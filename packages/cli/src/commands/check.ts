import * as readline from 'node:readline';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  FileProjectStore,
  ArtifactIntrospector,
  ConsistencyChecker,
  ConfigManager,
  detectDocuments,
  updateFrontmatterField,
} from '@context-forge/core/node';
import type {
  ConsistencyCheckResult,
  ConsistencyFixResult,
  ConsistencyFinding,
} from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { withJsonOption, withProjectOption, withYesOption, withFixOption } from '../options.js';
import { applyWorktreeOverlay } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, dim, error as errorStyle, warn as warnStyle } from '../output/styles.js';

const SEVERITY_ICON: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

/** Prompt user for y/N confirmation via stdin. Returns true if confirmed. */
function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

function isFixResult(result: ConsistencyCheckResult): result is ConsistencyFixResult {
  return 'fixLog' in result;
}

/** Merge findings from multiple checkAll runs, deduplicating by rule+location+description. */
function mergeCheckResults(results: ConsistencyCheckResult[]): ConsistencyCheckResult {
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
  const summary = total === 0 ? 'No inconsistencies found' : `${total} finding${total !== 1 ? 's' : ''}: ${parts.join(', ')}`;
  return { projectPath, findings: allFindings, totalFindings: total, errors, warnings, infos, summary };
}

function formatFinding(finding: ConsistencyFinding, fixResult?: ConsistencyFixResult): string {
  const icon = SEVERITY_ICON[finding.severity] ?? '?';
  const colorFn = finding.severity === 'error' ? errorStyle : finding.severity === 'warning' ? warnStyle : dim;
  const lines: string[] = [];
  lines.push(colorFn(`  ${icon} ${finding.description}`));

  if (fixResult && finding.fixable) {
    const logEntry = fixResult.fixLog.find((e) => e.rule === finding.rule);
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

interface CheckOpts {
  json?: boolean;
  project?: string;
  fix?: boolean;
  slice?: string;
  yes?: boolean;
  setReviewNone?: string;
}

/**
 * Declare a slice docs-only (#57): writes codeReview: none to its slice-design
 * frontmatter, so evaluateReviewGate() skips the pre-advance code-review gate
 * for it. A direct, single-purpose mutation — not part of the check/fix
 * pipeline, since it doesn't depend on any finding having been detected first.
 */
async function setReviewNoneAction(indexArg: string, opts: CheckOpts): Promise<void> {
  const index = parseInt(indexArg, 10);
  if (isNaN(index)) {
    throw new UserError(`Invalid slice index: '${indexArg}'`);
  }

  const store = new FileProjectStore();
  const { id } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await store.getById(id);
  if (!project) {
    throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
  }
  if (!project.projectPath) {
    throw new UserError('No projectPath configured. Set one with: cf set projectPath /path/to/project');
  }

  const docs = await detectDocuments(project.projectPath, index);
  if (!docs.sliceDesign) {
    throw new UserError(
      `No slice-design file found for slice ${index}. codeReview: none is set on the slice design, not the task file.`,
    );
  }

  const filePath = join(project.projectPath, docs.sliceDesign);
  const entry = await updateFrontmatterField(filePath, 'codeReview', 'none');

  if (opts.json) {
    printJson({ slice: index, filePath: docs.sliceDesign, field: 'codeReview', before: entry.before, after: entry.after });
    return;
  }
  console.log(label(`Set codeReview: none on slice ${index}`));
  console.log(dim(`  ${docs.sliceDesign}`));
}

export function registerCheckCommand(program: Command): void {
  const checkCmd = program
    .command('check')
    .description('Run consistency checks on project artifacts');
  withJsonOption(checkCmd);
  withProjectOption(checkCmd);
  withFixOption(checkCmd);
  checkCmd.option('--slice <index>', 'Check only a specific slice by index');
  checkCmd.option('--set-review-none <index>', 'Declare a slice docs-only (writes codeReview: none to its slice design)');
  withYesOption(checkCmd);
  checkCmd.action(async (opts: CheckOpts) => {
      try {
        if (opts.setReviewNone !== undefined) {
          await setReviewNoneAction(opts.setReviewNone, opts);
          return;
        }

        const store = new FileProjectStore();
        const { id } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const introspector = new ArtifactIntrospector();
        const config = new ConfigManager(project.projectPath);
        const checker = new ConsistencyChecker(introspector, config);

        // Determine fix mode: explicit flag > config key > false
        let fixMode = opts.fix ?? false;
        if (!fixMode) {
          try {
            const autoFixResult = await config.get('workflow.auto_fix');
            if (autoFixResult.value === true) {
              fixMode = true;
            }
          } catch {
            // Config read failed — default to check-only
          }
        }

        // Determine scope: --slice narrows to single slice, otherwise all-slices
        const singleSlice = opts.slice ? parseInt(opts.slice, 10) : null;
        if (singleSlice !== null && isNaN(singleSlice)) {
          throw new UserError(`Invalid slice index: '${opts.slice}'`);
        }

        // Build project views: one per worktree overlay so all workflow fields are visible.
        // Findings are merged and deduplicated — aggregate rules (filesystem scan) run per
        // view but produce the same results, so deduplication collapses them correctly.
        const worktrees = project.worktrees ?? [];
        const projectViews = worktrees.length > 0
          ? worktrees.map((wt) => applyWorktreeOverlay(project, wt.id))
          : [project];

        let result: ConsistencyCheckResult;

        if (singleSlice !== null) {
          // Narrow to single slice — set fileSlice temporarily and use check()
          const sliceViews = projectViews.map((v) => ({ ...v, fileSlice: `${singleSlice}-slice` }));
          const checkResults = await Promise.all(sliceViews.map((v) => checker.check(v)));
          const merged = mergeCheckResults(checkResults);
          result = fixMode ? await checker.applyFixes(merged) : merged;
        } else if (fixMode) {
          // All-slices fix mode — prompt for confirmation unless --yes
          const dryRunResults = await Promise.all(projectViews.map((v) => checker.checkAll(v)));
          const dryRun = mergeCheckResults(dryRunResults);
          const fixableCount = dryRun.findings.filter((f) => f.fixable).length;

          if (fixableCount === 0) {
            printCheckOutput(dryRun, project.name, false);
            console.log(dim('No fixable findings — nothing to apply.'));
            return;
          } else if (!opts.yes) {
            printCheckOutput(dryRun, project.name, false);
            const confirmed = await askConfirmation(
              `\nFound ${fixableCount} fixable finding${fixableCount !== 1 ? 's' : ''}. Apply fixes? [y/N] `,
            );
            if (!confirmed) {
              console.log('Aborted.');
              return;
            }
            result = await checker.applyFixes(dryRun);
          } else {
            result = await checker.applyFixes(dryRun);
          }
        } else {
          const checkResults = await Promise.all(projectViews.map((v) => checker.checkAll(v)));
          result = mergeCheckResults(checkResults);
        }

        if (opts.json) {
          printJson(result);
          return;
        }

        printCheckOutput(result, project.name, fixMode);
      } catch (err) {
        handleError(err);
      }
    });
}

function printCheckOutput(
  result: ConsistencyCheckResult,
  projectName: string,
  fixMode: boolean,
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
      console.log(formatFinding(finding, fixRes));
    }
    console.log('');
  }

  if (fixRes) {
    console.log(label(`Fixed ${fixRes.fixed} of ${result.totalFindings} findings`));
    if (fixRes.fixErrors.length > 0) {
      for (const err of fixRes.fixErrors) {
        console.log(errorStyle(`  Fix error: ${err}`));
      }
    }
  } else {
    console.log(dim(result.summary));
  }
}
