import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CloneStrategy } from '../../../src/guides/strategies/CloneStrategy.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('../../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  isGitAvailable: vi.fn(),
}));

import { existsSync } from 'fs';
import { gitExec, isGitAvailable } from '../../../src/guides/gitExec.js';

const mockExistsSync = vi.mocked(existsSync);
const mockGitExec = vi.mocked(gitExec);
const mockIsGitAvailable = vi.mocked(isGitAvailable);

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
    it('calls git clone with correct source and target', async () => {
      mockIsGitAvailable.mockResolvedValue(true);
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'clone') return { stdout: '', stderr: '' };
        if (args[0] === 'describe') return { stdout: 'v0.13.2', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.install(projectPath, source, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['clone', source, targetDir],
        expect.any(String)
      );
      expect(result.success).toBe(true);
      expect(result.version).toBe('v0.13.2');
      expect(result.method).toBe('clone');
    });

    it('errors when git is unavailable', async () => {
      mockIsGitAvailable.mockResolvedValue(false);

      await expect(strategy.install(projectPath, source, targetDir))
        .rejects.toThrow('git is not available');
    });
  });

  describe('update()', () => {
    it('calls git pull --ff-only in target dir and returns versions', async () => {
      let describeCount = 0;
      mockGitExec.mockImplementation(async (args) => {
        if (args[0] === 'describe') {
          describeCount++;
          return { stdout: describeCount === 1 ? 'v0.12.0' : 'v0.13.2', stderr: '' };
        }
        if (args[0] === '-C') return { stdout: '', stderr: '' };
        throw new Error('unexpected');
      });

      const result = await strategy.update(projectPath, targetDir);

      expect(mockGitExec).toHaveBeenCalledWith(
        ['-C', targetDir, 'pull', '--ff-only'],
        expect.any(String)
      );
      expect(result.previousVersion).toBe('v0.12.0');
      expect(result.newVersion).toBe('v0.13.2');
      expect(result.method).toBe('clone');
    });
  });
});
