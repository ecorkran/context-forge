import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createContextPipeline, resolvePromptFilePath } from '../../src/services/CoreServiceFactory.js';
import { ContextTemplateEngine } from '../../src/services/ContextTemplateEngine.js';
import { ContextIntegrator } from '../../src/services/ContextIntegrator.js';
import { resolveTaskFilesForPrompt } from '../../src/services/taskFilesResolver.js';
import { resolveIntegrationBranchForPrompt } from '../../src/services/integrationBranchResolver.js';
import {
  PERMISSIVENESS_FRAGMENT_DIR,
  PERMISSIVENESS_PHASES,
} from '../../src/services/permissivenessResolver.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { PERMISSIVENESS_LEVELS } from '../../src/config/ConfigKeys.js';
import { TASK_BREAKDOWN_PHASE } from '../../src/schema/projectSchema.js';
import { createTestProjectData } from '../helpers/testData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PROJECT_PATH = join(__dirname, '..', 'fixtures', 'test-project');

describe('CoreServiceFactory — createContextPipeline', () => {
  it('returns engine and integrator with correct types', () => {
    const { engine, integrator } = createContextPipeline(FIXTURE_PROJECT_PATH);
    expect(engine).toBeInstanceOf(ContextTemplateEngine);
    expect(integrator).toBeInstanceOf(ContextIntegrator);
  });

  it('generates non-empty context from fixture project', async () => {
    const { integrator } = createContextPipeline(FIXTURE_PROJECT_PATH);
    const project = createTestProjectData({
      projectPath: FIXTURE_PROJECT_PATH,
      name: 'test-project',
      template: 'default',
      fileSlice: '100-slice.auth',
      instruction: 'implementation',
    });

    const context = await integrator.generateContextFromProject(project);
    expect(context).toBeTruthy();
    expect(context.length).toBeGreaterThan(0);
  });

  it('resolvePromptFilePath throws when guide is not installed', () => {
    expect(() => resolvePromptFilePath('/tmp/no-such-project')).toThrow('cf guide install');
  });

  it('resolvePromptFilePath returns path when guide is installed', () => {
    const result = resolvePromptFilePath(FIXTURE_PROJECT_PATH);
    expect(result).toContain('prompt.ai-project.system.md');
  });

  it('generated context contains project name', async () => {
    const { integrator } = createContextPipeline(FIXTURE_PROJECT_PATH);
    const project = createTestProjectData({
      projectPath: FIXTURE_PROJECT_PATH,
      name: 'my-context-forge',
    });

    const context = await integrator.generateContextFromProject(project);
    expect(context).toContain('my-context-forge');
  });
});

describe('CoreServiceFactory — permissiveness fragment (slice 246)', () => {
  const FIXTURE_FRAGMENTS = join(__dirname, '..', 'fixtures', 'permissiveness');
  // The most permissive level (last in the list); it has a fragment fixture.
  const FRAGMENT_LEVEL = PERMISSIVENESS_LEVELS[PERMISSIVENESS_LEVELS.length - 1];
  let checkout: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), 'cf-factory-permissiveness-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = join(root, 'user-data');
    checkout = join(root, 'project');
    cpSync(FIXTURE_PROJECT_PATH, checkout, { recursive: true });
    const fragmentDir = join(checkout, dirname(PROMPT_FILE_RELATIVE_PATH), PERMISSIVENESS_FRAGMENT_DIR);
    mkdirSync(fragmentDir, { recursive: true });
    cpSync(FIXTURE_FRAGMENTS, fragmentDir, { recursive: true });
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    rmSync(dirname(checkout), { recursive: true, force: true });
  });

  it('places the configured fragment after the instruction prompt and before the next section', async () => {
    await new ConfigManager(checkout).set('workflow.permissiveness', FRAGMENT_LEVEL, 'project');
    const { integrator } = createContextPipeline(checkout);
    const project = createTestProjectData({ projectPath: checkout, instruction: TASK_BREAKDOWN_PHASE });

    const context = await integrator.generateContextFromProject(project);

    const heading = `### Permissiveness: ${FRAGMENT_LEVEL}`;
    const instructionAt = context.indexOf('### Instruction Prompt');
    const fragmentAt = context.indexOf(heading);
    const nextSectionAt = context.indexOf('### 3rd-Party Tools & MCP');
    expect(instructionAt).toBeGreaterThanOrEqual(0);
    expect(fragmentAt).toBeGreaterThan(instructionAt);
    expect(nextSectionAt).toBeGreaterThan(fragmentAt);
    expect(readFileSync(join(FIXTURE_FRAGMENTS, `${FRAGMENT_LEVEL}.md`), 'utf-8')).toContain(
      context.slice(fragmentAt, nextSectionAt).trim()
    );
  });

  it.each([...PERMISSIVENESS_PHASES])(
    'is byte-identical to a pipeline without the resolver when the key is unset (%s)',
    async (phase) => {
      const { engine, integrator } = createContextPipeline(checkout);
      const withoutResolver = new ContextIntegrator(
        engine,
        true,
        (filePath: string) => readFileSync(filePath, 'utf-8'),
        resolveTaskFilesForPrompt,
        resolveIntegrationBranchForPrompt,
      );
      const project = createTestProjectData({ projectPath: checkout, instruction: phase });

      expect(await integrator.generateContextFromProject(project)).toBe(
        await withoutResolver.generateContextFromProject(project)
      );
    }
  );

  it('fails the build when the configured fragment is missing', async () => {
    await new ConfigManager(checkout).set('workflow.permissiveness', FRAGMENT_LEVEL, 'project');
    rmSync(join(checkout, dirname(PROMPT_FILE_RELATIVE_PATH), PERMISSIVENESS_FRAGMENT_DIR), {
      recursive: true,
      force: true,
    });
    const { integrator } = createContextPipeline(checkout);
    const project = createTestProjectData({ projectPath: checkout, instruction: TASK_BREAKDOWN_PHASE });

    await expect(integrator.generateContextFromProject(project)).rejects.toThrow('cf guides update');
  });
});
