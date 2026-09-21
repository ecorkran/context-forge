import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { commitPathIfChanged } from '../../src/guides/gitExec.js';

// Real git throughout: the properties under test (pathspec isolation, how an
// ignored path reports, behavior outside a work tree) are git's own, and a
// mock would only restate the assumptions being checked.

const GUIDE = 'project-documents/ai-project-guide';
const MESSAGE = 'docs: install ai-project-guide v1.2.3';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

function writeGuide(root: string): void {
  mkdirSync(join(root, GUIDE), { recursive: true });
  writeFileSync(join(root, GUIDE, 'readme.md'), 'guide\n');
}

describe('commitPathIfChanged', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-commit-path-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function initRepo(): void {
    // -b main explicitly: the default branch name otherwise comes from the
    // machine's init.defaultBranch.
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'commit.gpgsign', 'false');
    writeFileSync(join(root, 'README.md'), 'init\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'init');
  }

  it('commits the path and leaves the tree clean', async () => {
    initRepo();
    writeGuide(root);

    expect(await commitPathIfChanged(root, GUIDE, MESSAGE)).toBe(true);

    expect(git(root, 'log', '-1', '--format=%s')).toBe(MESSAGE);
    expect(git(root, 'status', '--porcelain')).toBe('');
  });

  it('keeps unrelated staged and unstaged work out of the commit', async () => {
    initRepo();
    writeGuide(root);
    writeFileSync(join(root, 'staged.txt'), 'staged\n');
    git(root, 'add', 'staged.txt');
    writeFileSync(join(root, 'README.md'), 'edited\n');

    await commitPathIfChanged(root, GUIDE, MESSAGE);

    const committed = git(root, 'show', '--name-only', '--format=', 'HEAD').split('\n');
    expect(committed).toEqual([`${GUIDE}/readme.md`]);
    // Still exactly as the user left them: one staged add, one unstaged edit.
    // Untrimmed: porcelain's leading space is the "unstaged" column.
    const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf-8' });
    expect(status.split('\n').filter(Boolean).sort()).toEqual([
      ' M README.md',
      'A  staged.txt',
    ]);
  });

  it('commits deletions under the path, as an update that drops files needs', async () => {
    initRepo();
    writeGuide(root);
    writeFileSync(join(root, GUIDE, 'dropped.md'), 'old\n');
    await commitPathIfChanged(root, GUIDE, MESSAGE);

    rmSync(join(root, GUIDE, 'dropped.md'));
    expect(await commitPathIfChanged(root, GUIDE, 'docs: update ai-project-guide v1.2.4')).toBe(true);

    expect(git(root, 'ls-files', GUIDE)).toBe(`${GUIDE}/readme.md`);
  });

  it('returns false and makes no commit when the path is unchanged', async () => {
    initRepo();
    writeGuide(root);
    await commitPathIfChanged(root, GUIDE, MESSAGE);
    const head = git(root, 'rev-parse', 'HEAD');

    expect(await commitPathIfChanged(root, GUIDE, MESSAGE)).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('returns false rather than failing when the project gitignores the path', async () => {
    initRepo();
    writeFileSync(join(root, '.gitignore'), `${GUIDE}/\n`);
    git(root, 'add', '.gitignore');
    git(root, 'commit', '-q', '-m', 'ignore guide');
    const head = git(root, 'rev-parse', 'HEAD');
    writeGuide(root);

    expect(await commitPathIfChanged(root, GUIDE, MESSAGE)).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('returns false outside a git work tree', async () => {
    writeGuide(root);

    expect(await commitPathIfChanged(root, GUIDE, MESSAGE)).toBe(false);
  });

  it('works in a repository with no commits yet', async () => {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
    git(root, 'config', 'commit.gpgsign', 'false');
    writeGuide(root);

    expect(await commitPathIfChanged(root, GUIDE, MESSAGE)).toBe(true);
    expect(git(root, 'log', '-1', '--format=%s')).toBe(MESSAGE);
  });
});
