import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuideManager } from '../../src/guides/GuideManager.js';
import { DEFAULT_SOURCE_GIT } from '../../src/guides/types.js';
import type { GuideInfo } from '../../src/guides/types.js';

// Mock fs for mkdirSync
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
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

import { mkdirSync } from 'fs';
import { GuideDetector } from '../../src/guides/GuideDetector.js';
import { SubmoduleStrategy } from '../../src/guides/strategies/SubmoduleStrategy.js';
import { CloneStrategy } from '../../src/guides/strategies/CloneStrategy.js';
import { TarballStrategy } from '../../src/guides/strategies/TarballStrategy.js';

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
  });

  describe('status()', () => {
    it('delegates to detector with resolved source from config', async () => {
      mockDetect.mockResolvedValue(installedInfo);
      const manager = new GuideManager(projectPath, mockConfigManager as never);

      const result = await manager.status();

      expect(mockDetect).toHaveBeenCalledWith(projectPath, DEFAULT_SOURCE_GIT);
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

      expect(mockDetect).toHaveBeenCalledWith(projectPath, customSource);
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
  });
});
