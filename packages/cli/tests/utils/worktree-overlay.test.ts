import { describe, it, expect } from 'vitest';
import { applyWorktreeOverlay } from '../../src/utils/worktree-overlay.js';
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
    expect(result.projectPath).toBe('/tmp/test');
  });

  it('returns project unchanged when worktreeId not found', () => {
    const result = applyWorktreeOverlay(baseProject, 'wt_nonexistent');

    expect(result).toBe(baseProject);
  });

  it('falls back to project values for empty worktree fields', () => {
    const projectWithPartialWorktree: ProjectData = {
      ...baseProject,
      worktrees: [
        {
          id: 'wt_partial',
          name: 'Partial',
          indexRange: [200, 299] as [number, number],
          worktreePath: '/repos/partial',
          developmentPhase: 'Phase 4: Slice Design',
          // All other fields empty/undefined — should fall back to project
          archDoc: '',
          slicePlan: '',
          activeSlice: '',
          activeTaskFile: '',
        },
      ],
    };

    const result = applyWorktreeOverlay(projectWithPartialWorktree, 'wt_partial');

    expect(result.developmentPhase).toBe('Phase 4: Slice Design');
    expect(result.fileArch).toBe('050-arch.core-system');
    expect(result.fileSlicePlan).toBe('050-slices.core');
    expect(result.fileSlice).toBe('050-slice.core-auth');
    expect(result.fileTasks).toBe('050-tasks.core-auth');
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
