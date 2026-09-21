// Tarball-based (manual) guide installation strategy
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { VERSION_MARKER_FILE, DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from '../types.js';
import { gitExec, withNetworkErrorHint, commitPathIfChanged } from '../gitExec.js';

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
 * Whether a raw tarball entry path should be skipped. node-tar calls filter
 * before `strip` is applied, so the path still begins with the archive root
 * ({owner}-{repo}-{hash}/); directory entries end with a slash.
 */
export function isGitWiringEntry(entryPath: string): boolean {
  const parts = entryPath.replace(/^\.\//, '').split('/');
  const relative = parts.slice(1).join('/');
  return TARBALL_EXCLUDED_ENTRIES.some(
    (name) => relative === name || relative === `${name}/` || relative.startsWith(`${name}/`)
  );
}

export class TarballStrategy implements InstallStrategy {
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

    await this.downloadAndExtract(resolvedSource, latestTag, targetDir);
    writeFileSync(join(targetDir, VERSION_MARKER_FILE), latestTag, 'utf-8');

    // Same commit the submodule strategy makes, so a tarball install does not
    // leave the guide untracked for the user to notice later.
    const committed = await commitPathIfChanged(
      projectPath,
      GUIDE_RELATIVE_PATH,
      `docs: install ai-project-guide ${latestTag}`
    );

    return { success: true, version: latestTag, method: 'tarball', path: targetDir, committed };
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

    if (previousVersion === latestTag) {
      return { success: true, previousVersion, newVersion: latestTag, method: 'tarball' };
    }

    // Remove existing contents and re-download
    rmSync(targetDir, { recursive: true, force: true });
    await this.downloadAndExtract(source, latestTag, targetDir);
    writeFileSync(join(targetDir, VERSION_MARKER_FILE), latestTag, 'utf-8');

    const committed = await commitPathIfChanged(
      projectPath,
      GUIDE_RELATIVE_PATH,
      `docs: update ai-project-guide ${latestTag}`
    );

    return { success: true, previousVersion, newVersion: latestTag, method: 'tarball', committed };
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

  /** Download tarball from GitHub API and extract to targetDir */
  private async downloadAndExtract(
    source: string,
    tag: string,
    targetDir: string
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

      mkdirSync(targetDir, { recursive: true });

      // GitHub tarballs have a top-level directory like {owner}-{repo}-{hash}/
      // We strip 1 level and extract directly into targetDir
      const nodeStream = Readable.fromWeb(response.body as never);
      await pipeline(
        nodeStream,
        createGunzip(),
        extract({ cwd: targetDir, strip: 1, filter: (entryPath) => !isGitWiringEntry(entryPath) })
      );
    } finally {
      await dispatcher.close();
    }
  }
}
