import { join } from 'node:path';
import { Command } from 'commander';
import {
  FileProjectStore,
  ArtifactIntrospector,
  ConsistencyChecker,
  ConfigManager,
  detectDocuments,
  updateFrontmatterField,
  applyFixPlan,
  scopeCheck,
  resolveFixInvokingPath,
  planFixRun,
} from '@context-forge/core/node';
import {
  formatDateProject,
  mergeCheckResults,
  buildAttributedViews,
  runAttributed,
} from '@context-forge/core';
import type { ConsistencyCheckResult, ConsistencyFixResult, ProjectData } from '@context-forge/core';
import type { CheckScope } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { withJsonOption, withProjectOption, withYesOption, withFixOption } from '../options.js';
import { resolveOperationPath } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { label, dim } from '../output/styles.js';
import { printFixPlan, plannedFixCount } from '../output/fixReport.js';
import { printCheckOutput } from '../output/checkReport.js';

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
 *
 * Waiving reviews is a PM decision (slice 928 TD-6), so the write needs either --yes
 * or an interactive "y". --json without --yes, or a non-TTY stdin without --yes, is
 * an error rather than a prompt that would hang. Declining writes nothing.
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

  if (opts.json && !opts.yes) {
    throw new UserError('--yes is required with --json for --set-review-none');
  }
  if (!opts.yes && !process.stdin.isTTY) {
    throw new UserError('--yes is required for --set-review-none in a non-interactive shell');
  }
  if (!opts.json) {
    console.log(label(`Slice ${index}: ${docs.sliceDesign}`));
    console.log('Setting review: none waives the slice, tasks, and code review gates for this slice.');
    console.log('This is a Project Manager decision.');
  }
  if (!opts.yes && !(await askConfirmation('Proceed? [y/N] '))) {
    console.log('Cancelled.');
    return;
  }

  const filePath = join(project.projectPath, docs.sliceDesign);
  const entry = await updateFrontmatterField(filePath, 'review', 'none', formatDateProject());

  if (opts.json) {
    printJson({ slice: index, filePath: docs.sliceDesign, field: 'review', before: entry.before, after: entry.after });
    return;
  }
  console.log(label(`Set review: none on slice ${index}`));
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
        const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const introspector = new ArtifactIntrospector();
        const config = new ConfigManager(project.projectPath);
        const checker = new ConsistencyChecker(introspector, config);

        // Determine fix mode: explicit flag > config key > false
        let fixMode = opts.fix ?? false;
        const explicitFix = fixMode;
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
        // buildAttributedViews owns the count-not-presence rule; it is shared
        // with MCP's workflow_check so the invariant cannot drift between the
        // two consumers of the same merge.
        const projectViews = buildAttributedViews(project);
        const showWorktree = projectViews.some((v) => v.worktree !== undefined);

        // Top-level projectPath means the invoking checkout (D6). Each view's
        // own projectPath has been overlaid to its worktree path, so the merge
        // must be told which one that is.
        const invokingPath = resolveOperationPath(project, worktreeId) ?? project.projectPath;

        // --slice narrows to one slice; otherwise every view runs checkAll()
        const scope = scopeCheck(checker, projectViews, singleSlice);

        let result: ConsistencyCheckResult;
        if (fixMode) {
          const fixResult = await runRoutedFix({
            project,
            checker,
            scope,
            invokingPath,
            // Only an explicit all-slices --fix previews and prompts; the
            // workflow.auto_fix path skips both by design (slice 213 SC 11).
            confirm: singleSlice === null && explicitFix && !opts.yes,
            allSlices: singleSlice === null,
            showWorktree,
          });
          if (!fixResult) return;
          result = fixResult;
        } else {
          const checkResults = await runAttributed(scope.views, scope.runCheck);
          result = mergeCheckResults(checkResults, invokingPath);
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

interface RoutedFixArgs {
  project: ProjectData;
  checker: ConsistencyChecker;
  scope: CheckScope;
  invokingPath: string | undefined;
  /** Preview and prompt before writing. */
  confirm: boolean;
  allSlices: boolean;
  showWorktree: boolean;
}

/**
 * Fix mode (slice 213): dry run per view, route each fix to the checkout that
 * owns its subject, optionally preview and confirm, then apply. Returns null
 * when nothing is applied (no fixable findings, or the user declined).
 */
async function runRoutedFix(args: RoutedFixArgs): Promise<ConsistencyFixResult | null> {
  const { project, checker, scope, showWorktree } = args;
  const multi = scope.views.length > 1;

  // Routing needs to know which checkout is "here"; an unregistered one, or
  // no projectPath at all, is a hard stop before anything is written (D5b, SC 12).
  let invokingPath: string;
  try {
    invokingPath = await resolveFixInvokingPath(scope.views, args.invokingPath);
  } catch (err) {
    throw new UserError(err instanceof Error ? err.message : String(err));
  }

  const { dryRunResults, plan } = await planFixRun(project, scope, invokingPath);

  if (args.allSlices) {
    const dryRun = mergeCheckResults(dryRunResults, invokingPath);
    const fixableCount = dryRun.findings.filter((f) => f.fixable).length;
    if (fixableCount === 0) {
      printCheckOutput(dryRun, project.name, false, showWorktree);
      console.log(dim('No fixable findings — nothing to apply.'));
      return null;
    }
    if (args.confirm) {
      printCheckOutput(dryRun, project.name, false, showWorktree);
      if (multi) {
        printFixPlan(plan);
        if (plannedFixCount(plan) === 0) {
          console.log(dim('Every fix is left alone — nothing to apply.'));
          return null;
        }
      }
      const prompt = multi
        ? `\nApply ${plannedFixCount(plan)} fix(es) as planned? [y/N] `
        : `\nFound ${fixableCount} fixable finding${fixableCount !== 1 ? 's' : ''}. Apply fixes? [y/N] `;
      if (!(await askConfirmation(prompt))) {
        console.log('Aborted.');
        return null;
      }
    }
  }

  return applyFixPlan(checker, plan);
}
