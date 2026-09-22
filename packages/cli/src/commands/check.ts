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
import { formatDateProject, mergeCheckResults, attributeFindings } from '@context-forge/core';
import type {
  ConsistencyCheckResult,
  ConsistencyFixResult,
  ConsistencyFinding,
  FindingWorktree,
  ProjectData,
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

/** A project view paired with the worktree it was overlaid from, if any. */
interface ProjectView {
  view: ProjectData;
  worktree?: FindingWorktree;
}

/** Run a checker over each view and attribute the findings to their worktree. */
async function runAttributed(
  views: ProjectView[],
  run: (view: ProjectData) => Promise<ConsistencyCheckResult>,
): Promise<ConsistencyCheckResult[]> {
  return Promise.all(
    views.map(async ({ view, worktree }) => attributeFindings(await run(view), worktree)),
  );
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

interface CheckOpts {
  json?: boolean;
  project?: string;
  fix?: boolean;
  slice?: string;
  yes?: boolean;
  setReviewNone?: string;
}

/**
 * Declare a slice review-exempt (#57): writes review: none to its slice-design
 * frontmatter, so evaluateReviewGate() skips the slice/tasks/code review gates
 * for it (not the architecture gate, which is a different document). A direct,
 * single-purpose mutation — not part of the check/fix pipeline, since it
 * doesn't depend on any finding having been detected first.
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
      `No slice-design file found for slice ${index}. review: none is set on the slice design, not the task file.`,
    );
  }

  const filePath = join(project.projectPath, docs.sliceDesign);
  const entry = await updateFrontmatterField(filePath, 'review', 'none', formatDateProject());

  if (opts.json) {
    printJson({ slice: index, filePath: docs.sliceDesign, field: 'review', before: entry.before, after: entry.after });
    return;
  }
  console.log(label(`Set review: none on slice ${index}`));
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
  checkCmd.option('--set-review-none <index>', 'Declare a slice review-exempt (writes review: none to its slice design)');
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
        // Each view stays paired with the worktree that produced it, so findings
        // can be attributed before the merge. The dedup key has no worktree
        // component, so attributing after the merge would misattribute
        // first-seen-wins duplicates (#87).
        // Attribution is only meaningful when there is more than one checkout
        // to tell apart, so a single-worktree project attaches none and its
        // output stays byte-identical to the pre-slice build. Note that a
        // migrated project has exactly one worktree named "default" rather
        // than no worktrees at all, so this must key on the count — not on
        // the absence of a worktrees array, and not on that name, since a
        // user-visible label is not logical structure.
        const worktrees = project.worktrees ?? [];
        const attributable = worktrees.length > 1;
        const projectViews: ProjectView[] = worktrees.length > 0
          ? worktrees.map((wt) => ({
              view: applyWorktreeOverlay(project, wt.id),
              worktree: attributable
                ? { id: wt.id, name: wt.name, path: wt.worktreePath }
                : undefined,
            }))
          : [{ view: project }];

        const showWorktree = attributable;

        let result: ConsistencyCheckResult;

        if (singleSlice !== null) {
          // Narrow to single slice — set fileSlice temporarily and use check()
          const sliceViews = projectViews.map((pv) => ({
            ...pv,
            view: { ...pv.view, fileSlice: `${singleSlice}-slice` },
          }));
          const checkResults = await runAttributed(sliceViews, (v) => checker.check(v));
          const merged = mergeCheckResults(checkResults);
          result = fixMode ? await checker.applyFixes(merged) : merged;
        } else if (fixMode) {
          // All-slices fix mode — prompt for confirmation unless --yes
          const dryRunResults = await runAttributed(projectViews, (v) => checker.checkAll(v));
          const dryRun = mergeCheckResults(dryRunResults);
          const fixableCount = dryRun.findings.filter((f) => f.fixable).length;

          if (fixableCount === 0) {
            printCheckOutput(dryRun, project.name, false, showWorktree);
            console.log(dim('No fixable findings — nothing to apply.'));
            return;
          } else if (!opts.yes) {
            printCheckOutput(dryRun, project.name, false, showWorktree);
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
          const checkResults = await runAttributed(projectViews, (v) => checker.checkAll(v));
          result = mergeCheckResults(checkResults);
        }

        if (opts.json) {
          printJson(result);
          return;
        }

        printCheckOutput(result, project.name, fixMode, showWorktree);
      } catch (err) {
        handleError(err);
      }
    });
}

function printCheckOutput(
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
