import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseGitHubOwnerRepo,
  describeRateLimit,
  activeProxyEnvVars,
  listRemoteTags,
} from '../../src/guides/tarballSource.js';
import { gitExec } from '../../src/guides/gitExec.js';

vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  withNetworkErrorHint: (message: string) => message,
}));

const mockGitExec = vi.mocked(gitExec);

describe('describeRateLimit()', () => {
  it('returns null for a 403 that is not a rate limit', () => {
    expect(describeRateLimit(403, new Headers({ 'x-ratelimit-remaining': '42' }))).toBeNull();
  });

  it('recognizes 429 with remaining 0', () => {
    expect(describeRateLimit(429, new Headers({ 'x-ratelimit-remaining': '0' })))
      .toMatch(/rate limit exceeded/);
  });

  it('omits the reset time when the header is missing or malformed', () => {
    const message = describeRateLimit(403, new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'soon' }));
    expect(message).toMatch(/rate limit exceeded/);
    expect(message).not.toMatch(/Resets at/);
  });
});

describe('activeProxyEnvVars()', () => {
  it('returns only the variables that are set, in precedence order', () => {
    expect(activeProxyEnvVars({ http_proxy: 'http://p:1', HTTPS_PROXY: 'http://p:2', NO_PROXY: 'x' }))
      .toEqual(['HTTPS_PROXY', 'http_proxy']);
  });

  it('returns an empty list when nothing is set', () => {
    expect(activeProxyEnvVars({})).toEqual([]);
  });
});

describe('parseGitHubOwnerRepo()', () => {
  it('parses https://github.com/owner/repo.git', () => {
    expect(parseGitHubOwnerRepo('https://github.com/ecorkran/ai-project-guide.git'))
      .toEqual({ owner: 'ecorkran', repo: 'ai-project-guide' });
  });

  it('parses https://github.com/owner/repo (no .git)', () => {
    expect(parseGitHubOwnerRepo('https://github.com/ecorkran/ai-project-guide'))
      .toEqual({ owner: 'ecorkran', repo: 'ai-project-guide' });
  });

  it('throws for non-GitHub URL', () => {
    expect(() => parseGitHubOwnerRepo('https://gitlab.com/foo/bar'))
      .toThrow('Cannot parse GitHub owner/repo');
  });
});

describe('listRemoteTags()', () => {
  const source = 'https://github.com/ecorkran/ai-project-guide.git';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns only semver tags, newest first', async () => {
    mockGitExec.mockResolvedValue({
      stdout: [
        'aaa\trefs/tags/v0.9.0',
        'bbb\trefs/tags/v0.10.0',
        'ccc\trefs/tags/nightly',
        'ddd\trefs/tags/v0.2.1',
      ].join('\n'),
      stderr: '',
    });

    expect(await listRemoteTags(source)).toEqual(['v0.10.0', 'v0.9.0', 'v0.2.1']);
  });

  it('returns an empty list for a tag-less remote', async () => {
    mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });

    expect(await listRemoteTags(source)).toEqual([]);
  });

  it('propagates ls-remote failures', async () => {
    mockGitExec.mockRejectedValue(new Error('fatal: unable to access remote'));

    await expect(listRemoteTags(source)).rejects.toThrow('unable to access remote');
  });
});
