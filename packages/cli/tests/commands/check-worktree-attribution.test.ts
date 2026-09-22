import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCheckCommand } from '../../src/commands/check.js';

/**
 * Worktree attribution for `cf check` findings (#87).
 *
 * check.test.ts has no worktree coverage: its fixture project has no
 * `worktrees`, so mergeCheckResults always returns at its `results.length === 1`
 * early guard and the multi-view path is never exercised. Everything here uses
 * TWO worktrees so the merge actually merges.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockCheck = vi.fn();
const mockCheckAll = vi.fn();
const mockConfigGet = vi.fn();
const mockDetectDocuments = vi.fn();

vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({ question: vi.fn(), close: vi.fn() })),
}));

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: class {
    getAll = mockGetAll;
    getById = mockGetById;
  },
  ArtifactIntrospector: vi.fn(),
  ConsistencyChecker: class {
    check = mockCheck;
    fix = vi.fn();
    checkAll = mockCheckAll;
    fixAll = vi.fn();
    applyFixes = vi.fn();
  },
  ConfigManager: class {
    get = mockConfigGet;
  },
  detectDocuments: (...args: unknown[]) => mockDetectDocuments(...args),
  updateFrontmatterField: vi.fn(),
}));

const TWO_WORKTREE_PROJECT = {
  id: 'proj_wt',
  name: 'wt-project',
  projectPath: '/repo/main',
  worktrees: [
    { id: 'wt_a', name: 'alpha', indexRange: [200, 299], worktreePath: '/repo/wt-alpha' },
    { id: 'wt_b', name: 'beta', indexRange: [300, 399], worktreePath: '/repo/wt-beta' },
  ],
};

const SINGLE_CHECKOUT_PROJECT = {
  id: 'proj_single',
  name: 'single-project',
  projectPath: '/repo/main',
};

/**
 * The realistic single-checkout shape. A migrated project has exactly one
 * worktree named "default" whose path equals projectPath — it does NOT have an
 * absent worktrees array. Gating attribution on the array's presence rather
 * than its length adds a worktree field to output that must stay unchanged.
 */
const MIGRATED_DEFAULT_PROJECT = {
  id: 'proj_migrated',
  name: 'migrated-project',
  projectPath: '/repo/main',
  worktrees: [
    { id: 'wt_default', name: 'default', indexRange: [100, 999], worktreePath: '/repo/main' },
  ],
};

/**
 * A result carrying one finding, shaped like ConsistencyChecker output.
 *
 * `projectPath` defaults to the project root but is overridable: in production
 * each view's projectPath has been overlaid to its own worktree path, so a
 * fixture that hardcodes one value for every view cannot detect the merge
 * picking the wrong one.
 */
function resultWith(description: string, location = '/repo/x.md', projectPath = '/repo/main') {
  return {
    projectPath,
    findings: [
      {
        rule: 'task-vs-plan',
        severity: 'warning',
        location,
        description,
        suggestedFix: 'Fix it',
        fixable: false,
      },
    ],
    totalFindings: 1,
    errors: 0,
    warnings: 1,
    infos: 0,
    summary: '1 finding: 1 warning',
  };
}

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerCheckCommand(program);
  return program;
}

function jsonFrom(writeMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const raw = writeMock.mock.calls.map((c) => String(c[0])).join('');
  return JSON.parse(raw);
}

describe('cf check worktree attribution (#87)', () => {
  let stdoutWrite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigGet.mockResolvedValue({ value: false });
    mockDetectDocuments.mockResolvedValue({});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stdoutWrite = vi.fn().mockReturnValue(true);
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWrite as never);
    process.exitCode = undefined;
  });

  it('tags each finding with the worktree whose view produced it', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    mockCheckAll
      .mockResolvedValueOnce(resultWith('finding from alpha', '/repo/wt-alpha/a.md'))
      .mockResolvedValueOnce(resultWith('finding from beta', '/repo/wt-beta/b.md'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt', '--json']);

    const findings = jsonFrom(stdoutWrite).findings as Array<{
      description: string;
      worktree?: { id: string; name: string; path?: string };
    }>;

    expect(findings).toHaveLength(2);
    expect(findings.find((f) => f.description === 'finding from alpha')?.worktree).toEqual({
      id: 'wt_a',
      name: 'alpha',
      path: '/repo/wt-alpha',
    });
    expect(findings.find((f) => f.description === 'finding from beta')?.worktree).toEqual({
      id: 'wt_b',
      name: 'beta',
      path: '/repo/wt-beta',
    });
  });

  it('dedups an identical finding across worktrees to a single entry', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    // An aggregate rule legitimately produces the same project-level finding in
    // every view. The merge must collapse it — adding worktree to the dedup key
    // would multiply project-level findings by worktree count.
    const shared = 'project-level finding seen everywhere';
    mockCheckAll
      .mockResolvedValueOnce(resultWith(shared))
      .mockResolvedValueOnce(resultWith(shared));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt', '--json']);

    const parsed = jsonFrom(stdoutWrite);
    expect(parsed.totalFindings).toBe(1);
    expect(parsed.findings).toHaveLength(1);
  });

  it('attributes a deduped finding deterministically to the first view', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    const shared = 'same finding, both views';
    mockCheckAll
      .mockResolvedValueOnce(resultWith(shared))
      .mockResolvedValueOnce(resultWith(shared));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt', '--json']);

    const findings = jsonFrom(stdoutWrite).findings as Array<{ worktree?: { name: string } }>;
    // First-seen-wins, and the worktree order is the registration order — not
    // arbitrary. Attribution attaches pre-merge, so the surviving copy keeps
    // its own origin rather than picking one up later.
    expect(findings[0].worktree?.name).toBe('alpha');
  });

  it('leaves single-checkout findings unattributed', async () => {
    mockGetAll.mockResolvedValue([SINGLE_CHECKOUT_PROJECT]);
    mockGetById.mockResolvedValue(SINGLE_CHECKOUT_PROJECT);
    mockCheckAll.mockResolvedValue(resultWith('a finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_single', '--json']);

    const findings = jsonFrom(stdoutWrite).findings as Array<Record<string, unknown>>;
    expect(findings[0]).not.toHaveProperty('worktree');
  });

  it('pins the whole single-checkout JSON object (tasks review F002)', async () => {
    mockGetAll.mockResolvedValue([SINGLE_CHECKOUT_PROJECT]);
    mockGetById.mockResolvedValue(SINGLE_CHECKOUT_PROJECT);
    mockCheckAll.mockResolvedValue(resultWith('a finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_single', '--json']);

    // Byte-for-byte the pre-slice shape: a single-checkout project must see no
    // change at all, including no new keys.
    expect(jsonFrom(stdoutWrite)).toEqual({
      projectPath: '/repo/main',
      findings: [
        {
          rule: 'task-vs-plan',
          severity: 'warning',
          location: '/repo/x.md',
          description: 'a finding',
          suggestedFix: 'Fix it',
          fixable: false,
        },
      ],
      totalFindings: 1,
      errors: 0,
      warnings: 1,
      infos: 0,
      summary: '1 finding: 1 warning',
    });
  });

  it('leaves findings unattributed for a migrated single "default" worktree', async () => {
    // Caught by the real-CLI walkthrough, not by the zero-worktrees test: this
    // repo has one migrated "default" worktree, and cf check --json gained a
    // worktree field against the published build.
    mockGetAll.mockResolvedValue([MIGRATED_DEFAULT_PROJECT]);
    mockGetById.mockResolvedValue(MIGRATED_DEFAULT_PROJECT);
    mockCheckAll.mockResolvedValue(resultWith('a finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_migrated', '--json']);

    const findings = jsonFrom(stdoutWrite).findings as Array<Record<string, unknown>>;
    expect(findings[0]).not.toHaveProperty('worktree');
  });

  it('shows no worktree label for a migrated single "default" worktree', async () => {
    mockGetAll.mockResolvedValue([MIGRATED_DEFAULT_PROJECT]);
    mockGetById.mockResolvedValue(MIGRATED_DEFAULT_PROJECT);
    mockCheckAll.mockResolvedValue(resultWith('a finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_migrated']);

    const output = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('a finding');
    expect(output).not.toContain('[default]');
  });

  it('shows the worktree name on each finding with two worktrees', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    mockCheckAll
      .mockResolvedValueOnce(resultWith('alpha finding'))
      .mockResolvedValueOnce(resultWith('beta finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt']);

    const output = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('[alpha] alpha finding');
    expect(output).toContain('[beta] beta finding');
  });

  it('shows no worktree label for a single-checkout project', async () => {
    mockGetAll.mockResolvedValue([SINGLE_CHECKOUT_PROJECT]);
    mockGetById.mockResolvedValue(SINGLE_CHECKOUT_PROJECT);
    mockCheckAll.mockResolvedValue(resultWith('a finding'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_single']);

    const output = vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');
    expect(output).toContain('a finding');
    expect(output).not.toMatch(/\[[^\]]+\]\s+a finding/);
  });

  it('attributes findings in single-slice mode too', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    mockCheck
      .mockResolvedValueOnce(resultWith('slice finding alpha'))
      .mockResolvedValueOnce(resultWith('slice finding beta'));

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'check', '--slice', '200', '--project', 'proj_wt', '--json',
    ]);

    const findings = jsonFrom(stdoutWrite).findings as Array<{
      description: string;
      worktree?: { name: string };
    }>;
    expect(findings.find((f) => f.description === 'slice finding alpha')?.worktree?.name).toBe('alpha');
    expect(findings.find((f) => f.description === 'slice finding beta')?.worktree?.name).toBe('beta');
  });

  it('keeps the top-level projectPath meaning the invoking checkout (D6)', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    // Each view reports its OWN overlaid path, as applyWorktreeOverlay makes
    // it do in production. An earlier version of this test hardcoded
    // '/repo/main' in every mock result, so the assertion could not fail —
    // and it was masking a real defect: mergeCheckResults inherited
    // results[0].projectPath, i.e. the first *registered* worktree, not the
    // invoking checkout. Caught by the code review for this slice.
    mockCheckAll
      .mockResolvedValueOnce(resultWith('a', '/repo/a.md', '/repo/wt-alpha'))
      .mockResolvedValueOnce(resultWith('b', '/repo/b.md', '/repo/wt-beta'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt', '--json']);

    // --project resolves without a worktree, so the invoking checkout is the
    // project root — not alpha's path, which results[0] would have supplied.
    expect(jsonFrom(stdoutWrite).projectPath).toBe('/repo/main');
  });

  it('does not inherit the first registered worktree path as projectPath', async () => {
    mockGetAll.mockResolvedValue([TWO_WORKTREE_PROJECT]);
    mockGetById.mockResolvedValue(TWO_WORKTREE_PROJECT);
    mockCheckAll
      .mockResolvedValueOnce(resultWith('a', '/repo/a.md', '/repo/wt-alpha'))
      .mockResolvedValueOnce(resultWith('b', '/repo/b.md', '/repo/wt-beta'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_wt', '--json']);

    // The specific wrong answer, named so a regression is unambiguous.
    expect(jsonFrom(stdoutWrite).projectPath).not.toBe('/repo/wt-alpha');
  });
});
