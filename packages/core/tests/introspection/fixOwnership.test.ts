import { describe, it, expect } from 'vitest';
import { resolveFixOwner } from '../../src/introspection/fixOwnership.js';
import { buildAttributedViews } from '../../src/introspection/mergeCheckResults.js';
import type { ProjectData } from '../../src/types/project.js';
import type { WorktreeContext } from '../../src/types/worktree.js';

const PRIMARY = '/repo/main';

function worktree(id: string, path: string, range: [number, number], extra: Partial<WorktreeContext> = {}): WorktreeContext {
  return {
    id,
    name: id,
    indexRange: range,
    worktreePath: path,
    developmentPhase: 'Phase 6: Implementation',
    ...extra,
  };
}

function project(worktrees?: WorktreeContext[], projectPath: string | undefined = PRIMARY): ProjectData {
  return {
    id: 'p1',
    name: 'owner-test',
    template: 'default',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    projectPath,
    worktrees,
  };
}

/** Root of the view resolveFixOwner picked, for readable assertions. */
function ownerRoot(p: ProjectData, index: number | null): string | null {
  const owner = resolveFixOwner(p, index, buildAttributedViews(p));
  return owner ? owner.view.projectPath ?? null : null;
}

describe('resolveFixOwner (slice 213 D2)', () => {
  it('single checkout: the only view owns every index', () => {
    const none = project();
    expect(ownerRoot(none, 950)).toBe(PRIMARY);
    const one = project([worktree('a', '/repo/a', [100, 199])]);
    expect(ownerRoot(one, 950)).toBe('/repo/a');
    expect(ownerRoot(one, null)).toBe('/repo/a');
  });

  it('exactly one worktree range contains the index: that worktree owns it', () => {
    const p = project([worktree('main', PRIMARY, [100, 199]), worktree('b', '/repo/b', [950, 959])]);
    expect(ownerRoot(p, 950)).toBe('/repo/b');
    expect(ownerRoot(p, 120)).toBe(PRIMARY);
  });

  it('unclaimed index: the primary-checkout view owns it', () => {
    const p = project([worktree('main', PRIMARY, [100, 199]), worktree('b', '/repo/b', [950, 959])]);
    expect(ownerRoot(p, 900)).toBe(PRIMARY);
  });

  it('null index: the primary-checkout view owns it', () => {
    const p = project([worktree('b', '/repo/b', [950, 959]), worktree('main', PRIMARY + '/', [100, 199])]);
    expect(ownerRoot(p, null)).toBe(PRIMARY + '/');
  });

  it('overlapping ranges: no owner', () => {
    const p = project([worktree('main', PRIMARY, [900, 999]), worktree('b', '/repo/b', [950, 959])]);
    expect(resolveFixOwner(p, 955, buildAttributedViews(p))).toBeNull();
  });

  it('no view at the primary projectPath: no owner for an unclaimed index', () => {
    const p = project([worktree('a', '/repo/a', [100, 199]), worktree('b', '/repo/b', [950, 959])]);
    expect(resolveFixOwner(p, 500, buildAttributedViews(p))).toBeNull();
    expect(resolveFixOwner(p, null, buildAttributedViews(p))).toBeNull();
  });

  it('rangeOverride does not make a worktree own an out-of-range index', () => {
    const p = project([
      worktree('main', PRIMARY, [100, 199]),
      worktree('b', '/repo/b', [950, 959], { rangeOverride: true, activeSlice: '500-slice.outside' }),
    ]);
    expect(ownerRoot(p, 500)).toBe(PRIMARY);
  });
});
