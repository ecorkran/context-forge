/**
 * Real-git fixtures for guide submodule checkout states.
 *
 * The existing guide tests mock the filesystem and gitExec, which cannot
 * reproduce the #80 condition: a gitlink recorded in the host repo whose
 * working directory is empty. These helpers build actual repositories in a
 * temp directory so detection runs against real `git submodule status` output.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GUIDE_RELATIVE_PATH } from '../../../src/guides/types.js';

export interface SubmoduleFixture {
  /** Host repo path — the "project" a user works in. */
  hostPath: string;
  /** Absolute path of the guide checkout inside the host repo. */
  guidePath: string;
  /** Remove every directory this fixture created. */
  cleanup: () => void;
}

/**
 * Git refuses the 'file' transport for submodule clones by default (CVE-2022-39253),
 * and it classes ANY local path that way — plain or file:// alike. Real guide
 * sources are https, so this only affects fixtures. The allowance is scoped to
 * the test process rather than passed as a git flag, because the code under
 * test builds its own git invocations and must not need such a flag to work.
 */
export function allowLocalSubmoduleTransport(): () => void {
  const previous = process.env.GIT_ALLOW_PROTOCOL;
  process.env.GIT_ALLOW_PROTOCOL = 'file';
  return () => {
    if (previous === undefined) delete process.env.GIT_ALLOW_PROTOCOL;
    else process.env.GIT_ALLOW_PROTOCOL = previous;
  };
}

/** Deterministic identity and settings so fixtures do not read user git config. */
const GIT_ENV = {
  ...process.env,
  GIT_ALLOW_PROTOCOL: 'file',
  GIT_AUTHOR_NAME: 'cf-test',
  GIT_AUTHOR_EMAIL: 'cf-test@example.invalid',
  GIT_COMMITTER_NAME: 'cf-test',
  GIT_COMMITTER_EMAIL: 'cf-test@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf-8' });
}

/** True when git can run at all; tests skip themselves when it cannot. */
export function gitAvailable(): boolean {
  try {
    execFileSync('git', ['--version'], { env: GIT_ENV, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * `git submodule status` for the guide path, as the host repo reports it.
 *
 * The leading character IS the state (`-` uninitialized, ` ` in sync, `+` at a
 * different commit), so this must not be trimmed. Only the trailing newline is
 * removed.
 */
export function submoduleStatus(hostPath: string): string {
  return git(['submodule', 'status', GUIDE_RELATIVE_PATH], hostPath).replace(/\n$/, '');
}

interface FixtureRoots {
  root: string;
  guideOrigin: string;
  hostOrigin: string;
}

/**
 * Build the two origin repos every state starts from: a guide repo with one
 * tagged commit, and a host repo that records it as a submodule.
 */
function createOrigins(): FixtureRoots {
  const root = mkdtempSync(join(tmpdir(), 'cf-submodule-fixture-'));
  const guideOrigin = join(root, 'guide-origin');
  const hostOrigin = join(root, 'host-origin');

  mkdirSync(guideOrigin, { recursive: true });
  git(['init', '-q', '-b', 'main'], guideOrigin);
  writeFileSync(join(guideOrigin, 'README.md'), '# guide v1\n', 'utf-8');
  git(['add', '.'], guideOrigin);
  git(['commit', '-q', '-m', 'guide: initial'], guideOrigin);
  git(['tag', 'v1.0.0'], guideOrigin);

  mkdirSync(hostOrigin, { recursive: true });
  git(['init', '-q', '-b', 'main'], hostOrigin);
  writeFileSync(join(hostOrigin, 'README.md'), '# host\n', 'utf-8');
  git(['add', '.'], hostOrigin);
  git(['commit', '-q', '-m', 'host: initial'], hostOrigin);
  // A plain local path, deliberately NOT a file:// URL: git >= 2.38 blocks the
  // 'file' transport for submodules, and the product code under test must not
  // need a protocol.file.allow override to succeed.
  git(
    ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', guideOrigin, GUIDE_RELATIVE_PATH],
    hostOrigin
  );
  git(['commit', '-q', '-m', 'host: add guide submodule'], hostOrigin);

  return { root, guideOrigin, hostOrigin };
}

function cloneHost(roots: FixtureRoots): { hostPath: string; cleanup: () => void } {
  const hostPath = join(roots.root, 'host-clone');
  git(['clone', '-q', roots.hostOrigin, hostPath], roots.root);
  return {
    hostPath,
    cleanup: () => rmSync(roots.root, { recursive: true, force: true }),
  };
}

function toFixture(hostPath: string, cleanup: () => void): SubmoduleFixture {
  return { hostPath, guidePath: join(hostPath, GUIDE_RELATIVE_PATH), cleanup };
}

/**
 * The #80 state: host cloned WITHOUT --recurse-submodules. The gitlink exists
 * and the guide directory is empty. `git submodule status` prefixes `-`.
 */
export function cloned(): SubmoduleFixture {
  const restoreEnv = allowLocalSubmoduleTransport();
  const roots = createOrigins();
  const { hostPath, cleanup } = cloneHost(roots);
  return toFixture(hostPath, () => {
    cleanup();
    restoreEnv();
  });
}

/**
 * Cloned then `git submodule update --init`: the guide is checked out at the
 * pinned commit. `git submodule status` prefixes a space.
 */
export function initialized(): SubmoduleFixture {
  const restoreEnv = allowLocalSubmoduleTransport();
  const roots = createOrigins();
  const { hostPath, cleanup } = cloneHost(roots);
  git(['submodule', 'update', '--init', GUIDE_RELATIVE_PATH], hostPath);
  return toFixture(hostPath, () => {
    cleanup();
    restoreEnv();
  });
}

/**
 * Initialized, then a second guide commit checked out inside the submodule so
 * the checkout no longer matches the host's pinned commit. `git submodule
 * status` prefixes `+`.
 */
export function outOfSync(): SubmoduleFixture {
  const restoreEnv = allowLocalSubmoduleTransport();
  const roots = createOrigins();
  const { hostPath, cleanup } = cloneHost(roots);
  const guidePath = join(hostPath, GUIDE_RELATIVE_PATH);
  git(['submodule', 'update', '--init', GUIDE_RELATIVE_PATH], hostPath);
  // Commit inside the submodule checkout; the host still points at the old SHA.
  writeFileSync(join(guidePath, 'README.md'), '# guide v2\n', 'utf-8');
  git(['add', '.'], guidePath);
  git(['commit', '-q', '-m', 'guide: second commit'], guidePath);
  return toFixture(hostPath, () => {
    cleanup();
    restoreEnv();
  });
}
