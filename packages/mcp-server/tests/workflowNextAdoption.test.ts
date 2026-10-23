import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ConfigManager, WorkflowNavigator } from '@context-forge/core/node';
import { registerWorkflowTools } from '../src/tools/workflowTools.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../../core/tests/helpers/adoptionFixtures.js';

/**
 * `workflow_next` parity with the navigator for every adoption fixture (slice 264 SC "Parity",
 * walkthrough step 9). Real navigator over real temp checkouts; only the project store and the
 * upstream-lag check are stubbed. workflowTools.test.ts mocks the navigator, so this lives apart.
 */

const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    upstreamLag: vi.fn().mockResolvedValue(null),
    FileProjectStore: class {
      getById = mockGetById;
      getAll = vi.fn().mockResolvedValue([]);
    },
  };
});

const CONCEPT_INSTRUCTION = 'Phase 0: Concept';
const REGISTERED = { fileArch: '100-arch.existing', fileSlicePlan: '100-slices.existing' };

interface AdoptionCase {
  label: string;
  options: AdoptionFixtureOptions;
  overrides?: Record<string, string>;
}

const CASES: AdoptionCase[] = [
  { label: 'unset with a concept (D2 warning)', options: { concept: true } },
  { label: 'declined', options: { state: 'declined', concept: true } },
  { label: 'in_progress: concept step', options: { state: 'in_progress' } },
  { label: 'in_progress: architecture step', options: { state: 'in_progress', concept: true } },
  { label: 'in_progress: existing-state-plan step', options: { state: 'in_progress', concept: true, arch: true } },
  {
    label: 'in_progress: record-completion step',
    options: { state: 'in_progress', concept: true, arch: true, plan: MIXED_ENTRIES },
  },
  {
    label: 'in_progress outside Phase 0 (D5 warning)',
    options: { state: 'in_progress', concept: true },
    overrides: { instruction: 'Phase 2: Architecture' },
  },
  { label: 'complete without a plan (D6 warning)', options: { state: 'complete', concept: true, arch: true } },
  {
    label: 'complete: register-plan step',
    options: { state: 'complete', concept: true, arch: true, plan: MIXED_ENTRIES },
  },
  {
    label: 'complete: first new slice',
    options: { state: 'complete', concept: true, arch: true, plan: MIXED_ENTRIES },
    overrides: REGISTERED,
  },
  {
    label: 'complete: plan-new-work step',
    options: { state: 'complete', concept: true, arch: true, plan: ALL_RETROACTIVE_ENTRIES },
    overrides: REGISTERED,
  },
];

describe('workflow_next: adoption parity with the navigator (slice 264)', () => {
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    server = new McpServer({ name: 'test-server', version: '0.1.0' });
    registerWorkflowTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    vi.restoreAllMocks();
  });

  async function callNext(project: unknown) {
    mockGetById.mockResolvedValue(project);
    return client.callTool({ name: 'workflow_next', arguments: { projectId: 'project_adoption' } });
  }

  function textOf(result: { content: unknown }): string {
    return (result.content as Array<{ text: string }>)[0].text;
  }

  it.each(CASES)('$label', async ({ options, overrides }) => {
    const fixture = createAdoptionFixture(options);
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION, ...overrides });
    const expected = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project);

    const result = await callNext(project);
    const actual = JSON.parse(textOf(result)) as typeof expected;

    expect(actual.recommendation).toBe(expected.recommendation);
    expect(actual.suggestedCommand).toBe(expected.suggestedCommand);
    expect(actual.warnings).toEqual(expected.warnings);
  });

  it('reports the adoption step, not Phase 0 advice, through the tool', async () => {
    const fixture = createAdoptionFixture({ state: 'in_progress', concept: true });
    const result = await callNext(fixture.project({ instruction: CONCEPT_INSTRUCTION }));
    const actual = JSON.parse(textOf(result)) as { recommendation: string; suggestedCommand: string };
    expect(actual.recommendation).toBe('Next adoption step: architecture derived from the code.');
    expect(actual.suggestedCommand).toBe('cf build');
  });

  it('returns the readAdoptionState message for an out-of-enum adoption.state', async () => {
    const fixture = createAdoptionFixture({ state: 'bogus', concept: true });
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION });
    const failure = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(Error);

    const result = await callNext(project);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Error: ${(failure as Error).message}`);
  });
});
