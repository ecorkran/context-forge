// History fact (slice 261, D5). Reported for the prompt, never decides the outcome.
import { gitExec } from '../guides/gitExec.js';

export type HistoryFact =
  | { kind: 'known'; commits: number; shallow: boolean }
  | { kind: 'unknown'; reason: string };

export const HISTORY_GIT_TIMEOUT_MS = 5000;

/** Commits touching `root` (scoped, so a monorepo subdirectory reports its own) and shallow-clone status. */
export async function readHistory(root: string): Promise<HistoryFact> {
  const opts = { timeoutMs: HISTORY_GIT_TIMEOUT_MS };
  try {
    const count = await gitExec(['rev-list', '--count', 'HEAD', '--', '.'], root, opts);
    const shallow = await gitExec(['rev-parse', '--is-shallow-repository'], root, opts);
    const commits = Number.parseInt(count.stdout, 10);
    if (Number.isNaN(commits)) {
      return { kind: 'unknown', reason: `unexpected git output: ${JSON.stringify(count.stdout)}` };
    }
    return { kind: 'known', commits, shallow: shallow.stdout === 'true' };
  } catch (error) {
    // Not a repo, no commits, no git, or a timeout. History never decides the
    // outcome (D1), so "unknown" with the reason is a stated fact, not a fallback.
    return { kind: 'unknown', reason: error instanceof Error ? error.message : String(error) };
  }
}
