import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { FileProjectStore } from '../storage/FileProjectStore.js';
import { createContextPipeline } from '../services/CoreServiceFactory.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Context Pipeline Integration (no Electron)', () => {
  let tempDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cf-pipeline-test-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = tempDir;
    // Pre-seed empty projects.json to prevent legacy migration
    await writeFile(join(tempDir, 'projects.json'), '[]');
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates a project and generates context', async () => {
    const store = new FileProjectStore();

    // 1. Create a project via core storage
    const fixtureProjectPath = join(
      __dirname,
      '__fixtures__',
      'test-project'
    );
    const project = await store.create({
      name: 'test-project',
      template: 'default',
      slice: 'auth',
      isMonorepo: false,
      projectPath: fixtureProjectPath,
    });

    // 2. Verify project persists
    const loaded = await store.getById(project.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('test-project');

    // 3. Wire up context pipeline with fixture path
    const { integrator } = createContextPipeline(fixtureProjectPath);

    // 4. Generate context from the project
    const context = await integrator.generateContextFromProject(loaded!);

    // 5. Verify context was generated
    expect(context).toBeDefined();
    expect(typeof context).toBe('string');
    expect(context.length).toBeGreaterThan(0);
  });

  it('round-trips CRUD operations', async () => {
    const store = new FileProjectStore();

    // Create
    const project = await store.create({
      name: 'crud-test',
      template: 'default',
      slice: '',
      isMonorepo: false,
    });
    expect(project.id).toMatch(/^project_/);

    // Read all
    const all = await store.getAll();
    expect(all).toHaveLength(1);

    // Update
    await store.update(project.id, { slice: 'updated-slice' });
    const updated = await store.getById(project.id);
    expect(updated!.slice).toBe('updated-slice');

    // Delete
    await store.delete(project.id);
    const afterDelete = await store.getAll();
    expect(afterDelete).toHaveLength(0);
  });

  it('recovers from backup on corrupted main file', async () => {
    const store = new FileProjectStore();

    // Create valid data
    const project = await store.create({
      name: 'backup-test',
      template: '',
      slice: '',
      isMonorepo: false,
    });

    // Force a second write so .backup contains the project data
    // (first write backed up the pre-seeded empty array)
    await store.update(project.id, { name: 'backup-test' });

    // Now corrupt main file
    await writeFile(join(tempDir, 'projects.json'), 'NOT VALID JSON');

    // New store instance should recover from backup
    const freshStore = new FileProjectStore();
    const projects = await freshStore.getAll();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('backup-test');
  });
});
