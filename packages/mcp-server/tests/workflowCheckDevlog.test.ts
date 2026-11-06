import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerWorkflowTools } from '../src/tools/workflowTools.js';
import {
  createGitWorktreeFixture,
  lastSubject,
  porcelain,
  writeRel,
  type GitWorktreeFixture,
} from '../../core/tests/helpers/gitWorktreeFixture.js';

/** `workflow_check` reports and fixes the devlog-size rule (slice 936 SC 7). Real checker, real git. */

const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    FileProjectStore: class {
      getById = mockGetById;
      getAll = vi.fn().mockResolvedValue([]);
    },
  };
});

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);
const DEVLOG = '# Development Log\n\n' + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);
const CONFIG = '[devlog]\nmax_bytes = 600\ntarget_bytes = 450\n';
const Q4 = 'project-documents/user/archive/devlog/DEVLOG-2025-Q4.md';

interface CheckJson {
  findings: Array<{ rule: string; fixable: boolean; fixAction?: { type: string; additionalPaths?: string[] } }>;
  fixed?: number;
  commits?: Array<{ files: string[] }>;
}

describe('workflow_check — devlog-size rule (slice 936)', () => {
  let fx: GitWorktreeFixture;
  let client: Client;
  let server: McpServer;

  beforeEach(async () => {
    fx = createGitWorktreeFixture(['b'], (primary) => {
      writeRel(primary, 'DEVLOG.md', DEVLOG);
      writeRel(primary, '.context-forge.toml', CONFIG);
    });
    mockGetById.mockResolvedValue({
      id: 'project_dl',
      name: 'devlog-project',
      template: 'default',
      projectPath: fx.primary,
      worktrees: [
        { id: 'wt_a', name: 'alpha', indexRange: [200, 249], worktreePath: fx.primary },
        { id: 'wt_b', name: 'beta', indexRange: [250, 259], worktreePath: fx.worktrees.b },
      ],
    });
    vi.spyOn(process, 'cwd').mockReturnValue(fx.worktrees.b);
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

  async function callCheck(args: Record<string, unknown>): Promise<CheckJson> {
    const result = await client.callTool({ name: 'workflow_check', arguments: { projectId: 'project_dl', ...args } });
    expect(result.isError).toBeFalsy();
    return JSON.parse((result.content as { text: string }[])[0].text) as CheckJson;
  }

  it('returns a fixable devlog-size finding with the archive-devlog fixAction', async () => {
    const result = await callCheck({});
    const finding = result.findings.find((f) => f.rule === 'devlog-size');
    expect(finding?.fixable).toBe(true);
    expect(finding?.fixAction?.type).toBe('archive-devlog');
    expect(finding?.fixAction?.additionalPaths).toHaveLength(2);
  });

  it('fix: true archives in the primary and commits DEVLOG.md with its archives', async () => {
    const result = await callCheck({ fix: true });
    expect(existsSync(join(fx.primary, Q4))).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(result.commits![0].files).toContain('DEVLOG.md');
    expect(result.commits![0].files).toContain(Q4);
    expect(porcelain(fx.primary)).toBe('');
    expect(readFileSync(join(fx.worktrees.b, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
  });

  it('workflow.auto_fix archives without a fix argument and commits in the non-invoking primary', async () => {
    writeRel(fx.primary, '.context-forge.toml', CONFIG + '[workflow]\nauto_fix = true\n');
    const result = await callCheck({});
    expect(existsSync(join(fx.primary, Q4))).toBe(true);
    expect(result.commits).toHaveLength(1);
    expect(lastSubject(fx.primary)).toMatch(/update project documents/);
  });
});
