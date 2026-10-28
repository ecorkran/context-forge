import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import {
  ABSENT_ARTIFACT,
  ADOPTION_INPUTS_HEADING,
  ADOPTION_INPUT_LABELS,
  NO_COMPREHENSION_SENTENCE,
} from '@context-forge/core/node';
import { PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
import { registerPromptCommand } from '../../src/commands/prompt.js';
import { createAdoptionFixture, type AdoptionFixtureOptions } from '../../../core/tests/helpers/adoptionFixtures.js';

/**
 * `cf prompt get` over a real guide fixture and real planning files (slice 271 D7). Only the
 * project store is stubbed; the profile comes from the brownfield-guide fixture's prompt file.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

const FIXTURE_PROMPT = join(
  import.meta.dirname,
  '../../../core/tests/fixtures/brownfield-guide',
  PROMPT_FILE_RELATIVE_PATH,
);
const ADOPTION_KEY = 'brownfield-adoption';
// A phase input matching the Concept prompt, whose profile lists no variables.
const NON_ADOPTION_INPUT = 'concept';
const NON_ADOPTION_KEY = 'concept-phase-0';
const ANALYSIS_FILE = 'project-documents/user/analysis/700-analysis.comprehension.md';
const PROJECT_TOKEN = '{project}';

const roots: string[] = [];

/** A registered project whose checkout holds the fixture prompt, with `{project}` added to the adoption prompt. */
function project(options: AdoptionFixtureOptions = {}): { root: string; name: string; id: string } {
  const fixture = createAdoptionFixture(options);
  roots.push(fixture.root);
  const promptPath = join(fixture.root, PROMPT_FILE_RELATIVE_PATH);
  mkdirSync(dirname(promptPath), { recursive: true });
  const prompt = readFileSync(FIXTURE_PROMPT, 'utf8').replace('We are adopting', `We are adopting ${PROJECT_TOKEN},`);
  writeFileSync(promptPath, prompt);
  const data = fixture.project();
  mockGetAll.mockResolvedValue([data]);
  mockGetById.mockResolvedValue(data);
  return { root: fixture.root, name: data.name, id: data.id };
}

function writeAnalysis(root: string): string {
  const full = join(root, ANALYSIS_FILE);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, '# analysis\n');
  return full;
}

async function promptGet(...args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerPromptCommand(program);
  await program.parseAsync(['node', 'cf', 'prompt', 'get', ...args]);
}

function printed(): string {
  return vi.mocked(process.stdout.write).mock.calls.map((call) => String(call[0])).join('');
}

function errors(): string {
  return vi.mocked(console.error).mock.calls.map((call) => String(call[0])).join('\n');
}

describe('cf prompt get: Adoption Inputs (D7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it('no flag: the section carries the no-comprehension sentence and none for absent artifacts', async () => {
    const { id } = project();
    await promptGet(ADOPTION_KEY, '--project', id);
    expect(printed()).toContain(ADOPTION_INPUTS_HEADING);
    expect(printed()).toContain(NO_COMPREHENSION_SENTENCE);
    expect(printed()).toContain(`${ADOPTION_INPUT_LABELS.concept}: ${ABSENT_ARTIFACT}`);
  });

  it('a stored fileComprehension is ignored: only --comprehension names the doc (D2)', async () => {
    const { root, id } = project();
    writeAnalysis(root);
    const stored = { ...(await mockGetById()), fileComprehension: ANALYSIS_FILE };
    mockGetAll.mockResolvedValue([stored]);
    mockGetById.mockResolvedValue(stored);
    await promptGet(ADOPTION_KEY, '--project', id);
    expect(printed()).toContain(NO_COMPREHENSION_SENTENCE);
    expect(printed()).not.toContain(ANALYSIS_FILE);
  });

  it('lists the concept, derived architecture and existing-state plan the project already has', async () => {
    const { id } = project({ concept: true, arch: true });
    await promptGet(ADOPTION_KEY, '--project', id);
    expect(printed()).toMatch(/Concept: project-documents\/user\/project-guides\/000-concept\./);
    expect(printed()).toMatch(/Derived architecture: project-documents\/user\/architecture\/100-arch\./);
    expect(printed()).toContain(`${ADOPTION_INPUT_LABELS.existingStatePlan}: ${ABSENT_ARTIFACT}`);
  });

  it('a relative path shows root-relative', async () => {
    const { root, id } = project();
    writeAnalysis(root);
    await promptGet(ADOPTION_KEY, '--project', id, '--comprehension', ANALYSIS_FILE);
    expect(printed()).toContain(`${ADOPTION_INPUT_LABELS.comprehension}: ${ANALYSIS_FILE}`);
    expect(printed()).not.toContain(NO_COMPREHENSION_SENTENCE);
  });

  it('an absolute path inside the root shows root-relative; outside it stays absolute', async () => {
    const { root, id } = project();
    const inside = writeAnalysis(root);
    await promptGet(ADOPTION_KEY, '--project', id, '--comprehension', inside);
    expect(printed()).toContain(`${ADOPTION_INPUT_LABELS.comprehension}: ${ANALYSIS_FILE}`);

    const outsideDir = mkdtempSync(join(tmpdir(), 'cf-outside-'));
    roots.push(outsideDir);
    const outside = join(outsideDir, 'c.md');
    writeFileSync(outside, '# analysis\n');
    vi.mocked(process.stdout.write).mockClear();
    await promptGet(ADOPTION_KEY, '--project', id, '--comprehension', outside);
    expect(printed()).toContain(`${ADOPTION_INPUT_LABELS.comprehension}: ${outside}`);
  });

  it('a missing path is a named error and prints nothing', async () => {
    const { id } = project();
    await promptGet(ADOPTION_KEY, '--project', id, '--comprehension', 'no/such/file.md');
    expect(errors()).toContain('does not exist');
    expect(errors()).toContain('no/such/file.md');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(printed()).toBe('');
  });

  it('a directory is a named error', async () => {
    const { root, id } = project();
    writeAnalysis(root);
    await promptGet(ADOPTION_KEY, '--project', id, '--comprehension', 'project-documents/user/analysis');
    expect(errors()).toContain('is a directory');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(printed()).toBe('');
  });

  it('--comprehension on a prompt whose profile lacks the variable is refused, naming the key', async () => {
    const { root, id } = project();
    writeAnalysis(root);
    await promptGet(NON_ADOPTION_INPUT, '--project', id, '--comprehension', ANALYSIS_FILE);
    expect(errors()).toContain(NON_ADOPTION_KEY);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(printed()).toBe('');
  });

  it('--raw with --comprehension is an error', async () => {
    const { root, id } = project();
    writeAnalysis(root);
    await promptGet(ADOPTION_KEY, '--project', id, '--raw', '--comprehension', ANALYSIS_FILE);
    expect(errors()).toContain('--raw');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(printed()).toBe('');
  });

  it('--raw alone prints the unrendered template with no section', async () => {
    const { id } = project();
    await promptGet(ADOPTION_KEY, '--project', id, '--raw');
    expect(printed()).toContain(PROJECT_TOKEN);
    expect(printed()).not.toContain(ADOPTION_INPUTS_HEADING);
  });

  it('a prompt without the variable gets no section when no flag is passed', async () => {
    const { id } = project({ concept: true });
    await promptGet(NON_ADOPTION_INPUT, '--project', id);
    expect(printed()).not.toContain(ADOPTION_INPUTS_HEADING);
  });

  it('--path from an unrelated cwd takes {project} and the inputs from the --path project', async () => {
    const wanted = project({ concept: true });
    const decoy = createAdoptionFixture({ concept: false });
    roots.push(decoy.root);
    const decoyData = { ...decoy.project(), id: 'project_decoy', name: 'decoy-project' };
    const wantedData = { ...createAdoptionFixture().project(), id: wanted.id, name: wanted.name, projectPath: wanted.root };
    mockGetAll.mockResolvedValue([decoyData, wantedData]);

    await promptGet(ADOPTION_KEY, '--path', wanted.root);

    expect(printed()).toContain(`We are adopting ${wanted.name},`);
    expect(printed()).not.toContain('decoy-project');
    expect(printed()).toMatch(/Concept: project-documents\/user\/project-guides\/000-concept\./);
  });

  it('the Adoption Inputs section follows a blank line after the prompt', async () => {
    const { id } = project();
    await promptGet(ADOPTION_KEY, '--project', id);
    expect(printed()).toContain(`\n\n${ADOPTION_INPUTS_HEADING}\n`);
    expect(printed().endsWith('\n')).toBe(true);
  });
});
