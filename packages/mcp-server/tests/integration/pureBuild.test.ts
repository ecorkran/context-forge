/**
 * Slice 268: building context is pure. In a brownfield checkout, `cf build`, `context_build` and
 * `template_preview` assemble the same prompt, write nothing, ignore a stored adoption.state and
 * never spawn `sq`. A fake `sq` on PATH leaves a marker file if anything runs it, so the test never
 * depends on whether the machine has a real one.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BROWNFIELD_MIN_SOURCE_LINES, FileProjectStore, createContextPipeline } from '@context-forge/core/node';
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
const PROJECT_CONFIG_FILE = '.context-forge.toml';
// A legacy adoption.state (slice 269): no longer used, and the build ignores it.
const IN_PROGRESS_CONFIG = '[adoption]\nstate = "in_progress"\n';
const BROWNFIELD_INSTRUCTION = 'brownfield-adoption';
// Text from the brownfield-guide fixture prompt, never from the installed guide.
const CONCEPT_PROMPT_TEXT = "We're starting work on a new project. Write the concept.";
const BROWNFIELD_PROMPT_TEXT = 'We are adopting an existing codebase.';
const ADOPTION_FACTS_HEADING = '### Adoption Facts';
const SQ_MARKER_FILE = 'sq-was-run';

let fixtureEnv: FixtureEnv;
let ctx: IntegrationClient;
let binDir: string;
let sqMarker: string;
let originalPath: string | undefined;
let checkout: string | undefined;

beforeAll(async () => {
  fixtureEnv = await setupFixtureEnv();
  ctx = await createIntegrationClient();
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-fake-sq-'));
  sqMarker = path.join(binDir, SQ_MARKER_FILE);
  const sq = path.join(binDir, 'sq');
  fs.writeFileSync(sq, `#!/bin/sh\ntouch "${sqMarker}"\n`, { mode: 0o755 });
  originalPath = process.env.PATH;
  process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ''}`;
});

afterAll(async () => {
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  fs.rmSync(binDir, { recursive: true, force: true });
  await ctx.cleanup();
  await fixtureEnv.cleanup();
});

afterEach(() => {
  if (checkout) fs.rmSync(checkout, { recursive: true, force: true });
  checkout = undefined;
  fs.rmSync(sqMarker, { force: true });
});

/** A brownfield checkout: enough source and no planning artifacts. */
function createBrownfieldCheckout(config?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-mcp-pure-'));
  fs.cpSync(path.join(FIXTURE_DIR, 'integration-project'), dir, { recursive: true });
  fs.cpSync(BROWNFIELD_GUIDE, path.join(dir, PROMPT_FILE_RELATIVE_PATH));
  // Guard: an unresolved threshold would yield an empty file and a vacuously passing suite.
  if (!Number.isFinite(BROWNFIELD_MIN_SOURCE_LINES)) throw new Error('BROWNFIELD_MIN_SOURCE_LINES did not resolve');
  const lines = BROWNFIELD_MIN_SOURCE_LINES + 100;
  const source = Array.from({ length: lines }, (_, i) => `export const v${i} = ${i};`).join('\n');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'big.ts'), source);
  if (config !== undefined) fs.writeFileSync(path.join(dir, PROJECT_CONFIG_FILE), config);
  const projectsJson = fs
    .readFileSync(path.join(FIXTURE_DIR, 'projects.json'), 'utf-8')
    .replace(PROJECT_PATH_PLACEHOLDER, dir);
  fs.writeFileSync(path.join(fixtureEnv.tempDir, 'projects.json'), projectsJson);
  checkout = dir;
  return dir;
}

function listFiles(root: string, rel = ''): string[] {
  return fs
    .readdirSync(path.join(root, rel), { withFileTypes: true })
    .flatMap((entry) => {
      const entryRel = path.join(rel, entry.name);
      return entry.isDirectory() ? listFiles(root, entryRel) : [entryRel];
    })
    .sort();
}

/** Every file path, plus the project config bytes or its absence. */
function snapshot(root: string): { files: string[]; config: string | null } {
  const configPath = path.join(root, PROJECT_CONFIG_FILE);
  return { files: listFiles(root), config: fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : null };
}

/** Runs `build` and asserts the checkout is untouched, `sq` never ran, and the prompt is the concept prompt. */
async function expectPureBuild(root: string, build: () => Promise<string>): Promise<string> {
  const before = snapshot(root);
  const prompt = await build();
  expect(snapshot(root)).toEqual(before);
  expect(fs.existsSync(sqMarker)).toBe(false);
  expect(prompt).toContain(CONCEPT_PROMPT_TEXT);
  expect(prompt).not.toContain(ADOPTION_FACTS_HEADING);
  return prompt;
}

/** The CLI path, as packages/cli/src/commands/build.ts does it. */
async function buildViaCli(instruction: string): Promise<string> {
  const project = await new FileProjectStore().getById(FIXTURE_PROJECT_ID);
  expect(project).toBeDefined();
  const workingCopy = { ...project!, instruction };
  const { integrator } = createContextPipeline(workingCopy.projectPath!);
  return integrator.generateContextFromProject(workingCopy);
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  const result = await ctx.client.callTool({ name, arguments: { projectId: FIXTURE_PROJECT_ID, ...args } });
  expect(result.isError).toBeFalsy();
  return (result.content as { type: string; text: string }[])[0].text;
}

describe('pure build (slice 268)', () => {
  it('cf build in a brownfield checkout with no config writes nothing', async () => {
    const root = createBrownfieldCheckout();
    await expectPureBuild(root, () => buildViaCli(CONCEPT_PHASE));
  });

  it('cf build ignores a stored legacy in_progress value and leaves it in place', async () => {
    const root = createBrownfieldCheckout(IN_PROGRESS_CONFIG);
    await expectPureBuild(root, () => buildViaCli(CONCEPT_PHASE));
    expect(fs.readFileSync(path.join(root, PROJECT_CONFIG_FILE), 'utf-8')).toBe(IN_PROGRESS_CONFIG);
  });

  it('context_build and template_preview are pure and match the CLI prompt', async () => {
    const root = createBrownfieldCheckout(IN_PROGRESS_CONFIG);
    const cliPrompt = await buildViaCli(CONCEPT_PHASE);
    const mcpPrompt = await expectPureBuild(root, () => callTool('context_build', { instruction: CONCEPT_PHASE }));
    await expectPureBuild(root, () => callTool('template_preview', { instructionType: CONCEPT_PHASE }));
    expect(mcpPrompt).toBe(cliPrompt);
  });

  it('an explicit brownfield-adoption instruction renders its prompt with no facts', async () => {
    createBrownfieldCheckout();
    const prompt = await buildViaCli(BROWNFIELD_INSTRUCTION);
    expect(prompt).toContain(BROWNFIELD_PROMPT_TEXT);
    expect(prompt).not.toContain(ADOPTION_FACTS_HEADING);
    expect(fs.existsSync(sqMarker)).toBe(false);
  });
});
