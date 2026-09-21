// Safe shell execution wrapper for git commands
import { execFile } from 'child_process';

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

// Guide install/update must never block on interactive input — the remote is always
// expected to be publicly accessible. Without this, a credential helper (e.g. Git
// Credential Manager) can silently pop a browser sign-in and hang the CLI forever.
const GIT_NONINTERACTIVE_ENV = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };

/** Strip embedded credentials (user:token@host) from URL-like args before they reach error messages/logs. */
function redactCredentials(args: string[]): string {
  return args.map((arg) => arg.replace(/^(\w+:\/\/)[^/@\s]+@/, '$1')).join(' ');
}

// Substrings git/curl/Node emit for DNS, proxy, and connectivity failures.
const NETWORK_ERROR_PATTERNS = [
  /could not resolve host/i,
  /could not connect to/i,
  /connection timed out/i,
  // Our own timeout message (see GitExecOptions.timeoutMs). The existing
  // 'connection timed out' pattern is git's wording and does not match it.
  /timed out after \d+s/i,
  /network is unreachable/i,
  /ssl certificate problem/i,
  /failed to connect/i,
  /enotfound/i,
  /econnrefused/i,
  /etimedout/i,
];

/**
 * Offline/network remediation guidance for guide installation. Defined once and
 * reused wherever a guide-install failure is surfaced, so the advice cannot drift
 * between call sites (#78).
 */
export const GUIDE_OFFLINE_REMEDIATION =
  'Check your VPN/proxy connection, or install offline by pointing guide.source ' +
  'at a local path or mirror (cf config set guide.source <path>).';

/** Append remediation guidance when a message looks like a network/DNS failure. */
export function withNetworkErrorHint(message: string): string {
  if (!NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }
  return (
    `${message}\n` +
    `  This looks like a network/DNS problem reaching the remote. ${GUIDE_OFFLINE_REMEDIATION}`
  );
}

export interface GitExecOptions {
  /**
   * Kill the command after this many milliseconds. Omit for no bound.
   *
   * Only automatic operations inside a read command set this: a credential
   * prompt is already prevented by GIT_NONINTERACTIVE_ENV, but a proxy that
   * accepts a connection and never answers would otherwise block for the OS
   * TCP timeout. User-initiated install and update stay unbounded (D10).
   */
  timeoutMs?: number;
}

/**
 * Execute a git command safely using execFile (no shell injection).
 * @param args - arguments to pass to git (e.g., ['clone', url, dir])
 * @param cwd - working directory for the command
 * @param opts - optional execution bounds
 */
export function gitExec(
  args: string[],
  cwd: string,
  opts?: GitExecOptions
): Promise<GitExecResult> {
  return new Promise((resolve, reject) => {
    const timeoutMs = opts?.timeoutMs;
    execFile(
      'git',
      args,
      {
        cwd,
        env: { ...process.env, ...GIT_NONINTERACTIVE_ENV },
        ...(timeoutMs ? { timeout: timeoutMs, killSignal: 'SIGTERM' as const } : {}),
      },
      (error, stdout, stderr) => {
        if (error) {
          // execFile reports a timeout kill via `killed`; surface it as a
          // timeout so withNetworkErrorHint's /timed out/i pattern appends the
          // offline remediation text.
          const killedByTimeout =
            timeoutMs !== undefined &&
            (error as NodeJS.ErrnoException & { killed?: boolean }).killed === true;
          const detail = killedByTimeout
            ? `timed out after ${Math.round(timeoutMs / 1000)}s`
            : stderr.trim() || error.message;
          reject(
            new Error(withNetworkErrorHint(`git ${redactCredentials(args)} failed in ${cwd}: ${detail}`))
          );
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });
}

/** Check whether git is available on the system */
export async function isGitAvailable(): Promise<boolean> {
  try {
    await gitExec(['--version'], process.cwd());
    return true;
  } catch {
    return false;
  }
}

/** Check whether a directory is inside a git repository */
export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await gitExec(['rev-parse', '--is-inside-work-tree'], dir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stage and commit one path, and only that path, when it has changes.
 *
 * Returns false without committing when `repoPath` is not a git work tree, or
 * when git reports nothing to commit under `relPath` — which covers both an
 * unchanged path and one the project gitignores. The pathspec on `commit`
 * keeps anything else the user has staged out of this commit. Never pushes.
 */
export async function commitPathIfChanged(
  repoPath: string,
  relPath: string,
  message: string
): Promise<boolean> {
  if (!(await isGitRepo(repoPath))) return false;

  const { stdout } = await gitExec(['status', '--porcelain', '--', relPath], repoPath);
  if (!stdout) return false;

  await gitExec(['add', '-A', '--', relPath], repoPath);
  await gitExec(['commit', '-m', message, '--', relPath], repoPath);
  return true;
}
