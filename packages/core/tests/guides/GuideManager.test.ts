import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuideManager } from '../../src/guides/GuideManager.js';
import { DEFAULT_SOURCE_GIT } from '../../src/guides/types.js';
import type { GuideInfo } from '../../src/guides/types.js';

// Mock fs
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  rmSync: vi.fn(),
}));

// Mock gitExec (used by uninstall via dynamic import)
vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
  isGitAvailable: vi.fn().mockResolvedValue(true),
  isGitRepo: vi.fn().mockResolvedValue(true),
}));

// Mock dependencies
vi.mock('../../src/guides/GuideDetector.js', () => ({
  GuideDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn(),
  })),
}));

vi.mock('../../src/guides/strategies/SubmoduleStrategy.js', () => ({
  SubmoduleStrategy: vi.fn().mockImplementation(() => ({
    install: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('../../src/guides/strategies/CloneStrategy.js', () => ({
  CloneStrategy: vi.fn().mockImplementation(() => ({
    install: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('../../src/guides/strategies/TarballStrategy.js', () => ({
  TarballStrategy: vi.fn().mockImplementation(() => ({
    install: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('../../src/guides/branchGuard.js', async () => {
  const actual = await vi.importActual('../../src/guides/branchGuard.js');
  return {
    ...actual,
    evaluateBranchGuard: vi.fn(),
  };
});

import { mkdirSync, existsSync, rmSync } from 'fs';
import { GuideDetector } from '../../src/guides/GuideDetector.js';
import { SubmoduleStrategy } from '../../src/guides/strategies/SubmoduleStrategy.js';
import { CloneStrategy } from '../../src/guides/strategies/CloneStrategy.js';
import { TarballStrategy } from '../../src/guides/strategies/TarballStrategy.js';
import { gitExec } from '../../src/guides/gitExec.js';
import { GUIDE_RELATIVE_PATH } from '../../src/guides/types.js';
import {
  evaluateBranchGuard,
  BranchGuardBlockedError,
  BranchGuardWarnError,
} from '../../src/guides/branchGuard.js';

describe('GuideManager', () => {
  const projectPath = '/test/project';

  const notInstalledInfo: GuideInfo = {
    installed: false,
    method: null,
    version: null,
    path: '/test/project/project-documents/ai-project-guide',
    source: DEFAULT_SOURCE_GIT,
    latestVersion: 'v0.13.2',
    updateAvailable: false,
    usingBundledPrompt: true,
  };

  const installedInfo: GuideInfo = {
    installed: true,
    method: 'submodule',
    version: 'v0.12.0',
    path: '/test/project/project-documents/ai-project-guide',
    source: DEFAULT_SOURCE_GIT,
    latestVersion: 'v0.13.2',
    updateAvailable: true,
    usingBundledPrompt: false,
  };

  let mockDetect: ReturnType<typeof vi.fn>;
  let mockConfigManager: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect = vi.fn();
    (GuideDetector as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      detect: mockDetect,
    }));
    mockConfigManager = {
      get: vi.fn().mockImplementation(async (key: string) => {
        if (key === 'guide.source') return { value: '', source: 'default' };
        if (key === 'guide.git_strategy') return { value: 'submodule', source: 'default' };
        throw new Error('unknown key');
      }),
    };
    // Default to 'proceed' so pre-existing update() tests (predating the branch guard)
    // aren't broken by the new unconditional guard call.
    vi.mocked(evaluateBranchGuard).mockResolvedValue({ outcome: 'proceed' });
  });

  describe('status()', () => {
    it('delegates to detector with resolved source from config', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const manager = new GuideManager(projectPath, mockConfigManager as never);

      const result = await manager.status();

      expect(mockDetect).toHaveBeenCalledWith(projectPath, DEFAULT_SOURCE_GIT, undefined);
      expect(result).toEqual(installedInfo);
    });

    it('uses custom source from config', async () => {
      const customSource = 'https://example.com/guide.git';
      mockConfigManager.get.mockImplementation(async (key: string) => {
        if (key === 'guide.source') return { value: customSource, source: 'user' };
        return { value: '', source: 'default' };
      });
      mockDetect.mockResolvedValue(notInstalledInfo);

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      await manager.status();

      expect(mockDetect).toHaveBeenCalledWith(projectPath, customSource, undefined);
    });
  });

  describe('install()', () => {
    it('reads strategy from config and delegates to correct strategy', async () => {
      mockDetect.mockResolvedValue(notInstalledInfo);
      const mockInstall = vi.fn().mockResolvedValue({
        success: true, version: 'v0.13.2', method: 'submodule', path: '/test/path',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: mockInstall,
        update: vi.fn(),
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.install();

      expect(mockInstall).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('strategy/source overrides take precedence over config', async () => {
      mockDetect.mockResolvedValue(notInstalledInfo);
      const mockCloneInstall = vi.fn().mockResolvedValue({
        success: true, version: 'v0.13.2', method: 'clone', path: '/test/path',
      });
      (CloneStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: mockCloneInstall,
        update: vi.fn(),
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      await manager.install('clone', 'https://custom.example.com/guide.git');

      expect(mockCloneInstall).toHaveBeenCalledWith(
        projectPath,
        'https://custom.example.com/guide.git',
        expect.any(String)
      );
    });

    it('creates user artifact directories after install', async () => {
      mockDetect.mockResolvedValue(notInstalledInfo);
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn().mockResolvedValue({ success: true, version: 'v0.13.2', method: 'submodule', path: '/test/path' }),
        update: vi.fn(),
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      await manager.install();

      const calls = vi.mocked(mkdirSync).mock.calls.map((c) => c[0]);
      expect(calls).toContain('/test/project/project-documents/user');
      expect(calls).toContain('/test/project/project-documents/user/architecture');
      expect(calls).toContain('/test/project/project-documents/user/slices');
      expect(calls).toContain('/test/project/project-documents/user/tasks');
      expect(calls).toContain('/test/project/project-documents/user/project-guides');
    });

    it('errors when guide already installed', async () => {
      mockDetect.mockResolvedValue(installedInfo);

      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.install()).rejects.toThrow('already installed');
    });
  });

  describe('update()', () => {
    it('detects current method and delegates to matching strategy', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.update();

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.previousVersion).toBe('v0.12.0');
    });

    it('errors when guide not installed', async () => {
      mockDetect.mockResolvedValue(notInstalledInfo);

      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.update()).rejects.toThrow('not installed');
    });

    it('does not call sync() when no operationPath is set', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockSync = vi.fn();
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
        sync: mockSync,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      await manager.update();

      expect(mockSync).not.toHaveBeenCalled();
    });

    it('calls sync(operationPath) after update when operationPath is set and method is submodule', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockSync = vi.fn();
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
        sync: mockSync,
      }));

      const operationPath = '/test/worktree';
      const manager = new GuideManager(projectPath, mockConfigManager as never, operationPath);
      await manager.update();

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSync).toHaveBeenCalledWith(operationPath, projectPath);
    });

    it('does not call sync() when operationPath equals projectPath', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockSync = vi.fn();
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
        sync: mockSync,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never, projectPath);
      await manager.update();

      expect(mockSync).not.toHaveBeenCalled();
    });

    it('does not call sync() when method is clone (not submodule)', async () => {
      const cloneInstalledInfo: GuideInfo = {
        ...installedInfo,
        method: 'clone',
      };
      mockDetect.mockResolvedValue(cloneInstalledInfo);
      const mockSync = vi.fn();
      const mockCloneUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'clone',
      });
      (CloneStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockCloneUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never, '/test/worktree');
      await manager.update();

      expect(mockCloneUpdate).toHaveBeenCalled();
      expect(mockSync).not.toHaveBeenCalled();
    });
  });

  describe('update - branch guard', () => {
    it('proceed verdict -> strategy.update() is called, returns normally', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({ outcome: 'proceed' });
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.update();

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('block verdict -> update() rejects with BranchGuardBlockedError, strategy.update() NOT called', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({
        outcome: 'block', trunk: 'dev/erik', current: 'main',
      });
      const mockUpdate = vi.fn();
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.update()).rejects.toBeInstanceOf(BranchGuardBlockedError);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('warn verdict, no opts -> rejects with BranchGuardWarnError, strategy.update() NOT called', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({
        outcome: 'warn', trunk: 'main', current: 'feature-x', ancestry: 'descends',
      });
      const mockUpdate = vi.fn();
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.update()).rejects.toBeInstanceOf(BranchGuardWarnError);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('warn verdict, update({ confirmed: true }) -> strategy.update() IS called, returns normally', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({
        outcome: 'warn', trunk: 'main', current: 'feature-x', ancestry: 'descends',
      });
      const mockUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.update({ confirmed: true });

      expect(mockUpdate).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('update - TarballStrategy (manual) evaluates guard like any other strategy', () => {
    it("info.method === 'manual', guard returns proceed -> TarballStrategy.update() is called normally", async () => {
      const manualInstalledInfo: GuideInfo = { ...installedInfo, method: 'manual' };
      mockDetect.mockResolvedValue(manualInstalledInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({ outcome: 'proceed' });
      const mockTarballUpdate = vi.fn().mockResolvedValue({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'manual',
      });
      (TarballStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockTarballUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.update();

      expect(mockTarballUpdate).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it("info.method === 'manual', guard returns block -> TarballStrategy.update() NOT called, BranchGuardBlockedError thrown", async () => {
      const manualInstalledInfo: GuideInfo = { ...installedInfo, method: 'manual' };
      mockDetect.mockResolvedValue(manualInstalledInfo);
      vi.mocked(evaluateBranchGuard).mockResolvedValue({
        outcome: 'block', trunk: 'dev/erik', current: 'main',
      });
      const mockTarballUpdate = vi.fn();
      (TarballStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: mockTarballUpdate,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.update()).rejects.toBeInstanceOf(BranchGuardBlockedError);
      expect(mockTarballUpdate).not.toHaveBeenCalled();
    });
  });

  describe('uninstall()', () => {
    const mockGitExec = vi.mocked(gitExec);
    const mockExistsSync = vi.mocked(existsSync);
    const mockRmSync = vi.mocked(rmSync);

    beforeEach(() => {
      mockGitExec.mockResolvedValue({ stdout: '', stderr: '' });
      mockExistsSync.mockReturnValue(false);
      mockRmSync.mockReturnValue(undefined);
    });

    it('performs full uninstall when no operationPath is set', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const manager = new GuideManager(projectPath, mockConfigManager as never);

      const result = await manager.uninstall();

      expect(result).toEqual({ success: true, method: 'submodule', version: 'v0.12.0' });
      // Should call submodule deinit on projectPath
      expect(mockGitExec).toHaveBeenCalledWith(
        ['submodule', 'deinit', '-f', GUIDE_RELATIVE_PATH],
        projectPath,
      );
      // Should call git rm
      expect(mockGitExec).toHaveBeenCalledWith(
        ['rm', '-f', GUIDE_RELATIVE_PATH],
        projectPath,
      );
      // Should commit
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', 'docs: uninstall ai-project-guide v0.12.0'],
        projectPath,
      );
    });

    it('performs full uninstall when operationPath equals projectPath', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const manager = new GuideManager(projectPath, mockConfigManager as never, projectPath);

      await manager.uninstall();

      // Should still do full uninstall (same path = main repo)
      expect(mockGitExec).toHaveBeenCalledWith(
        ['rm', '-f', GUIDE_RELATIVE_PATH],
        projectPath,
      );
      expect(mockGitExec).toHaveBeenCalledWith(
        ['commit', '-m', expect.stringContaining('uninstall')],
        projectPath,
      );
    });

    it('removes .git/modules when they exist during full uninstall', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      mockExistsSync.mockReturnValue(true);
      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await manager.uninstall();

      expect(mockRmSync).toHaveBeenCalledWith(
        `/test/project/.git/modules/${GUIDE_RELATIVE_PATH}`,
        { recursive: true, force: true },
      );
    });

    it('performs worktree-scoped deinit and removes guide dir when operationPath differs', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      mockExistsSync.mockReturnValue(true);
      const worktreePath = '/test/worktree';
      const manager = new GuideManager(projectPath, mockConfigManager as never, worktreePath);

      const result = await manager.uninstall();

      expect(result).toEqual({ success: true, method: 'submodule', version: 'v0.12.0' });
      // Should call submodule deinit on the WORKTREE path
      expect(mockGitExec).toHaveBeenCalledWith(
        ['submodule', 'deinit', '-f', GUIDE_RELATIVE_PATH],
        worktreePath,
      );
      // Should physically remove the guide directory from the worktree
      expect(mockRmSync).toHaveBeenCalledWith(
        `${worktreePath}/${GUIDE_RELATIVE_PATH}`,
        { recursive: true, force: true },
      );
      // Should NOT call git rm or commit (shared state)
      expect(mockGitExec).not.toHaveBeenCalledWith(
        ['rm', '-f', GUIDE_RELATIVE_PATH],
        expect.anything(),
      );
      expect(mockGitExec).not.toHaveBeenCalledWith(
        ['commit', '-m', expect.anything()],
        expect.anything(),
      );
      // Should have been called exactly once (only deinit)
      expect(mockGitExec).toHaveBeenCalledTimes(1);
    });

    it('removes clone/manual directory without git operations', async () => {
      const cloneInfo = { ...installedInfo, method: 'clone' as const };
      mockDetect.mockResolvedValue(cloneInfo);
      mockExistsSync.mockReturnValue(true);

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const result = await manager.uninstall();

      expect(result.method).toBe('clone');
      expect(mockRmSync).toHaveBeenCalledWith(
        `${projectPath}/${GUIDE_RELATIVE_PATH}`,
        { recursive: true, force: true },
      );
      expect(mockGitExec).not.toHaveBeenCalled();
    });

    it('errors when guide not installed', async () => {
      mockDetect.mockResolvedValue(notInstalledInfo);
      const manager = new GuideManager(projectPath, mockConfigManager as never);

      await expect(manager.uninstall()).rejects.toThrow('not installed');
    });
  });

  describe('syncWorktrees()', () => {
    it('calls sync() for each path and collects results', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockSync = vi.fn().mockResolvedValue(undefined);
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: vi.fn(),
        sync: mockSync,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const results = await manager.syncWorktrees(['/wt1', '/wt2']);

      expect(results).toEqual([
        { worktreePath: '/wt1', success: true },
        { worktreePath: '/wt2', success: true },
      ]);
      expect(mockSync).toHaveBeenCalledTimes(2);
    });

    it('returns success: false with error for failing paths without stopping', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const mockSync = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('sync failed'))
        .mockResolvedValueOnce(undefined);
      (SubmoduleStrategy as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
        install: vi.fn(),
        update: vi.fn(),
        sync: mockSync,
      }));

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const results = await manager.syncWorktrees(['/wt1', '/wt2', '/wt3']);

      expect(results).toEqual([
        { worktreePath: '/wt1', success: true },
        { worktreePath: '/wt2', success: false, error: 'sync failed' },
        { worktreePath: '/wt3', success: true },
      ]);
    });

    it('returns empty array when method is not submodule', async () => {
      const cloneInstalledInfo: GuideInfo = {
        ...installedInfo,
        method: 'clone',
      };
      mockDetect.mockResolvedValue(cloneInstalledInfo);

      const manager = new GuideManager(projectPath, mockConfigManager as never);
      const results = await manager.syncWorktrees(['/wt1']);

      expect(results).toEqual([]);
    });
  });
});
