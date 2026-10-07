// Real throwaway git repositories for tests that exercise commit behavior.
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

/** Run git in `cwd` and return trimmed stdout; throws on a non-zero exit. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

/** Initialize a repo with a local identity; commits one unrelated file when `withCommit`. */
export function initRepo(dir: string, withCommit: boolean): void {
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  if (withCommit) {
    writeFileSync(join(dir, 'README.md'), '# project\n');
    git(dir, 'add', 'README.md');
    git(dir, 'commit', '-q', '-m', 'init');
  }
}
