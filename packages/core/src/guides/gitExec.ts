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

// Safety net in case a credential helper ignores the non-interactive env above. 30s is
// generous for the fast metadata commands (ls-remote, describe, rev-parse) this module also
// issues, but a clone/submodule-add of a large repo over a slow link could legitimately take
// longer and get misreported as an auth-prompt hang — the non-interactive env above is the
// primary defense against that scenario, this is just a backstop.
const GIT_EXEC_TIMEOUT_MS = 30_000;

/** Strip embedded credentials (user:token@host) from URL-like args before they reach error messages/logs. */
function redactCredentials(args: string[]): string {
  return args.map((arg) => arg.replace(/^(\w+:\/\/)[^/@\s]+@/, '$1')).join(' ');
}

// Substrings git/curl/Node emit for DNS, proxy, and connectivity failures.
const NETWORK_ERROR_PATTERNS = [
  /could not resolve host/i,
  /could not connect to/i,
  /connection timed out/i,
  /network is unreachable/i,
  /ssl certificate problem/i,
  /failed to connect/i,
  /enotfound/i,
  /econnrefused/i,
  /etimedout/i,
];

/** Append remediation guidance when a message looks like a network/DNS failure. */
export function withNetworkErrorHint(message: string): string {
  if (!NETWORK_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return message;
  }
  return (
    `${message}\n` +
    '  This looks like a network/DNS problem reaching the remote. Check your VPN/proxy ' +
    'connection, or install offline by pointing guide.source at a local path or mirror ' +
    '(cf config set guide.source <path>).'
  );
}

/**
 * Execute a git command safely using execFile (no shell injection).
 * @param args - arguments to pass to git (e.g., ['clone', url, dir])
 * @param cwd - working directory for the command
 */
export function gitExec(args: string[], cwd: string): Promise<GitExecResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, timeout: GIT_EXEC_TIMEOUT_MS, env: { ...process.env, ...GIT_NONINTERACTIVE_ENV } },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            reject(
              new Error(
                `git ${redactCredentials(args)} in ${cwd} timed out after ${GIT_EXEC_TIMEOUT_MS}ms. ` +
                  'This usually means git is blocked on an interactive credential/auth prompt ' +
                  '(e.g. a browser sign-in) for a remote that requires authentication. Verify the ' +
                  'source URL is correct and publicly accessible.'
              )
            );
            return;
          }
          const detail = stderr.trim() || error.message;
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
