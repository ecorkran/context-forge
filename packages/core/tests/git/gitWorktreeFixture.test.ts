import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { createGitWorktreeFixture, git, porcelain } from '../helpers/gitWorktreeFixture.js';

describe('gitWorktreeFixture (smoke)', () => {
  it('creates a primary repo with two linked worktrees and cleans up', () => {
    const fx = createGitWorktreeFixture(['a', 'b']);
    try {
      expect(git(fx.primary, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
      expect(git(fx.worktrees.a, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('a');
      expect(git(fx.worktrees.b, 'rev-parse', '--show-toplevel')).toBe(fx.worktrees.b);
      expect(porcelain(fx.worktrees.b)).toBe('');
    } finally {
      fx.cleanup();
    }
    expect(existsSync(fx.root)).toBe(false);
  });
});
