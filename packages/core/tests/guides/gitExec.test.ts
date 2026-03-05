import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gitExec, isGitAvailable, isGitRepo } from '../../src/guides/gitExec.js';

// Mock child_process.execFile
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'child_process';

const mockExecFile = vi.mocked(execFile);

describe('gitExec', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('gitExec()', () => {
    it('calls execFile with correct args and cwd', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'output text\n', '');
        return undefined as never;
      });

      const result = await gitExec(['status'], '/some/dir');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['status'],
        { cwd: '/some/dir' },
        expect.any(Function)
      );
      expect(result.stdout).toBe('output text');
      expect(result.stderr).toBe('');
    });

    it('rejects with descriptive error on non-zero exit', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const error = new Error('Command failed');
        (callback as Function)(error, '', 'fatal: not a git repository');
        return undefined as never;
      });

      await expect(gitExec(['status'], '/bad/dir')).rejects.toThrow(
        'git status failed in /bad/dir: fatal: not a git repository'
      );
    });

    it('uses error.message when stderr is empty', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const error = new Error('ENOENT: git not found');
        (callback as Function)(error, '', '');
        return undefined as never;
      });

      await expect(gitExec(['--version'], '/some/dir')).rejects.toThrow(
        'git --version failed in /some/dir: ENOENT: git not found'
      );
    });
  });

  describe('isGitAvailable()', () => {
    it('returns true when git succeeds', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'git version 2.43.0', '');
        return undefined as never;
      });

      expect(await isGitAvailable()).toBe(true);
    });

    it('returns false when git fails', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(new Error('not found'), '', '');
        return undefined as never;
      });

      expect(await isGitAvailable()).toBe(false);
    });
  });

  describe('isGitRepo()', () => {
    it('returns true inside a git repo', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'true', '');
        return undefined as never;
      });

      expect(await isGitRepo('/my/repo')).toBe(true);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--is-inside-work-tree'],
        { cwd: '/my/repo' },
        expect.any(Function)
      );
    });

    it('returns false outside a git repo', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(new Error('not a repo'), '', 'fatal: not a git repository');
        return undefined as never;
      });

      expect(await isGitRepo('/not/a/repo')).toBe(false);
    });
  });
});
