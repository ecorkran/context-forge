import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock child_process.execFile (used by isAncestor)
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock gitExec (used by evaluateBranchGuard for rev-parse)
vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
}));

import { execFile } from 'child_process';
import { gitExec } from '../../src/guides/gitExec.js';
import {
  isAncestor,
  evaluateBranchGuard,
  BranchGuardBlockedError,
  BranchGuardWarnError,
} from '../../src/guides/branchGuard.js';
import type { ConfigManager } from '../../src/config/ConfigManager.js';

const mockExecFile = vi.mocked(execFile);
const mockGitExec = vi.mocked(gitExec);

function mockConfigManager(integrationBranch: string | undefined): ConfigManager {
  return {
    get: vi.fn().mockResolvedValue({
      key: 'git.integration_branch',
      value: integrationBranch ?? '',
      source: integrationBranch ? 'project' : 'default',
      description: '',
    }),
  } as unknown as ConfigManager;
}

describe('isAncestor()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves true on exit code 0', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      (callback as Function)(null, '', '');
      return undefined as never;
    });

    await expect(isAncestor('main', '/repo')).resolves.toBe(true);
  });

  it('resolves false on exit code 1 (clean exit, no error)', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('Command failed'), { code: 1 });
      (callback as Function)(error, '', '');
      return undefined as never;
    });

    await expect(isAncestor('main', '/repo')).resolves.toBe(false);
  });

  it('rejects on exit code 128 (git error, e.g. invalid ref)', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('Command failed'), { code: 128 });
      (callback as Function)(error, '', 'fatal: bad revision');
      return undefined as never;
    });

    await expect(isAncestor('bogus-ref', '/repo')).rejects.toThrow(
      /merge-base --is-ancestor/
    );
  });

  it('rejects on spawn failure (execFile error callback with no numeric exit code)', async () => {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
      (callback as Function)(error, '', '');
      return undefined as never;
    });

    await expect(isAncestor('main', '/repo')).rejects.toThrow();
  });
});

describe('evaluateBranchGuard()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockCurrentBranch(name: string): void {
    mockGitExec.mockResolvedValue({ stdout: name, stderr: '' });
  }

  function mockAncestry(result: boolean): void {
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      if (result) {
        (callback as Function)(null, '', '');
      } else {
        const error = Object.assign(new Error('Command failed'), { code: 1 });
        (callback as Function)(error, '', '');
      }
      return undefined as never;
    });
  }

  it('trunk unset (main), current main -> proceed', async () => {
    mockCurrentBranch('main');
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager(undefined));
    expect(verdict).toEqual({ outcome: 'proceed' });
  });

  it('trunk unset (main), current HEAD (detached) -> block', async () => {
    mockCurrentBranch('HEAD');
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager(undefined));
    expect(verdict).toEqual({ outcome: 'block', trunk: 'main', current: 'HEAD' });
  });

  it('trunk unset (main), current descends from main -> warn (descends)', async () => {
    mockCurrentBranch('feature-x');
    mockAncestry(true);
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager(undefined));
    expect(verdict).toEqual({
      outcome: 'warn',
      trunk: 'main',
      current: 'feature-x',
      ancestry: 'descends',
    });
  });

  it('trunk unset (main), current unrelated to main -> warn (unrelated)', async () => {
    mockCurrentBranch('orphan-branch');
    mockAncestry(false);
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager(undefined));
    expect(verdict).toEqual({
      outcome: 'warn',
      trunk: 'main',
      current: 'orphan-branch',
      ancestry: 'unrelated',
    });
  });

  it('trunk set (dev/erik), current equals trunk -> proceed', async () => {
    mockCurrentBranch('dev/erik');
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager('dev/erik'));
    expect(verdict).toEqual({ outcome: 'proceed' });
  });

  it('trunk set, current main -> block', async () => {
    mockCurrentBranch('main');
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager('dev/erik'));
    expect(verdict).toEqual({ outcome: 'block', trunk: 'dev/erik', current: 'main' });
  });

  it('trunk set, current HEAD (detached) -> block (detached check runs before trunk/main check)', async () => {
    mockCurrentBranch('HEAD');
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager('dev/erik'));
    expect(verdict).toEqual({ outcome: 'block', trunk: 'dev/erik', current: 'HEAD' });
  });

  it('trunk set, current descends from trunk -> warn (descends)', async () => {
    mockCurrentBranch('feature-y');
    mockAncestry(true);
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager('dev/erik'));
    expect(verdict).toEqual({
      outcome: 'warn',
      trunk: 'dev/erik',
      current: 'feature-y',
      ancestry: 'descends',
    });
  });

  it('trunk set, current unrelated to trunk -> warn (unrelated)', async () => {
    mockCurrentBranch('orphan-branch');
    mockAncestry(false);
    const verdict = await evaluateBranchGuard('/repo', mockConfigManager('dev/erik'));
    expect(verdict).toEqual({
      outcome: 'warn',
      trunk: 'dev/erik',
      current: 'orphan-branch',
      ancestry: 'unrelated',
    });
  });

  it('isAncestor rejects (exit code >1) -> evaluateBranchGuard rejects, no warn verdict returned', async () => {
    mockCurrentBranch('feature-z');
    mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
      const error = Object.assign(new Error('Command failed'), { code: 128 });
      (callback as Function)(error, '', 'fatal: corrupted object');
      return undefined as never;
    });

    await expect(
      evaluateBranchGuard('/repo', mockConfigManager('dev/erik'))
    ).rejects.toThrow(/merge-base --is-ancestor/);
  });

  it('configManager.get rejects -> falls back to trunk=main, evaluates normally', async () => {
    mockCurrentBranch('main');
    const badConfigManager = {
      get: vi.fn().mockRejectedValue(new Error('config corrupted')),
    } as unknown as ConfigManager;

    const verdict = await evaluateBranchGuard('/repo', badConfigManager);
    expect(verdict).toEqual({ outcome: 'proceed' });
  });

  it('configManager omitted entirely -> treated as trunk unset (main)', async () => {
    mockCurrentBranch('main');
    const verdict = await evaluateBranchGuard('/repo');
    expect(verdict).toEqual({ outcome: 'proceed' });
  });
});

describe('BranchGuardBlockedError', () => {
  it('constructs with trunk/current, message, instanceof Error', () => {
    const err = new BranchGuardBlockedError('dev/erik', 'main');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BranchGuardBlockedError');
    expect(err.trunk).toBe('dev/erik');
    expect(err.current).toBe('main');
  });

  it('normal case message includes remediation: switching to trunk and unsetting git.integration_branch', () => {
    const err = new BranchGuardBlockedError('dev/erik', 'main');
    expect(err.message).toContain('dev/erik');
    expect(err.message).toContain('main');
    expect(err.message).toMatch(/switch/i);
    expect(err.message).toContain('git.integration_branch');
  });

  it('detached HEAD case message mentions detached HEAD and its distinct remediation (checking out a branch)', () => {
    const err = new BranchGuardBlockedError('dev/erik', 'HEAD');
    expect(err.message).toMatch(/detached HEAD/i);
    expect(err.message).toMatch(/check out a branch/i);
    expect(err.message).not.toMatch(/git\.integration_branch/);
  });
});

describe('BranchGuardWarnError', () => {
  it('descends and unrelated ancestry produce distinguishable message text', () => {
    const descends = new BranchGuardWarnError('main', 'feature-x', 'descends');
    const unrelated = new BranchGuardWarnError('main', 'orphan', 'unrelated');

    expect(descends).toBeInstanceOf(Error);
    expect(descends.name).toBe('BranchGuardWarnError');
    expect(descends.ancestry).toBe('descends');
    expect(unrelated.ancestry).toBe('unrelated');
    expect(descends.message).not.toBe(unrelated.message);
    expect(descends.message).toContain('feature-x');
    expect(unrelated.message).toContain('orphan');
  });
});
