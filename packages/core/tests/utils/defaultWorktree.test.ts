import { describe, it, expect } from 'vitest';
import {
  isDefaultWorktree,
  findDefaultWorktree,
  markLegacyDefaultWorktree,
} from '../../src/utils/defaultWorktree.js';
import type { WorktreeContext } from '../../src/types/worktree.js';
import { createTestProjectData } from '../helpers/testData.js';

const PROJECT_PATH = '/work/proj';
const JSON_PATH = '/cfg/context-forge/projects.json';

function wt(id: string, name: string, extra: Partial<WorktreeContext> = {}): WorktreeContext {
  return { id, name, indexRange: [100, 199], ...extra };
}

function projectWith(worktrees: WorktreeContext[]) {
  return createTestProjectData({ name: 'proj', projectPath: PROJECT_PATH, worktrees });
}

/** isDefault per worktree id, after migration. */
function flags(worktrees: WorktreeContext[] | undefined): Record<string, boolean | undefined> {
  return Object.fromEntries((worktrees ?? []).map((w) => [w.id, w.isDefault]));
}

describe('isDefaultWorktree', () => {
  it('is true only for isDefault: true', () => {
    expect(isDefaultWorktree(wt('a', 'x', { isDefault: true }))).toBe(true);
    expect(isDefaultWorktree(wt('a', 'x', { isDefault: false }))).toBe(false);
    expect(isDefaultWorktree(wt('a', 'x'))).toBe(false);
  });

  it('does not read the name', () => {
    expect(isDefaultWorktree(wt('a', 'default'))).toBe(false);
    expect(isDefaultWorktree(wt('a', 'Default', { isDefault: false }))).toBe(false);
  });
});

describe('findDefaultWorktree', () => {
  it('returns undefined when none is marked', () => {
    expect(findDefaultWorktree([wt('a', 'default'), wt('b', 'other')], 'proj')).toBeUndefined();
  });

  it('returns the one marked worktree', () => {
    const marked = wt('b', 'main-line', { isDefault: true });
    expect(findDefaultWorktree([wt('a', 'default', { isDefault: false }), marked], 'proj')).toBe(marked);
  });

  it('throws naming both when two are marked', () => {
    const list = [wt('a', 'one', { isDefault: true }), wt('b', 'two', { isDefault: true })];
    expect(() => findDefaultWorktree(list, 'proj')).toThrow(
      /Project 'proj'.*'one' \(a\).*'two' \(b\)/,
    );
  });

  it('returns undefined when excludeId is the only marked worktree', () => {
    const list = [wt('a', 'one', { isDefault: true }), wt('b', 'two', { isDefault: false })];
    expect(findDefaultWorktree(list, 'proj', 'a')).toBeUndefined();
  });

  it('returns the other without throwing when excludeId is one of two marked', () => {
    const other = wt('b', 'two', { isDefault: true });
    const list = [wt('a', 'one', { isDefault: true }), other];
    expect(findDefaultWorktree(list, 'proj', 'a')).toBe(other);
  });
});

describe('markLegacyDefaultWorktree', () => {
  it('marks a single legacy default and the rest false', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([wt('a', 'default'), wt('b', 'sibling')]),
      JSON_PATH,
    );
    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(flags(result.project.worktrees)).toEqual({ a: true, b: false });
  });

  it('matches the name case-insensitively', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([wt('a', 'Default'), wt('b', 'sibling')]),
      JSON_PATH,
    );
    expect(flags(result.project.worktrees)).toEqual({ a: true, b: false });
  });

  it('turns absent values false when a worktree is already marked', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([wt('a', 'main-line', { isDefault: true }), wt('b', 'default')]),
      JSON_PATH,
    );
    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(flags(result.project.worktrees)).toEqual({ a: true, b: false });
  });

  it('is silent when no candidate exists and nothing is at the project path', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([wt('a', 'one', { worktreePath: '/elsewhere/a' }), wt('b', 'two')]),
      JSON_PATH,
    );
    expect(result.changed).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(flags(result.project.worktrees)).toEqual({ a: false, b: false });
  });

  it('warns about a probable renamed default when a worktree is at the project path', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([wt('a', 'main-line', { worktreePath: PROJECT_PATH }), wt('b', 'two')]),
      JSON_PATH,
    );
    expect(flags(result.project.worktrees)).toEqual({ a: false, b: false });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("'main-line' (a)");
    expect(result.warnings[0]).toContain('renamed default');
    expect(result.warnings[0]).toContain(`set "isDefault": true on the intended worktree in ${JSON_PATH}.`);
  });

  it('narrows several candidates by project path', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([
        wt('a', 'default', { worktreePath: '/elsewhere' }),
        wt('b', 'Default', { worktreePath: PROJECT_PATH }),
      ]),
      JSON_PATH,
    );
    expect(result.warnings).toEqual([]);
    expect(flags(result.project.worktrees)).toEqual({ a: false, b: true });
  });

  it('marks nothing and warns when candidates stay ambiguous', () => {
    const result = markLegacyDefaultWorktree(
      projectWith([
        wt('a', 'default', { worktreePath: '/elsewhere' }),
        wt('b', 'Default', { worktreePath: '/another' }),
        wt('c', 'other'),
      ]),
      JSON_PATH,
    );
    expect(flags(result.project.worktrees)).toEqual({ a: false, b: false, c: false });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("'default' (a)");
    expect(result.warnings[0]).toContain("'Default' (b)");
    expect(result.warnings[0]).toContain(`set "isDefault": true on the intended worktree in ${JSON_PATH}.`);
  });

  it('both warnings end with the same recovery sentence', () => {
    const ambiguous = markLegacyDefaultWorktree(
      projectWith([wt('a', 'default'), wt('b', 'default', { worktreePath: '/x' })]),
      JSON_PATH,
    ).warnings[0];
    const renamed = markLegacyDefaultWorktree(
      projectWith([wt('a', 'main-line', { worktreePath: PROJECT_PATH })]),
      JSON_PATH,
    ).warnings[0];
    const sentence = `Range narrowing and restore are off for this project. To turn them on, set "isDefault": true on the intended worktree in ${JSON_PATH}.`;
    expect(ambiguous.endsWith(sentence)).toBe(true);
    expect(renamed.endsWith(sentence)).toBe(true);
  });

  it('is idempotent: a second run changes nothing and warns nothing', () => {
    const first = markLegacyDefaultWorktree(
      projectWith([wt('a', 'default'), wt('b', 'sibling')]),
      JSON_PATH,
    );
    const second = markLegacyDefaultWorktree(first.project, JSON_PATH);
    expect(second.changed).toBe(false);
    expect(second.warnings).toEqual([]);
    expect(second.project).toBe(first.project);
  });

  it('reports no change for a project without worktrees', () => {
    const result = markLegacyDefaultWorktree(createTestProjectData({ name: 'proj' }), JSON_PATH);
    expect(result.changed).toBe(false);
  });

  it('never mutates its input and never changes existing values', () => {
    const input = projectWith([
      wt('a', 'default', { isDefault: false }),
      wt('b', 'default'),
      wt('c', 'x', { isDefault: true }),
    ]);
    const snapshot = JSON.parse(JSON.stringify(input));
    const result = markLegacyDefaultWorktree(input, JSON_PATH);
    expect(input).toEqual(snapshot);
    expect(flags(result.project.worktrees)).toEqual({ a: false, b: false, c: true });
  });
});
