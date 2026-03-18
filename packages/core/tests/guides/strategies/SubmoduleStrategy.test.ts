import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubmoduleStrategy } from '../../../src/guides/strategies/SubmoduleStrategy.js';
import { GUIDE_RELATIVE_PATH } from '../../../src/guides/types.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  isGitAvailable: vi.fn(),
  isGitRepo: vi.fn(),
}));

import { existsSync, readFileSync } from 'fs';
import { gitExec, isGitAvailable, isGitRepo } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockGitExec = vi.mocked(gitExec);
const mockIsGitAvailable = vi.mocked(isGitAvailable);
const mockIsGitRepo = vi.mocked(isGitRepo);

describe('SubmoduleStrategy', () => {
  let strategy: SubmoduleStrategy;
  const projectPath = '/test/project';
  const targetDir = '/test/project/project-documents/ai-project-guide';
  const source = 'https://github.com/ecorkran/ai-project-guide.git';

  beforeEach(() => {
    vi.clearAllMocks();
    strategy = new SubmoduleStrategy();
  });

  describe('detect()', () => {
    it('returns result when .gitmodules contains path match', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        `[submodule "guide"]\n\tpath = ${GUIDE_RELATIVE_PATH}\n\turl = ${source}`
      );
      mockGitExec.mockResolvedValue({ stdout: 'v0.13.2', stderr: '' });

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toEqual({
        method: 'submodule',
        version: 'v0.13.2',
        source,
      });
    });

    it('returns null when .gitmodules is missing', async () => {
      mockExistsSync.mockReturnValue(false);

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toBeNull();
    });

    it('returns null when .gitmodules has no matching path', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('[submodule "other"]\n\tpath = some/other/path\n');

      const result = await strategy.detect(projectPath, targetDir);

      expect(result).toBeNull();
    });
  });

  describe('install()', () => {
    it('calls submodule add, git add, and git commit', async () => {
      mockIsGitAvailable.mockResolvedValue(true);
      mockIsGitRepo.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'submodule') return { stdout: '', stderr: '' };
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['submodule', 'add', source, GUIDE_RELATIVE_PATH],
        projectPath
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['add', '.gitmodules', GUIDE_RELATIVE_PATH],
        projectPath
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: install ai-project-guide v0.13.2'],
        projectPath
      );
      expect(result.success).toBe(true);
      expect(result.version).toBe('v0.13.2');
      expect(result.method).toBe('submodule');
    });

    it('errors when git is unavailable', async () => {
      mockIsGitAvailable.mockResolvedValue(false);

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('git is not available');
    });

    it('errors when not a git repo with helpful message', async () => {
      mockIsGitAvailable.mockResolvedValue(true);
      mockIsGitRepo.mockResolvedValue(false);

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('not a git repository');
    });
  });

  describe('update()', () => {
    it('calls submodule update, git add, and git commit when version changes', async () => {
      let describeCallCount = 0;
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') {
          describeCallCount++;
          return { stdout: describeCallCount === 1 ? 'v0.12.0' : 'v0.13.2', stderr: '' };
        }
        if (args[0] === 'submodule') return { stdout: '', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['submodule', 'update', '--remote', GUIDE_RELATIVE_PATH],
        projectPath
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['add', GUIDE_RELATIVE_PATH],
        projectPath
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: update ai-project-guide to v0.13.2'],
        projectPath
      );
      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
      expect(result.method).toBe('submodule');
    });

    it('skips git add and commit when version is unchanged', async () => {
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        if (args[0] === 'submodule') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).not.toHaveBeenCalledWith(
        expect.arrayContaining(['add']),
        expect.anything()
      );
      expect(mockGitExec).not.toHaveBeenCalledWith(
        expect.arrayContaining(['commit']),
        expect.anything()
      );
      expect(result.previousVersion).toBe('v0.13.2');
      expect(result.newVersion).toBe('v0.13.2');
    });

    it('commits without version suffix when no tag available', async () => {
      let describeCallCount = 0;
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') {
          describeCallCount++;
          if (describeCallCount === 1) return { stdout: 'v0.12.0', stderr: '' };
          throw new Error('no tags');
        }
        if (args[0] === 'submodule') return { stdout: '', stderr: '' };
        if (args[0] === 'add') return { stdout: '', stderr: '' };
        if (args[0] === 'commit') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      await strategy.update(projectPath, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: update ai-project-guide'],
        projectPath
      );
    });
  });

  describe('sync()', () => {
    it('calls gitExec with submodule update --init and the worktree path as cwd', async () => {
      mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });
      const worktreePath = '/test/worktree';

      await strategy.sync(worktreePath);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['submodule', 'update', '--init', GUIDE_RELATIVE_PATH],
        worktreePath
      );
    });

    it('propagates errors from gitExec', async () => {
      mockGitExec.mockRejectedValue(new Error('submodule update failed'));

      await expect(strategy.sync('/test/worktree'))
        .rejects.toThrow('submodule update failed');
    });

    it('does not use --remote flag', async () => {
      mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });

      await strategy.sync('/test/worktree');

      const call = mockGitExec.mock.calls[0];
      expect(call[0]).not.toContain('--remote');
    });
  });
});
