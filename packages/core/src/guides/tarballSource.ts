// Where a tarball guide comes from: remote tag lookup and archive download.
import { createReadStream, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { Readable } from 'stream';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import { gitExec, withNetworkErrorHint } from './gitExec.js';
import { LOCAL_VERSION_MARKER } from './types.js';
import { compareSemverTagsNewestFirst } from './versionTags.js';

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
 * Semver tags of the remote, newest first, via git ls-remote. Real failures
 * (network, auth, invalid remote) propagate — only a genuinely tag-less remote
 * yields an empty list.
 */
export async function listRemoteTags(source: string): Promise<string[]> {
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

  return tags.sort(compareSemverTagsNewestFirst);
}

/** Archive extensions accepted for a local --source. */
const LOCAL_ARCHIVE_EXTENSIONS = ['.tgz', '.tar.gz'] as const;

/** Where a guide comes from after --source and --version are resolved. */
export type ResolvedTarballSource =
  | { kind: 'remote'; source: string; tag: string }
  | { kind: 'local'; path: string; tag: typeof LOCAL_VERSION_MARKER };

/**
 * A source that looks like a filesystem path rather than a GitHub URL: it
 * starts like a path, uses backslashes, or names an archive file (so a typo in
 * a bare `guide.tgz` reports "file not found" instead of a git error).
 */
function looksLikePath(source: string): boolean {
  return (
    /^[./~]/.test(source) ||
    source.includes('\\') ||
    LOCAL_ARCHIVE_EXTENSIONS.some((extension) => source.endsWith(extension))
  );
}

/**
 * Absolute path when `source` names an existing file (relative paths resolve
 * against `projectRoot`), else null. A directory is not a local archive: a
 * submodule or clone source may legitimately be a local git directory.
 */
export function localSourceFile(source: string, projectRoot: string): string | null {
  const path = resolve(projectRoot, source);
  return existsSync(path) && statSync(path).isFile() ? path : null;
}

/**
 * Decide whether `source` is a local archive or a remote repository, and
 * which tag applies. A source is local when it names an existing file; a
 * relative path resolves against `projectRoot` (callers pass the CLI's cwd or
 * the project root). Paths outside the project root are allowed.
 */
export async function resolveTarballSource({
  source,
  version,
  projectRoot,
}: {
  source: string;
  version: string | undefined;
  projectRoot: string;
}): Promise<ResolvedTarballSource> {
  const localPath = localSourceFile(source, projectRoot);
  if (localPath !== null) {
    if (!LOCAL_ARCHIVE_EXTENSIONS.some((ext) => localPath.endsWith(ext))) {
      throw new Error(`--source ${source} is a local file but not a .tgz/.tar.gz archive`);
    }
    if (version !== undefined) {
      throw new Error(
        `--version cannot be combined with a local --source; a local archive is always recorded as "${LOCAL_VERSION_MARKER}"`
      );
    }
    return { kind: 'local', path: localPath, tag: LOCAL_VERSION_MARKER };
  }
  if (looksLikePath(source)) {
    throw new Error(`--source ${source}: file not found (looked for ${resolve(projectRoot, source)})`);
  }

  const tags = await listRemoteTags(source);
  if (tags.length === 0) {
    throw new Error('Could not determine latest version from remote.');
  }
  if (version === undefined) {
    return { kind: 'remote', source, tag: tags[0] };
  }
  if (!tags.includes(version)) {
    throw new Error(`--version ${version} not found on the remote; newest available is ${tags[0]}`);
  }
  return { kind: 'remote', source, tag: version };
}

/** Raw `.tar.gz` bytes of a guide archive. `close` must be called once the stream is consumed. */
export interface ArchiveStream {
  stream: Readable;
  /** What to name in an error: the download URL, or the local file path. */
  label: string;
  close: () => Promise<void>;
}

/** Open a resolved source (remote tag or local file) as a byte stream. */
export function openArchive(resolved: ResolvedTarballSource): Promise<ArchiveStream> {
  return resolved.kind === 'remote'
    ? openRemoteArchive(resolved.source, resolved.tag)
    : Promise.resolve(openLocalArchive(resolved.path));
}

function openLocalArchive(path: string): ArchiveStream {
  return { stream: createReadStream(path), label: path, close: () => Promise.resolve() };
}

/** Open the GitHub tarball for a tag as a byte stream. */
export async function openRemoteArchive(source: string, tag: string): Promise<ArchiveStream> {
  const { owner, repo } = parseGitHubOwnerRepo(source);
  const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${tag}`;

  // The ls-remote half already went through git, which honors the proxy
  // variables itself; a failure here is therefore the download specifically.
  const proxyVars = activeProxyEnvVars();
  const via = proxyVars.length > 0 ? ` via proxy (${proxyVars.join(', ')})` : '';
  const failurePrefix = `Downloading guide tarball from ${url}${via} failed`;

  // The caller closes it: an open keep-alive socket would otherwise hold the
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
      throw new Error(withNetworkErrorHint(`${failurePrefix}: ${cause ? `${message}: ${cause}` : message}`), { cause: err });
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

    return {
      stream: Readable.fromWeb(response.body),
      label: url,
      close: () => dispatcher.close(),
    };
  } catch (err) {
    await dispatcher.close();
    throw err;
  }
}
