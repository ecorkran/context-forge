import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TarballStrategy, parseGitHubOwnerRepo } from '../../../src/guides/strategies/TarballStrategy.js';
import { VERSION_MARKER_FILE } from '../../../src/guides/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('../../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
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

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { gitExec } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockGitExec = vi.mocked(gitExec);

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

      expect(result).toEqual({ method: 'manual', version: 'v0.13.2', source: null });
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
      expect(result.success).toBe(true);
      expect(result.version).toBe('v0.13.2');
      expect(result.method).toBe('manual');
    });

    it('handles network failure with descriptive error', async () => {
      mockGitExec.mockRejectedValue(new Error('network'));

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('Could not determine latest version');
    });
  });

  describe('update()', () => {
    it('returns no-op when already at latest version', async () => {
      mockReadFileSync.mockReturnValue('v0.13.2\n');
      mockGitExec.mockResolvedValue({
        stdout: 'abc123\trefs/tags/v0.13.2\n',
        stderr: '',
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(result.previousVersion).toBe('v0.13.2');
      expect(result.newVersion).toBe('v0.13.2');
      expect(mockFetch).not.toHaveBeenCalled();
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

      const result = await strategy.update(projectPath, targetDir);

      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
      expect(mockFetch).toHaveBeenCalled();
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
