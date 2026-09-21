import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TarballStrategy,
  parseGitHubOwnerRepo,
  isGitWiringEntry,
  describeRateLimit,
  activeProxyEnvVars,
} from '../../../src/guides/strategies/TarballStrategy.js';
import { VERSION_MARKER_FILE, GUIDE_RELATIVE_PATH } from '../../../src/guides/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  commitPathIfChanged: vi.fn(async () => true),
  withNetworkErrorHint: (message: string) =>
    /enotfound|econnrefused|etimedout|could not resolve host/i.test(message)
      ? `${message}\nnetwork/DNS problem`
      : message,
}));

// Mock tar and zlib for download/extract
vi.mock('tar', () => ({
  extract: vi.fn(() => {
    // Return a writable stream mock
    const { PassThrough } = require('stream');
    return new PassThrough();
  }),
}));

vi.mock('stream/promises', () => ({
  pipeline: vi.fn(async () => {}),
}));

// The download goes through undici's fetch with an EnvHttpProxyAgent dispatcher
const { mockFetch, mockDispatcherClose } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockDispatcherClose: vi.fn(async () => {}),
}));
vi.mock('undici', () => ({
  fetch: mockFetch,
  EnvHttpProxyAgent: vi.fn(() => ({ close: mockDispatcherClose })),
}));

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { extract } from 'tar';
import { EnvHttpProxyAgent } from 'undici';
import { gitExec, commitPathIfChanged } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockGitExec = vi.mocked(gitExec);
const mockCommitPath = vi.mocked(commitPathIfChanged);

describe('TarballStrategy', () => {
  let strategy: TarballStrategy;
  const projectPath = '/test/project';
  const targetDir = '/test/project/project-documents/ai-project-guide';
  const source = 'https://github.com/ecorkran/ai-project-guide.git';

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new TarballStrategy();
  });

  describe('detect()', () => {
    it('returns result when marker file exists', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('v0.13.2\n');

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toEqual({ method: 'tarball', version: 'v0.13.2', source: null });
    });

    it('returns null when marker file is missing', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toBeNull();
    });
  });

  describe('install()', () => {
    it('calls fetch with correct GitHub API URL and writes marker', async () => {
      mockGitExec.mockResolvedValue({
        stdout: 'abc123\trefs/tags/v0.13.2\n',
        stderr: '',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        body: new ReadableStream(),
        status: 200,
      });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['ls-remote', '--tags', '--sort=-v:refname', source],
        expect.any(String)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/ecorkran/ai-project-guide/tarball/v0.13.2',
        expect.objectContaining({ headers: { Accept: 'application/vnd.github+json' } })
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining(VERSION_MARKER_FILE),
        'v0.13.2',
        'utf-8'
      );
      expect(vi.mocked(extract)).toHaveBeenCalledWith(
        expect.objectContaining({ strip: 1, filter: expect.any(Function) })
      );
      expect(result.success).toBe(true);
      expect(result.version).toBe('v0.13.2');
      expect(result.method).toBe('tarball');
    });

    it('commits only the guide path, after the marker is written, and reports it', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockCommitPath).toHaveBeenCalledWith(
        projectPath,
        GUIDE_RELATIVE_PATH,
        'docs: install ai-project-guide v0.13.2'
      );
      // The marker is part of the install; committing before it lands would
      // leave the version file as a stray untracked change.
      expect(mockWriteFileSync.mock.invocationCallOrder[0]).toBeLessThan(
        mockCommitPath.mock.invocationCallOrder[0]
      );
      expect(result.committed).toBe(true);
    });

    it('reports committed: false when there was nothing to commit', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
      mockCommitPath.mockResolvedValueOnce(false);

      const result = await strategy.install(projectPath, source, targetDir);

      expect(result.committed).toBe(false);
    });

    it('propagates network failure from ls-remote with descriptive error', async () => {
      mockGitExec.mockRejectedValue(new Error('git ls-remote failed: Could not resolve host'));

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('Could not resolve host');
    });

    it('throws when remote has no tags', async () => {
      mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('Could not determine latest version');
    });

    it('wraps fetch failure with a network remediation hint', async () => {
      mockGitExec.mockResolvedValue({
        stdout: 'abc123\trefs/tags/v0.13.2\n',
        stderr: '',
      });
      const dnsError = new TypeError('fetch failed');
      (dnsError as Error & { cause?: Error }).cause = new Error('getaddrinfo ENOTFOUND api.github.com');
      mockFetch.mockRejectedValue(dnsError);

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow(/network\/DNS problem/i);
    });

    it('names the download call and URL when the fetch fails', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('Downloading guide tarball from https://api.github.com/repos/ecorkran/ai-project-guide/tarball/v0.13.2 failed');
    });

    it('routes the download through EnvHttpProxyAgent and closes it afterwards', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });

      await strategy.install(projectPath, source, targetDir);

      expect(EnvHttpProxyAgent).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ dispatcher: expect.objectContaining({ close: mockDispatcherClose }) })
      );
      expect(mockDispatcherClose).toHaveBeenCalledTimes(1);
    });

    it('closes the proxy agent even when the download fails', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(strategy.install(projectPath, source, targetDir)).rejects.toThrow();
      expect(mockDispatcherClose).toHaveBeenCalledTimes(1);
    });

    it('says which proxy variable applied when one is set', async () => {
      vi.stubEnv('HTTPS_PROXY', 'http://proxy.corp.example:3128');
      try {
        mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
        mockFetch.mockRejectedValue(new TypeError('fetch failed'));

        await expect(strategy.install(projectPath, source, targetDir))
          .rejects.toThrow('via proxy (HTTPS_PROXY)');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('reports an exhausted GitHub rate limit specifically', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        headers: new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' }),
      });

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow(/rate limit exceeded.*60 per hour.*Resets at/s);
    });

    it('reports other HTTP failures with status and URL', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers(),
      });

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow(/Downloading guide tarball from .*tarball\/v0\.13\.2 failed: HTTP 404 Not Found/);
    });
  });

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

  describe('update()', () => {
    it('returns no-op when already at latest version', async () => {
      mockReadFileSync.mockReturnValue('v0.13.2\n');
      mockGitExec.mockResolvedValue({
        stdout: 'abc123\trefs/tags/v0.13.2\n',
        stderr: '',
      });

      const result = await strategy.update(projectPath, targetDir, source);

      expect(result.previousVersion).toBe('v0.13.2');
      expect(result.newVersion).toBe('v0.13.2');
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockCommitPath).not.toHaveBeenCalled();
    });

    it('downloads and replaces when newer version available', async () => {
      mockReadFileSync.mockReturnValue('v0.12.0\n');
      mockGitExec.mockResolvedValue({
        stdout: 'abc123\trefs/tags/v0.12.0\ndef456\trefs/tags/v0.13.2\n',
        stderr: '',
      });
      mockFetch.mockResolvedValue({
        ok: true,
        body: new ReadableStream(),
        status: 200,
      });

      const result = await strategy.update(projectPath, targetDir, source);

      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
      expect(mockFetch).toHaveBeenCalled();
      expect(mockCommitPath).toHaveBeenCalledWith(
        projectPath,
        GUIDE_RELATIVE_PATH,
        'docs: update ai-project-guide v0.13.2'
      );
      expect(result.committed).toBe(true);
    });

    it('resolves the latest tag from the passed source, not the default', async () => {
      const customSource = 'https://github.com/acme/guide-mirror.git';
      mockReadFileSync.mockReturnValue('v0.12.0\n');
      mockGitExec.mockResolvedValue({
        stdout: 'def456\trefs/tags/v0.13.2\n',
        stderr: '',
      });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });

      await strategy.update(projectPath, targetDir, customSource);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['ls-remote', '--tags', '--sort=-v:refname', customSource],
        expect.any(String)
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/acme/guide-mirror/tarball/v0.13.2',
        expect.anything()
      );
    });
  });

  describe('isGitWiringEntry()', () => {
    // Real entry shapes from the v0.17.5 GitHub tarball: archive root prefix,
    // trailing slash on directories.
    const root = 'ecorkran-ai-project-guide-3f14d43';

    it('drops the guide repo .gitmodules and .gitignore', () => {
      expect(isGitWiringEntry(`${root}/.gitmodules`)).toBe(true);
      expect(isGitWiringEntry(`${root}/.gitignore`)).toBe(true);
    });

    it('drops the self-referential project-documents gitlink directory', () => {
      expect(isGitWiringEntry(`${root}/project-documents/`)).toBe(true);
      expect(isGitWiringEntry(`${root}/project-documents/ai-project-guide/`)).toBe(true);
    });

    it('keeps guide content and intentional dotfiles', () => {
      expect(isGitWiringEntry(`${root}/project-guides/guide.ai-project.process.md`)).toBe(false);
      expect(isGitWiringEntry(`${root}/.claude/rules/typescript.md`)).toBe(false);
      expect(isGitWiringEntry(`${root}/`)).toBe(false);
    });

    it('does not match prefixes of longer names', () => {
      expect(isGitWiringEntry(`${root}/.gitignore-templates/node`)).toBe(false);
      expect(isGitWiringEntry(`${root}/project-documents-archive/x.md`)).toBe(false);
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
});
