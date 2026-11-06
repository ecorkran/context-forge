import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { archiveRelPath } from '../../src/devlog/archiveDevlog.js';
import { buildAttributedViews, runAttributed } from '../../src/introspection/mergeCheckResults.js';
import {
  FIX_COMMIT_MESSAGE,
  applyFixPlan,
  fixRelPath,
  fixRelPaths,
  planRoutedFixes,
} from '../../src/introspection/routedFixes.js';
import { DeferReason, type ConsistencyFinding } from '../../src/introspection/types.js';
import type { ProjectData } from '../../src/types/project.js';
import type { WorktreeContext } from '../../src/types/worktree.js';
import {
  commitCount,
  createGitWorktreeFixture,
  git,
  installRejectingPreCommitHook,
  lastSubject,
  porcelain,
  writeRel,
  type GitWorktreeFixture,
} from '../helpers/gitWorktreeFixture.js';

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);
const DEVLOG = '# Development Log\n\n' + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);
const CONFIG = '[devlog]\nmax_bytes = 600\ntarget_bytes = 450\n';
const Q4 = archiveRelPath('2025-Q4');
const Q3 = archiveRelPath('2025-Q3');

function worktreeCtx(id: string, path: string, range: [number, number]): WorktreeContext {
  return { id, name: id, indexRange: range, worktreePath: path };
}

async function dryRun(project: ProjectData, checker: ConsistencyChecker) {
  const views = buildAttributedViews(project);
  const results = await runAttributed(views, (v) => checker.checkAll(v));
  return views.map((view, i) => ({ view, result: results[i] }));
}

function seed(primary: string): void {
  writeRel(primary, 'DEVLOG.md', DEVLOG);
  writeRel(primary, '.context-forge.toml', CONFIG);
}

describe('multi-path archive-devlog fixes (slice 936 D9)', () => {
  let fx: GitWorktreeFixture;
  let project: ProjectData;
  let checker: ConsistencyChecker;

  beforeEach(() => {
    fx = createGitWorktreeFixture(['b'], seed);
    project = {
      id: 'p1',
      name: 'devlog-routed',
      template: 'default',
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      projectPath: fx.primary,
      worktrees: [worktreeCtx('main', fx.primary, [100, 199]), worktreeCtx('b', fx.worktrees.b, [950, 959])],
    };
    checker = new ConsistencyChecker(new ArtifactIntrospector(), new ConfigManager(fx.primary));
  });
  afterEach(() => fx.cleanup());

  const plan = async (invoking: string) => planRoutedFixes(project, await dryRun(project, checker), invoking);
  const devlogDeferred = (p: Awaited<ReturnType<typeof plan>>) =>
    p.deferred.filter((d) => d.finding.rule === 'devlog-size');

  it('fixRelPaths is exactly [filePath] when there are no additionalPaths', async () => {
    const [view] = buildAttributedViews(project);
    const finding = {
      fixAction: { type: 'update-checkbox', filePath: join(fx.primary, 'a.md'), detail: {}, subjectIndex: 1 },
    } as unknown as ConsistencyFinding;
    expect(fixRelPaths(view, finding)).toEqual(['a.md']);
    expect(fixRelPaths(view, finding)).toEqual([fixRelPath(view, finding)]);
  });

  it('commits DEVLOG.md and every archive in one commit in a non-invoking primary', async () => {
    const result = await applyFixPlan(checker, await plan(fx.worktrees.b));
    expect(result.fixErrors).toEqual([]);
    expect(result.commits).toHaveLength(1);
    expect([...result.commits[0].files].sort()).toEqual(['DEVLOG.md', Q3, Q4].sort());
    expect(lastSubject(fx.primary)).toBe(FIX_COMMIT_MESSAGE);
    expect(porcelain(fx.primary)).toBe('');
  });

  it('defers as file-dirty, writing nothing, when an archive file is dirty', async () => {
    writeRel(fx.primary, Q4, '# someone else is editing\n');
    const p = await plan(fx.worktrees.b);
    expect(devlogDeferred(p).map((d) => d.reason)).toContain(DeferReason.FILE_DIRTY);
    const result = await applyFixPlan(checker, p);
    expect(readFileSync(join(fx.primary, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
    expect(result.commits).toEqual([]);
    expect(readFileSync(join(fx.primary, Q4), 'utf8')).toBe('# someone else is editing\n');
  });

  it('removes new archives and restores DEVLOG.md when the commit fails', async () => {
    installRejectingPreCommitHook(fx, fx.primary);
    const before = commitCount(fx.primary);
    const result = await applyFixPlan(checker, await plan(fx.worktrees.b));
    const failed = result.deferred.filter(
      (d) => d.finding.rule === 'devlog-size' && d.reason === DeferReason.COMMIT_FAILED,
    );
    expect(failed.map((d) => d.reason)).toEqual([DeferReason.COMMIT_FAILED]);
    expect(readFileSync(join(fx.primary, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
    expect(existsSync(join(fx.primary, Q4))).toBe(false);
    expect(existsSync(join(fx.primary, Q3))).toBe(false);
    expect(porcelain(fx.primary)).toBe('');
    expect(commitCount(fx.primary)).toBe(before);
  });

  it('archives only in the primary; the worktree copy is deferred not-owner naming cf devlog archive', async () => {
    const p = await plan(fx.primary);
    const notOwner = devlogDeferred(p).filter((d) => d.reason === DeferReason.NOT_OWNER);
    expect(notOwner).toHaveLength(1);
    expect(notOwner[0].finding.suggestedFix).toContain('cf devlog archive');
    await applyFixPlan(checker, p);
    expect(existsSync(join(fx.primary, Q4))).toBe(true);
    expect(readFileSync(join(fx.worktrees.b, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
    expect(existsSync(join(fx.worktrees.b, Q4))).toBe(false);
    expect(git(fx.worktrees.b, 'status', '--porcelain')).toBe('');
  });

  it('applyFixes surfaces a writer failure through fixErrors', async () => {
    const findings = (await checker.checkAll({ ...project, worktrees: undefined })).findings;
    const finding = findings.find((f) => f.rule === 'devlog-size')!;
    // target >= max makes the writer refuse; the failure must land in fixErrors, not throw.
    finding.fixAction!.detail = { ...finding.fixAction!.detail, targetBytes: 600 };
    const result = await checker.applyFixes({
      ...(await checker.checkAll({ ...project, worktrees: undefined })),
      findings: [finding],
    });
    expect(result.fixed).toBe(0);
    expect(result.fixErrors[0]).toMatch(/devlog\.target_bytes/);
    expect(readFileSync(join(fx.primary, 'DEVLOG.md'), 'utf8')).toBe(DEVLOG);
  });
});
