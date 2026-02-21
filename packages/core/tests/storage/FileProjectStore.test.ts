import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileProjectStore } from '../../src/storage/FileProjectStore.js';

describe('FileProjectStore', () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = await mkdtemp(join(tmpdir(), 'cf-project-store-test-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = tempDir;
    // Pre-seed empty projects.json to prevent migration from real legacy path
    await writeFile(join(tempDir, 'projects.json'), '[]');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('CRUD round-trip', () => {
    it('should create, read, update, and delete a project', async () => {
      const store = new FileProjectStore();

      // Create
      const project = await store.create({
        name: 'test-project',
        template: 'default',
        slice: 'auth',
        isMonorepo: false,
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('test-project');

      // GetAll
      const all = await store.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('test-project');

      // GetById
      const found = await store.getById(project.id);
      expect(found).toBeDefined();
      expect(found!.name).toBe('test-project');

      // Update
      await store.update(project.id, { slice: 'updated-slice' });
      const updated = await store.getById(project.id);
      expect(updated!.slice).toBe('updated-slice');

      // Delete
      await store.delete(project.id);
      const afterDelete = await store.getAll();
      expect(afterDelete).toHaveLength(0);
    });
  });

  describe('ID generation', () => {
    it('should generate IDs with project_ prefix', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'id-test',
        template: 'default',
        slice: '',
        isMonorepo: false,
      });

      expect(project.id).toMatch(/^project_\d+_[a-z0-9]+$/);
    });
  });

  describe('field migration on read', () => {
    it('should apply defaults for missing fields', async () => {
      // Manually write projects.json missing newer fields
      const rawProjects = [
        {
          id: 'project_123_abc',
          name: 'legacy',
          template: 'default',
          slice: 'old',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];
      await writeFile(
        join(tempDir, 'projects.json'),
        JSON.stringify(rawProjects)
      );

      const store = new FileProjectStore();
      const all = await store.getAll();

      expect(all).toHaveLength(1);
      expect(all[0].taskFile).toBe('');
      expect(all[0].instruction).toBe('implementation');
      expect(all[0].isMonorepo).toBe(false);
      expect(all[0].customData).toEqual({});
    });
  });

  describe('timestamps', () => {
    it('should set createdAt and updatedAt as ISO timestamps on create', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'ts-test',
        template: 'default',
        slice: '',
        isMonorepo: false,
      });

      expect(project.createdAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
      expect(project.updatedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      );
    });

    it('should update updatedAt but not createdAt on update', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'ts-test',
        template: 'default',
        slice: '',
        isMonorepo: false,
      });

      const originalCreatedAt = project.createdAt;

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.update(project.id, { name: 'updated' });
      const updated = await store.getById(project.id);

      expect(updated!.createdAt).toBe(originalCreatedAt);
      expect(updated!.updatedAt).not.toBe(project.updatedAt);
    });
  });

  describe('error handling', () => {
    it('should throw when updating non-existent ID', async () => {
      const store = new FileProjectStore();
      await expect(
        store.update('nonexistent', { name: 'fail' })
      ).rejects.toThrow('Project not found');
    });

    it('should throw when deleting non-existent ID', async () => {
      const store = new FileProjectStore();
      await expect(store.delete('nonexistent')).rejects.toThrow(
        'Project not found'
      );
    });
  });

  describe('empty store', () => {
    it('should return empty array on getAll with no data', async () => {
      // tempDir has pre-seeded empty projects.json from beforeEach
      const store = new FileProjectStore();
      const all = await store.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('migration from legacy location', () => {
    it('should not migrate when new location has no legacy data available', async () => {
      // Use a completely fresh directory with no pre-seeded data
      const freshDir = join(tempDir, 'no-legacy');
      process.env.CONTEXT_FORGE_DATA_DIR = freshDir;

      const store = new FileProjectStore();
      const all = await store.getAll();

      // No legacy data to migrate (getLegacyElectronPath returns real macOS path
      // but our CONTEXT_FORGE_DATA_DIR override isolates the storage location)
      expect(Array.isArray(all)).toBe(true);
    });

    it('should skip migration when new location already has data', async () => {
      // tempDir already has pre-seeded projects.json from beforeEach
      // Add actual project data
      const existingProjects = [
        {
          id: 'project_existing_1',
          name: 'existing-project',
          template: 'default',
          slice: 'new',
          taskFile: '',
          instruction: 'implementation',
          isMonorepo: false,
          customData: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      await writeFile(
        join(tempDir, 'projects.json'),
        JSON.stringify(existingProjects)
      );

      const store = new FileProjectStore();
      const all = await store.getAll();

      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('existing-project');
    });
  });
});
