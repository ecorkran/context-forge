import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  ADOPTION_OPT_OUT,
  BROWNFIELD_LINE,
  BROWNFIELD_MIN_SOURCE_LINES,
  ConfigManager,
  INCOMPLETE_ADOPTION_LINE,
  LEGACY_ADOPTION_STATES,
  WorkflowNavigator,
  legacyAdoptionStateNotice,
  type NextAction,
} from '@context-forge/core/node';
import { registerWorkflowTools } from '../src/tools/workflowTools.js';
import {
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../../core/tests/helpers/adoptionFixtures.js';

/**
 * `workflow_next` adoption warnings (slice 269 D6), with parity against the navigator. Real
 * navigator over real temp checkouts; only the project store and the upstream-lag check are
 * stubbed. workflowTools.test.ts mocks the navigator, so this lives apart.
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
const OUT_OF_ENUM_VALUE = 'bogus';
const LEGACY_VALUE = LEGACY_ADOPTION_STATES[0];
const ADOPTION_LINES = [BROWNFIELD_LINE, INCOMPLETE_ADOPTION_LINE];

interface AdoptionCase {
  label: string;
  options: AdoptionFixtureOptions;
  overrides?: Record<string, string>;
  /** The adoption lines expected among the warnings. */
  lines: string[];
  /** A further warning expected, such as the legacy notice. */
  extraWarning?: string;
}

const CASES: AdoptionCase[] = [
  { label: 'brownfield', options: { sourceLines: BROWNFIELD_MIN_SOURCE_LINES }, lines: [BROWNFIELD_LINE] },
  { label: 'adoption incomplete', options: { concept: true, arch: true }, lines: [INCOMPLETE_ADOPTION_LINE] },
  {
    label: 'opted out',
    options: { state: ADOPTION_OPT_OUT, sourceLines: BROWNFIELD_MIN_SOURCE_LINES },
    lines: [],
  },
  { label: 'greenfield', options: { concept: true, sourceLines: BROWNFIELD_MIN_SOURCE_LINES - 1 }, lines: [] },
  {
    label: 'adopted',
    options: { concept: true, arch: true, plan: MIXED_ENTRIES },
    overrides: REGISTERED,
    lines: [],
  },
  {
    label: 'legacy value',
    options: { state: LEGACY_VALUE, sourceLines: BROWNFIELD_MIN_SOURCE_LINES },
    lines: [BROWNFIELD_LINE],
    extraWarning: legacyAdoptionStateNotice(LEGACY_VALUE),
  },
];

describe('workflow_next: adoption warnings (slice 269 D6)', () => {
  let client: Client;
  let server: McpServer;
  const roots: string[] = [];

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
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  async function callNext(project: unknown) {
    mockGetById.mockResolvedValue(project);
    return client.callTool({ name: 'workflow_next', arguments: { projectId: 'project_adoption' } });
  }

  function textOf(result: { content: unknown }): string {
    // workflow_next returns one text content item; the SDK types content as unknown here.
    return (result.content as Array<{ text: string }>)[0].text;
  }

  it.each(CASES)('$label', async ({ options, overrides, lines, extraWarning }) => {
    const fixture = createAdoptionFixture(options);
    roots.push(fixture.root);
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION, ...overrides });
    const expected = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project);

    // workflow_next returns the navigator's NextAction as JSON text.
    const actual = JSON.parse(textOf(await callNext(project))) as NextAction;

    expect(actual).toEqual(JSON.parse(JSON.stringify(expected)));
    expect((actual.warnings ?? []).filter((text) => ADOPTION_LINES.includes(text))).toEqual(lines);
    if (extraWarning) expect(actual.warnings).toContain(extraWarning);
  });

  it('returns the readAdoptionOptOut message for an out-of-enum adoption.state', async () => {
    const fixture = createAdoptionFixture({ state: OUT_OF_ENUM_VALUE, concept: true });
    roots.push(fixture.root);
    const project = fixture.project({ instruction: CONCEPT_INSTRUCTION });
    const failure = await new WorkflowNavigator(new ConfigManager(fixture.root)).getNext(project).catch((e: unknown) => e);
    if (!(failure instanceof Error)) throw new Error('expected getNext to reject with an Error');

    const result = await callNext(project);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe(`Error: ${failure.message}`);
  });
});
