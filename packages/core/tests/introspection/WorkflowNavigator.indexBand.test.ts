import { describe, it, expect } from 'vitest';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { makeProject } from '../helpers/workflowNavigatorFixtures.js';

describe('WorkflowNavigator', () => {
  const nav = new WorkflowNavigator();

  describe('arch-existence and index band warnings', () => {
    it('recommends creating arch when arch set but file missing, even with active slice', async () => {
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: '999-arch.nonexistent',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture document');
      expect(next.rationale).toContain('does not exist');
      expect(next.phase).toBe('Phase 2: Architecture');
      expect(next.suggestedCommand).toContain('Phase 2');
    });

    it('includes index band mismatch warning when slice is outside arch hundred-block', async () => {
      // Arch at 100, slice at 900 → mismatch warning
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      // Slice 999 needs-design, arch exists → normal recommendation with warning
      expect(next.recommendation).toContain('Create slice design');
      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('outside the 100-band');
    });

    it('no warning when slice is in same hundred-block as arch', async () => {
      // Arch at 100, slice at 100 → same band, no warning
      const project = makeProject({
        fileSlice: '100-slice.test-feature.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 6: Implementation',
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('combines arch-missing with index band warning', async () => {
      // Arch at 100 (missing file), slice at 900 → both arch-missing and band mismatch
      const project = makeProject({
        fileSlice: '900-slice.nonexistent.md',
        fileArch: '100-arch.nonexistent',
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.recommendation).toContain('Create architecture document');
      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('outside the 100-band');
    });

    it('no warning when fileArch is not set', async () => {
      const project = makeProject({
        fileSlice: '999-slice.nonexistent.md',
        fileArch: undefined,
        developmentPhase: 'Phase 4: Slice Design',
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('no warning when active slice is inside its active worktree range, even outside the arch hundred-block (#48)', async () => {
      // default worktree owns [100,799]; slice 209 falls inside it even though
      // the architecture is anchored at the 100-band. This is issue #48's exact repro.
      const project = makeProject({
        fileSlice: '209-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [
          { id: 'wt-default', name: 'default', indexRange: [100, 799] },
          { id: 'wt-api', name: 'api', indexRange: [800, 899] },
        ],
        resolvedWorktree: { id: 'wt-default', name: 'default' },
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('warns naming the active worktree when index is outside its range, even if a sibling worktree covers it', async () => {
      const project = makeProject({
        fileSlice: '209-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [
          { id: 'wt-default', name: 'default', indexRange: [100, 199] },
          { id: 'wt-api', name: 'api', indexRange: [200, 299] },
        ],
        resolvedWorktree: { id: 'wt-default', name: 'default' },
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('default');
      expect(next.warnings![0]).toContain('[100-199]');
    });

    it('suppresses the warning entirely when the active worktree has rangeOverride', async () => {
      const project = makeProject({
        fileSlice: '209-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [
          { id: 'wt-default', name: 'default', indexRange: [100, 199], rangeOverride: true },
          { id: 'wt-api', name: 'api', indexRange: [300, 399] },
        ],
        resolvedWorktree: { id: 'wt-default', name: 'default' },
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('no warning when no active worktree resolves but the index is inside the union of configured ranges', async () => {
      const project = makeProject({
        fileSlice: '209-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [
          { id: 'wt-default', name: 'default', indexRange: [100, 799] },
          { id: 'wt-api', name: 'api', indexRange: [800, 899] },
        ],
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    it('warns listing configured ranges when no active worktree resolves and the index is outside all of them', async () => {
      const project = makeProject({
        fileSlice: '850-slice.nonexistent.md',
        fileArch: '100-arch.test-system',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [
          { id: 'wt-default', name: 'default', indexRange: [100, 799] },
          { id: 'wt-api', name: 'api', indexRange: [900, 999] },
        ],
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeDefined();
      expect(next.warnings!.length).toBe(1);
      expect(next.warnings![0]).toContain('default');
      expect(next.warnings![0]).toContain('[100-799]');
      expect(next.warnings![0]).toContain('api');
      expect(next.warnings![0]).not.toContain('band');
      expect(next.warnings![0]).not.toContain('hundred');
    });

    it('no worktree-range warning when only one worktree is configured, even outside its range (#75)', async () => {
      // A lone worktree does not range-filter listings, so it must not warn
      // either. Slice 900 is outside the default's [100,799] but the project
      // has nothing to isolate it from. The arch hundred-block check still
      // applies as the legacy fallback.
      const project = makeProject({
        fileSlice: '900-slice.nonexistent.md',
        fileArch: '900-arch.maintenance',
        developmentPhase: 'Phase 4: Slice Design',
        worktrees: [{ id: 'wt-default', name: 'default', indexRange: [100, 799] }],
        resolvedWorktree: { id: 'wt-default', name: 'default' },
      });
      const next = await nav.getNext(project);

      expect(next.warnings).toBeUndefined();
    });

    // No-worktrees legacy case is already covered by
    // 'includes index band mismatch warning when slice is outside arch hundred-block' above.
  });
});
