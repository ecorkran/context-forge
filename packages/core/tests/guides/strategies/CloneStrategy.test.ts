import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloneStrategy } from '../../../src/guides/strategies/CloneStrategy.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  isGitAvailable: vi.fn(),
  isGitRepo: vi.fn(),
}));

import { existsSync } from 'fs';
import { gitExec, isGitAvailable, isGitRepo } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockGitExec = vi.mocked(gitExec);
const mockIsGitAvailable = vi.mocked(isGitAvailable);
const mockIsGitRepo = vi.mocked(isGitRepo);

describe('CloneStrategy', () => {
  let strategy: CloneStrategy;
  const projectPath = '/test/project';
  const targetDir = '/test/project/project-documents/ai-project-guide';
  const source = 'https://github.com/ecorkran/ai-project-guide.git';

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new CloneStrategy();
  });

  describe('detect()', () => {
    it('returns result when .git/ exists inside guide dir', async () => {
      mockExistsSync.mockReturnValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        if (args[0] === 'remote') return { stdout: source, stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toEqual({ method: 'clone', version: 'v0.13.2', source });
    });

    it('returns null when .git/ does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toBeNull();
    });
  });

  describe('install()', () => {
    it('calls git clone and auto-commits when parent is a git repo', async () => {
      mockIsGitAvailable.mockResolvedValue(true);
      mockIsGitRepo.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'clone') return { stdout: '', stderr: '' };
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['clone', source, targetDir],
        expect.any(String)
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: install ai-project-guide v0.13.2'],
        projectPath
      );
      expect(result.success).toBe(true);
      expect(result.version).toBe('v0.13.2');
      expect(result.method).toBe('clone');
    });

    it('skips commit when parent is not a git repo', async () => {
      mockIsGitAvailable.mockResolvedValue(true);
      mockIsGitRepo.mockResolvedValue(false);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'clone') return { stdout: '', stderr: '' };
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockGitExec).not.toHaveBeenCalledWith(
        expect.arrayContaining(['commit']),
        expect.anything()
      );
      expect(result.success).toBe(true);
    });

    it('errors when git is unavailable', async () => {
      mockIsGitAvailable.mockResolvedValue(false);

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('git is not available');
    });
  });

  describe('update()', () => {
    it('fetches, pulls, and auto-commits when version changes', async () => {
      let describeCount = 0;
      mockIsGitRepo.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') {
          describeCount++;
          return { stdout: describeCount === 1 ? 'v0.12.0' : 'v0.13.2', stderr: '' };
        }
        if (args[0] === 'fetch') return { stdout: '', stderr: '' };
        if (args[0] === 'pull') return { stdout: '', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['fetch', '--tags', 'origin'],
        targetDir
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['pull', '--ff-only'],
        targetDir
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: update ai-project-guide to v0.13.2'],
        projectPath
      );
      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
      expect(result.method).toBe('clone');
    });

    it('skips commit when version is unchanged', async () => {
      mockIsGitRepo.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        if (args[0] === 'fetch') return { stdout: '', stderr: '' };
        if (args[0] === 'pull') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).not.toHaveBeenCalledWith(
        expect.arrayContaining(['commit']),
        expect.anything()
      );
      expect(result.previousVersion).toBe('v0.13.2');
      expect(result.newVersion).toBe('v0.13.2');
    });

    it('falls back to tag checkout on detached HEAD', async () => {
      let describeCount = 0;
      mockIsGitRepo.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') {
          describeCount++;
          return { stdout: describeCount === 1 ? 'v0.12.0' : 'v0.13.2', stderr: '' };
        }
        if (args[0] === 'fetch') return { stdout: '', stderr: '' };
        if (args[0] === 'pull') throw new Error('not on a branch');
        if (args[0] === 'tag') return { stdout: 'v0.13.2\nv0.12.0\n', stderr: '' };
        if (args[0] === 'checkout') return { stdout: '', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['checkout', 'v0.13.2'],
        targetDir
      );
      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
    });
  });
});
