/**
 * Slice 261: `cf build` and `context_build` must assemble the same brownfield
 * prompt. Both go through createContextPipeline, so this runs the CLI path
 * (pipeline + integrator, as build.ts does) and the MCP tool on one checkout.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ConfigManager, FileProjectStore, createContextPipeline } from '@context-forge/core/node';
import { CONCEPT_PHASE, PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
import {
  createIntegrationClient,
  setupFixtureEnv,
  type FixtureEnv,
  type IntegrationClient,
} from '../helpers/integrationSetup.js';

const FIXTURE_PROJECT_ID = 'project_integration_001';
const FIXTURE_DIR = path.resolve(import.meta.dirname, '../fixtures/integration-project');
const BROWNFIELD_GUIDE = path.resolve(
  import.meta.dirname,
  '../../../core/tests/fixtures/brownfield-guide',
  PROMPT_FILE_RELATIVE_PATH,
);
const PROJECT_PATH_PLACEHOLDER = '__FIXTURE_PROJECT_PATH__';
const BROWNFIELD_PROMPT = 'We are adopting an existing codebase.';
const SOURCE_LINES = 2100;

let fixtureEnv: FixtureEnv;
let ctx: IntegrationClient;
let client: Client;
let checkout: string;

beforeAll(async () => {
  fixtureEnv = await setupFixtureEnv();
  ctx = await createIntegrationClient();
  client = ctx.client;
});

afterAll(async () => {
  await ctx.cleanup();
  await fixtureEnv.cleanup();
});

afterEach(() => {
  // Unset when the test failed before creating the checkout; don't mask that failure.
  if (checkout) fs.rmSync(checkout, { recursive: true, force: true });
});

function createBrownfieldCheckout(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mcp-adoption-'));
  fs.cpSync(path.join(FIXTURE_DIR, 'integration-project'), dir, { recursive: true });
  fs.cpSync(BROWNFIELD_GUIDE, path.join(dir, PROMPT_FILE_RELATIVE_PATH));
  const source = Array.from({ length: SOURCE_LINES }, (_, i) => `export const v${i} = ${i};`).join('\n');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'big.ts'), source);

  const projectsJson = fs
    .readFileSync(path.join(FIXTURE_DIR, 'projects.json'), 'utf-8')
    .replace(PROJECT_PATH_PLACEHOLDER, dir);
  fs.writeFileSync(path.join(fixtureEnv.tempDir, 'projects.json'), projectsJson);
  return dir;
}

describe('cf build / context_build parity (slice 261)', () => {
  it('produces identical brownfield prompts', async () => {
    checkout = createBrownfieldCheckout();

    // MCP path. The first build records adoption.state = in_progress.
    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: FIXTURE_PROJECT_ID, instruction: CONCEPT_PHASE },
    });
    expect(result.isError).toBeFalsy();
    const mcpPrompt = (result.content as { type: string; text: string }[])[0].text;
    expect(mcpPrompt).toContain(BROWNFIELD_PROMPT);
    expect(await new ConfigManager(checkout).get('adoption.state')).toMatchObject({ value: 'in_progress' });

    // Back to the pre-build state, so the CLI path decides from the same inputs.
    fs.rmSync(path.join(checkout, '.context-forge.toml'));

    // CLI path, as packages/cli/src/commands/build.ts does it.
    const project = await new FileProjectStore().getById(FIXTURE_PROJECT_ID);
    expect(project).toBeDefined();
    const workingCopy = { ...project!, instruction: CONCEPT_PHASE };
    const { integrator } = createContextPipeline(workingCopy.projectPath!, { adoptionStateWrites: 'persist' });
    const cliPrompt = await integrator.generateContextFromProject(workingCopy);

    expect(cliPrompt).toBe(mcpPrompt);
  });
});
