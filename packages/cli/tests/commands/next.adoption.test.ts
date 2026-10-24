import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { ConfigManager, WorkflowNavigator } from '@context-forge/core/node';
import { registerNextCommand } from '../../src/commands/next.js';
import {
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../../../core/tests/helpers/adoptionFixtures.js';

/**
 * `cf next` over a real navigator for adoption fixtures (slice 264). next.test.ts mocks the
 * navigator, so this lives apart. Only the project store and the upstream-lag check are stubbed.
 * `cf next` prints exactly what `getNext` returns, so one fixture plus the error case cover the
 * CLI surface; the MCP table in workflowNextAdoption.test.ts covers every adoption state.
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

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerNextCommand(program);
  return program;
}

async function runNext(options: AdoptionFixtureOptions, ...flags: string[]) {
  const fixture = createAdoptionFixture(options);
  const project = fixture.project({ instruction: CONCEPT_INSTRUCTION });
  mockGetById.mockResolvedValue(project);
  mockGetAll.mockResolvedValue([project]);
  await createProgram().parseAsync(['node', 'cf', 'next', '--project', project.id, ...flags]);
  return { fixture, project };
}

describe('cf next: adoption (slice 264)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('--json matches getNext for a record-completion fixture', async () => {
    const options: AdoptionFixtureOptions = { state: 'in_progress', concept: true, arch: true, plan: MIXED_ENTRIES };
    const { fixture, project } = await runNext(options, '--json');
    const expected = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project);

    const printed = vi.mocked(process.stdout.write).mock.calls.map((call) => String(call[0])).join('');
    const actual = JSON.parse(printed) as typeof expected;
    expect(actual.recommendation).toBe(expected.recommendation);
    expect(actual.suggestedCommand).toBe('cf build');
    expect(actual.recommendation).toContain('record adoption as complete');
  });

  it('prints the adoption step for the plain output', async () => {
    await runNext({ state: 'in_progress', concept: true });
    const output = vi.mocked(console.log).mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Next adoption step: architecture derived from the code.');
    expect(output).toContain('cf build');
  });

  it('exits non-zero with the readAdoptionState message for an out-of-enum adoption.state', async () => {
    const options: AdoptionFixtureOptions = { state: 'bogus', concept: true };
    const { fixture, project } = await runNext(options);
    const failure = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(console.error).toHaveBeenCalledWith(`Error: ${(failure as Error).message}`);
  });
});
