import { describe, it, expect } from 'vitest';
import {
  applyWorktreeOverlay,
  resolveOperationPath,
  getWorktreeIndexRange,
  getWorktreeRangeOverride,
  isInIndexRange,
  resolveAllOperationPaths,
} from '../../src/utils/worktree-overlay.js';
import type { ProjectData } from '@context-forge/core';

const baseProject: ProjectData = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
  developmentPhase: 'Phase 3: Slice Planning',
  instruction: 'Phase 3: Slice Planning',
  workType: 'new-feature',
  fileArch: '050-arch.core-system',
  fileSlicePlan: '050-slices.core',
  fileSlice: '050-slice.core-auth',
  fileTasks: '050-tasks.core-auth',
  worktrees: [
    {
      id: 'wt_001',
      name: 'Feature A',
      indexRange: [100, 199] as [number, number],
      worktreePath: '/repos/feature-a',
      developmentPhase: 'Phase 6: Implementation',
      instruction: 'Phase 6: Implementation',
      workType: 'bugfix',
      archDoc: '180-arch.initiative-context-worktree',
      slicePlan: '180-slices.initiative-context-worktree',
      activeSlice: '183-slice.worktree-cli-commands',
      activeTaskFile: '183-tasks.worktree-cli-commands',
    },
  ],
};

describe('applyWorktreeOverlay', () => {
  it('overlays all worktree-scoped fields when worktree found', () => {
    const result = applyWorktreeOverlay(baseProject, 'wt_001');

    expect(result.developmentPhase).toBe('Phase 6: Implementation');
    expect(result.instruction).toBe('Phase 6: Implementation');
    expect(result.workType).toBe('bugfix');
    expect(result.fileArch).toBe('180-arch.initiative-context-worktree');
    expect(result.fileSlicePlan).toBe('180-slices.initiative-context-worktree');
    expect(result.fileSlice).toBe('183-slice.worktree-cli-commands');
    expect(result.fileTasks).toBe('183-tasks.worktree-cli-commands');
  });

  it('preserves non-overlaid fields', () => {
    const result = applyWorktreeOverlay(baseProject, 'wt_001');

    expect(result.id).toBe('proj_001');
    expect(result.name).toBe('test-project');
  });

  it('sets projectPath to worktreePath when worktreePath is present', () => {
    const result = applyWorktreeOverlay(baseProject, 'wt_001');

    expect(result.projectPath).toBe('/repos/feature-a');
  });

  it('preserves projectPath when worktreePath is absent', () => {
    const projectWithNoPathWorktree: ProjectData = {
      ...baseProject,
      worktrees: [
        {
          id: 'wt_nopath',
          name: 'No Path',
          indexRange: [200, 299] as [number, number],
          developmentPhase: 'Phase 4: Slice Design',
          archDoc: '',
          slicePlan: '',
          activeSlice: '',
          activeTaskFile: '',
        },
      ],
    };

    const result = applyWorktreeOverlay(projectWithNoPathWorktree, 'wt_nopath');
    expect(result.projectPath).toBe('/tmp/test');
  });

  it('returns project unchanged when worktreeId not found', () => {
    const result = applyWorktreeOverlay(baseProject, 'wt_nonexistent');

    expect(result).toBe(baseProject);
  });

  it('does not fall back to project values for empty worktree fields', () => {
    const projectWithPartialWorktree: ProjectData = {
      ...baseProject,
      worktrees: [
        {
          id: 'wt_partial',
          name: 'Partial',
          indexRange: [200, 299] as [number, number],
          worktreePath: '/repos/partial',
          developmentPhase: 'Phase 4: Slice Design',
          // Empty/undefined fields should NOT fall back to project values
          archDoc: '',
          slicePlan: '',
          activeSlice: '',
          activeTaskFile: '',
        },
      ],
    };

    const result = applyWorktreeOverlay(projectWithPartialWorktree, 'wt_partial');

    expect(result.developmentPhase).toBe('Phase 4: Slice Design');
    expect(result.fileArch).toBe('');
    expect(result.fileSlicePlan).toBe('');
    expect(result.fileSlice).toBe('');
    expect(result.fileTasks).toBe('');
  });

  it('handles project with no worktrees array (undefined)', () => {
    const projectNoWorktrees: ProjectData = {
      ...baseProject,
      worktrees: undefined,
    };

    const result = applyWorktreeOverlay(projectNoWorktrees, 'wt_001');
    expect(result).toBe(projectNoWorktrees);
  });

  it('handles project with empty worktrees array', () => {
    const projectEmptyWorktrees: ProjectData = {
      ...baseProject,
      worktrees: [],
    };

    const result = applyWorktreeOverlay(projectEmptyWorktrees, 'wt_001');
    expect(result).toBe(projectEmptyWorktrees);
  });

  it('does not mutate the original project', () => {
    const original = { ...baseProject };
    applyWorktreeOverlay(baseProject, 'wt_001');

    expect(baseProject.developmentPhase).toBe(original.developmentPhase);
    expect(baseProject.fileSlice).toBe(original.fileSlice);
  });
});

const projectWithDefault: ProjectData = {
  ...baseProject,
  worktrees: [
    {
      id: 'wt_default',
      name: 'default',
      indexRange: [100, 799] as [number, number],
      worktreePath: '/repos/main',
    },
    {
      id: 'wt_api',
      name: 'api-layer',
      indexRange: [300, 499] as [number, number],
      worktreePath: '/repos/api',
    },
    {
      id: 'wt_nopath',
      name: 'no-path',
      indexRange: [500, 599] as [number, number],
      // no worktreePath
    },
  ],
};

describe('resolveOperationPath', () => {
  it('returns worktreePath when worktreeId matches and has path', () => {
    expect(resolveOperationPath(projectWithDefault, 'wt_api')).toBe('/repos/api');
  });

  it('returns projectPath when worktreeId matches but has no worktreePath', () => {
    expect(resolveOperationPath(projectWithDefault, 'wt_nopath')).toBe('/tmp/test');
  });

  it('returns projectPath when no worktreeId provided', () => {
    expect(resolveOperationPath(projectWithDefault)).toBe('/tmp/test');
  });

  it('returns projectPath when worktreeId not found', () => {
    expect(resolveOperationPath(projectWithDefault, 'wt_missing')).toBe('/tmp/test');
  });

  it('returns projectPath when project has no worktrees array', () => {
    const noWt: ProjectData = { ...baseProject, worktrees: undefined };
    expect(resolveOperationPath(noWt, 'wt_api')).toBe('/tmp/test');
  });
});

describe('getWorktreeIndexRange', () => {
  it('returns index range for non-default worktree', () => {
    expect(getWorktreeIndexRange(projectWithDefault, 'wt_api')).toEqual([300, 499]);
  });

  it('returns index range for default worktree', () => {
    expect(getWorktreeIndexRange(projectWithDefault, 'wt_default')).toEqual([100, 799]);
  });

  it('returns undefined when no worktreeId provided', () => {
    expect(getWorktreeIndexRange(projectWithDefault)).toBeUndefined();
  });

  it('returns undefined when worktreeId not found', () => {
    expect(getWorktreeIndexRange(projectWithDefault, 'wt_missing')).toBeUndefined();
  });

  it('returns undefined when project has no worktrees', () => {
    const noWt: ProjectData = { ...baseProject, worktrees: undefined };
    expect(getWorktreeIndexRange(noWt, 'wt_api')).toBeUndefined();
  });
});

describe('getWorktreeRangeOverride', () => {
  it('returns false when no worktreeId', () => {
    expect(getWorktreeRangeOverride(projectWithDefault)).toBe(false);
  });

  it('returns false when worktree has no rangeOverride', () => {
    expect(getWorktreeRangeOverride(projectWithDefault, 'wt_api')).toBe(false);
  });

  it('returns true when worktree has rangeOverride: true', () => {
    const projectWithOverride: ProjectData = {
      ...baseProject,
      worktrees: [
        {
          id: 'wt_override',
          name: 'Cross',
          indexRange: [300, 399] as [number, number],
          rangeOverride: true,
        },
      ],
    };
    expect(getWorktreeRangeOverride(projectWithOverride, 'wt_override')).toBe(true);
  });

  it('returns false when project has no worktrees', () => {
    const noWt: ProjectData = { ...baseProject, worktrees: undefined };
    expect(getWorktreeRangeOverride(noWt, 'wt_001')).toBe(false);
  });
});

describe('isInIndexRange', () => {
  it('returns true when index is within range', () => {
    expect(isInIndexRange(350, [300, 499])).toBe(true);
  });

  it('returns true at lower boundary', () => {
    expect(isInIndexRange(300, [300, 499])).toBe(true);
  });

  it('returns true at upper boundary', () => {
    expect(isInIndexRange(499, [300, 499])).toBe(true);
  });

  it('returns false when index is below range', () => {
    expect(isInIndexRange(100, [300, 499])).toBe(false);
  });

  it('returns false when index is above range', () => {
    expect(isInIndexRange(500, [300, 499])).toBe(false);
  });

  it('returns true when no range specified (no filtering)', () => {
    expect(isInIndexRange(999)).toBe(true);
  });
});

describe('resolveAllOperationPaths', () => {
  it('returns projectPath and all worktree paths (deduplicated)', () => {
    const paths = resolveAllOperationPaths(projectWithDefault);
    expect(paths).toContain('/tmp/test');
    expect(paths).toContain('/repos/main');
    expect(paths).toContain('/repos/api');
    // wt_nopath has no worktreePath, should not contribute
    expect(paths).toHaveLength(3);
  });

  it('returns only projectPath when no worktrees', () => {
    const noWt: ProjectData = { ...baseProject, worktrees: undefined };
    expect(resolveAllOperationPaths(noWt)).toEqual(['/tmp/test']);
  });

  it('deduplicates when projectPath equals a worktreePath', () => {
    const overlapping: ProjectData = {
      ...baseProject,
      projectPath: '/repos/main',
      worktrees: [
        {
          id: 'wt_default',
          name: 'default',
          indexRange: [100, 799] as [number, number],
          worktreePath: '/repos/main',
        },
      ],
    };
    expect(resolveAllOperationPaths(overlapping)).toEqual(['/repos/main']);
  });

  it('returns empty array when no projectPath and no worktrees', () => {
    const empty: ProjectData = {
      ...baseProject,
      projectPath: undefined as unknown as string,
      worktrees: [],
    };
    expect(resolveAllOperationPaths(empty)).toEqual([]);
  });
});
