import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, chmod } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileProjectStore } from '../../src/storage/FileProjectStore.js';
import { WorktreeService } from '../../src/services/WorktreeService.js';

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
        fileSlice: 'auth',

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
      await store.update(project.id, { fileSlice: 'updated-slice' });
      const updated = await store.getById(project.id);
      expect(updated!.fileSlice).toBe('updated-slice');

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
        fileSlice: '',

      });

      expect(project.id).toMatch(/^project_\d+_[a-z0-9]+$/);
    });
  });

  // NOTE: getAll() returns project fields verbatim. migrateProjectFields() was
  // intentionally removed (commit 8da8cc8): legacy-field renaming is no longer
  // papered over at read time; cf get / cf get --json both consume a
  // schema-filtered view via buildProjectGetView() (see PROJECT_FIELDS). The one
  // read-time migration is worktree `isDefault` (slice 934), tested in
  // 'default worktree marker migration' below. None of these fixtures has
  // `worktrees`, so that migration does not touch them.
  describe('read returns stored fields verbatim', () => {
    it('should pass through new-schema fields unchanged (idempotent)', async () => {
      const newSchemaProject = [
        {
          id: 'project_new_001',
          name: 'new-schema',
          template: 'default',
          fileSlice: '100-slice.auth',
          fileTasks: '100-tasks.auth',
          dateProject: '2026-01-01',
          instruction: 'implementation',
  
          customData: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      await writeFile(
        join(tempDir, 'projects.json'),
        JSON.stringify(newSchemaProject)
      );

      const store = new FileProjectStore();
      const all = await store.getAll();

      expect(all).toHaveLength(1);
      expect(all[0].fileSlice).toBe('100-slice.auth');
      expect(all[0].fileTasks).toBe('100-tasks.auth');
      expect(all[0].dateProject).toBe('2026-01-01');
    });

    it('should prefer new-schema fields when both old and new names are present', async () => {
      const mixedSchemaProject = [
        {
          id: 'project_mixed_001',
          name: 'mixed-schema',
          template: 'default',
          slice: 'old-slice',
          fileSlice: 'new-slice',
          taskFile: 'old-tasks',
          fileTasks: 'new-tasks',
          projectDate: '2026-01-01',
          dateProject: '2026-02-01',
          instruction: 'implementation',
  
          customData: {},
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      await writeFile(
        join(tempDir, 'projects.json'),
        JSON.stringify(mixedSchemaProject)
      );

      const store = new FileProjectStore();
      const all = await store.getAll();

      expect(all[0].fileSlice).toBe('new-slice');
      expect(all[0].fileTasks).toBe('new-tasks');
      expect(all[0].dateProject).toBe('2026-02-01');
    });

    it('should set artifact fields to undefined when absent and preserve when present', async () => {
      const projectWithArtifacts = [
        {
          id: 'project_art_001',
          name: 'artifact-project',
          template: 'default',
          fileSlice: '161-slice.schema',
          fileTasks: '161-tasks.schema',
          instruction: 'implementation',
  
          customData: {},
          fileHLD: 'project-documents/user/architecture/050-hld.md',
          fileArch: 'project-documents/user/architecture/060-arch.md',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ];
      await writeFile(
        join(tempDir, 'projects.json'),
        JSON.stringify(projectWithArtifacts)
      );

      const store = new FileProjectStore();
      const all = await store.getAll();

      expect(all[0].fileHLD).toBe('project-documents/user/architecture/050-hld.md');
      expect(all[0].fileArch).toBe('project-documents/user/architecture/060-arch.md');
      expect(all[0].fileSlicePlan).toBeUndefined();
      expect(all[0].fileSpec).toBeUndefined();
    });
  });

  describe('create() uses new field names', () => {
    it('should store project with new field names exclusively', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'new-fields-test',
        template: 'default',
        fileSlice: '161-slice.schema',
        fileTasks: '161-tasks.schema',
        dateProject: '2026-02-28',

      });

      expect(project.fileSlice).toBe('161-slice.schema');
      expect(project.fileTasks).toBe('161-tasks.schema');
      expect(project.dateProject).toBe('2026-02-28');
    });

    it('should set artifact fields on create when provided', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'artifact-create-test',
        template: 'default',
        fileSlice: '161-slice.schema',

        fileHLD: 'project-documents/user/architecture/050-hld.md',
        fileSpec: 'project-documents/user/spec.md',
      });

      expect(project.fileHLD).toBe('project-documents/user/architecture/050-hld.md');
      expect(project.fileSpec).toBe('project-documents/user/spec.md');
      expect(project.fileArch).toBeUndefined();
      expect(project.fileSlicePlan).toBeUndefined();
    });
  });

  describe('timestamps', () => {
    it('should set createdAt and updatedAt as ISO timestamps on create', async () => {
      const store = new FileProjectStore();
      const project = await store.create({
        name: 'ts-test',
        template: 'default',
        fileSlice: '',

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
        fileSlice: '',

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
          fileSlice: 'new-slice',
          fileTasks: '',
          instruction: 'implementation',
  
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

  describe('default worktree marker migration', () => {
    const PROJECT_PATH = '/work/proj';

    /** Realistic pre-934 shape: a `default` worktree at the project path, no isDefault, plus a sibling. */
    function legacyProject(id: string, defaultName = 'default') {
      return {
        id,
        name: `name-${id}`,
        template: 'default',
        projectPath: PROJECT_PATH,
        customData: {},
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        worktrees: [
          { id: `${id}_d`, name: defaultName, indexRange: [100, 799], worktreePath: PROJECT_PATH },
          { id: `${id}_s`, name: 'sibling', indexRange: [800, 899], worktreePath: '/work/sibling' },
        ],
      };
    }

    const projectsFile = () => join(tempDir, 'projects.json');
    const seed = (projects: unknown[]) => writeFile(projectsFile(), JSON.stringify(projects, null, 2));

    // The printed-warnings set is module state, so each test loads a fresh module.
    async function loadStore() {
      const { FileProjectStore: Store } = await import('../../src/storage/FileProjectStore.js');
      return new Store();
    }

    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      vi.resetModules();
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('returns migrated isDefault values and does not write the file', async () => {
      await seed([legacyProject('p1')]);
      const before = await readFile(projectsFile(), 'utf-8');

      const all = await (await loadStore()).getAll();

      expect(all[0].worktrees?.map((w) => w.isDefault)).toEqual([true, false]);
      expect(await readFile(projectsFile(), 'utf-8')).toBe(before);
    });

    it('saves the migrated fields for every project on the next update()', async () => {
      await seed([legacyProject('p1'), legacyProject('p2')]);
      const store = await loadStore();

      await store.update('p1', { fileSlice: 'touched' });

      const onDisk = JSON.parse(await readFile(projectsFile(), 'utf-8')) as ReturnType<typeof legacyProject>[];
      for (const project of onDisk) {
        expect(project.worktrees.map((w) => (w as { isDefault?: boolean }).isDefault)).toEqual([true, false]);
      }
    });

    it('prints each warning once per process, however often it reads', async () => {
      await seed([legacyProject('p1', 'main-line')]);
      const store = await loadStore();

      await store.getAll();
      await store.getAll();
      await (await loadStore()).getAll(); // same module instance: cached import

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(String(warnSpy.mock.calls[0][0])).toContain('renamed default');
    });

    it('warns on stderr only: console.warn is used, stdout is not', async () => {
      await seed([legacyProject('p1', 'main-line')]);
      const logSpy = vi.mocked(console.log);
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

      await (await loadStore()).getAll();

      expect(warnSpy).toHaveBeenCalled();
      expect(logSpy).not.toHaveBeenCalled();
      expect(stdoutSpy).not.toHaveBeenCalled();
    });

    it('reads migrated data from a read-only projects.json without error', async () => {
      await seed([legacyProject('p1')]);
      await chmod(projectsFile(), 0o444);
      try {
        const all = await (await loadStore()).getAll();
        expect(all[0].worktrees?.map((w) => w.isDefault)).toEqual([true, false]);
      } finally {
        await chmod(projectsFile(), 0o644);
      }
    });

    it('lists migrated worktrees through a real WorktreeService on a read-only file', async () => {
      await seed([legacyProject('p1')]);
      await chmod(projectsFile(), 0o444);
      try {
        const service = new WorktreeService(await loadStore());
        const worktrees = await service.listWorktrees('p1');
        expect(worktrees.map((w) => w.isDefault)).toEqual([true, false]);
      } finally {
        await chmod(projectsFile(), 0o644);
      }
    });

    it('does not mark a worktree later renamed to default, even in a fresh store', async () => {
      await seed([legacyProject('p1')]);
      const service = new WorktreeService(await loadStore());

      await service.removeWorktree('p1', 'p1_d');
      await service.updateWorktree('p1', 'p1_s', { name: 'default' });

      const all = await (await loadStore()).getAll();
      expect(all[0].worktrees).toHaveLength(1);
      expect(all[0].worktrees?.[0].name).toBe('default');
      expect(all[0].worktrees?.[0].isDefault).toBe(false);
    });
  });
});
