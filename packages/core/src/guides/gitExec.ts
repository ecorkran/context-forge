// Safe shell execution wrapper for git commands
import { execFile } from 'child_process';

export interface GitExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Execute a git command safely using execFile (no shell injection).
 * @param args - arguments to pass to git (e.g., ['clone', url, dir])
 * @param cwd - working directory for the command
 */
export function gitExec(args: string[], cwd: string): Promise<GitExecResult> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `git ${args.join(' ')} failed in ${cwd}: ${stderr.trim() || error.message}`
          )
        );
        return;
      }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
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
