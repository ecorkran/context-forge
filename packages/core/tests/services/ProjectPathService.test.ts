import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProjectPathService } from '../../src/services/ProjectPathService.js';

describe('ProjectPathService', () => {
  const service = new ProjectPathService();
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cf-pathsvc-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('validate — valid structure', () => {
    it('validates a full project structure', async () => {
      // Create: project-documents/user/{slices,tasks,features,architecture}
      const userDir = join(tempDir, 'project-documents', 'user');
      await mkdir(join(userDir, 'slices'), { recursive: true });
      await mkdir(join(userDir, 'tasks'), { recursive: true });
      await mkdir(join(userDir, 'features'), { recursive: true });
      await mkdir(join(userDir, 'architecture'), { recursive: true });

      const result = await service.validate(tempDir);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.structure.hasProjectDocuments).toBe(true);
      expect(result.structure.hasUserDir).toBe(true);
      expect(result.structure.subdirectories).toContain('slices');
      expect(result.structure.subdirectories).toContain('tasks');
    });

    it('validates with project-documents but no user dir', async () => {
      await mkdir(join(tempDir, 'project-documents'), { recursive: true });

      const result = await service.validate(tempDir);
      expect(result.valid).toBe(true);
      expect(result.structure.hasProjectDocuments).toBe(true);
      expect(result.structure.hasUserDir).toBe(false);
      expect(result.structure.subdirectories).toHaveLength(0);
    });

    it('validates with user dir but no expected subdirectories', async () => {
      await mkdir(join(tempDir, 'project-documents', 'user'), { recursive: true });

      const result = await service.validate(tempDir);
      expect(result.valid).toBe(true);
      expect(result.structure.hasUserDir).toBe(true);
      expect(result.structure.subdirectories).toHaveLength(0);
    });
  });

  describe('validate — invalid paths', () => {
    it('rejects empty string', async () => {
      const result = await service.validate('');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path must be a non-empty string');
    });

    it('rejects null characters', async () => {
      const result = await service.validate('/path/with\0null');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path contains invalid characters');
    });

    it('rejects path traversal (..)', async () => {
      const result = await service.validate('/some/../path');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path contains invalid characters');
    });

    it('rejects non-existent path', async () => {
      const result = await service.validate(join(tempDir, 'nonexistent'));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path does not exist');
    });

    it('rejects non-directory (file)', async () => {
      const filePath = join(tempDir, 'afile.txt');
      await writeFile(filePath, 'content');

      const result = await service.validate(filePath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path is not a directory');
    });

    it('rejects when project-documents missing', async () => {
      // tempDir exists but has no project-documents/
      const result = await service.validate(tempDir);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('project-documents/ directory not found');
    });
  });

  describe('listDirectory — standard path resolution', () => {
    it('lists files in a subdirectory', async () => {
      const slicesDir = join(tempDir, 'project-documents', 'user', 'slices');
      await mkdir(slicesDir, { recursive: true });
      await writeFile(join(slicesDir, 'slice-a.md'), 'content');
      await writeFile(join(slicesDir, 'slice-b.md'), 'content');
      // Subdirectory should be excluded (only files)
      await mkdir(join(slicesDir, 'subdir'));

      const result = await service.listDirectory(tempDir, 'slices');
      expect(result.error).toBeUndefined();
      expect(result.files).toHaveLength(2);
      expect(result.files).toContain('slice-a.md');
      expect(result.files).toContain('slice-b.md');
    });

    it('returns empty for non-existent subdirectory', async () => {
      await mkdir(join(tempDir, 'project-documents', 'user'), { recursive: true });

      const result = await service.listDirectory(tempDir, 'nonexistent');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('not found');
    });
  });

  describe('listDirectory — security', () => {
    it('rejects path traversal in subdirectory', async () => {
      const result = await service.listDirectory(tempDir, '../etc');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('invalid characters');
    });

    it('rejects null characters in subdirectory', async () => {
      const result = await service.listDirectory(tempDir, 'slices\0evil');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('invalid characters');
    });

    it('rejects empty project path', async () => {
      const result = await service.listDirectory('', 'slices');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('non-empty string');
    });

    it('rejects null chars in project path', async () => {
      const result = await service.listDirectory('/path\0evil', 'slices');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('invalid characters');
    });

    it('rejects traversal in project path', async () => {
      const result = await service.listDirectory('/path/../etc', 'slices');
      expect(result.files).toHaveLength(0);
      expect(result.error).toContain('invalid characters');
    });
  });

  describe('healthCheck', () => {
    it('delegates to validate and returns same result', async () => {
      await mkdir(join(tempDir, 'project-documents'), { recursive: true });

      const validateResult = await service.validate(tempDir);
      const healthResult = await service.healthCheck(tempDir);

      expect(healthResult.valid).toBe(validateResult.valid);
      expect(healthResult.structure.hasProjectDocuments).toBe(
        validateResult.structure.hasProjectDocuments,
      );
    });
  });
});
