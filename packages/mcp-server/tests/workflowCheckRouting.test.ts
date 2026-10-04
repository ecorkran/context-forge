import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeferReason } from '@context-forge/core';
import { FIX_COMMIT_MESSAGE } from '@context-forge/core/node';
import { registerWorkflowTools } from '../src/tools/workflowTools.js';
import {
  createGitWorktreeFixture,
  git,
  lastSubject,
  porcelain,
  writeRel,
  type GitWorktreeFixture,
} from '../../core/tests/helpers/gitWorktreeFixture.js';

/**
 * MCP `workflow_check` routing parity with `cf check --fix` (slice 213 SC 11,
 * walkthrough step 9). Real ConsistencyChecker over real git worktrees; only
 * the project store and the server's working directory are stubbed.
 * workflowTools.test.ts mocks core wholesale, so this lives in its own file.
 */

const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>(
    '@context-forge/core/node',
  );
  return {
    ...actual,
    FileProjectStore: class {
      getById = mockGetById;
      getAll = vi.fn().mockResolvedValue([]);
    },
  };
});

const SLICE_INDEX = 250;
const SLICE_NAME = 'wt-fix-test';
const PLAN_STEM = `${SLICE_INDEX}-slices.${SLICE_NAME}`;
const PLAN_REL = `project-documents/user/architecture/${PLAN_STEM}.md`;
const TASKS_REL = `project-documents/user/tasks/${SLICE_INDEX}-tasks.${SLICE_NAME}.md`;

/** Tasks complete, plan entry unchecked: one fixable finding (task-vs-plan, slice 250) in both checkouts. */
function seed(primary: string): void {
  const dates = 'dateCreated: 20260101\ndateUpdated: 20260101';
  writeRel(
    primary,
    TASKS_REL,
    `---\ndocType: tasks\nslice: ${SLICE_NAME}\nproject: ${SLICE_NAME}\nstatus: complete\n${dates}\n---\n\n- [x] one\n- [x] two\n`,
  );
  writeRel(
    primary,
    PLAN_REL,
    `---\ndocType: slice-plan\nproject: ${SLICE_NAME}\nstatus: in_progress\n${dates}\n---\n\n# Plan\n\n` +
      `1. [ ] **(${SLICE_INDEX}) Worktree Fix Feature** — routed.\n`,
  );
}

function entryState(checkout: string): string {
  const line = readFileSync(join(checkout, PLAN_REL), 'utf-8').split('\n').find((l) => l.includes(`(${SLICE_INDEX})`));
  return line?.includes('[x]') ? '[x]' : '[ ]';
}

interface FixJson {
  fixed: number;
  fixLog: Array<{ worktree?: { name: string } }>;
  deferred: Array<{ reason: string; owner?: { name: string } }>;
  commits: Array<{ sha: string; files: string[] }>;
}

describe('workflow_check — worktree-aware fix routing (slice 213)', () => {
  let fx: GitWorktreeFixture;
  let wtb: string;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    fx = createGitWorktreeFixture(['b'], seed);
    wtb = fx.worktrees.b;
    mockGetById.mockResolvedValue({
      id: 'project_wt',
      name: 'wt-fix-project',
      template: 'default',
      projectPath: fx.primary,
      fileSlicePlan: PLAN_STEM,
      worktrees: [
        { id: 'wt_a', name: 'alpha', indexRange: [200, 249], worktreePath: fx.primary, slicePlan: PLAN_STEM },
        { id: 'wt_b', name: 'beta', indexRange: [250, 259], worktreePath: wtb, slicePlan: PLAN_STEM },
      ],
    });
    vi.spyOn(process, 'cwd').mockReturnValue(fx.primary);
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
    fx.cleanup();
  });

  async function callCheck(args: Record<string, unknown>) {
    return client.callTool({ name: 'workflow_check', arguments: { projectId: 'project_wt', ...args } });
  }

  function parse(result: { content: unknown[] }): FixJson {
    return JSON.parse((result.content as { text: string }[])[0].text);
  }

  /** Same routed result as the CLI owner-commit case. */
  function expectRoutedToOwner(result: FixJson): void {
    expect(entryState(wtb)).toBe('[x]');
    expect(entryState(fx.primary)).toBe('[ ]');
    expect(result.fixed).toBe(1);
    expect(result.fixLog[0].worktree?.name).toBe('beta');
    expect(result.deferred).toHaveLength(1);
    expect(result.deferred[0].reason).toBe(DeferReason.NOT_OWNER);
    expect(result.deferred[0].owner?.name).toBe('beta');
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].files).toEqual([PLAN_REL]);
    expect(result.commits[0].sha).toBe(git(wtb, 'rev-parse', 'HEAD'));
    expect(lastSubject(wtb)).toBe(FIX_COMMIT_MESSAGE);
    expect(porcelain(wtb)).toBe('');
  }

  it('fix: true writes only the owner\'s copy and commits it there', async () => {
    const result = await callCheck({ fix: true });
    expect(result.isError).toBeFalsy();
    expectRoutedToOwner(parse(result));
  });

  it('server cwd in an unregistered checkout with fix: true → tool error, nothing written', async () => {
    const stray = join(fx.root, 'wt-stray');
    git(fx.primary, 'worktree', 'add', '-q', '-b', 'stray', stray);
    vi.mocked(process.cwd).mockReturnValue(stray);

    const result = await callCheck({ fix: true });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toMatch(/not a registered worktree/);
    expect(entryState(wtb)).toBe('[ ]');
    expect(entryState(fx.primary)).toBe('[ ]');
  });

  it('workflow.auto_fix with no fix argument routes and commits the same way', async () => {
    writeFileSync(join(fx.primary, '.context-forge.toml'), '[workflow]\nauto_fix = true\n');
    const result = await callCheck({});
    expect(result.isError).toBeFalsy();
    expectRoutedToOwner(parse(result));
  });
});
