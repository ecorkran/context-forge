// Tarball-based (manual) guide installation strategy
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, renameSync } from 'fs';
import { basename, dirname, join } from 'path';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { VERSION_MARKER_FILE, EXCLUDE_RECORD_FILE, DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from '../types.js';
import { gitExec, withNetworkErrorHint, commitPathIfChanged } from '../gitExec.js';
import { isExcludedGuidePath, parseGuideExclude } from '../../config/guideExclude.js';

/**
 * Proxy variables honored by the tarball download. Git reads these on its own
 * for the ls-remote half; Node's built-in fetch does not, so the download goes
 * through undici's EnvHttpProxyAgent, which reads the same set (and NO_PROXY).
 */
const PROXY_ENV_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'] as const;

/** Names of the proxy variables currently set, so a failure can say which applied. */
export function activeProxyEnvVars(env: NodeJS.ProcessEnv = process.env): string[] {
  return PROXY_ENV_VARS.filter((name) => Boolean(env[name]));
}

/** Minimal header access shared by undici and WHATWG Response objects. */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * GitHub signals an exhausted rate limit with 403 (or 429) plus
 * x-ratelimit-remaining: 0. Returns a specific message for that case, null
 * for any other failure status.
 */
export function describeRateLimit(status: number, headers: HeaderReader): string | null {
  if (status !== 403 && status !== 429) return null;
  if (headers.get('x-ratelimit-remaining') !== '0') return null;

  const reset = headers.get('x-ratelimit-reset');
  const resetAt = reset && /^\d+$/.test(reset)
    ? ` Resets at ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
    : '';
  return (
    'GitHub API rate limit exceeded: unauthenticated requests are limited to 60 per hour ' +
    `per source IP, shared by everyone behind the same NAT or proxy.${resetAt}`
  );
}

/**
 * Parse owner/repo from a GitHub source URL.
 * Supports: https://github.com/{owner}/{repo}.git and https://github.com/{owner}/{repo}
 */
export function parseGitHubOwnerRepo(source: string): { owner: string; repo: string } {
  const match = /github\.com\/([^/]+)\/([^/.]+)/.exec(source);
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from source URL: ${source}`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Top-level entries dropped from the extracted tarball. A tarball install
 * promises plain files with no git wiring, and the guide repo has at times
 * carried its own .gitmodules and a self-referential project-documents/
 * gitlink that would otherwise land inside the consumer's guide directory.
 */
const TARBALL_EXCLUDED_ENTRIES = ['.gitmodules', '.gitignore', 'project-documents'] as const;

/**
 * The pattern that skips a raw tarball entry — a built-in git-wiring entry
 * first, then the guide.exclude list — or null to keep it. node-tar calls
 * filter before `strip` is applied, so the path still begins with the archive
 * root ({owner}-{repo}-{hash}/); directory entries end with a slash. The
 * archive root itself is never skipped.
 */
export function isSkippedTarballEntry(entryPath: string, exclude: readonly string[]): string | null {
  const parts = entryPath.replace(/^\.\//, '').split('/');
  const relative = parts.slice(1).join('/').replace(/\/$/, '');
  if (relative === '') return null;
  return isExcludedGuidePath(relative, TARBALL_EXCLUDED_ENTRIES) ?? isExcludedGuidePath(relative, exclude);
}

/**
 * The guide.exclude list an installed tarball guide was extracted with,
 * normalized the same way as config so the two compare directly. A missing
 * record means nothing was excluded (true of every install that predates it).
 */
export function readExcludeRecord(guideDir: string): string[] {
  const recordPath = join(guideDir, EXCLUDE_RECORD_FILE);
  if (!existsSync(recordPath)) return [];
  return parseGuideExclude(readFileSync(recordPath, 'utf-8').split(/\r?\n/).join(','));
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

  async detect(_projectPath: string, targetDir: string): Promise<DetectionResult | null> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    if (!existsSync(markerPath)) return null;

    try {
      const version = readFileSync(markerPath, 'utf-8').trim() || null;
      return { method: 'tarball', version, source: null };
    } catch {
      return null;
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

    const excludeDiffers = readExcludeRecord(targetDir).join(',') !== this.sortedExclude().join(',');
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
    await this.downloadAndExtract(source, tag, staging, (entryPath) => {
      const pattern = isSkippedTarballEntry(entryPath, this.exclude);
      if (pattern === null) return true;
      matched.add(pattern);
      return false;
    });
    writeFileSync(join(staging, VERSION_MARKER_FILE), tag, 'utf-8');
    if (this.exclude.length > 0) {
      writeFileSync(join(staging, EXCLUDE_RECORD_FILE), this.sortedExclude().join('\n') + '\n', 'utf-8');
    }

    const hadGuide = existsSync(targetDir);
    if (hadGuide) renameSync(targetDir, previous);
    try {
      renameSync(staging, targetDir);
    } catch (err) {
      if (hadGuide) renameSync(previous, targetDir);
      throw err;
    }
    rmSync(previous, { recursive: true, force: true });

    return this.exclude.filter((pattern) => !matched.has(pattern));
  }

  /**
   * Fetch latest tag from remote using git ls-remote. Real failures (network,
   * auth, invalid remote) propagate — only a genuinely tag-less remote yields null.
   */
  private async fetchLatestTag(source: string): Promise<string | null> {
    const { stdout } = await gitExec(
      ['ls-remote', '--tags', '--sort=-v:refname', source],
      process.cwd()
    );

    const tagPattern = /refs\/tags\/(v?\d+\.\d+\.\d+)$/;
    const tags: string[] = [];
    for (const line of stdout.split('\n')) {
      const match = tagPattern.exec(line.trim());
      if (match) tags.push(match[1]);
    }

    if (tags.length === 0) return null;

    // Sort descending
    tags.sort((a, b) => {
      const pa = a.replace(/^v/, '').split('.').map(Number);
      const pb = b.replace(/^v/, '').split('.').map(Number);
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i];
      }
      return 0;
    });

    return tags[0];
  }

  /** Download tarball from GitHub API and extract into extractDir */
  private async downloadAndExtract(
    source: string,
    tag: string,
    extractDir: string,
    filter: (entryPath: string) => boolean
  ): Promise<void> {
    const { owner, repo } = parseGitHubOwnerRepo(source);
    const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${tag}`;

    // The ls-remote half already went through git, which honors the proxy
    // variables itself; a failure here is therefore the download specifically.
    const proxyVars = activeProxyEnvVars();
    const via = proxyVars.length > 0 ? ` via proxy (${proxyVars.join(', ')})` : '';
    const failurePrefix = `Downloading guide tarball from ${url}${via} failed`;

    // Closed in finally: an open keep-alive socket would otherwise hold the
    // CLI process alive until the agent's idle timeout.
    const dispatcher = new EnvHttpProxyAgent();
    try {
      let response;
      try {
        response = await undiciFetch(url, {
          headers: { Accept: 'application/vnd.github+json' },
          redirect: 'follow',
          dispatcher,
        });
      } catch (err) {
        // undici throws TypeError('fetch failed') with the real DNS/connection
        // reason on err.cause.message — surface that, not the generic wrapper text.
        const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(withNetworkErrorHint(`${failurePrefix}: ${cause ? `${message}: ${cause}` : message}`));
      }

      if (!response.ok) {
        const rateLimit = describeRateLimit(response.status, response.headers);
        throw new Error(
          rateLimit ?? `${failurePrefix}: HTTP ${response.status} ${response.statusText}`
        );
      }

      if (!response.body) {
        throw new Error(`${failurePrefix}: empty response body`);
      }

      mkdirSync(extractDir, { recursive: true });

      // GitHub tarballs have a top-level directory like {owner}-{repo}-{hash}/
      // We strip 1 level and extract directly into extractDir
      const nodeStream = Readable.fromWeb(response.body as never);
      await pipeline(
        nodeStream,
        createGunzip(),
        extract({ cwd: extractDir, strip: 1, filter })
      );
    } finally {
      await dispatcher.close();
    }
  }
}
