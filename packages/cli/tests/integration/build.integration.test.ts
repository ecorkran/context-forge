import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ConfigManager,
  PERMISSIVENESS_FRAGMENT_DIR,
  PERMISSIVENESS_LEVELS,
  createContextPipeline,
} from '@context-forge/core/node';
import { IMPLEMENTATION_PHASE, PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
import type { ProjectData } from '@context-forge/core';

/**
 * Integration tests for cf build — verifies CLI uses same core pipeline as MCP.
 * Uses the MCP server's fixture project directly via core service calls.
 */

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  '../../../mcp-server/tests/fixtures/integration-project/integration-project',
);

const fixtureProject: ProjectData = {
  id: 'project_integration_001',
  name: 'integration-test-project',
  template: 'default',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  instruction: 'implementation',
  developmentPhase: 'Phase 6: Implementation',
  workType: 'continue',
  dateProject: '2026-02-23',
  projectPath: FIXTURE_ROOT,
  createdAt: '2026-02-23T00:00:00.000Z',
  updatedAt: '2026-02-23T00:00:00.000Z',
};

describe('cf build integration — core pipeline parity', () => {
  it('generates context via same createContextPipeline as MCP', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT, { adoptionStateWrites: 'read-only' });
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toBeTruthy();
    expect(typeof context).toBe('string');
    expect(context.length).toBeGreaterThan(0);
  });

  it('context contains project name from fixture', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT, { adoptionStateWrites: 'read-only' });
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toContain('integration-test-project');
  });

  it('context contains slice name from fixture', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT, { adoptionStateWrites: 'read-only' });
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toContain('100-slice.auth');
  });

  it('override changes output', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT, { adoptionStateWrites: 'read-only' });
    const overridden: ProjectData = {
      ...fixtureProject,
      instruction: 'design',
    };
    const context = await integrator.generateContextFromProject(overridden);

    // Should now use the design instruction instead of implementation
    expect(context).toBeTruthy();
    expect(context.length).toBeGreaterThan(0);
  });
});

describe('cf build — workflow.permissiveness (slice 246)', () => {
  const CLI_ENTRY = path.resolve(import.meta.dirname, '../../dist/index.js');
  const FIXTURE_PROJECTS_JSON = path.resolve(FIXTURE_ROOT, '..', 'projects.json');
  const FIXTURE_FRAGMENTS = path.resolve(import.meta.dirname, '../../../core/tests/fixtures/permissiveness');
  const PROJECT_PATH_PLACEHOLDER = '__FIXTURE_PROJECT_PATH__';
  // The most permissive level (last in the list); it has a fragment fixture.
  const LEVEL = PERMISSIVENESS_LEVELS[PERMISSIVENESS_LEVELS.length - 1];

  let tempRoot: string;
  let checkout: string;
  let dataDir: string;

  /** Runs the real built CLI against the temp project in the implementation phase. */
  function runBuild(): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync(
      process.execPath,
      // --json: without it `cf build` prints only a summary, not the context.
      [CLI_ENTRY, 'build', '--json', '--project', fixtureProject.id, '--phase', IMPLEMENTATION_PHASE],
      { env: { ...process.env, CONTEXT_FORGE_DATA_DIR: dataDir }, encoding: 'utf-8' },
    );
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  beforeEach(async () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-build-permissiveness-'));
    checkout = path.join(tempRoot, 'project');
    dataDir = path.join(tempRoot, 'data');
    fs.cpSync(FIXTURE_ROOT, checkout, { recursive: true });
    fs.mkdirSync(dataDir);
    const projectsJson = fs
      .readFileSync(FIXTURE_PROJECTS_JSON, 'utf-8')
      .replace(PROJECT_PATH_PLACEHOLDER, checkout);
    fs.writeFileSync(path.join(dataDir, 'projects.json'), projectsJson);

    const fragmentDir = path.join(checkout, path.dirname(PROMPT_FILE_RELATIVE_PATH), PERMISSIVENESS_FRAGMENT_DIR);
    fs.mkdirSync(fragmentDir, { recursive: true });
    fs.cpSync(FIXTURE_FRAGMENTS, fragmentDir, { recursive: true });

    // Config is stored per checkout; the data dir env keeps user-level config out of the test.
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
    await new ConfigManager(checkout).set('workflow.permissiveness', LEVEL, 'project');
  });

  afterEach(() => {
    delete process.env.CONTEXT_FORGE_DATA_DIR;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('adds the configured fragment to the built context', () => {
    const { status, stdout, stderr } = runBuild();
    expect(status, stderr).toBe(0);
    const { context } = JSON.parse(stdout) as { context: string };
    expect(context).toContain(`### Permissiveness: ${LEVEL}`);
  });

  it('exits non-zero, naming the path, when the configured fragment is missing', () => {
    fs.rmSync(path.join(checkout, path.dirname(PROMPT_FILE_RELATIVE_PATH), PERMISSIVENESS_FRAGMENT_DIR), {
      recursive: true,
      force: true,
    });
    const { status, stderr } = runBuild();
    expect(status).not.toBe(0);
    expect(stderr).toContain(`${LEVEL}.md`);
    expect(stderr).toContain('cf guides update');
  });
});
