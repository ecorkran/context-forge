import type { ConsistencyCheckResult, ConsistencyFixResult, ConsistencyFinding } from '@context-forge/core';
import { label, dim, error as errorStyle, warn as warnStyle } from './styles.js';
import { printRoutedFixResult } from './fixReport.js';

const SEVERITY_ICON: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

function isFixResult(result: ConsistencyCheckResult): result is ConsistencyFixResult {
  return 'fixLog' in result;
}

function formatFinding(
  finding: ConsistencyFinding,
  fixResult?: ConsistencyFixResult,
  showWorktree = false,
): string {
  const icon = SEVERITY_ICON[finding.severity] ?? '?';
  const colorFn = finding.severity === 'error' ? errorStyle : finding.severity === 'warning' ? warnStyle : dim;
  const lines: string[] = [];
  const prefix = showWorktree && finding.worktree ? `[${finding.worktree.name}] ` : '';
  lines.push(colorFn(`  ${icon} ${prefix}${finding.description}`));

  if (fixResult && finding.fixable) {
    // Match on rule AND file: several findings can share a rule (e.g. multiple
    // frontmatter-schema fixes in one run), and location may be relative while
    // the fix log records the absolute path.
    const logEntry = fixResult.fixLog.find(
      (e) =>
        e.rule === finding.rule &&
        (e.filePath === finding.location ||
          e.filePath.endsWith(finding.location) ||
          finding.location.endsWith(e.filePath)),
    );
    if (logEntry) {
      lines.push(dim(`    → Fixed: ${logEntry.before} → ${logEntry.after} in ${logEntry.filePath}`));
    }
  } else {
    lines.push(dim(`    → ${finding.suggestedFix}`));
  }

  return lines.join('\n');
}

/** Extract slice index prefix from a finding description like "[175] ..." */
function extractFindingSliceIndex(description: string): string | null {
  const match = /^\[(\d+)\]\s/.exec(description);
  return match ? match[1] : null;
}

/** Group findings by slice index prefix, with non-prefixed in a "Project-level" group */
function groupFindings(findings: ConsistencyFinding[]): Map<string, ConsistencyFinding[]> {
  const groups = new Map<string, ConsistencyFinding[]>();
  for (const finding of findings) {
    const idx = extractFindingSliceIndex(finding.description);
    const key = idx ?? 'project';
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }
  return groups;
}

/** Print a check or fix result grouped by slice; multi-checkout fix results add the routed report. */
export function printCheckOutput(
  result: ConsistencyCheckResult,
  projectName: string,
  fixMode: boolean,
  showWorktree = false,
): void {
  const modeLabel = fixMode ? ' (fix mode)' : '';
  console.log(label(`Consistency Check: ${projectName}${modeLabel}`));
  console.log('');

  if (result.totalFindings === 0) {
    console.log('  No inconsistencies found');
    return;
  }

  const fixRes = isFixResult(result) ? result : undefined;
  const groups = groupFindings(result.findings);

  for (const [key, findings] of groups) {
    const groupLabel = key === 'project' ? 'Project-level' : `Slice ${key}`;
    console.log(label(`  ${groupLabel}`));

    for (const finding of findings) {
      console.log(formatFinding(finding, fixRes, showWorktree));
    }
    console.log('');
  }

  if (fixRes && showWorktree) {
    printRoutedFixResult(fixRes);
    for (const err of fixRes.fixErrors) {
      console.log(errorStyle(`  Fix error: ${err}`));
    }
  } else if (fixRes) {
    const fixSummary =
      fixRes.fixed > result.totalFindings
        ? `Fixed ${result.totalFindings} finding(s) (${fixRes.fixed} file update(s) across checkouts)`
        : `Fixed ${fixRes.fixed} of ${result.totalFindings} findings`;
    console.log(label(fixSummary));
    if (fixRes.fixErrors.length > 0) {
      for (const err of fixRes.fixErrors) {
        console.log(errorStyle(`  Fix error: ${err}`));
      }
    }
  } else {
    console.log(dim(result.summary));
  }
}
