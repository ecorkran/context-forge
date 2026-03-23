import { describe, it, expect } from 'vitest';
import {
  formatDateProject,
  buildProjectCreationDefaults,
  WORKTREE_SCOPED_FIELDS,
  PROJECT_TO_WORKTREE_FIELD,
} from '../src/project-defaults.js';

describe('WORKTREE_SCOPED_FIELDS', () => {
  it('contains expected fields', () => {
    expect(WORKTREE_SCOPED_FIELDS.has('developmentPhase')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('fileSlice')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('fileTasks')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('fileArch')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('fileSlicePlan')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('instruction')).toBe(true);
    expect(WORKTREE_SCOPED_FIELDS.has('workType')).toBe(true);
  });

  it('does not contain non-worktree fields', () => {
    expect(WORKTREE_SCOPED_FIELDS.has('name')).toBe(false);
    expect(WORKTREE_SCOPED_FIELDS.has('projectPath')).toBe(false);
  });
});

describe('PROJECT_TO_WORKTREE_FIELD', () => {
  it('maps project field names to worktree counterparts', () => {
    expect(PROJECT_TO_WORKTREE_FIELD.fileSlice).toBe('activeSlice');
    expect(PROJECT_TO_WORKTREE_FIELD.fileTasks).toBe('activeTaskFile');
    expect(PROJECT_TO_WORKTREE_FIELD.fileArch).toBe('archDoc');
    expect(PROJECT_TO_WORKTREE_FIELD.fileSlicePlan).toBe('slicePlan');
    expect(PROJECT_TO_WORKTREE_FIELD.developmentPhase).toBe('developmentPhase');
  });
});

describe('formatDateProject', () => {
  it('formats a known date as YYYYMMDD', () => {
    const date = new Date(2026, 2, 22); // March 22, 2026
    expect(formatDateProject(date)).toBe('20260322');
  });

  it('zero-pads single-digit month', () => {
    const date = new Date(2026, 0, 15); // January 15, 2026
    expect(formatDateProject(date)).toBe('20260115');
  });

  it('zero-pads single-digit day', () => {
    const date = new Date(2026, 11, 5); // December 5, 2026
    expect(formatDateProject(date)).toBe('20261205');
  });

  it('defaults to current date when no argument', () => {
    const result = formatDateProject();
    // Should be 8 characters in YYYYMMDD format
    expect(result).toMatch(/^\d{8}$/);
  });
});

describe('buildProjectCreationDefaults', () => {
  it('returns correct default values', () => {
    const result = buildProjectCreationDefaults({
      name: 'test-project',
      projectPath: '/tmp/test',
    });

    expect(result.name).toBe('test-project');
    expect(result.projectPath).toBe('/tmp/test');
    expect(result.template).toBe('default');
    expect(result.developmentPhase).toBe('Phase 0: Concept');
    expect(result.instruction).toBe('Phase 0: Concept');
    expect(result.fileSlice).toBe('');
    expect(result.dateProject).toMatch(/^\d{8}$/);
  });

  it('accepts optional developmentPhase override', () => {
    const result = buildProjectCreationDefaults({
      name: 'test',
      projectPath: '/tmp/test',
      developmentPhase: 'Phase 3: Architecture',
    });

    expect(result.developmentPhase).toBe('Phase 3: Architecture');
    expect(result.instruction).toBe('Phase 3: Architecture');
  });

  it('accepts optional template override', () => {
    const result = buildProjectCreationDefaults({
      name: 'test',
      projectPath: '/tmp/test',
      template: 'minimal',
    });

    expect(result.template).toBe('minimal');
  });

  it('instruction matches developmentPhase', () => {
    const result = buildProjectCreationDefaults({
      name: 'test',
      projectPath: '/tmp/test',
    });

    expect(result.instruction).toBe(result.developmentPhase);
  });
});
