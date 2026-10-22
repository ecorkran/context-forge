import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { SquadronProbe } from '../src/adoption/contracts.js';
import type { ProbeOutcome } from '../src/detection/squadronProbe.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../src/services/constants.js';
import { createTestProjectData } from './helpers/testData.js';
import { FileProjectStore } from '../src/storage/FileProjectStore.js';
import { createContextPipeline } from '../src/services/CoreServiceFactory.js';

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
      'fixtures',
      'test-project'
    );
    const project = await store.create({
      name: 'test-project',
      template: 'default',
      fileSlice: 'auth',

      projectPath: fixtureProjectPath,
    });

    // 2. Verify project persists
    const loaded = await store.getById(project.id);
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('test-project');

    // 3. Wire up context pipeline with fixture path
    const { integrator } = createContextPipeline(fixtureProjectPath, { adoptionStateWrites: 'read-only' });

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
      fileSlice: '',

    });
    expect(project.id).toMatch(/^project_/);

    // Read all
    const all = await store.getAll();
    expect(all).toHaveLength(1);

    // Update
    await store.update(project.id, { fileSlice: 'updated-slice' });
    const updated = await store.getById(project.id);
    expect(updated!.fileSlice).toBe('updated-slice');

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
      fileSlice: '',

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

  describe('brownfield build with an injected squadron probe', () => {
    const CONCEPT = 'Phase 0: Concept';
    const COMPREHENSION = 'user/analysis/944-analysis.codebase-comprehension.md';
    let checkout: string;

    const probeReturning = (outcome: ProbeOutcome): SquadronProbe => async () => outcome;

    async function build(probe: SquadronProbe): Promise<string> {
      const { integrator } = createContextPipeline(checkout, {
        adoptionStateWrites: 'read-only',
        squadronProbe: probe,
      });
      const project = createTestProjectData({ projectPath: checkout, instruction: CONCEPT });
      return integrator.generateContextFromProject(project);
    }

    beforeEach(async () => {
      checkout = await mkdtemp(join(tmpdir(), 'cf-squadron-path-'));
      const guide = join(checkout, PROMPT_FILE_RELATIVE_PATH);
      await mkdir(dirname(guide), { recursive: true });
      await cp(join(__dirname, 'fixtures', 'brownfield-guide', PROMPT_FILE_RELATIVE_PATH), guide);
      await mkdir(join(checkout, 'src'), { recursive: true });
      const body = Array.from({ length: 2100 }, (_, i) => `export const v${i} = ${i};`).join('\n');
      await writeFile(join(checkout, 'src', 'big.ts'), body);
    });

    afterEach(async () => {
      await rm(checkout, { recursive: true, force: true });
    });

    it('available probe with a null field and a WARNING line → the JSON block and the line are in the prompt', async () => {
      const json = '{"probe_version":1,"graph":{"commits_behind":null}}';
      const output = await build(
        probeReturning({ kind: 'available', json, warnings: ['WARNING graph.commits_behind unknown'] }),
      );
      expect(output).toContain(json);
      expect(output).toContain('WARNING graph.commits_behind unknown');
    });

    it('unavailable probe → the statement carries the reason and the stderr line', async () => {
      const output = await build(
        probeReturning({
          kind: 'unavailable',
          reason: { kind: 'non-zero-exit', exitCode: 2 },
          warnings: ["No such command 'probe'."],
        }),
      );
      expect(output).toContain('- Squadron: unavailable. `sq probe --json` exited with code 2.');
      expect(output).toContain("No such command 'probe'.");
    });

    const unavailable = probeReturning({ kind: 'unavailable', reason: { kind: 'not-found' }, warnings: [] });

    it('comprehension document present → Comprehension line in Project Context', async () => {
      const dir = join(checkout, 'project-documents', 'user', 'analysis');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, '944-analysis.codebase-comprehension.md'),
        '---\ndocType: analysis\nproject: sample\n---\n# Comprehension\n',
      );
      expect(await build(unavailable)).toContain(`Comprehension: ${COMPREHENSION}`);
    });

    it('comprehension document absent → no Comprehension text anywhere', async () => {
      expect(await build(unavailable)).not.toContain('Comprehension');
    });
  });
});
