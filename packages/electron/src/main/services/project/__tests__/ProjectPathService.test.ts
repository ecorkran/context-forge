import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectPathService } from '../ProjectPathService';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readdir: vi.fn(),
  },
}));

import * as fs from 'fs';

const mockStat = vi.mocked(fs.promises.stat);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockReaddir = vi.mocked(fs.promises.readdir) as any;

/** Helper to create a mock stat result for a directory. */
function dirStat() {
  return { isDirectory: () => true, isFile: () => false } as unknown as fs.Stats;
}

/** Helper to create a mock ENOENT error. */
function enoent() {
  const err = new Error('ENOENT') as NodeJS.ErrnoException;
  err.code = 'ENOENT';
  return err;
}

/** Helper to create a mock EACCES error. */
function eacces() {
  const err = new Error('EACCES') as NodeJS.ErrnoException;
  err.code = 'EACCES';
  return err;
}

describe('ProjectPathService', () => {
  let service: ProjectPathService;

  beforeEach(() => {
    service = new ProjectPathService();
    vi.clearAllMocks();
  });

  describe('validate', () => {
    it('should return invalid for empty string', async () => {
      const result = await service.validate('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path must be a non-empty string');
    });

    it('should return invalid for null-byte path', async () => {
      const result = await service.validate('/some/path\0bad');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path contains invalid characters');
    });

    it('should return invalid for path traversal', async () => {
      const result = await service.validate('/some/../escape');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path contains invalid characters');
    });

    it('should return invalid when path does not exist', async () => {
      mockStat.mockRejectedValueOnce(enoent());

      const result = await service.validate('/nonexistent');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path does not exist');
    });

    it('should return invalid when path has no permissions', async () => {
      mockStat.mockRejectedValueOnce(eacces());

      const result = await service.validate('/restricted');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Permission denied');
    });

    it('should return invalid when path is not a directory', async () => {
      mockStat.mockResolvedValueOnce({
        isDirectory: () => false,
      } as unknown as fs.Stats);

      const result = await service.validate('/some/file.txt');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path is not a directory');
    });

    it('should return invalid when project-documents/ is missing', async () => {
      mockStat
        .mockResolvedValueOnce(dirStat()) // project root
        .mockRejectedValueOnce(enoent()); // project-documents/

      const result = await service.validate('/my/project');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('project-documents/ directory not found');
      expect(result.structure.hasProjectDocuments).toBe(false);
    });

    it('should return valid with project-documents/ but no user/', async () => {
      mockStat
        .mockResolvedValueOnce(dirStat()) // project root
        .mockResolvedValueOnce(dirStat()) // project-documents/
        .mockRejectedValueOnce(enoent()); // user/ missing

      const result = await service.validate('/my/project');
      expect(result.valid).toBe(true);
      expect(result.structure.hasProjectDocuments).toBe(true);
      expect(result.structure.hasUserDir).toBe(false);
      expect(result.structure.subdirectories).toEqual([]);
    });

    it('should detect existing subdirectories under user/', async () => {
      mockStat
        .mockResolvedValueOnce(dirStat()) // project root
        .mockResolvedValueOnce(dirStat()) // project-documents/
        .mockResolvedValueOnce(dirStat()) // user/
        .mockResolvedValueOnce(dirStat()) // slices/
        .mockRejectedValueOnce(enoent())  // tasks/ missing
        .mockResolvedValueOnce(dirStat()) // features/
        .mockRejectedValueOnce(enoent()); // architecture/ missing

      const result = await service.validate('/my/project');
      expect(result.valid).toBe(true);
      expect(result.structure.hasProjectDocuments).toBe(true);
      expect(result.structure.hasUserDir).toBe(true);
      expect(result.structure.subdirectories).toEqual(['slices', 'features']);
    });

    it('should detect all four subdirectories when present', async () => {
      mockStat
        .mockResolvedValueOnce(dirStat()) // project root
        .mockResolvedValueOnce(dirStat()) // project-documents/
        .mockResolvedValueOnce(dirStat()) // user/
        .mockResolvedValueOnce(dirStat()) // slices/
        .mockResolvedValueOnce(dirStat()) // tasks/
        .mockResolvedValueOnce(dirStat()) // features/
        .mockResolvedValueOnce(dirStat()); // architecture/

      const result = await service.validate('/my/project');
      expect(result.valid).toBe(true);
      expect(result.structure.subdirectories).toEqual([
        'slices',
        'tasks',
        'features',
        'architecture',
      ]);
    });

    it('should always return the projectPath in the result', async () => {
      mockStat.mockRejectedValueOnce(enoent());

      const result = await service.validate('/test/path');
      expect(result.projectPath).toBe('/test/path');
    });
  });

  describe('healthCheck', () => {
    it('should delegate to validate', async () => {
      mockStat.mockRejectedValueOnce(enoent());

      const result = await service.healthCheck('/nonexistent');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path does not exist');
    });
  });

  describe('listDirectory', () => {
    it('should return error for empty path', async () => {
      const result = await service.listDirectory('', 'slices');
      expect(result.files).toEqual([]);
      expect(result.error).toBe('Path must be a non-empty string');
    });

    it('should return error for path with traversal in subdirectory', async () => {
      const result = await service.listDirectory('/valid', '../escape');
      expect(result.files).toEqual([]);
      expect(result.error).toBe('Subdirectory contains invalid characters');
    });

    it('should list files from standard project path', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: '128-slice.project-path.md', isFile: () => true, isDirectory: () => false },
        { name: '100-slice.foundation.md', isFile: () => true, isDirectory: () => false },
        { name: '.gitkeep', isFile: () => true, isDirectory: () => false },
        { name: 'subdirectory', isFile: () => false, isDirectory: () => true },
      ] as unknown as fs.Dirent[]);

      const result = await service.listDirectory('/my/project', 'slices');
      expect(result.files).toEqual([
        '128-slice.project-path.md',
        '100-slice.foundation.md',
        '.gitkeep',
      ]);
      expect(result.error).toBeUndefined();

      // Verify correct path was used (non-monorepo)
      expect(mockReaddir).toHaveBeenCalledWith(
        expect.stringContaining('project-documents'),
        { withFileTypes: true },
      );
    });

    it('should use project-artifacts/ path for monorepo', async () => {
      mockReaddir.mockResolvedValueOnce([
        { name: 'file.md', isFile: () => true, isDirectory: () => false },
      ] as unknown as fs.Dirent[]);

      const result = await service.listDirectory('/my/project', 'slices', true);
      expect(result.files).toEqual(['file.md']);
      expect(mockReaddir).toHaveBeenCalledWith(
        expect.stringContaining('project-artifacts'),
        { withFileTypes: true },
      );
    });

    it('should return empty array with error when directory not found', async () => {
      mockReaddir.mockRejectedValueOnce(enoent());

      const result = await service.listDirectory('/my/project', 'slices');
      expect(result.files).toEqual([]);
      expect(result.error).toBe('Directory not found: slices');
    });

    it('should return error for permission denied', async () => {
      mockReaddir.mockRejectedValueOnce(eacces());

      const result = await service.listDirectory('/my/project', 'slices');
      expect(result.files).toEqual([]);
      expect(result.error).toBe('Permission denied');
    });

    it('should return empty array for empty directory', async () => {
      mockReaddir.mockResolvedValueOnce([]);

      const result = await service.listDirectory('/my/project', 'tasks');
      expect(result.files).toEqual([]);
      expect(result.error).toBeUndefined();
    });
  });
});
