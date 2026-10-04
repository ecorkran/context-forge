import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import {
  TarballStrategy,
  parseGitHubOwnerRepo,
  decideTarballEntry,
  readExcludeRecord,
  describeRateLimit,
  activeProxyEnvVars,
} from '../../../src/guides/strategies/TarballStrategy.js';
import { VERSION_MARKER_FILE, EXCLUDE_RECORD_FILE, GUIDE_RELATIVE_PATH } from '../../../src/guides/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  renameSync: vi.fn(),
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
vi.mock('tar', async () => {
  const { PassThrough: Stream } = await import('stream');
  // Return a writable stream mock
  return { extract: vi.fn(() => new Stream()) };
});

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

import { existsSync, readFileSync, writeFileSync, rmSync, renameSync } from 'fs';
import { extract } from 'tar';
import { pipeline } from 'stream/promises';
import { EnvHttpProxyAgent } from 'undici';
import { gitExec, commitPathIfChanged } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockGitExec = vi.mocked(gitExec);
const mockCommitPath = vi.mocked(commitPathIfChanged);
const mockRmSync = vi.mocked(rmSync);
const mockRenameSync = vi.mocked(renameSync);

describe('TarballStrategy', () => {
  let strategy: TarballStrategy;
  const projectPath = '/test/project';
  const targetDir = '/test/project/project-documents/ai-project-guide';
  const source = 'https://github.com/ecorkran/ai-project-guide.git';

  beforeEach(() => {
    // Reset (not just clear): tests install their own fs implementations, and
    // vitest 3 resets each mock back to its factory implementation.
    vi.resetAllMocks();
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

  describe('staging and swap', () => {
    const staging = '/test/project/project-documents/.ai-project-guide.staging';
    const previous = '/test/project/project-documents/.ai-project-guide.previous';

    function mockNewerRelease(): void {
      mockReadFileSync.mockReturnValue('v0.12.0\n');
      mockGitExec.mockResolvedValue({ stdout: 'def456\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
    }

    it('extracts into staging, then swaps it into place in order', async () => {
      mockNewerRelease();
      mockExistsSync.mockImplementation((p) => p === targetDir);
      const calls: string[] = [];
      mockRmSync.mockImplementation((p) => { calls.push(`rm ${p}`); });
      mockRenameSync.mockImplementation((from, to) => { calls.push(`rename ${from} -> ${to}`); });
      mockWriteFileSync.mockImplementation((p) => { calls.push(`write ${p}`); });
      vi.mocked(extract).mockImplementationOnce(((opts: { cwd: string }) => {
        calls.push(`extract ${opts.cwd}`);
        return new PassThrough();
      }) as never);

      await strategy.update(projectPath, targetDir, source);

      expect(calls).toEqual([
        `rm ${staging}`,
        `rm ${previous}`,
        `extract ${staging}`,
        `write ${staging}/${VERSION_MARKER_FILE}`,
        `rename ${targetDir} -> ${previous}`,
        `rename ${staging} -> ${targetDir}`,
        `rm ${previous}`,
      ]);
    });

    it('leaves the guide untouched when the download fails', async () => {
      mockNewerRelease();
      mockExistsSync.mockImplementation((p) => p === targetDir);
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      await expect(strategy.update(projectPath, targetDir, source)).rejects.toThrow('fetch failed');

      expect(mockRenameSync).not.toHaveBeenCalled();
      expect(mockRmSync).not.toHaveBeenCalledWith(targetDir, expect.anything());
    });

    it('removes the partial staging dir when extraction fails', async () => {
      mockNewerRelease();
      mockExistsSync.mockImplementation((p) => p === targetDir);
      const brokenArchive = new Error('TAR_BAD_ARCHIVE');
      vi.mocked(pipeline).mockRejectedValueOnce(brokenArchive);

      await expect(strategy.update(projectPath, targetDir, source)).rejects.toBe(brokenArchive);

      expect(mockRmSync).toHaveBeenLastCalledWith(staging, { recursive: true, force: true });
      expect(mockRenameSync).not.toHaveBeenCalled();
    });

    it('names the backup and keeps the swap error when the restore also fails', async () => {
      mockNewerRelease();
      mockExistsSync.mockImplementation((p) => p === targetDir);
      const swapError = new Error('EXDEV: rename failed');
      mockRenameSync.mockImplementation((from) => {
        if (from === staging) throw swapError;
        if (from === previous) throw new Error('EBUSY: restore failed');
      });

      const err = await strategy.update(projectPath, targetDir, source).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('EBUSY: restore failed');
      expect((err as Error).message).toContain(`The previous guide is at ${previous}`);
      expect((err as Error).cause).toBe(swapError);
    });

    it('restores the previous guide when the swap rename fails', async () => {
      mockNewerRelease();
      mockExistsSync.mockImplementation((p) => p === targetDir);
      const swapError = new Error('EXDEV: rename failed');
      mockRenameSync.mockImplementation((from) => {
        if (from === staging) throw swapError;
      });

      await expect(strategy.update(projectPath, targetDir, source)).rejects.toBe(swapError);

      expect(mockRenameSync.mock.calls).toEqual([
        [targetDir, previous],
        [staging, targetDir],
        [previous, targetDir],
      ]);
    });

    it('skips moving the guide aside on a first install', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
      mockExistsSync.mockReturnValue(false);

      await strategy.install(projectPath, source, targetDir);

      expect(mockRenameSync.mock.calls).toEqual([[staging, targetDir]]);
    });
  });

  describe('exclude filtering', () => {
    const root = 'ecorkran-ai-project-guide-3f14d43';

    it('reports patterns that matched no archive entry', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
      const kept: string[] = [];
      vi.mocked(extract).mockImplementationOnce(((opts: { filter: (p: string) => boolean }) => {
        for (const entry of [`${root}/`, `${root}/tool-guides/`, `${root}/tool-guides/a.md`, `${root}/scripts/setup-ide`]) {
          if (opts.filter(entry)) kept.push(entry);
        }
        return new PassThrough();
      }) as never);

      const result = await new TarballStrategy(['tool-guide', 'tool-guides']).install(projectPath, source, targetDir);

      expect(kept).toEqual([`${root}/`, `${root}/scripts/setup-ide`]);
      expect(result.exclude).toEqual(['tool-guide', 'tool-guides']);
      expect(result.unmatchedExclude).toEqual(['tool-guide']);
    });

    it('omits the exclude fields when nothing is excluded', async () => {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(result).not.toHaveProperty('exclude');
      expect(result).not.toHaveProperty('unmatchedExclude');
    });
  });

  describe('exclude record', () => {
    const markerPath = `${targetDir}/${VERSION_MARKER_FILE}`;
    const recordPath = `${targetDir}/${EXCLUDE_RECORD_FILE}`;

    /** Installed guide at v0.13.2 with the given record contents (null = no record). */
    function mockInstalledGuide(record: string | null): void {
      mockGitExec.mockResolvedValue({ stdout: 'abc123\trefs/tags/v0.13.2\n', stderr: '' });
      mockFetch.mockResolvedValue({ ok: true, body: new ReadableStream(), status: 200 });
      mockExistsSync.mockImplementation((p) => p === targetDir || (p === recordPath && record !== null));
      mockReadFileSync.mockImplementation(((p: string) => {
        if (p === markerPath) return 'v0.13.2\n';
        if (p === recordPath && record !== null) return record;
        throw new Error(`ENOENT: ${p}`);
      }) as never);
    }

    it('readExcludeRecord returns [] when the record is missing', () => {
      mockInstalledGuide(null);
      expect(readExcludeRecord(targetDir)).toEqual([]);
    });

    it('readExcludeRecord trims, drops blank lines, and sorts', () => {
      mockInstalledGuide('tool-guides \r\n\nframework-guides\n');
      expect(readExcludeRecord(targetDir)).toEqual(['framework-guides', 'tool-guides']);
    });

    it('readExcludeRecord does not re-validate entries against config rules', () => {
      // A record written before a path became protected stays readable.
      mockInstalledGuide('scripts\n');
      expect(readExcludeRecord(targetDir)).toEqual(['scripts']);
    });

    it('install writes the sorted record into staging when excludes are set', async () => {
      mockInstalledGuide(null);

      await new TarballStrategy(['tool-guides', 'framework-guides']).install(projectPath, source, targetDir);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        `/test/project/project-documents/.ai-project-guide.staging/${EXCLUDE_RECORD_FILE}`,
        'framework-guides\ntool-guides\n',
        'utf-8'
      );
    });

    it('install writes no record when nothing is excluded', async () => {
      mockInstalledGuide(null);

      await strategy.install(projectPath, source, targetDir);

      expect(mockWriteFileSync).not.toHaveBeenCalledWith(
        expect.stringContaining(EXCLUDE_RECORD_FILE),
        expect.anything(),
        expect.anything()
      );
    });

    it('returns early at the same version when the record matches', async () => {
      mockInstalledGuide('tool-guides\n');

      const result = await new TarballStrategy(['tool-guides']).update(projectPath, targetDir, source);

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockCommitPath).not.toHaveBeenCalled();
      expect(result).not.toHaveProperty('excludeChanged');
    });

    it('re-extracts the same version when the record differs', async () => {
      mockInstalledGuide('tool-guides\n');

      const result = await new TarballStrategy(['framework-guides']).update(projectPath, targetDir, source);

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/tarball/v0.13.2'), expect.anything());
      expect(result.excludeChanged).toBe(true);
      expect(result.newVersion).toBe('v0.13.2');
      expect(mockCommitPath).toHaveBeenCalledWith(
        projectPath,
        GUIDE_RELATIVE_PATH,
        'docs: re-extract ai-project-guide v0.13.2 (guide.exclude changed)'
      );
    });

    it('returns early with no record and no excludes configured', async () => {
      mockInstalledGuide(null);

      await strategy.update(projectPath, targetDir, source);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns early when the record differs only in order', async () => {
      mockInstalledGuide('tool-guides\nframework-guides\n');

      await new TarballStrategy(['framework-guides', 'tool-guides']).update(projectPath, targetDir, source);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('decideTarballEntry()', () => {
    // Real entry shapes from the v0.17.5 GitHub tarball: archive root prefix,
    // trailing slash on directories.
    const root = 'ecorkran-ai-project-guide-3f14d43';
    const keep = { skip: false, matchedExclude: [] };
    const builtInSkip = { skip: true, matchedExclude: [] };

    it('drops the guide repo .gitmodules and .gitignore', () => {
      expect(decideTarballEntry(`${root}/.gitmodules`, [])).toEqual(builtInSkip);
      expect(decideTarballEntry(`${root}/.gitignore`, [])).toEqual(builtInSkip);
    });

    it('drops the self-referential project-documents gitlink directory', () => {
      expect(decideTarballEntry(`${root}/project-documents/`, [])).toEqual(builtInSkip);
      expect(decideTarballEntry(`${root}/project-documents/ai-project-guide/`, [])).toEqual(builtInSkip);
    });

    it('keeps guide content and intentional dotfiles', () => {
      expect(decideTarballEntry(`${root}/project-guides/guide.ai-project.process.md`, [])).toEqual(keep);
      expect(decideTarballEntry(`${root}/.claude/rules/typescript.md`, [])).toEqual(keep);
      expect(decideTarballEntry(`${root}/`, [])).toEqual(keep);
    });

    it('does not match prefixes of longer names', () => {
      expect(decideTarballEntry(`${root}/.gitignore-templates/node`, [])).toEqual(keep);
      expect(decideTarballEntry(`${root}/project-documents-archive/x.md`, [])).toEqual(keep);
    });

    it('reports the matching guide.exclude pattern for files and directory entries', () => {
      const matched = { skip: true, matchedExclude: ['tool-guides'] };
      expect(decideTarballEntry(`${root}/tool-guides/`, ['tool-guides'])).toEqual(matched);
      expect(decideTarballEntry(`${root}/tool-guides/x/y.md`, ['tool-guides'])).toEqual(matched);
    });

    it('reports every overlapping pattern that matches', () => {
      expect(decideTarballEntry(`${root}/tool-guides/x/y.md`, ['tool-guides', 'tool-guides/x'])).toEqual({
        skip: true,
        matchedExclude: ['tool-guides', 'tool-guides/x'],
      });
    });

    it('reports a user pattern that repeats a built-in entry as matched', () => {
      expect(decideTarballEntry(`${root}/.gitignore`, ['.gitignore'])).toEqual({
        skip: true,
        matchedExclude: ['.gitignore'],
      });
    });

    it('keeps a sibling sharing a name prefix and the archive root', () => {
      expect(decideTarballEntry(`${root}/tool-guides-old/x`, ['tool-guides'])).toEqual(keep);
      expect(decideTarballEntry(`${root}/`, ['tool-guides'])).toEqual(keep);
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
