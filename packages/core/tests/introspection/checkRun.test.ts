import { describe, it, expect, vi } from 'vitest';
import { scopeCheck, resolveFixInvokingPath } from '../../src/introspection/checkRun.js';
import type { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import type { AttributedView } from '../../src/introspection/mergeCheckResults.js';
import type { ProjectData } from '../../src/types/index.js';

const project = { id: 'p1', name: 'p', projectPath: '/repo' } as ProjectData;
const views: AttributedView[] = [{ view: project }];

function fakeChecker() {
  const empty = Promise.resolve({ projectName: 'p', projectPath: '/repo', findings: [] });
  return { check: vi.fn(() => empty), checkAll: vi.fn(() => empty) };
}

describe('scopeCheck (slice 213)', () => {
  it('all slices: views unchanged, runs checkAll', async () => {
    const checker = fakeChecker();
    const scope = scopeCheck(checker as unknown as ConsistencyChecker, views, null);
    await scope.runCheck(scope.views[0].view);
    expect(scope.views).toBe(views);
    expect(checker.checkAll).toHaveBeenCalledTimes(1);
    expect(checker.check).not.toHaveBeenCalled();
  });

  it('one slice: sets fileSlice on every view, runs check', async () => {
    const checker = fakeChecker();
    const scope = scopeCheck(checker as unknown as ConsistencyChecker, views, 213);
    await scope.runCheck(scope.views[0].view);
    expect(scope.views[0].view.fileSlice).toBe('213-slice');
    expect(checker.check).toHaveBeenCalledTimes(1);
    expect(checker.checkAll).not.toHaveBeenCalled();
  });
});

describe('resolveFixInvokingPath (slice 213)', () => {
  it('single view uses the given path without running git', async () => {
    expect(await resolveFixInvokingPath(views, '/repo/wt')).toBe('/repo/wt');
  });

  it('throws when no path is available', async () => {
    await expect(resolveFixInvokingPath(views, undefined)).rejects.toThrow(/No projectPath configured/);
  });
});
