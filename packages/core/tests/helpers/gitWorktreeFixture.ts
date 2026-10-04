import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/**
 * Real-git fixture: a primary repo plus linked worktrees under one temp root.
 *
 * Uses the `git` binary directly — never a mocked child_process — so code
 * that commits, restores, or inspects checkout state is tested against git's
 * real behavior. Kept apart from gitExec.test.ts, which mocks child_process.
 */
export interface GitWorktreeFixture {
  /** realpath of the temp root holding every checkout. */
  root: string;
  /** The primary checkout (branch `main`). */
  primary: string;
  /** Linked worktree checkouts keyed by the name passed in. */
  worktrees: Record<string, string>;
  cleanup(): void;
}

/** Run git in `cwd` and return trimmed stdout. Throws on non-zero exit. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Write a file under a checkout, creating parent directories. */
export function writeRel(checkout: string, relPath: string, content: string): void {
  const full = join(checkout, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf-8');
}

/** Write a file and commit it (only that path). */
export function writeAndCommit(checkout: string, relPath: string, content: string, message = `write ${relPath}`): void {
  writeRel(checkout, relPath, content);
  git(checkout, 'add', '--', relPath);
  git(checkout, 'commit', '-q', '-m', message, '--', relPath);
}

/** `git status --porcelain` output for a checkout. */
export function porcelain(checkout: string): string {
  return git(checkout, 'status', '--porcelain');
}

/** Subject line of the checkout's HEAD commit. */
export function lastSubject(checkout: string): string {
  return git(checkout, 'log', '-1', '--format=%s');
}

/** Number of commits reachable from HEAD. */
export function commitCount(checkout: string): number {
  return Number(git(checkout, 'rev-list', '--count', 'HEAD'));
}

let conflictSeq = 0;

/** Leave the checkout in an unresolved conflicting merge (MERGE_HEAD present). */
export function startConflictingMerge(checkout: string): void {
  const current = git(checkout, 'rev-parse', '--abbrev-ref', 'HEAD');
  const side = `conflict-side-${++conflictSeq}`;
  const file = `conflict-${conflictSeq}.txt`;
  git(checkout, 'checkout', '-q', '-b', side);
  writeAndCommit(checkout, file, 'theirs\n');
  git(checkout, 'checkout', '-q', current);
  writeAndCommit(checkout, file, 'ours\n');
  try {
    git(checkout, 'merge', '-q', side);
  } catch {
    // Expected: the merge stops on the conflict, which is the state we want.
    return;
  }
  throw new Error(`merge of ${side} in ${checkout} did not conflict`);
}

/** Detach HEAD at the current commit. */
export function detachHead(checkout: string): void {
  git(checkout, 'checkout', '-q', '--detach');
}

/**
 * Make `pre-commit` reject commits in one checkout only.
 *
 * Linked worktrees share the primary's hooks directory, so the hook checks
 * its own top level and rejects only for `checkout`.
 */
export function installRejectingPreCommitHook(fixture: GitWorktreeFixture, checkout: string): void {
  const hook = join(fixture.primary, '.git', 'hooks', 'pre-commit');
  mkdirSync(dirname(hook), { recursive: true });
  writeFileSync(
    hook,
    `#!/bin/sh\nif [ "$(git rev-parse --show-toplevel)" = "${checkout}" ]; then\n  echo "pre-commit: rejected by test hook" >&2\n  exit 1\nfi\nexit 0\n`,
    'utf-8',
  );
  chmodSync(hook, 0o755);
}

/**
 * Create the primary repo, run `seed` in it before the initial commit, then
 * add one linked worktree per name on a branch of the same name.
 *
 * Local config pins identity, disables signing, and points `core.hooksPath`
 * at the repo's own hooks directory so a developer's global git config cannot
 * change the outcome.
 */
export function createGitWorktreeFixture(
  names: string[],
  seed?: (primary: string) => void,
): GitWorktreeFixture {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cf-git-wt-')));
  const primary = join(root, 'main-co');
  mkdirSync(primary);
  git(primary, 'init', '-q', '-b', 'main');
  git(primary, 'config', 'user.name', 'Fixture');
  git(primary, 'config', 'user.email', 'fixture@example.com');
  git(primary, 'config', 'commit.gpgsign', 'false');
  git(primary, 'config', 'core.hooksPath', join(primary, '.git', 'hooks'));

  writeRel(primary, 'README.md', 'fixture\n');
  seed?.(primary);
  git(primary, 'add', '-A');
  git(primary, 'commit', '-q', '-m', 'seed');

  const worktrees: Record<string, string> = {};
  for (const name of names) {
    const path = join(root, `wt-${name}`);
    git(primary, 'worktree', 'add', '-q', '-b', name, path);
    worktrees[name] = path;
  }

  return {
    root,
    primary,
    worktrees,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
