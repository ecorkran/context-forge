import type { ConsistencyCheckResult, ConsistencyFinding } from './types.js';

/**
 * Merge findings from multiple checkAll runs, deduplicating by
 * rule+location+description.
 *
 * The dedup key deliberately carries no worktree component. Aggregate rules
 * run once per view and legitimately produce identical project-level findings
 * across views; collapsing them is the point. Adding worktree to the key would
 * multiply those findings by the worktree count. Per-finding worktree
 * attribution is therefore attached before the merge, by the caller that knows
 * which view produced each finding.
 */
export function mergeCheckResults(results: ConsistencyCheckResult[]): ConsistencyCheckResult {
  if (results.length === 1) return results[0];
  const seen = new Set<string>();
  const allFindings: ConsistencyFinding[] = [];
  for (const result of results) {
    for (const finding of result.findings) {
      const key = `${finding.rule}|${finding.location}|${finding.description}`;
      if (!seen.has(key)) {
        seen.add(key);
        allFindings.push(finding);
      }
    }
  }
  const projectPath = results[0].projectPath;
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
