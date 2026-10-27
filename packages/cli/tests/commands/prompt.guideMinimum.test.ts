import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import {
  GUIDE_RELATIVE_PATH,
  MIN_GUIDE_VERSION,
  VERSION_MARKER_FILE,
  checkGuideMinimum,
} from '@context-forge/core/node';
import { PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';
import { registerPromptCommand } from '../../src/commands/prompt.js';
import { createAdoptionFixture } from '../../../core/tests/helpers/adoptionFixtures.js';

/**
 * `cf prompt get` and the guide-minimum check (slice 272, D4). The warning goes to stderr; the
 * prompt on stdout and the exit code do not change. Only the project store is stubbed.
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
// A phase input matching the Concept prompt, which takes no adoption inputs.
const CONCEPT_INPUT = 'concept';
const OLDER_GUIDE_VERSION = '0.0.1';

const roots: string[] = [];

/** A registered project whose checkout holds the fixture prompt and a guide directory. */
function project(): { root: string; id: string } {
  const fixture = createAdoptionFixture();
  roots.push(fixture.root);
  const promptPath = join(fixture.root, PROMPT_FILE_RELATIVE_PATH);
  mkdirSync(dirname(promptPath), { recursive: true });
  writeFileSync(promptPath, readFileSync(FIXTURE_PROMPT, 'utf8'));
  const data = fixture.project();
  mockGetAll.mockResolvedValue([data]);
  mockGetById.mockResolvedValue(data);
  return { root: fixture.root, id: data.id };
}

function versionMarkerPath(root: string): string {
  return join(root, GUIDE_RELATIVE_PATH, VERSION_MARKER_FILE);
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

function stderrText(): string {
  return vi.mocked(process.stderr.write).mock.calls.map((call) => String(call[0])).join('');
}

describe('cf prompt get: guide minimum (slice 272, D4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it('an older guide: warns on stderr with the check message, prints the prompt, exits normally', async () => {
    const { root, id } = project();
    writeFileSync(versionMarkerPath(root), `v${OLDER_GUIDE_VERSION}\n`);
    const expected = await checkGuideMinimum(root);
    expect(expected).not.toBeNull();

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(stderrText()).toContain(`Warning: ${expected}`);
    expect(printed()).not.toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('a missing version marker: warns on stderr, prints the prompt, exits normally', async () => {
    const { root, id } = project();
    const expected = await checkGuideMinimum(root);
    expect(expected).not.toBeNull();

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(stderrText()).toContain(`Warning: ${expected}`);
    expect(printed()).not.toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('an empty version marker: warns on stderr, prints the prompt, exits normally', async () => {
    const { root, id } = project();
    writeFileSync(versionMarkerPath(root), '');
    const expected = await checkGuideMinimum(root);
    expect(expected).not.toBeNull();

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(stderrText()).toContain(`Warning: ${expected}`);
    expect(printed()).not.toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('an unreadable version marker (a directory at its path): same as a missing marker', async () => {
    const { root, id } = project();
    mkdirSync(versionMarkerPath(root));
    const expected = await checkGuideMinimum(root);
    expect(expected).not.toBeNull();

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(stderrText()).toContain(`Warning: ${expected}`);
    expect(printed()).not.toBe('');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('a current guide: no guide-minimum warning on stderr', async () => {
    const { root, id } = project();
    writeFileSync(versionMarkerPath(root), `v${MIN_GUIDE_VERSION}\n`);
    expect(await checkGuideMinimum(root)).toBeNull();

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(stderrText()).not.toContain('Warning:');
    expect(printed()).not.toBe('');
  });

  it('no guide installed: fails with exit 1 and nothing on stdout (no guide-minimum warning)', async () => {
    const { root, id } = project();
    rmSync(join(root, GUIDE_RELATIVE_PATH), { recursive: true, force: true });

    await promptGet(CONCEPT_INPUT, '--project', id);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(printed()).toBe('');
    expect(stderrText()).not.toContain('Warning:');
  });
});
