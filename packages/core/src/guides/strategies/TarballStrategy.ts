// Tarball-based (manual) guide installation strategy
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult, TarballUpdateOptions, GuidePreview, GuideVersionChange } from '../types.js';
import { VERSION_MARKER_FILE, EXCLUDE_RECORD_FILE, DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from '../types.js';
import { commitPathIfChanged } from '../gitExec.js';
import { resolveTarballSource, openArchive } from '../tarballSource.js';
import type { ResolvedTarballSource } from '../tarballSource.js';
import { diffGuideTrees } from '../guideTreeDiff.js';
import { decideConfigCommit } from '../configExcludeCommit.js';
import { clearLeftovers, removeStaging, stagingPathFor, swapIntoPlace } from './tarballSwap.js';
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

/** The version marker of a guide directory, or null when there is none. */
function readVersionMarker(guideDir: string): string | null {
  const markerPath = join(guideDir, VERSION_MARKER_FILE);
  return existsSync(markerPath) ? readFileSync(markerPath, 'utf-8').trim() || null : null;
}

/** Whether the installed and staged guides carry the same version marker and exclude record. */
function bookkeepingMatches(installedDir: string, stagedDir: string): boolean {
  return (
    readVersionMarker(installedDir) === readVersionMarker(stagedDir) &&
    sameExcludeList(readExcludeRecord(installedDir), readExcludeRecord(stagedDir))
  );
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

  async install(
    projectPath: string,
    source: string,
    targetDir: string,
    options: TarballUpdateOptions = {}
  ): Promise<InstallResult> {
    const resolved = await resolveTarballSource(
      source || DEFAULT_SOURCE_GIT,
      options.version,
      options.sourceRoot ?? projectPath
    );
    const tag = resolved.tag;

    const unmatched = await this.extractAndSwap(resolved, targetDir);

    // Same commit the submodule strategy makes, so a tarball install does not
    // leave the guide untracked for the user to notice later.
    const committed = await commitPathIfChanged(
      projectPath,
      GUIDE_RELATIVE_PATH,
      `docs: install ai-project-guide ${tag}`
    );

    return {
      success: true,
      version: tag,
      method: 'tarball',
      path: targetDir,
      committed,
      ...this.excludeFields(unmatched),
    };
  }

  async update(
    projectPath: string,
    targetDir: string,
    source: string,
    options: TarballUpdateOptions = {}
  ): Promise<UpdateResult> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    let previousVersion: string | null = null;
    try {
      previousVersion = readFileSync(markerPath, 'utf-8').trim() || null;
    } catch {
      // No previous version
    }

    const resolved = await resolveTarballSource(source, options.version, options.sourceRoot ?? projectPath);
    const tag = resolved.tag;

    const excludeDiffers = !sameExcludeList(readExcludeRecord(targetDir), this.sortedExclude());
    // A local archive always stages: the same 'local' marker can name different archives.
    if (resolved.kind === 'remote' && previousVersion === tag && !excludeDiffers) {
      return { success: true, previousVersion, newVersion: tag, method: 'tarball' };
    }
    // Same version but a different exclude list: re-extract the same tag.
    const excludeChanged = previousVersion === tag && excludeDiffers;

    const unmatched = await this.stage(resolved, targetDir);
    const { outcome, preview } = await this.reviewStaged(targetDir, options.confirm, { from: previousVersion, to: tag });
    // Nothing is swapped or committed for either of these; the guide is untouched.
    if (outcome === 'unchanged') {
      return { success: true, previousVersion, newVersion: previousVersion, method: 'tarball', unchanged: true, preview };
    }
    if (outcome === 'cancelled') {
      return { success: false, previousVersion, newVersion: previousVersion, method: 'tarball', cancelled: true, preview };
    }
    swapIntoPlace(targetDir);

    // A changed guide.exclude lives in .context-forge.toml; commit it with the
    // re-extract it caused, when that file holds no other uncommitted edits.
    const configDecision = excludeDiffers ? await decideConfigCommit(projectPath) : { add: false as const };
    const committed = await commitPathIfChanged(
      projectPath,
      configDecision.add ? [GUIDE_RELATIVE_PATH, configDecision.relativePath] : GUIDE_RELATIVE_PATH,
      excludeChanged
        ? `docs: re-extract ai-project-guide ${tag} (guide.exclude changed)`
        : `docs: update ai-project-guide ${tag}`
    );

    return {
      success: true,
      previousVersion,
      newVersion: tag,
      method: 'tarball',
      committed,
      preview,
      ...(excludeDiffers ? { configCommitted: configDecision.add && committed } : {}),
      ...(!configDecision.add && configDecision.notice ? { configNotice: configDecision.notice } : {}),
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

  /** Stage the new guide, then swap it into place (install: nothing to preview). */
  private async extractAndSwap(resolved: ResolvedTarballSource, targetDir: string): Promise<string[]> {
    const unmatched = await this.stage(resolved, targetDir);
    swapIntoPlace(targetDir);
    return unmatched;
  }

  /**
   * Build the new guide in a staging directory. Any failure (network, rate
   * limit, broken archive) removes the staging directory and leaves the
   * existing guide untouched. Returns the guide.exclude patterns that
   * matched no archive entry.
   */
  private async stage(resolved: ResolvedTarballSource, targetDir: string): Promise<string[]> {
    const staging = stagingPathFor(targetDir);
    clearLeftovers(targetDir);

    const matched = new Set<string>();
    try {
      await this.openAndExtract(resolved, staging, (entryPath) => {
        const decision = decideTarballEntry(entryPath, this.exclude);
        for (const pattern of decision.matchedExclude) matched.add(pattern);
        return !decision.skip;
      });
      writeFileSync(join(staging, VERSION_MARKER_FILE), resolved.tag, 'utf-8');
      if (this.exclude.length > 0) {
        writeFileSync(join(staging, EXCLUDE_RECORD_FILE), this.sortedExclude().join('\n') + '\n', 'utf-8');
      }
    } catch (err) {
      // Don't leave a partial staging dir in the user's repo; the guide itself is untouched.
      removeStaging(targetDir);
      throw err;
    }

    return this.exclude.filter((pattern) => !matched.has(pattern));
  }

  /**
   * Diff the staged guide against the installed one and decide whether to
   * swap. The staging directory is removed on every path except `proceed`,
   * including when the diff or the confirm callback throws.
   */
  private async reviewStaged(
    targetDir: string,
    confirm: TarballUpdateOptions['confirm'],
    versions: GuideVersionChange
  ): Promise<{ outcome: 'unchanged' | 'cancelled' | 'proceed'; preview: GuidePreview }> {
    let proceed = false;
    try {
      const preview = await diffGuideTrees(targetDir, stagingPathFor(targetDir));
      if (preview.added + preview.removed + preview.changed === 0) {
        // Identical files. Only a true no-op when cf's own bookkeeping matches
        // too; otherwise swap (no prompt: nothing visible changes) so the
        // marker and exclude record do not go stale.
        if (bookkeepingMatches(targetDir, stagingPathFor(targetDir))) return { outcome: 'unchanged', preview };
        proceed = true;
        return { outcome: 'proceed', preview };
      }
      if (confirm && !(await confirm(preview, versions))) return { outcome: 'cancelled', preview };
      proceed = true;
      return { outcome: 'proceed', preview };
    } finally {
      if (!proceed) removeStaging(targetDir);
    }
  }

  /**
   * Open the resolved archive (remote tag or local file) and extract it into
   * extractDir. A gunzip, tar or read error names the archive. An archive with
   * more than one top-level directory is refused: the extract strips exactly
   * one level, so a second root would land its files loose in the guide.
   */
  private async openAndExtract(
    resolved: ResolvedTarballSource,
    extractDir: string,
    filter: (entryPath: string) => boolean
  ): Promise<void> {
    const archive = await openArchive(resolved);
    const roots = new Set<string>();
    const rootGuardedFilter = (entryPath: string): boolean => {
      const root = entryPath.replace(/^\.\//, '').split('/')[0];
      if (root !== '') roots.add(root);
      return roots.size <= 1 && filter(entryPath);
    };

    try {
      mkdirSync(extractDir, { recursive: true });

      // GitHub tarballs have a top-level directory like {owner}-{repo}-{hash}/
      // We strip 1 level and extract directly into extractDir
      try {
        await pipeline(
          archive.stream,
          createGunzip(),
          extract({ cwd: extractDir, strip: 1, filter: rootGuardedFilter })
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Reading guide archive ${archive.label} failed: ${reason}`, { cause: err });
      }
      if (roots.size > 1) {
        throw new Error(`Archive must contain a single top-level directory (${archive.label})`);
      }
    } finally {
      await archive.close();
    }
  }
}
