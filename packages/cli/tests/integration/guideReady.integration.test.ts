import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ensureGuideReady } from '../../src/utils/guideReady.js';

/**
 * Exercises the CLI auto-init helper against real git repositories.
 *
 * The command-level tests mock @context-forge/core/node wholesale, so they can
 * prove ensureGuideReady is CALLED but not that it works. These prove the
 * behavior, including that notices land on stderr and never on stdout (D4).
 */

const GUIDE_PATH = 'project-documents/ai-project-guide';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'cf-test',
  GIT_AUTHOR_EMAIL: 'cf-test@example.invalid',
  GIT_COMMITTER_NAME: 'cf-test',
  GIT_COMMITTER_EMAIL: 'cf-test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  // Git blocks the 'file' transport for submodule clones and treats every
  // local path that way; real guide sources are https.
  GIT_ALLOW_PROTOCOL: 'file',
};

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf-8' });
}

function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const maybe = gitAvailable() ? describe : describe.skip;

let roots: string[] = [];
const previousGitAllowProtocol = process.env.GIT_ALLOW_PROTOCOL;

function makeUninitializedClone(): { hostPath: string; guidePath: string } {
  process.env.GIT_ALLOW_PROTOCOL = 'file';
  const root = mkdtempSync(join(tmpdir(), 'cf-guideready-'));
  roots.push(root);

  const guideOrigin = join(root, 'guide-origin');
  mkdirSync(guideOrigin, { recursive: true });
  git(['init', '-q', '-b', 'main'], guideOrigin);
  writeFileSync(join(guideOrigin, 'README.md'), '# guide\n', 'utf-8');
  git(['add', '.'], guideOrigin);
  git(['commit', '-q', '-m', 'guide'], guideOrigin);

  const hostOrigin = join(root, 'host-origin');
  mkdirSync(hostOrigin, { recursive: true });
  git(['init', '-q', '-b', 'main'], hostOrigin);
  writeFileSync(join(hostOrigin, 'README.md'), '# host\n', 'utf-8');
  git(['add', '.'], hostOrigin);
  git(['commit', '-q', '-m', 'host'], hostOrigin);
  git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', guideOrigin, GUIDE_PATH], hostOrigin);
  git(['commit', '-q', '-m', 'add guide'], hostOrigin);

  const hostPath = join(root, 'host-clone');
  git(['clone', '-q', hostOrigin, hostPath], root);
  return { hostPath, guidePath: join(hostPath, GUIDE_PATH) };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
  // makeUninitializedClone sets this process-wide; do not leak it to later tests.
  if (previousGitAllowProtocol === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
  else process.env.GIT_ALLOW_PROTOCOL = previousGitAllowProtocol;
});

maybe('ensureGuideReady against real repositories', () => {
  it('initializes an uninitialized submodule and reports it on stderr only', async () => {
    const { hostPath, guidePath } = makeUninitializedClone();
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(existsSync(join(guidePath, 'README.md'))).toBe(false);

    const result = await ensureGuideReady(hostPath);

    expect(result.action).toBe('initialized');
    expect(result.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(existsSync(join(guidePath, 'README.md'))).toBe(true);

    const errText = stderr.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errText).toContain('Initialized the guide submodule');
    expect(errText).toContain(result.commit as string);
    expect(stdout).not.toHaveBeenCalled();
  });

  it('is a silent no-op on the second call', async () => {
    const { hostPath } = makeUninitializedClone();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await ensureGuideReady(hostPath);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    stderr.mockClear();
    const result = await ensureGuideReady(hostPath);

    expect(result.action).toBe('none');
    expect(stderr).not.toHaveBeenCalled();
  });

  it('warns on stderr without changing an out-of-sync checkout', async () => {
    const { hostPath, guidePath } = makeUninitializedClone();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await ensureGuideReady(hostPath);

    // Move the submodule checkout off the pinned commit.
    writeFileSync(join(guidePath, 'README.md'), '# local edit\n', 'utf-8');
    git(['add', '.'], guidePath);
    git(['commit', '-q', '-m', 'local'], guidePath);
    const before = git(['submodule', 'status', GUIDE_PATH], hostPath);

    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    const stdout = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await ensureGuideReady(hostPath);

    expect(result.action).toBe('warned');
    const errText = stderr.mock.calls.map((c) => String(c[0])).join('\n');
    expect(errText).toContain('cf guides update');
    expect(stdout).not.toHaveBeenCalled();
    expect(git(['submodule', 'status', GUIDE_PATH], hostPath)).toBe(before);
  });

  it('is a no-op when the project has no guide installed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cf-noguide-'));
    roots.push(root);
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await ensureGuideReady(root);

    expect(result.action).toBe('none');
    expect(stderr).not.toHaveBeenCalled();
  });
});
