import type {
  ConsistencyCheckResult,
  ConsistencyFinding,
  FindingWorktree,
} from './types.js';
import type { ProjectData } from '../types/index.js';
import { applyWorktreeOverlay, stripTrailingSeparator } from '../utils/worktree-overlay.js';

/** A project view paired with the worktree it was overlaid from, if any. */
export interface AttributedView {
  view: ProjectData;
  worktree?: FindingWorktree;
}

/**
 * Build one project view per registered worktree, each paired with the
 * worktree that produced it so its findings can be attributed before the merge.
 *
 * Attribution is attached only when there is more than one checkout to tell
 * apart. Note that a migrated project has exactly one worktree named "default"
 * whose path equals `projectPath` — it does not have an absent `worktrees`
 * array — so this keys on the count. Keying on the array's presence would add
 * a worktree field to single-checkout output that must stay byte-identical,
 * and keying on the "default" name would use a user-visible label as logical
 * structure.
 *
 * Shared by `cf check` and MCP's `workflow_check`: both consume the same merge,
 * so this invariant must not be able to drift between them.
 */
export function buildAttributedViews(project: ProjectData): AttributedView[] {
  const worktrees = project.worktrees ?? [];
  if (worktrees.length === 0) return [{ view: project }];

  const attributable = worktrees.length > 1;
  return worktrees.map((wt) => ({
    view: applyWorktreeOverlay(project, wt.id),
    worktree: attributable
      ? { id: wt.id, name: wt.name, path: wt.worktreePath }
      : undefined,
  }));
}

/**
 * Tag every finding in a result with the worktree whose view produced it.
 *
 * Must run before mergeCheckResults: the dedup key carries no worktree, so a
 * duplicate the merge collapses would otherwise lose its origin and be
 * attributed first-seen-wins (#87).
 */
export function attributeFindings(
  result: ConsistencyCheckResult,
  worktree?: FindingWorktree,
): ConsistencyCheckResult {
  if (!worktree) return result;
  return {
    ...result,
    findings: result.findings.map((f) => ({ ...f, worktree })),
  };
}

/**
 * Replace every occurrence of `viewRoot` in `text` with a fixed token, so two
 * views of the same project produce identical dedup keys regardless of which
 * checkout root their paths were built from.
 *
 * A match requires a path separator or end-of-string immediately after the
 * root, mirroring resolveWorktreeForPath's boundary check — `/repo` does not
 * match inside `/repo-other`.
 */
function replaceRoot(text: string, viewRoot: string): string {
  const root = stripTrailingSeparator(viewRoot);
  if (!root) return text;
  let result = '';
  let rest = text;
  let index = rest.indexOf(root);
  while (index !== -1) {
    const after = rest[index + root.length];
    if (after === undefined || after === '/' || after === '\\') {
      result += rest.slice(0, index) + '\u0000ROOT\u0000';
      rest = rest.slice(index + root.length);
    } else {
      result += rest.slice(0, index + root.length);
      rest = rest.slice(index + root.length);
    }
    index = rest.indexOf(root);
  }
  return result + rest;
}

/**
 * Build the dedup key for one finding, with the view's checkout root
 * normalized out of `location` and `description` so the same logical finding
 * from two different worktree views collapses to one key. See "#100 — Dedup
 * Key Normalization" in the slice 927 design.
 */
function dedupKey(finding: ConsistencyFinding, viewRoot: string | undefined): string {
  const norm = (s: string) => (viewRoot ? replaceRoot(s, viewRoot) : s);
  return `${finding.rule}|${norm(finding.location)}|${norm(finding.description)}`;
}

/**
 * Merge findings from multiple checkAll runs, deduplicating by
 * rule+location+description with the view's checkout root normalized out of
 * the key (see dedupKey). The kept finding is pushed unmodified — normalization
 * affects the dedup key only, never the finding's own `location`/`description`.
 *
 * The dedup key deliberately carries no worktree component. Aggregate rules
 * run once per view and legitimately produce identical project-level findings
 * across views; collapsing them is the point. Adding worktree to the key would
 * multiply those findings by the worktree count. Per-finding worktree
 * attribution is therefore attached before the merge, by the caller that knows
 * which view produced each finding.
 *
 * `invokingPath` sets the result's top-level `projectPath`, which per D6 means
 * "the checkout the command was invoked from". Each view's own `projectPath`
 * has been overlaid to its worktree path, so inheriting `results[0]` would
 * report the first *registered* worktree instead of the invoking one. Omitted,
 * it falls back to that legacy behavior.
 */
export function mergeCheckResults(
  results: ConsistencyCheckResult[],
  invokingPath?: string,
): ConsistencyCheckResult {
  if (results.length === 1) {
    return invokingPath ? { ...results[0], projectPath: invokingPath } : results[0];
  }
  const seen = new Set<string>();
  const allFindings: ConsistencyFinding[] = [];
  for (const result of results) {
    for (const finding of result.findings) {
      const key = dedupKey(finding, result.projectPath);
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(finding);
      }
    }
  }
  const projectPath = invokingPath ?? results[0].projectPath;
  const errors = allFindings.filter((f) => f.severity === 'error').length;
  const warnings = allFindings.filter((f) => f.severity === 'warning').length;
  const infos = allFindings.filter((f) => f.severity === 'info').length;
  const total = allFindings.length;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
  if (infos > 0) parts.push(`${infos} info${infos !== 1 ? 's' : ''}`);
  const summary =
    total === 0
      ? 'No inconsistencies found'
      : `${total} finding${total !== 1 ? 's' : ''}: ${parts.join(', ')}`;
  return { projectPath, findings: allFindings, totalFindings: total, errors, warnings, infos, summary };
}
