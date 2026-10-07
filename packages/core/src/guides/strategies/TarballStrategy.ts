// Tarball-based (manual) guide installation strategy
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'fs';
import { basename, dirname, join } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { VERSION_MARKER_FILE, EXCLUDE_RECORD_FILE, DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from '../types.js';
import { commitPathIfChanged } from '../gitExec.js';
import { listRemoteTags, openRemoteArchive } from '../tarballSource.js';
import { matchingGuidePatterns, sameExcludeList } from '../../config/guideExclude.js';

// Moved to tarballSource; re-exported so existing importers keep working.
export { activeProxyEnvVars, describeRateLimit, parseGitHubOwnerRepo } from '../tarballSource.js';

/**
 * Top-level entries dropped from the extracted tarball. A tarball install
 * promises plain files with no git wiring, and the guide repo has at times
 * carried its own .gitmodules and a self-referential project-documents/
 * gitlink that would otherwise land inside the consumer's guide directory.
 */
const TARBALL_EXCLUDED_ENTRIES = ['.gitmodules', '.gitignore', 'project-documents'] as const;

/** Whether to drop a raw tarball entry, and which guide.exclude patterns match it. */
export interface TarballEntryDecision {
  skip: boolean;
  matchedExclude: string[];
}

/**
 * Decide a raw tarball entry against the built-in git-wiring entries and the
 * guide.exclude list. node-tar calls filter before `strip` is applied, so the
 * path still begins with the archive root ({owner}-{repo}-{hash}/); directory
 * entries end with a slash. The archive root itself is never skipped.
 * matchedExclude lists user patterns only, even when a built-in entry also
 * matches, so a user entry such as `.gitignore` is not reported as unmatched.
 */
export function decideTarballEntry(entryPath: string, exclude: readonly string[]): TarballEntryDecision {
  const parts = entryPath.replace(/^\.\//, '').split('/');
  const relative = parts.slice(1).join('/').replace(/\/$/, '');
  if (relative === '') return { skip: false, matchedExclude: [] };
  const matchedExclude = matchingGuidePatterns(relative, exclude);
  const builtIn = matchingGuidePatterns(relative, TARBALL_EXCLUDED_ENTRIES).length > 0;
  return { skip: builtIn || matchedExclude.length > 0, matchedExclude };
}

/**
 * The guide.exclude list an installed tarball guide was extracted with. cf
 * writes it already parsed and sorted, so it is read back as plain lines —
 * not re-validated, so an old record stays readable if the validation rules
 * tighten later. A missing record means nothing was excluded (true of every
 * install that predates it).
 */
export function readExcludeRecord(guideDir: string): string[] {
  const recordPath = join(guideDir, EXCLUDE_RECORD_FILE);
  if (!existsSync(recordPath)) return [];
  return readFileSync(recordPath, 'utf-8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .sort();
}

/**
 * Suffixes for the sibling directories extractAndSwap uses next to the guide
 * directory (e.g. project-documents/.ai-project-guide.staging). Siblings, so
 * both renames stay on one filesystem.
 */
const STAGING_SUFFIX = '.staging';
const PREVIOUS_SUFFIX = '.previous';

function siblingPath(targetDir: string, suffix: string): string {
  return join(dirname(targetDir), `.${basename(targetDir)}${suffix}`);
}

export class TarballStrategy implements InstallStrategy {
  /** The parsed guide.exclude list; empty means nothing is excluded. */
  constructor(private readonly exclude: readonly string[] = []) {}

  detect(_projectPath: string, targetDir: string): Promise<DetectionResult | null> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    if (!existsSync(markerPath)) return Promise.resolve(null);

    try {
      const version = readFileSync(markerPath, 'utf-8').trim() || null;
      return Promise.resolve({ method: 'tarball', version, source: null });
    } catch {
      return Promise.resolve(null);
    }
  }

  async install(projectPath: string, source: string, targetDir: string): Promise<InstallResult> {
    const resolvedSource = source || DEFAULT_SOURCE_GIT;
    const latestTag = await this.fetchLatestTag(resolvedSource);
    if (!latestTag) {
      throw new Error('Could not determine latest version from remote.');
    }

    const unmatched = await this.extractAndSwap(resolvedSource, latestTag, targetDir);

    // Same commit the submodule strategy makes, so a tarball install does not
    // leave the guide untracked for the user to notice later.
    const committed = await commitPathIfChanged(
      projectPath,
      GUIDE_RELATIVE_PATH,
      `docs: install ai-project-guide ${latestTag}`
    );

    return {
      success: true,
      version: latestTag,
      method: 'tarball',
      path: targetDir,
      committed,
      ...this.excludeFields(unmatched),
    };
  }

  async update(projectPath: string, targetDir: string, source: string): Promise<UpdateResult> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    let previousVersion: string | null = null;
    try {
      previousVersion = readFileSync(markerPath, 'utf-8').trim() || null;
    } catch {
      // No previous version
    }

    const latestTag = await this.fetchLatestTag(source);
    if (!latestTag) {
      throw new Error('Could not determine latest version from remote.');
    }

    const excludeDiffers = !sameExcludeList(readExcludeRecord(targetDir), this.sortedExclude());
    if (previousVersion === latestTag && !excludeDiffers) {
      return { success: true, previousVersion, newVersion: latestTag, method: 'tarball' };
    }
    // Same version but a different exclude list: re-extract the same tag.
    const excludeChanged = previousVersion === latestTag;

    const unmatched = await this.extractAndSwap(source, latestTag, targetDir);

    const committed = await commitPathIfChanged(
      projectPath,
      GUIDE_RELATIVE_PATH,
      excludeChanged
        ? `docs: re-extract ai-project-guide ${latestTag} (guide.exclude changed)`
        : `docs: update ai-project-guide ${latestTag}`
    );

    return {
      success: true,
      previousVersion,
      newVersion: latestTag,
      method: 'tarball',
      committed,
      ...this.excludeFields(unmatched),
      ...(excludeChanged ? { excludeChanged: true } : {}),
    };
  }

  private sortedExclude(): string[] {
    return [...this.exclude].sort();
  }

  /** Result fields for the applied and unmatched excludes, each only when not empty. */
  private excludeFields(unmatched: string[]): Pick<InstallResult, 'exclude' | 'unmatchedExclude'> {
    return {
      ...(this.exclude.length > 0 ? { exclude: [...this.exclude] } : {}),
      ...(unmatched.length > 0 ? { unmatchedExclude: unmatched } : {}),
    };
  }

  /**
   * Build the new guide in a staging directory, then swap it into place. Any
   * failure before the swap (network, rate limit, broken archive) leaves the
   * existing guide untouched; a failed swap restores it. Returns the
   * guide.exclude patterns that matched no archive entry.
   */
  private async extractAndSwap(source: string, tag: string, targetDir: string): Promise<string[]> {
    const staging = siblingPath(targetDir, STAGING_SUFFIX);
    const previous = siblingPath(targetDir, PREVIOUS_SUFFIX);

    // Leftovers from an earlier crash
    rmSync(staging, { recursive: true, force: true });
    rmSync(previous, { recursive: true, force: true });

    const matched = new Set<string>();
    try {
      await this.downloadAndExtract(source, tag, staging, (entryPath) => {
        const decision = decideTarballEntry(entryPath, this.exclude);
        for (const pattern of decision.matchedExclude) matched.add(pattern);
        return !decision.skip;
      });
      writeFileSync(join(staging, VERSION_MARKER_FILE), tag, 'utf-8');
      if (this.exclude.length > 0) {
        writeFileSync(join(staging, EXCLUDE_RECORD_FILE), this.sortedExclude().join('\n') + '\n', 'utf-8');
      }
    } catch (err) {
      // Don't leave a partial staging dir in the user's repo; the guide itself is untouched.
      rmSync(staging, { recursive: true, force: true });
      throw err;
    }

    const hadGuide = existsSync(targetDir);
    if (hadGuide) renameSync(targetDir, previous);
    try {
      renameSync(staging, targetDir);
    } catch (err) {
      if (hadGuide) this.restorePrevious(previous, targetDir, err);
      throw err;
    }
    rmSync(previous, { recursive: true, force: true });

    return this.exclude.filter((pattern) => !matched.has(pattern));
  }

  /**
   * Move the previous guide back after a failed swap. If that also fails, the
   * guide exists only at `previous`: throw an error that says where, keeping
   * the swap failure as the cause so the root error is not lost.
   */
  private restorePrevious(previous: string, targetDir: string, swapError: unknown): void {
    let restoreFailure: { reason: string } | null = null;
    try {
      renameSync(previous, targetDir);
    } catch (restoreError) {
      restoreFailure = { reason: restoreError instanceof Error ? restoreError.message : String(restoreError) };
    }
    // Thrown outside the catch: the cause is the swap failure, not the restore failure.
    if (restoreFailure) {
      throw new Error(
        `Installing the new guide failed, and restoring the previous guide also failed (${restoreFailure.reason}). ` +
          `The previous guide is at ${previous}; move it back to ${targetDir} by hand.`,
        { cause: swapError }
      );
    }
  }

  /** Newest remote tag, or null for a genuinely tag-less remote. */
  private async fetchLatestTag(source: string): Promise<string | null> {
    const tags = await listRemoteTags(source);
    return tags[0] ?? null;
  }

  /** Download the tag's tarball and extract it into extractDir. */
  private async downloadAndExtract(
    source: string,
    tag: string,
    extractDir: string,
    filter: (entryPath: string) => boolean
  ): Promise<void> {
    const archive = await openRemoteArchive(source, tag);
    try {
      mkdirSync(extractDir, { recursive: true });

      // GitHub tarballs have a top-level directory like {owner}-{repo}-{hash}/
      // We strip 1 level and extract directly into extractDir
      await pipeline(
        archive.stream,
        createGunzip(),
        extract({ cwd: extractDir, strip: 1, filter })
      );
    } finally {
      await archive.close();
    }
  }
}
