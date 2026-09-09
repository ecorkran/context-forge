import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  gitExec,
  isGitAvailable,
  isGitRepo,
  withNetworkErrorHint,
  GUIDE_OFFLINE_REMEDIATION,
} from '../../src/guides/gitExec.js';

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
        expect.objectContaining({ cwd: '/some/dir' }),
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

    it('redacts embedded credentials from URL args in the failure message', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const error = new Error('Command failed');
        (callback as Function)(error, '', 'fatal: authentication failed');
        return undefined as never;
      });

      await expect(
        gitExec(['clone', 'https://myuser:ghp_supersecrettoken@github.com/x/y.git'], '/some/dir')
      ).rejects.toThrow('git clone https://github.com/x/y.git failed in /some/dir: fatal: authentication failed');
    });

    it('appends a remediation hint for DNS/network failures', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const error = new Error('Command failed');
        (callback as Function)(
          error,
          '',
          "fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com"
        );
        return undefined as never;
      });

      await expect(gitExec(['clone', 'https://github.com/x/y.git'], '/some/dir')).rejects.toThrow(
        /network\/DNS problem.*guide\.source/is
      );
    });

    it('disables interactive git prompts so a blocked credential/auth prompt cannot hang forever', async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        (callback as Function)(null, 'ok', '');
        return undefined as never;
      });

      await gitExec(['ls-remote', 'https://example.com/repo.git'], '/some/dir');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['ls-remote', 'https://example.com/repo.git'],
        expect.objectContaining({
          cwd: '/some/dir',
          env: expect.objectContaining({ GIT_TERMINAL_PROMPT: '0' }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('withNetworkErrorHint()', () => {
    it('appends a hint for known network-failure substrings', () => {
      const result = withNetworkErrorHint('Could not resolve host: github.com');
      expect(result).toContain('Could not resolve host: github.com');
      expect(result).toContain('network/DNS problem');
      expect(result).toContain('guide.source');
    });

    it('leaves unrelated messages unchanged', () => {
      const message = 'fatal: not a git repository';
      expect(withNetworkErrorHint(message)).toBe(message);
    });

    it('builds the hint from the shared remediation constant', () => {
      expect(withNetworkErrorHint('Could not resolve host: github.com')).toContain(
        GUIDE_OFFLINE_REMEDIATION,
      );
    });
  });

  // The CLI's setup-ide test mocks @context-forge/core/node and hand-copies this
  // string. Pin the exact text so that copy cannot silently drift (#78).
  describe('GUIDE_OFFLINE_REMEDIATION', () => {
    it('is the exact shared remediation text', () => {
      expect(GUIDE_OFFLINE_REMEDIATION).toBe(
        'Check your VPN/proxy connection, or install offline by pointing guide.source ' +
          'at a local path or mirror (cf config set guide.source <path>).',
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
        expect.objectContaining({ cwd: '/my/repo' }),
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
