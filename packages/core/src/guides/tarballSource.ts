// Where a tarball guide comes from: remote tag lookup and archive download.
import { Readable } from 'stream';
import { fetch as undiciFetch, EnvHttpProxyAgent } from 'undici';
import { gitExec, withNetworkErrorHint } from './gitExec.js';

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

  return tags.sort((a, b) => {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  });
}

/** Raw `.tar.gz` bytes of a guide archive. `close` must be called once the stream is consumed. */
export interface ArchiveStream {
  stream: Readable;
  close: () => Promise<void>;
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
      stream: Readable.fromWeb(response.body as never),
      close: () => dispatcher.close(),
    };
  } catch (err) {
    await dispatcher.close();
    throw err;
  }
}
