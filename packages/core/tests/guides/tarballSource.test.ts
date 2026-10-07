import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  parseGitHubOwnerRepo,
  describeRateLimit,
  activeProxyEnvVars,
  listRemoteTags,
  resolveTarballSource,
} from '../../src/guides/tarballSource.js';
import { gitExec } from '../../src/guides/gitExec.js';
import { LOCAL_VERSION_MARKER } from '../../src/guides/types.js';
import { makeTempDir } from './helpers/guideArchiveFixture.js';

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

describe('resolveTarballSource()', () => {
  const remote = 'https://github.com/ecorkran/ai-project-guide.git';
  const tagLines = 'a\trefs/tags/v0.2.0\nb\trefs/tags/v0.3.0\nc\trefs/tags/v0.1.0\n';
  let root: string;

  beforeEach(() => {
    vi.resetAllMocks();
    root = makeTempDir();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves the newest remote tag when no version is given', async () => {
    mockGitExec.mockResolvedValue({ stdout: tagLines, stderr: '' });

    expect(await resolveTarballSource(remote, undefined, root))
      .toEqual({ kind: 'remote', source: remote, tag: 'v0.3.0' });
  });

  it('resolves a pinned remote version that exists', async () => {
    mockGitExec.mockResolvedValue({ stdout: tagLines, stderr: '' });

    expect(await resolveTarballSource(remote, 'v0.2.0', root))
      .toEqual({ kind: 'remote', source: remote, tag: 'v0.2.0' });
    expect(mockGitExec).toHaveBeenCalledTimes(1);
  });

  it('names the requested tag and the newest available when the pin is missing', async () => {
    mockGitExec.mockResolvedValue({ stdout: tagLines, stderr: '' });

    await expect(resolveTarballSource(remote, 'v9.9.9', root))
      .rejects.toThrow('--version v9.9.9 not found on the remote; newest available is v0.3.0');
  });

  it('fails when the remote has no tags', async () => {
    mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });

    await expect(resolveTarballSource(remote, undefined, root))
      .rejects.toThrow('Could not determine latest version from remote.');
  });

  it.each(['guide.tgz', 'guide.tar.gz'])('treats an existing %s as local', async (name) => {
    const file = join(root, name);
    writeFileSync(file, 'x');

    expect(await resolveTarballSource(file, undefined, root))
      .toEqual({ kind: 'local', path: file, tag: LOCAL_VERSION_MARKER });
    expect(mockGitExec).not.toHaveBeenCalled();
  });

  it('resolves a relative local path against the given root', async () => {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'g.tgz'), 'x');

    expect(await resolveTarballSource('sub/g.tgz', undefined, root))
      .toEqual({ kind: 'local', path: join(root, 'sub', 'g.tgz'), tag: LOCAL_VERSION_MARKER });
  });

  it('refuses an existing file that is not an archive', async () => {
    writeFileSync(join(root, 'notes.txt'), 'x');

    await expect(resolveTarballSource('notes.txt', undefined, root))
      .rejects.toThrow('--source notes.txt is a local file but not a .tgz/.tar.gz archive');
  });

  it.each(['./missing.tgz', '/no/such/guide.tgz', '~/guide.tgz', 'dir\\guide.tgz'])(
    'reports file not found for the path-like source %s',
    async (source) => {
      await expect(resolveTarballSource(source, undefined, root))
        .rejects.toThrow(`--source ${source}: file not found`);
      expect(mockGitExec).not.toHaveBeenCalled();
    }
  );

  it('refuses --version combined with a local source', async () => {
    const file = join(root, 'guide.tgz');
    writeFileSync(file, 'x');

    await expect(resolveTarballSource(file, 'v0.2.0', root))
      .rejects.toThrow('--version cannot be combined with a local --source');
  });
});
