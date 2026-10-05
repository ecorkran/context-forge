import { relative } from 'node:path';
import { DeferReason } from '@context-forge/core';
import type {
  ConsistencyFixResult,
  DeferredFix,
  DeferReasonValue,
  FindingWorktree,
  FixLogEntry,
} from '@context-forge/core';
import type { FixPlan } from '@context-forge/core/node';
import { label, dim, warn as warnStyle } from './styles.js';

/** Display text for each deferral reason (slice 213 D6). The only place these strings live. */
export const DEFER_REASON_LABELS: Record<DeferReasonValue, (d: DeferredFix) => string> = {
  [DeferReason.NOT_OWNER]: (d) => `stale copy; owned by ${d.owner?.name ?? 'another checkout'}`,
  [DeferReason.OWNER_UNRESOLVED]: () => 'owner unresolved (overlapping worktree ranges)',
  [DeferReason.NOT_A_CHECKOUT]: () => 'checkout missing or not a git checkout',
  [DeferReason.FILE_DIRTY]: () => 'file has uncommitted edits',
  [DeferReason.CHECKOUT_BUSY]: () => 'merge, rebase, or cherry-pick in progress',
  [DeferReason.DETACHED_HEAD]: () => 'checkout is on a detached HEAD',
  [DeferReason.COMMIT_FAILED]: (d) => `commit failed${d.detail ? `: ${d.detail}` : ''}`,
  [DeferReason.READINESS_FAILED]: (d) => `git readiness check failed${d.detail ? `: ${d.detail}` : ''}`,
};

const INVOKING_NOTE = '(invoking checkout, uncommitted)';

/** A path shown relative to its checkout's project-documents directory, as in the design sample. */
function displayPath(filePath: string, root: string | undefined): string {
  const rel = root ? relative(root, filePath) : filePath;
  return rel.replace(/^project-documents[\\/]/, '');
}

function tag(worktree: FindingWorktree | undefined, width: number): string {
  return `[${worktree?.name ?? '?'}]`.padEnd(width);
}

function tagWidth(worktrees: (FindingWorktree | undefined)[]): number {
  return Math.max(0, ...worktrees.map((w) => `[${w?.name ?? '?'}]`.length)) + 2;
}

function formatLogLine(entry: FixLogEntry, root: string | undefined): string {
  const change = entry.field ? `${entry.field}: ${entry.before} → ${entry.after}` : `${entry.before} → ${entry.after}`;
  return dim(`    → ${change} in ${displayPath(entry.filePath, root)}`);
}

function printDeferred(deferred: DeferredFix[]): void {
  if (deferred.length === 0) return;
  const width = tagWidth(deferred.map((d) => d.finding.worktree));
  console.log(label(`Left alone ${deferred.length} fix(es)`));
  for (const d of deferred) {
    const root = d.finding.worktree?.path;
    const path = displayPath(d.finding.fixAction?.filePath ?? d.finding.location, root);
    console.log(warnStyle(`  ${tag(d.finding.worktree, width)}${DEFER_REASON_LABELS[d.reason](d)} — ${path}`));
  }
}

/** Group key for a worktree; entries in multi-checkout output always carry one. */
function keyOf(worktree: FindingWorktree | undefined): string {
  return worktree?.id ?? '';
}

/**
 * Multi-checkout fix result, grouped by checkout (slice 213 "CLI text output"):
 * the invoking checkout's uncommitted writes, each committed checkout with its
 * short sha and path, then everything left alone.
 */
export function printRoutedFixResult(result: ConsistencyFixResult): void {
  const groups = new Map<string, { worktree?: FindingWorktree; entries: FixLogEntry[] }>();
  for (const entry of result.fixLog) {
    const group = groups.get(keyOf(entry.worktree)) ?? { worktree: entry.worktree, entries: [] };
    group.entries.push(entry);
    groups.set(keyOf(entry.worktree), group);
  }

  console.log(label(`Fixed ${result.fixed} finding(s)`));
  const width = tagWidth([...groups.values()].map((g) => g.worktree));
  for (const { worktree, entries } of groups.values()) {
    const commit = result.commits.find((c) => keyOf(c.worktree) === keyOf(worktree));
    const note = commit
      ? `committed ${commit.sha.slice(0, 7)} in ${commit.checkoutPath}`
      : worktree?.path === result.projectPath
        ? INVOKING_NOTE
        : 'uncommitted';
    console.log(`  ${tag(worktree, width)}${dim(note)}`);
    for (const entry of entries) console.log(formatLogLine(entry, worktree?.path));
  }
  printDeferred(result.deferred);
}

/** Number of fixes a plan will attempt to write. */
export function plannedFixCount(plan: FixPlan): number {
  return plan.entries.reduce((sum, e) => sum + e.result.findings.length, 0);
}

/** Multi-checkout confirmation preview: fixes per checkout, then deferrals. */
export function printFixPlan(plan: FixPlan): void {
  const withFixes = plan.entries.filter((e) => e.result.findings.length > 0);
  console.log(label(`Fix plan: ${plannedFixCount(plan)} fix(es)`));
  const width = tagWidth(withFixes.map((e) => e.view.worktree));
  for (const entry of withFixes) {
    const root = entry.view.view.projectPath;
    const note = entry.commit ? `will commit in ${root}` : INVOKING_NOTE;
    console.log(`  ${tag(entry.view.worktree, width)}${dim(note)}`);
    for (const f of entry.result.findings) {
      console.log(dim(`    → ${f.description} — ${displayPath(f.fixAction?.filePath ?? f.location, root)}`));
    }
  }
  printDeferred(plan.deferred);
}
