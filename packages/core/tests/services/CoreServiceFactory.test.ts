import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createContextPipeline, resolvePromptFilePath } from '../../src/services/CoreServiceFactory.js';
import { ContextTemplateEngine } from '../../src/services/ContextTemplateEngine.js';
import { ContextIntegrator } from '../../src/services/ContextIntegrator.js';
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
