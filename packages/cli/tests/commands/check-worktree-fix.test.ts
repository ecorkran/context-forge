import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerCheckCommand } from '../../src/commands/check.js';

/**
 * Integration coverage for Task 15 (slice 927, Part 3): `cf check --fix` must
 * apply fixes PER WORKTREE VIEW, before the merge, so that a logical finding
 * duplicated across two checkouts (now collapsed to one displayed finding by
 * the root-normalized dedup key, #100) still gets its underlying file fixed
 * in BOTH checkouts — not just the first one seen.
 *
 * check.test.ts and check-worktree-attribution.test.ts both mock
 * ConsistencyChecker entirely, so neither can see a bug in the real
 * file-write plumbing (updateCheckbox actually touching disk). This suite
 * uses the REAL ConsistencyChecker and ArtifactIntrospector over REAL temp
 * directories, following validate-worktree-scope.test.ts's (#88) precedent:
 * only FileProjectStore is mocked.
 *
 * Why this pins the fix (pre-Task-13/14 behavior): the old code ran
 * checker.check()/checkAll() per view, merged+deduped the results, and THEN
 * called checker.applyFixes() once on the already-merged result. Because the
 * merged result's fixAction.filePath for a deduped finding is only ever the
 * first-seen checkout's path, applyFixes(merged) would write ONE checkout's
 * file and silently leave the other checkout's stale checkbox untouched. The
 * assertions below read BOTH checkout files back off disk and require BOTH
 * to have flipped, and require TWO fixLog entries (one per checkout) even
 * though only ONE finding is displayed — a test that only checked "is there
 * at least one fix" or "does the displayed finding look right" would pass
 * under the old, broken behavior.
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
    // afterEach would strip the implementation and later tests would get a
    // bare mock whose store has no getAll (see validate-worktree-scope.test.ts).
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

const SLICE_INDEX = 250;
const SLICE_NAME = 'wt-fix-test';
const PLAN_STEM = `${SLICE_INDEX}-slices.${SLICE_NAME}`;
const TASK_FILE_NAME = `${SLICE_INDEX}-tasks.${SLICE_NAME}.md`;
const PLAN_FILE_NAME = `${PLAN_STEM}.md`;

/**
 * Writes a task file whose every checkbox is checked, so parseTaskFile
 * reports inferredStatus === 'complete' (completedTasks === totalTasks > 0).
 * Checkbox syntax must match taskFileParser's CHECKBOX_RE:
 * /^(?:\s*)-\s+\[([ xX])\]\s+(.+)$/ — no frontmatter is required for parsing.
 *
 * Frontmatter carries every field the 'tasks' schema requires (docType,
 * slice, project, status, dateCreated, dateUpdated) with status already
 * "complete" — matching the computed inferredStatus — so this fixture
 * produces no frontmatter-schema (rule 12) or task-file-status (rule 5)
 * findings and isolates rule 1 (task-vs-plan) as the only fixable finding.
 */
function writeCompleteTaskFile(checkoutRoot: string): void {
  const dir = join(checkoutRoot, 'project-documents/user/tasks');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, TASK_FILE_NAME),
    [
      '---',
      'docType: tasks',
      `slice: ${SLICE_NAME}`,
      `project: ${SLICE_NAME}`,
      'status: complete',
      'dateCreated: 20260101',
      'dateUpdated: 20260101',
      '---',
      '',
      '- [x] Task one',
      '- [x] Task two',
      '',
    ].join('\n'),
  );
}

/**
 * Writes a slice plan whose entry for SLICE_INDEX is UNCHECKED — the exact
 * shape that fires rule 1 (task-vs-plan): tasksComplete && !sliceChecked.
 * Entry line format must match slicePlanParser's PLAN_INDEXED_RE:
 * `N. [ ] **(IDX) Name** — description`. lineIndex is the 0-based raw line
 * number in the file (frontmatter counts), which is how updateCheckbox finds
 * the line to flip. Returns the 0-based line index of the entry, computed
 * the same way the parser computes it, so the test can assert on it
 * independently of ConsistencyChecker's own bookkeeping.
 *
 * Frontmatter carries every field the 'slice-plan' schema requires (docType,
 * project, status, dateCreated, dateUpdated) so this fixture produces no
 * frontmatter-schema (rule 12) finding that would insert a line and shift
 * entryLineIndex out from under the checkbox-fix assertions.
 */
function writeUncheckedSlicePlan(checkoutRoot: string): { filePath: string; entryLineIndex: number } {
  const dir = join(checkoutRoot, 'project-documents/user/architecture');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, PLAN_FILE_NAME);
  const lines = [
    '---',
    'docType: slice-plan',
    `project: ${SLICE_NAME}`,
    'status: in_progress',
    'dateCreated: 20260101',
    'dateUpdated: 20260101',
    '---',
    '',
    '# Slice Plan: Worktree Fix Test',
    '',
    '## Feature Slices',
    '',
    `1. [ ] **(${SLICE_INDEX}) Worktree Fix Feature** — exercises per-view fixing.`,
    '',
  ];
  const entryLineIndex = lines.findIndex((l) => l.includes(`(${SLICE_INDEX})`));
  writeFileSync(filePath, lines.join('\n'));
  return { filePath, entryLineIndex };
}

/** Reads the slice plan entry line back off disk and reports its checkbox state. */
function readEntryCheckboxState(filePath: string, entryLineIndex: number): '[ ]' | '[x]' {
  const content = readFileSync(filePath, 'utf-8');
  const line = content.split('\n')[entryLineIndex];
  if (line.includes('[x]') || line.includes('[X]')) return '[x]';
  if (line.includes('[ ]')) return '[ ]';
  throw new Error(`fixture error: line ${entryLineIndex} has no checkbox: "${line}"`);
}

interface FixLogEntry {
  filePath: string;
  rule: string;
  before: string;
  after: string;
}

interface CheckJsonResult {
  findings: Array<{ description: string; rule: string }>;
  totalFindings: number;
  fixLog?: FixLogEntry[];
  fixed?: number;
}

describe('cf check --fix — per-worktree-view fixing (slice 927, Task 15)', () => {
  let tmpRoot: string;
  let checkoutA: string;
  let checkoutB: string;
  let planA: { filePath: string; entryLineIndex: number };
  let planB: { filePath: string; entryLineIndex: number };
  let project: Record<string, unknown>;
  let jsonOutput: string;
  let capturedErrors: string[];

  beforeEach(() => {
    capturedErrors = [];
    jsonOutput = '';

    // realpath: on macOS process.cwd()-adjacent paths report /private/var while
    // mkdtemp returns /var; ConfigManager/checker path comparisons are string
    // comparisons, so normalize the same way validate-worktree-scope.test.ts does.
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'cf-wt-fix-')));
    checkoutA = join(tmpRoot, 'checkout-a');
    checkoutB = join(tmpRoot, 'checkout-b');
    mkdirSync(checkoutA, { recursive: true });
    mkdirSync(checkoutB, { recursive: true });

    // Same fixable state (tasks complete, plan entry unchecked) in BOTH
    // checkouts — the exact shape #100's dedup key collapses to one finding.
    writeCompleteTaskFile(checkoutA);
    writeCompleteTaskFile(checkoutB);
    planA = writeUncheckedSlicePlan(checkoutA);
    planB = writeUncheckedSlicePlan(checkoutB);

    project = {
      id: 'proj_wt_fix',
      name: 'wt-fix-project',
      template: 'default',
      projectPath: checkoutA,
      fileSlicePlan: PLAN_STEM,
      worktrees: [
        {
          id: 'wt_a',
          name: 'alpha',
          indexRange: [200, 299],
          worktreePath: checkoutA,
          slicePlan: PLAN_STEM,
        },
        {
          id: 'wt_b',
          name: 'beta',
          indexRange: [200, 299],
          worktreePath: checkoutB,
          slicePlan: PLAN_STEM,
          rangeOverride: true,
        },
      ],
    };

    mockGetAll.mockResolvedValue([project]);
    mockGetById.mockResolvedValue(project);

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      jsonOutput += String(chunk);
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(
        `cf exited ${code}: ${capturedErrors.join(' | ') || '(no stderr captured)'}`,
      );
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function createProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerCheckCommand(program);
    return program;
  }

  function parseJsonOutput(): CheckJsonResult {
    if (!jsonOutput) {
      throw new Error(`no JSON on stdout; stderr was: ${capturedErrors.join(' | ') || '(empty)'}`);
    }
    return JSON.parse(jsonOutput);
  }

  it('single-slice --fix flips the checkbox on disk in both checkouts and logs two fixes', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'check',
      '--slice', String(SLICE_INDEX),
      '--project', 'wt-fix-project',
      '--fix', '--json',
    ]);

    const result = parseJsonOutput();

    // Both checkouts' files must actually be rewritten on disk. Under the
    // pre-Task-13 behavior (fix applied to the merged/deduped result), only
    // the first-seen checkout's file would flip — this pair of assertions
    // fails outright if either checkout is skipped.
    expect(readEntryCheckboxState(planA.filePath, planA.entryLineIndex)).toBe('[x]');
    expect(readEntryCheckboxState(planB.filePath, planB.entryLineIndex)).toBe('[x]');

    // Two fixLog entries — one per checkout — even though the merge collapses
    // the underlying finding to a single displayed entry (asserted below).
    expect(result.fixLog).toBeDefined();
    expect(result.fixLog).toHaveLength(2);
    const fixedPaths = (result.fixLog ?? []).map((e) => e.filePath).sort();
    expect(fixedPaths).toEqual([planA.filePath, planB.filePath].sort());
    expect(result.fixed).toBe(2);
  });

  it('all-slices --fix --yes flips both checkouts on disk while showing one deduped finding', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'check',
      '--project', 'wt-fix-project',
      '--fix', '--yes', '--json',
    ]);

    const result = parseJsonOutput();

    expect(readEntryCheckboxState(planA.filePath, planA.entryLineIndex)).toBe('[x]');
    expect(readEntryCheckboxState(planB.filePath, planB.entryLineIndex)).toBe('[x]');

    expect(result.fixLog).toBeDefined();
    expect(result.fixLog).toHaveLength(2);
    const fixedPaths = (result.fixLog ?? []).map((e) => e.filePath).sort();
    expect(fixedPaths).toEqual([planA.filePath, planB.filePath].sort());
    expect(result.fixed).toBe(2);

    // The dedup key (root-normalized, #100) collapses the same logical
    // task-vs-plan finding from both checkouts into ONE displayed finding —
    // this is what makes "only the first checkout gets fixed" a silent bug
    // rather than an obviously-wrong doubled count.
    const taskVsPlanFindings = result.findings.filter((f) => f.rule === 'task-vs-plan');
    expect(taskVsPlanFindings).toHaveLength(1);
  });
});
