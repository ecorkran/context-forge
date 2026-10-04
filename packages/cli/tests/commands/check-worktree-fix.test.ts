import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeferReason } from '@context-forge/core';
import { FIX_COMMIT_MESSAGE } from '@context-forge/core/node';
import { registerCheckCommand } from '../../src/commands/check.js';
import { DEFER_REASON_LABELS } from '../../src/output/fixReport.js';
import {
  createGitWorktreeFixture,
  git,
  lastSubject,
  porcelain,
  writeRel,
  type GitWorktreeFixture,
} from '../../../core/tests/helpers/gitWorktreeFixture.js';

/**
 * `cf check --fix` with two real git checkouts (slice 213). Replaces the 927
 * contract (every checkout with the finding is rewritten): a fix is written
 * once, in the checkout that owns its subject, and committed there when that
 * is not the invoking checkout. The non-owner copy is reported as deferred.
 *
 * Uses the REAL ConsistencyChecker over real git worktrees; only the project
 * store, the cwd, and the y/N prompt are stubbed.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>(
    '@context-forge/core/node',
  );
  return {
    ...actual,
    // A plain class, not vi.fn().mockImplementation — restoreAllMocks() in
    // afterEach would strip the implementation (see validate-worktree-scope.test.ts).
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

const events: string[] = [];
const mockAskConfirmation = vi.fn<(prompt: string) => Promise<boolean>>();
vi.mock('../../src/utils/confirm.js', () => ({
  askConfirmation: (prompt: string) => {
    events.push('prompt');
    return mockAskConfirmation(prompt);
  },
}));

const SLICE_INDEX = 250;
const SLICE_NAME = 'wt-fix-test';
const PLAN_REL = `project-documents/user/architecture/${SLICE_INDEX}-slices.${SLICE_NAME}.md`;
const TASKS_REL = `project-documents/user/tasks/${SLICE_INDEX}-tasks.${SLICE_NAME}.md`;
const PLAN_STEM = `${SLICE_INDEX}-slices.${SLICE_NAME}`;
const PROJECT_NAME = 'wt-fix-project';

/**
 * Tasks complete (status already complete, so only rule 1 fires) and the plan
 * entry unchecked: exactly one fixable finding, task-vs-plan for slice 250.
 * Seeded before the worktree is added, so both checkouts hold the same state.
 */
function seed(primary: string): void {
  const dates = 'dateCreated: 20260101\ndateUpdated: 20260101';
  writeRel(
    primary,
    TASKS_REL,
    `---\ndocType: tasks\nslice: ${SLICE_NAME}\nproject: ${SLICE_NAME}\nstatus: complete\n${dates}\n---\n\n- [x] Task one\n- [x] Task two\n`,
  );
  writeRel(
    primary,
    PLAN_REL,
    `---\ndocType: slice-plan\nproject: ${SLICE_NAME}\nstatus: in_progress\n${dates}\n---\n\n# Plan\n\n` +
      `1. [ ] **(${SLICE_INDEX}) Worktree Fix Feature** — exercises routed fixing.\n`,
  );
}

function entryState(checkout: string): '[ ]' | '[x]' {
  const line = readFileSync(join(checkout, PLAN_REL), 'utf-8').split('\n').find((l) => l.includes(`(${SLICE_INDEX})`));
  if (line?.includes('[x]')) return '[x]';
  if (line?.includes('[ ]')) return '[ ]';
  throw new Error(`fixture error: no checkbox on the ${SLICE_INDEX} entry`);
}

interface CheckJsonResult {
  findings: Array<{ description: string; rule: string }>;
  fixed: number;
  fixLog: Array<{ filePath: string; rule: string; worktree?: { id: string; name: string } }>;
  deferred: Array<{ reason: string; owner?: { name: string }; finding: { rule: string; worktree?: { name: string } } }>;
  commits: Array<{ sha: string; checkoutPath: string; files: string[]; worktree?: { name: string } }>;
}

describe('cf check --fix — worktree-aware routing (slice 213)', () => {
  let fx: GitWorktreeFixture;
  let primary: string;
  let wtb: string;
  let project: Record<string, unknown>;
  let stdout: string;
  let logs: string[];
  let errors: string[];

  beforeEach(() => {
    fx = createGitWorktreeFixture(['b'], seed);
    primary = fx.primary;
    wtb = fx.worktrees.b;
    stdout = '';
    logs = [];
    errors = [];
    events.length = 0;
    mockAskConfirmation.mockReset();

    // b owns slice 250; primary owns the rest of the 200 band.
    project = {
      id: 'proj_wt_fix',
      name: PROJECT_NAME,
      template: 'default',
      projectPath: primary,
      fileSlicePlan: PLAN_STEM,
      worktrees: [
        { id: 'wt_a', name: 'alpha', indexRange: [200, 249], worktreePath: primary, slicePlan: PLAN_STEM },
        { id: 'wt_b', name: 'beta', indexRange: [250, 259], worktreePath: wtb, slicePlan: PLAN_STEM },
      ],
    };
    mockGetAll.mockResolvedValue([project]);
    mockGetById.mockResolvedValue(project);

    vi.spyOn(process, 'cwd').mockReturnValue(primary);
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      const line = args.map(String).join(' ');
      logs.push(line);
      events.push(line);
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      errors.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`cf exited ${code}: ${errors.join(' | ') || '(no stderr captured)'}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fx.cleanup();
  });

  async function run(...args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerCheckCommand(program);
    await program.parseAsync(['node', 'cf', 'check', '--project', PROJECT_NAME, ...args]);
  }

  function json(): CheckJsonResult {
    if (!stdout) throw new Error(`no JSON on stdout; stderr was: ${errors.join(' | ') || '(empty)'}`);
    return JSON.parse(stdout);
  }

  /** The 213 contract: written once in b (the owner) and committed there; primary's copy deferred. */
  function expectRoutedToOwner(result: CheckJsonResult): void {
    expect(entryState(wtb)).toBe('[x]');
    expect(entryState(primary)).toBe('[ ]');
    expect(result.fixed).toBe(1);
    expect(result.fixLog).toHaveLength(1);
    expect(result.fixLog[0].worktree?.name).toBe('beta');
    expect(result.deferred).toHaveLength(1);
    expect(result.deferred[0].reason).toBe(DeferReason.NOT_OWNER);
    expect(result.deferred[0].owner?.name).toBe('beta');
    expect(result.deferred[0].finding.worktree?.name).toBe('alpha');
    // SC 3, 4: one scoped commit in b with the defined message; b's tree is clean.
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].files).toEqual([PLAN_REL]);
    expect(result.commits[0].sha).toBe(git(wtb, 'rev-parse', 'HEAD'));
    expect(lastSubject(wtb)).toBe(FIX_COMMIT_MESSAGE);
    expect(porcelain(wtb)).toBe('');
  }

  it('single-slice --fix writes only the owner\'s copy and commits it there', async () => {
    await run('--slice', String(SLICE_INDEX), '--fix', '--json');
    expectRoutedToOwner(json());
  });

  it('all-slices --fix --yes routes the same way and shows one deduped finding', async () => {
    await run('--fix', '--yes', '--json');
    const result = json();
    expectRoutedToOwner(result);
    expect(result.findings.filter((f) => f.rule === 'task-vs-plan')).toHaveLength(1);
    expect(mockAskConfirmation).not.toHaveBeenCalled();
  });

  it('from an unregistered checkout, --fix fails with the D5b error and writes nothing', async () => {
    const stray = join(fx.root, 'wt-stray');
    git(primary, 'worktree', 'add', '-q', '-b', 'stray', stray);
    vi.mocked(process.cwd).mockReturnValue(stray);

    await expect(run('--fix', '--yes', '--json')).rejects.toThrow(/cf exited 1/);
    expect(errors.join('\n')).toMatch(/not a registered worktree/);
    expect(stdout).toBe('');
    expect(entryState(wtb)).toBe('[ ]');
    expect(entryState(primary)).toBe('[ ]');
    expect(porcelain(wtb)).toBe('');
  });

  it('read-only cf check from an unregistered checkout is unaffected', async () => {
    const stray = join(fx.root, 'wt-stray');
    git(primary, 'worktree', 'add', '-q', '-b', 'stray', stray);
    vi.mocked(process.cwd).mockReturnValue(stray);

    await run('--json');
    expect(json().findings.some((f) => f.rule === 'task-vs-plan')).toBe(true);
  });

  it('all-slices --fix previews the routed plan before prompting; declining writes nothing', async () => {
    mockAskConfirmation.mockResolvedValue(false);
    await run('--fix');

    const planAt = events.findIndex((e) => e.includes('Fix plan'));
    const promptAt = events.indexOf('prompt');
    expect(planAt).toBeGreaterThan(-1);
    expect(promptAt).toBeGreaterThan(planAt);
    const preview = events.slice(planAt, promptAt).join('\n');
    expect(preview).toContain('[beta]');
    expect(preview).toContain(`will commit in ${wtb}`);
    expect(preview).toContain('Left alone 1 fix(es)');
    expect(preview).toContain('stale copy; owned by beta');
    expect(entryState(wtb)).toBe('[ ]');
    expect(porcelain(wtb)).toBe('');
  });

  it('workflow.auto_fix: a plain cf check routes and commits without prompting (SC 11)', async () => {
    writeFileSync(join(primary, '.context-forge.toml'), '[workflow]\nauto_fix = true\n');
    await run('--json');
    expectRoutedToOwner(json());
    expect(mockAskConfirmation).not.toHaveBeenCalled();
  });

  it('single checkout --fix --json: deferred and commits are empty, no worktree on log entries', async () => {
    project.worktrees = undefined;
    await run('--fix', '--yes', '--json');
    const result = json();
    expect(entryState(primary)).toBe('[x]');
    expect(result.fixed).toBe(1);
    expect(result.deferred).toEqual([]);
    expect(result.commits).toEqual([]);
    expect(result.fixLog.some((e) => 'worktree' in e)).toBe(false);
  });

  describe('grouped text output (Task 20)', () => {
    /** Slice 210 is in alpha's (primary's) range: complete it there, uncommitted. */
    function addPrimaryOwnedFix(): void {
      const plan = readFileSync(join(primary, PLAN_REL), 'utf-8');
      writeRel(primary, PLAN_REL, plan + `2. [ ] **(210) Primary Feature** — owned by alpha.\n`);
      writeRel(
        primary,
        'project-documents/user/tasks/210-tasks.primary-feature.md',
        readFileSync(join(primary, TASKS_REL), 'utf-8').replace(`slice: ${SLICE_NAME}`, 'slice: primary-feature'),
      );
    }

    it('groups the invoking write, the committed write, and the deferral by checkout', async () => {
      addPrimaryOwnedFix();
      await run('--fix', '--yes');

      const out = logs.join('\n');
      const sha7 = git(wtb, 'rev-parse', '--short=7', 'HEAD');
      const invokingAt = out.search(/\[alpha\].*invoking checkout, uncommitted/);
      const committedAt = out.search(new RegExp(`\\[beta\\].*committed ${sha7} in ${wtb}`));
      const leftAt = out.indexOf('Left alone 1 fix(es)');
      expect(out).toContain('Fixed 2 finding(s)');
      expect(invokingAt).toBeGreaterThan(-1);
      expect(committedAt).toBeGreaterThan(-1);
      expect(leftAt).toBeGreaterThan(Math.max(invokingAt, committedAt));
      expect(out.slice(leftAt)).toMatch(/\[alpha\].*stale copy; owned by beta/);
    });

    it('every DeferReason value has a display label', () => {
      for (const reason of Object.values(DeferReason)) {
        expect(typeof DEFER_REASON_LABELS[reason]).toBe('function');
      }
      expect(Object.keys(DEFER_REASON_LABELS).sort()).toEqual(Object.values(DeferReason).sort());
    });

    it('single-checkout text output has no group headers or [worktree] prefixes', async () => {
      project.worktrees = undefined;
      await run('--fix', '--yes');

      const out = logs.join('\n');
      expect(out).toContain('Fixed 1 of');
      expect(out).not.toContain('invoking checkout');
      expect(out).not.toContain('Left alone');
      expect(out).not.toMatch(/\[(alpha|beta)\]/);
    });
  });
});
