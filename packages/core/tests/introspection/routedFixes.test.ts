import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'child_process';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { buildAttributedViews, runAttributed } from '../../src/introspection/mergeCheckResults.js';
import {
  applyFixPlan,
  FIX_COMMIT_MESSAGE,
  planRoutedFixes,
  resolveInvokingCheckout,
  type AttributedCheckResult,
} from '../../src/introspection/routedFixes.js';
import { restorePathsToHead } from '../../src/guides/gitExec.js';
import { checkoutReadiness } from '../../src/git/checkoutReadiness.js';
import { DeferReason, type ConsistencyFinding } from '../../src/introspection/types.js';
import type { ProjectData } from '../../src/types/project.js';
import type { WorktreeContext } from '../../src/types/worktree.js';
import {
  commitCount,
  createGitWorktreeFixture,
  detachHead,
  git,
  installRejectingPreCommitHook,
  lastSubject,
  porcelain,
  startConflictingMerge,
  writeAndCommit,
  writeRel,
  type GitWorktreeFixture,
} from '../helpers/gitWorktreeFixture.js';

// Passthrough spy: every git process the code under test starts goes through
// execFile (gitExec), so the single-checkout case can assert none ran.
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

// Passthrough, so case 7 alone can make the restore fail after a real commit failure.
vi.mock('../../src/guides/gitExec.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/guides/gitExec.js')>();
  return { ...actual, restorePathsToHead: vi.fn(actual.restorePathsToHead) };
});

// Passthrough, so case 8 alone can make a readiness probe throw.
vi.mock('../../src/git/checkoutReadiness.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/git/checkoutReadiness.js')>();
  return { ...actual, checkoutReadiness: vi.fn(actual.checkoutReadiness) };
});

const NAME = 'routed';
const DOCS = 'project-documents/user';
const PLAN = `${DOCS}/architecture/900-slices.maint.md`;

function fm(fields: string): string {
  return `---\n${fields}\nproject: ${NAME}\ndateCreated: 20260101\ndateUpdated: 20260101\n---\n`;
}

export function designPath(index: number, name: string): string {
  return `${DOCS}/slices/${index}-slice.${name}.md`;
}

export function tasksPath(index: number, name: string): string {
  return `${DOCS}/tasks/${index}-tasks.${name}.md`;
}

function planContent(entries: [number, string][]): string {
  const lines = entries.map(([idx, name], i) => `${i + 1}. [ ] **(${idx}) ${name}** — ${name}`);
  return fm('docType: slice-plan\nstatus: in_progress') + '\n# Plan\n\n' + lines.join('\n') + '\n';
}

function designContent(name: string, status = 'not_started'): string {
  return fm(`docType: slice-design\nslice: ${name}\nstatus: ${status}`) + `\n# ${name}\n`;
}

/** Task file whose items are all done or all open; frontmatter status stays not_started. */
function tasksContent(name: string, done: boolean): string {
  const box = done ? '[x]' : '[ ]';
  return fm(`docType: tasks\nslice: ${name}\nstatus: not_started`) + `\n- ${box} one\n- ${box} two\n`;
}

/** Seed: a 900 plan with entries 120 (primary's range) and 950 (b's range), no work done. */
function seedDocs(primary: string): void {
  writeRel(primary, PLAN, planContent([[120, 'alpha'], [950, 'beta']]));
  writeRel(primary, designPath(120, 'alpha'), designContent('alpha'));
  writeRel(primary, tasksPath(120, 'alpha'), tasksContent('alpha', false));
  writeRel(primary, designPath(950, 'beta'), designContent('beta'));
  writeRel(primary, tasksPath(950, 'beta'), tasksContent('beta', false));
}

/** Mark slice 950's tasks done in a checkout (three fixable findings follow: plan box, design, task file). */
export function completeBeta(checkout: string, commit: boolean): void {
  const content = tasksContent('beta', true);
  if (commit) writeAndCommit(checkout, tasksPath(950, 'beta'), content);
  else writeRel(checkout, tasksPath(950, 'beta'), content);
}

export function worktreeCtx(id: string, path: string, range: [number, number]): WorktreeContext {
  return { id, name: id, indexRange: range, worktreePath: path };
}

export interface RoutedSetup {
  fx: GitWorktreeFixture;
  project: ProjectData;
  checker: ConsistencyChecker;
  /** b's checkout. */
  wtb: string;
}

/** Real git: primary (main, 100–199) and worktree b (950–959), seeded with documents. */
export function createRoutedSetup(ranges: { main: [number, number]; b: [number, number] } = {
  main: [100, 199],
  b: [950, 959],
}): RoutedSetup {
  const fx = createGitWorktreeFixture(['b'], seedDocs);
  const project: ProjectData = {
    id: 'p1',
    name: NAME,
    template: 'default',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    projectPath: fx.primary,
    worktrees: [worktreeCtx('main', fx.primary, ranges.main), worktreeCtx('b', fx.worktrees.b, ranges.b)],
  };
  return { fx, project, checker: new ConsistencyChecker(new ArtifactIntrospector()), wtb: fx.worktrees.b };
}

/** Dry run every view, zipped with its view (runAttributed keeps view order). */
export async function dryRun(project: ProjectData, checker: ConsistencyChecker): Promise<AttributedCheckResult[]> {
  const views = buildAttributedViews(project);
  const results = await runAttributed(views, (v) => checker.checkAll(v));
  return views.map((view, i) => ({ view, result: results[i] }));
}

/** Fixable findings about one subject index. */
export function aboutSubject(findings: ConsistencyFinding[], index: number): ConsistencyFinding[] {
  return findings.filter((f) => f.fixable && f.fixAction?.subjectIndex === index);
}

let setup: RoutedSetup;

afterEach(() => setup?.fx.cleanup());

describe('resolveInvokingCheckout (slice 213 D5b)', () => {
  beforeEach(() => {
    setup = createRoutedSetup();
  });

  it('primary root → the primary view', async () => {
    const views = buildAttributedViews(setup.project);
    const view = await resolveInvokingCheckout(views, setup.fx.primary);
    expect(view.worktree?.id).toBe('main');
  });

  it('a subdirectory of a worktree → that worktree\'s view', async () => {
    const views = buildAttributedViews(setup.project);
    const view = await resolveInvokingCheckout(views, join(setup.wtb, DOCS));
    expect(view.worktree?.id).toBe('b');
  });

  it('an unregistered checkout → throws the D5b error', async () => {
    const stray = join(setup.fx.root, 'wt-stray');
    git(setup.fx.primary, 'worktree', 'add', '-q', '-b', 'stray', stray);
    const views = buildAttributedViews(setup.project);
    await expect(resolveInvokingCheckout(views, stray)).rejects.toThrow(/not a registered worktree.*cf worktree init/);
  });

  it('a directory outside any git checkout → throws', async () => {
    const views = buildAttributedViews(setup.project);
    await expect(resolveInvokingCheckout(views, '/')).rejects.toThrow(/not inside a git checkout/);
  });
});

describe('planRoutedFixes (slice 213)', () => {
  beforeEach(() => {
    setup = createRoutedSetup();
  });

  /** The plan entry for a worktree id. */
  function entryFor(plan: Awaited<ReturnType<typeof planRoutedFixes>>, id: string) {
    const entry = plan.entries.find((e) => e.view.worktree?.id === id);
    if (!entry) throw new Error(`no plan entry for ${id}`);
    return entry;
  }

  it('1. fix owned by the non-invoking worktree is kept in its view, commit: true', async () => {
    completeBeta(setup.wtb, true);
    const results = await dryRun(setup.project, setup.checker);
    vi.mocked(execFile).mockClear();
    const plan = await planRoutedFixes(setup.project, results, setup.fx.primary);

    // Positive control for the single-checkout no-git assertion: the spy sees readiness probes.
    expect(vi.mocked(execFile)).toHaveBeenCalled();
    const b = entryFor(plan, 'b');
    expect(b.commit).toBe(true);
    expect(aboutSubject(b.result.findings, 950)).toHaveLength(3);
    expect(b.result.findings.every((f) => f.fixable)).toBe(true);
    expect(entryFor(plan, 'main').commit).toBe(false);
    expect(plan.deferred).toEqual([]);
  });

  it('2. the same subject flagged in the non-owner view is deferred NOT_OWNER with the owner', async () => {
    completeBeta(setup.wtb, true);
    completeBeta(setup.fx.primary, false); // stale copy in the invoking checkout
    const plan = await planRoutedFixes(setup.project, await dryRun(setup.project, setup.checker), setup.fx.primary);

    expect(aboutSubject(entryFor(plan, 'main').result.findings, 950)).toEqual([]);
    const notOwner = plan.deferred.filter((d) => d.reason === DeferReason.NOT_OWNER);
    expect(notOwner).toHaveLength(3);
    for (const d of notOwner) {
      expect(d.owner?.id).toBe('b');
      expect(d.finding.worktree?.id).toBe('main');
    }
    expect(aboutSubject(entryFor(plan, 'b').result.findings, 950)).toHaveLength(3);
  });

  it('3. overlapping ranges → OWNER_UNRESOLVED', async () => {
    setup.fx.cleanup();
    setup = createRoutedSetup({ main: [900, 999], b: [950, 959] });
    completeBeta(setup.wtb, true);
    const plan = await planRoutedFixes(setup.project, await dryRun(setup.project, setup.checker), setup.fx.primary);

    const unresolved = plan.deferred.filter((d) => d.reason === DeferReason.OWNER_UNRESOLVED);
    expect(unresolved.map((d) => d.finding.fixAction?.subjectIndex)).toEqual([950, 950, 950]);
    expect(entryFor(plan, 'b').result.findings).toEqual([]);
  });

  it('4. owner lacks the file → kept in the view that reported it', async () => {
    // Slice 955 (b's range) exists only in the primary checkout.
    const p = setup.fx.primary;
    writeRel(p, PLAN, planContent([[120, 'alpha'], [950, 'beta'], [955, 'gamma']]));
    writeRel(p, designPath(955, 'gamma'), designContent('gamma'));
    writeRel(p, tasksPath(955, 'gamma'), tasksContent('gamma', true));
    const plan = await planRoutedFixes(setup.project, await dryRun(setup.project, setup.checker), p);

    const kept = aboutSubject(entryFor(plan, 'main').result.findings, 955).map((f) => f.rule).sort();
    expect(kept).toEqual(['frontmatter-vs-computed', 'task-file-status']);
    // The plan file exists in b, so that fix is a stale copy.
    const deferred = plan.deferred.filter((d) => d.finding.fixAction?.subjectIndex === 955);
    expect(deferred.map((d) => [d.finding.rule, d.reason])).toEqual([['task-vs-plan', DeferReason.NOT_OWNER]]);
  });

  it('5a. dirty target in the non-invoking checkout → FILE_DIRTY for that fix only', async () => {
    completeBeta(setup.wtb, true);
    writeRel(setup.wtb, designPath(950, 'beta'), designContent('beta') + '\nuser edit\n');
    const plan = await planRoutedFixes(setup.project, await dryRun(setup.project, setup.checker), setup.fx.primary);

    expect(plan.deferred.map((d) => [d.finding.rule, d.reason])).toEqual([
      ['frontmatter-vs-computed', DeferReason.FILE_DIRTY],
    ]);
    expect(entryFor(plan, 'b').result.findings.map((f) => f.rule).sort()).toEqual(['task-file-status', 'task-vs-plan']);
  });

  it('5b. unresolved merge → every fix there CHECKOUT_BUSY', async () => {
    completeBeta(setup.wtb, true);
    const results = await dryRun(setup.project, setup.checker);
    startConflictingMerge(setup.wtb);
    const plan = await planRoutedFixes(setup.project, results, setup.fx.primary);

    expect(plan.deferred.map((d) => d.reason)).toEqual(Array(3).fill(DeferReason.CHECKOUT_BUSY));
    expect(entryFor(plan, 'b').result.findings).toEqual([]);
  });

  it('5c. detached HEAD → DETACHED_HEAD', async () => {
    completeBeta(setup.wtb, true);
    detachHead(setup.wtb);
    const plan = await planRoutedFixes(setup.project, await dryRun(setup.project, setup.checker), setup.fx.primary);

    expect(plan.deferred.map((d) => d.reason)).toEqual(Array(3).fill(DeferReason.DETACHED_HEAD));
  });

  it('5d. worktree path gone → NOT_A_CHECKOUT', async () => {
    completeBeta(setup.wtb, true);
    const results = await dryRun(setup.project, setup.checker);
    renameSync(setup.wtb, `${setup.wtb}-moved`);
    const plan = await planRoutedFixes(setup.project, results, setup.fx.primary);

    expect(plan.deferred.map((d) => d.reason)).toEqual(Array(3).fill(DeferReason.NOT_A_CHECKOUT));
  });

  it('single checkout: everything kept, nothing deferred, no git process', async () => {
    const single: ProjectData = { ...setup.project, worktrees: undefined };
    completeBeta(setup.fx.primary, false);
    const results = await dryRun(single, setup.checker);
    vi.mocked(execFile).mockClear();

    const plan = await planRoutedFixes(single, results, setup.fx.primary);

    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(plan.deferred).toEqual([]);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].commit).toBe(false);
    expect(aboutSubject(plan.entries[0].result.findings, 950)).toHaveLength(3);
  });
});

describe('applyFixPlan (slice 213)', () => {
  beforeEach(() => {
    setup = createRoutedSetup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  async function planFromPrimary(project = setup.project) {
    return planRoutedFixes(project, await dryRun(project, setup.checker), setup.fx.primary);
  }

  const betaFiles = [PLAN, designPath(950, 'beta'), tasksPath(950, 'beta')].sort();

  it('1. owner fix in the non-invoking worktree is written and committed there', async () => {
    completeBeta(setup.wtb, true);
    const result = await applyFixPlan(setup.checker, await planFromPrimary());

    expect(lastSubject(setup.wtb)).toBe(FIX_COMMIT_MESSAGE);
    expect(porcelain(setup.wtb)).toBe('');
    expect(result.commits).toHaveLength(1);
    expect(result.commits[0].files.sort()).toEqual(betaFiles);
    expect(result.commits[0].sha).toBe(git(setup.wtb, 'rev-parse', 'HEAD'));
    expect(result.commits[0].worktree?.id).toBe('b');
    expect(result.fixed).toBe(3);
    expect(result.fixLog.every((e) => e.worktree?.id === 'b')).toBe(true);
    expect(result.deferred).toEqual([]);
    expect(result.projectPath).toBe(setup.fx.primary);
  });

  it('2. an unrelated staged file stays staged and out of the fix commit', async () => {
    completeBeta(setup.wtb, true);
    writeRel(setup.wtb, 'README.md', 'staged by user\n');
    git(setup.wtb, 'add', 'README.md');
    await applyFixPlan(setup.checker, await planFromPrimary());

    const committed = git(setup.wtb, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort();
    expect(committed).toEqual(betaFiles);
    expect(porcelain(setup.wtb)).toBe('M  README.md');
  });

  it('3. invoking checkout writes stay uncommitted', async () => {
    writeRel(setup.fx.primary, tasksPath(120, 'alpha'), tasksContent('alpha', true));
    const before = commitCount(setup.fx.primary);
    const result = await applyFixPlan(setup.checker, await planFromPrimary());

    expect(result.fixed).toBe(3);
    expect(result.commits).toEqual([]);
    expect(commitCount(setup.fx.primary)).toBe(before);
    expect(porcelain(setup.fx.primary)).toContain(designPath(120, 'alpha'));
  });

  it('4. target dirtied between plan and apply → FILE_DIRTY, not written', async () => {
    completeBeta(setup.wtb, true);
    const plan = await planFromPrimary();
    const userEdit = designContent('beta') + '\nuser edit\n';
    writeRel(setup.wtb, designPath(950, 'beta'), userEdit);

    const result = await applyFixPlan(setup.checker, plan);

    expect(result.deferred.map((d) => [d.finding.rule, d.reason])).toEqual([
      ['frontmatter-vs-computed', DeferReason.FILE_DIRTY],
    ]);
    expect(readFileSync(join(setup.wtb, designPath(950, 'beta')), 'utf-8')).toBe(userEdit);
    expect(result.commits[0].files.sort()).toEqual([PLAN, tasksPath(950, 'beta')].sort());
  });

  it('5. rejecting pre-commit hook → paths back at HEAD, COMMIT_FAILED with detail', async () => {
    completeBeta(setup.wtb, true);
    installRejectingPreCommitHook(setup.fx, setup.wtb);
    const before = commitCount(setup.wtb);

    const result = await applyFixPlan(setup.checker, await planFromPrimary());

    expect(porcelain(setup.wtb)).toBe('');
    expect(commitCount(setup.wtb)).toBe(before);
    expect(result.deferred).toHaveLength(3);
    for (const d of result.deferred) {
      expect(d.reason).toBe(DeferReason.COMMIT_FAILED);
      expect(d.detail).toMatch(/rejected by test hook/);
    }
    expect(result.fixed).toBe(result.fixLog.length);
    expect(result.fixed).toBe(0);
    expect(result.fixErrors).toEqual([]);
    expect(result.commits).toEqual([]);
  });

  it('6. owner-lacks-file fix written in each reporting view produces identical bytes', async () => {
    setup.fx.cleanup();
    const fx = createGitWorktreeFixture(['b', 'c'], seedDocs);
    const project: ProjectData = {
      ...createProjectFor(fx),
      worktrees: [
        worktreeCtx('main', fx.primary, [100, 199]),
        worktreeCtx('b', fx.worktrees.b, [950, 959]),
        worktreeCtx('c', fx.worktrees.c, [500, 599]),
      ],
    };
    setup = { ...setup, fx, project, wtb: fx.worktrees.b };
    // Slice 955 (b's range) lands on main and in c, never in b.
    writeAndCommit(fx.primary, PLAN, planContent([[120, 'alpha'], [950, 'beta'], [955, 'gamma']]));
    writeAndCommit(fx.primary, designPath(955, 'gamma'), designContent('gamma'));
    writeAndCommit(fx.primary, tasksPath(955, 'gamma'), tasksContent('gamma', true));
    git(fx.worktrees.c, 'merge', '-q', '--ff-only', 'main');

    const result = await applyFixPlan(setup.checker, await planFromPrimary(project));

    for (const rel of [designPath(955, 'gamma'), tasksPath(955, 'gamma')]) {
      const primaryBytes = readFileSync(join(fx.primary, rel), 'utf-8');
      expect(primaryBytes).toContain('status: complete');
      expect(readFileSync(join(fx.worktrees.c, rel), 'utf-8')).toBe(primaryBytes);
    }
    expect(result.commits.map((c) => c.worktree?.id)).toEqual(['c']);
    expect(lastSubject(fx.worktrees.c)).toBe(FIX_COMMIT_MESSAGE);
  });

  it('7. commit fails and restore fails → log entries stay, one fixErrors entry', async () => {
    completeBeta(setup.wtb, true);
    installRejectingPreCommitHook(setup.fx, setup.wtb);
    vi.mocked(restorePathsToHead).mockRejectedValueOnce(new Error('restore failed: index.lock held'));

    const result = await applyFixPlan(setup.checker, await planFromPrimary());

    // The restore really was attempted for b's written paths, and is what failed.
    expect(vi.mocked(restorePathsToHead)).toHaveBeenCalledTimes(1);
    const [restoreRoot, restorePaths] = vi.mocked(restorePathsToHead).mock.calls[0];
    expect(restoreRoot).toBe(setup.wtb);
    expect([...restorePaths].sort()).toEqual(betaFiles);
    expect(result.fixLog).toHaveLength(3);
    expect(result.fixed).toBe(3);
    expect(result.fixErrors).toHaveLength(1);
    expect(result.fixErrors[0]).toContain(setup.wtb);
    for (const rel of betaFiles) expect(result.fixErrors[0]).toContain(rel);
    expect(result.deferred).toEqual([]);
    expect(porcelain(setup.wtb)).not.toBe('');
  });

  it('8. readiness throws in a later checkout → earlier commit still reported, READINESS_FAILED', async () => {
    setup.fx.cleanup();
    const fx = createGitWorktreeFixture(['b', 'c'], seedDocs);
    const project: ProjectData = {
      ...createProjectFor(fx),
      worktrees: [
        worktreeCtx('main', fx.primary, [100, 199]),
        worktreeCtx('b', fx.worktrees.b, [950, 959]),
        worktreeCtx('c', fx.worktrees.c, [500, 599]),
      ],
    };
    setup = { ...setup, fx, project, wtb: fx.worktrees.b };
    writeAndCommit(fx.primary, tasksPath(120, 'alpha'), tasksContent('alpha', true));
    completeBeta(fx.worktrees.b, true);
    // Invoked from c: main's and b's fixes are both committed, main's first.
    const plan = await planRoutedFixes(project, await dryRun(project, setup.checker), fx.worktrees.c);
    const { checkoutReadiness: realReadiness } =
      await vi.importActual<typeof import('../../src/git/checkoutReadiness.js')>('../../src/git/checkoutReadiness.js');
    vi.mocked(checkoutReadiness)
      .mockImplementationOnce(realReadiness)
      .mockRejectedValueOnce(new Error('git timed out after 60000ms'));

    const result = await applyFixPlan(setup.checker, plan);

    expect(result.commits.map((c) => c.worktree?.id)).toEqual(['main']);
    expect(lastSubject(fx.primary)).toBe(FIX_COMMIT_MESSAGE);
    expect(result.fixed).toBe(3);
    expect(result.deferred).toHaveLength(3);
    for (const d of result.deferred) {
      expect(d.reason).toBe(DeferReason.READINESS_FAILED);
      expect(d.detail).toMatch(/timed out/);
      expect(d.finding.worktree?.id).toBe('b');
    }
    expect(porcelain(fx.worktrees.b)).toBe('');
  });

  it('single checkout: no deferrals, no commits, no worktree on log entries, no git process', async () => {
    const single: ProjectData = { ...setup.project, worktrees: undefined };
    completeBeta(setup.fx.primary, false);
    const results = await dryRun(single, setup.checker);
    const plan = await planRoutedFixes(single, results, setup.fx.primary);
    vi.mocked(execFile).mockClear();

    const result = await applyFixPlan(setup.checker, plan);

    expect(vi.mocked(execFile)).not.toHaveBeenCalled();
    expect(result.fixed).toBe(3);
    expect(result.deferred).toEqual([]);
    expect(result.commits).toEqual([]);
    expect(result.fixLog.some((e) => 'worktree' in e)).toBe(false);
    expect(result.findings).toEqual(results[0].result.findings);
  });
});

function createProjectFor(fx: GitWorktreeFixture): ProjectData {
  return { ...setup.project, projectPath: fx.primary };
}
