import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createContextPipeline } from '../src/services/CoreServiceFactory.js';
import { FileProjectStore } from '../src/storage/FileProjectStore.js';
import { CONCEPT_PHASE } from '../src/schema/projectSchema.js';

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'pure-build-golden');
const PROJECT_PATH_PLACEHOLDER = '<PROJECT_PATH>';
const PINNED_PROJECT_DATE = '2026-01-15';

// Golden outputs captured on the pre-268 build. Slice 268 must not change a byte of them.
describe('pure build golden outputs (slice 268)', () => {
  let dataDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-golden-test-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
    await writeFile(join(dataDir, 'projects.json'), '[]');
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
    else process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    await rm(dataDir, { recursive: true, force: true });
  });

  async function build(fixtureName: string, overrides: Record<string, string>): Promise<string> {
    const projectPath = join(GOLDEN_DIR, fixtureName);
    const store = new FileProjectStore();
    const project = await store.create({
      name: `golden-${fixtureName}`,
      template: 'default',
      fileSlice: '',
      projectPath,
      dateProject: PINNED_PROJECT_DATE,
      ...overrides,
    });
    const { integrator } = createContextPipeline(projectPath);
    const output = await integrator.generateContextFromProject(project);
    return output.split(projectPath).join(PROJECT_PATH_PLACEHOLDER);
  }

  async function expectGolden(fileName: string, actual: string): Promise<void> {
    const goldenPath = join(GOLDEN_DIR, fileName);
    expect(actual).toBe(await readFile(goldenPath, 'utf-8'));
  }

  it('greenfield at Phase 0', async () => {
    const output = await build('greenfield', { instruction: CONCEPT_PHASE });
    await expectGolden('greenfield.golden.md', output);
  });

  it('planned project at Phase 4', async () => {
    const output = await build('planned', {
      instruction: 'design',
      fileArch: '200-arch.golden-app.md',
      fileSlicePlan: '200-slices.golden-app.md',
      fileSlice: '200-slice.golden-slice',
    });
    await expectGolden('planned.golden.md', output);
  });
});
