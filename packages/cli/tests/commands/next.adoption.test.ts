import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { appendFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  ADOPTION_OPT_OUT,
  BROWNFIELD_LINE,
  BROWNFIELD_MIN_SOURCE_LINES,
  ConfigManager,
  INCOMPLETE_ADOPTION_LINE,
  LEGACY_ADOPTION_STATES,
  MAX_WALK_ENTRIES,
  WorkflowNavigator,
  inconclusiveDetectionLine,
  legacyAdoptionStateNotice,
  type NextAction,
} from '@context-forge/core/node';
import { registerNextCommand } from '../../src/commands/next.js';
import {
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixture,
  type AdoptionFixtureOptions,
} from '../../../core/tests/helpers/adoptionFixtures.js';

/**
 * `cf next` over a real navigator for adoption fixtures (slice 269 D6). next.test.ts mocks the
 * navigator, so this lives apart. Only the project store and the upstream-lag check are stubbed.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    upstreamLag: vi.fn().mockResolvedValue(null),
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

const CONCEPT_INSTRUCTION = 'Phase 0: Concept';
const REGISTERED = { fileArch: '100-arch.existing', fileSlicePlan: '100-slices.existing' };
const FIRST_NEW_SLICE_COMMAND = 'cf set slice 102';
const OUT_OF_ENUM_VALUE = 'bogus';
const LEGACY_VALUE = LEGACY_ADOPTION_STATES[0];
const ADOPTION_LINES = [BROWNFIELD_LINE, INCOMPLETE_ADOPTION_LINE];
const CAP_DIRS = 4;
// The fixed text before the reason; the reason itself names the walk's entry count.
const INCONCLUSIVE_PREFIX = inconclusiveDetectionLine('').split(':')[0];
const CONFIG_FILE = '.context-forge.toml';
const REVIEW_GATE_OFF = '[workflow]\nreview_enabled = false\n';

const roots: string[] = [];

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerNextCommand(program);
  return program;
}

function fixtureFor(options: AdoptionFixtureOptions): AdoptionFixture {
  const fixture = createAdoptionFixture(options);
  roots.push(fixture.root);
  return fixture;
}

async function runNextJson(fixture: AdoptionFixture, overrides: Record<string, string> = {}): Promise<NextAction> {
  const project = fixture.project({ instruction: CONCEPT_INSTRUCTION, ...overrides });
  mockGetById.mockResolvedValue(project);
  mockGetAll.mockResolvedValue([project]);
  vi.mocked(process.stdout.write).mockClear();
  await createProgram().parseAsync(['node', 'cf', 'next', '--project', project.id, '--json']);
  const printed = vi.mocked(process.stdout.write).mock.calls.map((call) => String(call[0])).join('');
  return JSON.parse(printed) as NextAction;
}

function adoptionLinesIn(action: NextAction): string[] {
  return (action.warnings ?? []).filter((text) => ADOPTION_LINES.includes(text));
}

describe('cf next: adoption warnings (slice 269 D6)', () => {
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

  it('brownfield: the brownfield line', async () => {
    const next = await runNextJson(fixtureFor({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(adoptionLinesIn(next)).toEqual([BROWNFIELD_LINE]);
  });

  it('adoption incomplete: the incomplete line', async () => {
    const next = await runNextJson(fixtureFor({ concept: true, arch: true }));
    expect(adoptionLinesIn(next)).toEqual([INCOMPLETE_ADOPTION_LINE]);
  });

  it('opted out: no adoption line', async () => {
    const next = await runNextJson(fixtureFor({ state: ADOPTION_OPT_OUT, sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(adoptionLinesIn(next)).toEqual([]);
  });

  it('greenfield: no adoption line', async () => {
    const next = await runNextJson(fixtureFor({ concept: true, sourceLines: BROWNFIELD_MIN_SOURCE_LINES - 1 }));
    expect(adoptionLinesIn(next)).toEqual([]);
  });

  it('adopted: points at the first unbuilt slice', async () => {
    const fixture = fixtureFor({ concept: true, arch: true, plan: MIXED_ENTRIES });
    // The review gate is a separate concern: without a review artifact it blocks before the slice.
    appendFileSync(join(fixture.root, CONFIG_FILE), REVIEW_GATE_OFF);
    const next = await runNextJson(fixture, REGISTERED);
    expect(adoptionLinesIn(next)).toEqual([]);
    expect(next.suggestedCommand).toBe(FIRST_NEW_SLICE_COMMAND);
  });

  it('legacy value: the notice, matching the navigator', async () => {
    const fixture = fixtureFor({ state: LEGACY_VALUE, sourceLines: BROWNFIELD_MIN_SOURCE_LINES });
    const next = await runNextJson(fixture);
    const expected = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(
      fixture.project({ instruction: CONCEPT_INSTRUCTION }),
    );
    expect(next.warnings).toContain(legacyAdoptionStateNotice(LEGACY_VALUE));
    expect(next.warnings).toEqual(expected.warnings);
  });

  it('walk cap: exits 0 with the inconclusive line naming MAX_WALK_ENTRIES', async () => {
    const fixture = fixtureFor({});
    const perDir = Math.ceil((MAX_WALK_ENTRIES + 1) / CAP_DIRS);
    for (let d = 0; d < CAP_DIRS; d++) {
      const dir = join(fixture.root, `d${d}`);
      mkdirSync(dir);
      for (let i = 0; i < perDir; i++) writeFileSync(join(dir, `f${i}.txt`), '');
    }
    const next = await runNextJson(fixture);
    expect(process.exit).not.toHaveBeenCalled();
    const inconclusive = (next.warnings ?? []).filter((text) => text.startsWith(INCONCLUSIVE_PREFIX));
    expect(inconclusive).toHaveLength(1);
    expect(inconclusive[0]).toContain(String(MAX_WALK_ENTRIES));
  }, 60_000);

  it('exits non-zero with the readAdoptionOptOut message for an out-of-enum adoption.state', async () => {
    const fixture = fixtureFor({ state: OUT_OF_ENUM_VALUE, concept: true });
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION });
    mockGetById.mockResolvedValue(project);
    mockGetAll.mockResolvedValue([project]);
    await createProgram().parseAsync(['node', 'cf', 'next', '--project', project.id]);
    const failure = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain(`adoption.state is "${OUT_OF_ENUM_VALUE}"`);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(`Error: ${(failure as Error).message}`);
  });
});
