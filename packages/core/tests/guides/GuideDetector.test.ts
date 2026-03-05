import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GuideDetector, isNewerVersion } from '../../src/guides/GuideDetector.js';
import { DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH, VERSION_MARKER_FILE } from '../../src/guides/types.js';
import { join } from 'path';

// Mock fs and gitExec
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
}));

import { existsSync, readFileSync } from 'fs';
import { gitExec } from '../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockGitExec = vi.mocked(gitExec);

describe('GuideDetector', () => {
  let detector: GuideDetector;
  const projectPath = '/test/project';
  const guidePath = join(projectPath, GUIDE_RELATIVE_PATH);

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new GuideDetector();
    // Default: ls-remote fails (no network)
    mockGitExec.mockRejectedValue(new Error('network'));
  });

  describe('detect()', () => {
    it('returns installed:false when directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      const info = await detector.detect(projectPath);

      expect(info.installed).toBe(false);
      expect(info.method).toBeNull();
      expect(info.usingBundledPrompt).toBe(true);
      expect(info.path).toBe(guidePath);
      expect(info.source).toBe(DEFAULT_SOURCE_GIT);
    });

    it('detects clone method when .git/ exists inside guide dir', async () => {
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === guidePath) return true;
        if (path === join(guidePath, '.git')) return true;
        return false;
      });
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        throw new Error('network');
      });

      const info = await detector.detect(projectPath);

      expect(info.installed).toBe(true);
      expect(info.method).toBe('clone');
      expect(info.version).toBe('v0.13.2');
      expect(info.usingBundledPrompt).toBe(false);
    });

    it('detects submodule method when .gitmodules contains path', async () => {
      const gitmodulesPath = join(projectPath, '.gitmodules');
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === guidePath) return true;
        if (path === join(guidePath, '.git')) return false;
        if (path === gitmodulesPath) return true;
        return false;
      });
      mockReadFileSync.mockReturnValue(
        `[submodule "ai-project-guide"]\n\tpath = ${GUIDE_RELATIVE_PATH}\n\turl = https://github.com/ecorkran/ai-project-guide.git`
      );
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.12.0', stderr: '' };
        throw new Error('network');
      });

      const info = await detector.detect(projectPath);

      expect(info.installed).toBe(true);
      expect(info.method).toBe('submodule');
      expect(info.version).toBe('v0.12.0');
    });

    it('detects manual method with version from marker file', async () => {
      const markerPath = join(guidePath, VERSION_MARKER_FILE);
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === guidePath) return true;
        if (path === join(guidePath, '.git')) return false;
        // No .gitmodules
        return false;
      });
      mockReadFileSync.mockImplementation((p) => {
        if (String(p) === markerPath) return 'v0.11.0\n';
        throw new Error('ENOENT');
      });

      const info = await detector.detect(projectPath);

      expect(info.installed).toBe(true);
      expect(info.method).toBe('manual');
      expect(info.version).toBe('v0.11.0');
    });

    it('detects manual method with null version when no marker', async () => {
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === guidePath) return true;
        return false;
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const info = await detector.detect(projectPath);

      expect(info.installed).toBe(true);
      expect(info.method).toBe('manual');
      expect(info.version).toBeNull();
    });

    it('sets latestVersion:null on network failure without throwing', async () => {
      mockExistsSync.mockReturnValue(false);

      const info = await detector.detect(projectPath);

      expect(info.latestVersion).toBeNull();
      expect(info.updateAvailable).toBe(false);
    });

    it('computes updateAvailable when latestVersion > version', async () => {
      mockExistsSync.mockImplementation((p) => {
        const path = String(p);
        if (path === guidePath) return true;
        if (path === join(guidePath, '.git')) return true;
        return false;
      });
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') return { stdout: 'v0.12.0', stderr: '' };
        if (args[0] === 'ls-remote') {
          return {
            stdout: 'abc123\trefs/tags/v0.12.0\ndef456\trefs/tags/v0.13.2\n',
            stderr: '',
          };
        }
        throw new Error('unexpected');
      });

      const info = await detector.detect(projectPath);

      expect(info.version).toBe('v0.12.0');
      expect(info.latestVersion).toBe('v0.13.2');
      expect(info.updateAvailable).toBe(true);
    });

    it('uses provided source override', async () => {
      mockExistsSync.mockReturnValue(false);
      const customSource = 'https://example.com/guide.git';

      const info = await detector.detect(projectPath, customSource);

      expect(info.source).toBe(customSource);
    });
  });

  describe('isNewerVersion()', () => {
    it('returns true when latest > current', () => {
      expect(isNewerVersion('v0.12.0', 'v0.13.2')).toBe(true);
    });

    it('returns false when latest <= current', () => {
      expect(isNewerVersion('v0.13.2', 'v0.13.2')).toBe(false);
      expect(isNewerVersion('v0.14.0', 'v0.13.2')).toBe(false);
    });

    it('returns false when either is null', () => {
      expect(isNewerVersion(null, 'v0.13.2')).toBe(false);
      expect(isNewerVersion('v0.13.2', null)).toBe(false);
    });
  });
});
