import path from 'node:path';
import type { Command } from 'commander';
import {
  ConfigManager,
  FileProjectStore,
  GUIDE_RELATIVE_PATH,
  SLICE_DESIGN_TEMPLATE_RELATIVE_PATH,
  DOC_TYPE_FAILURE_MESSAGE,
  DesignFailureReason,
  SliceDesignValidationError,
  isDecisionGateEnabled,
  validateSliceDesignFiles,
} from '@context-forge/core/node';
import type { DesignValidationResult } from '@context-forge/core/node';
import { resolveProjectWorktree } from '../utils/project.js';
import { resolveOperationPath } from '../utils/worktree-overlay.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';

interface ValidateDesignOpts {
  json?: boolean;
  project?: string;
}

/** The `--json` contract for `cf validate design`. */
export interface ValidateDesignJson {
  /** Absolute path of the template the files were checked against. */
  template: string;
  /** Whether the pending-decision gate was applied (workflow.decision_gate_enabled). */
  decisionGateEnabled: boolean;
  passed: number;
  failed: number;
  files: DesignValidationResult[];
}

/** Label printed before each pending decision; the human-output counterpart of `files[].pending`. */
const PENDING_LABEL = 'pending-pm';

/** The invoking checkout (worktree-aware) and the slice-design template inside its guide. */
async function resolveCheckout(
  opts: ValidateDesignOpts,
): Promise<{ checkoutRoot: string; templatePath: string }> {
  const store = new FileProjectStore();
  const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await store.getById(id);
  if (!project) {
    throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
  }
  const checkoutRoot = resolveOperationPath(project, worktreeId);
  if (!checkoutRoot) {
    throw new UserError('No projectPath configured. Set one with: cf set projectPath /path/to/project');
  }
  const templatePath = path.resolve(
    checkoutRoot,
    GUIDE_RELATIVE_PATH,
    SLICE_DESIGN_TEMPLATE_RELATIVE_PATH,
  );
  return { checkoutRoot, templatePath };
}

/** Print PASS/FAIL lines in the guide script's format. */
function printHumanOutput(results: DesignValidationResult[]): void {
  for (const result of results) {
    console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.path}`);
    if (result.reason === DesignFailureReason.DocType) {
      console.log(`  ${DOC_TYPE_FAILURE_MESSAGE}`);
    }
    for (const heading of result.missing) {
      console.log(`  missing: ${heading}`);
    }
    for (const decision of result.pending) {
      console.log(`  ${PENDING_LABEL}: ${decision.heading} (line ${decision.line})`);
    }
  }
}

async function validateDesignAction(files: string[], opts: ValidateDesignOpts): Promise<void> {
  if (files.length === 0) {
    throw new SliceDesignValidationError(
      'no files given. Usage: cf validate design <file...>',
    );
  }

  const { checkoutRoot, templatePath: template } = await resolveCheckout(opts);
  const decisionGateEnabled = await isDecisionGateEnabled(new ConfigManager(checkoutRoot));
  const results = await validateSliceDesignFiles(template, files, { decisionGateEnabled });
  const failed = results.filter((r) => !r.pass).length;

  if (opts.json) {
    const output: ValidateDesignJson = {
      template,
      decisionGateEnabled,
      passed: results.length - failed,
      failed,
      files: results,
    };
    printJson(output);
  } else {
    printHumanOutput(results);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

/** Add `design [files...]` to the `validate` command. */
export function registerValidateDesignCommand(validateCmd: Command): void {
  // Declared optional so an empty list reaches the action and exits 2, not Commander's 1.
  const designCmd = validateCmd
    .command('design [files...]')
    .description(
      'Check slice designs for every section the guide template marks required. ' +
        'Exit 0 all pass, 1 any fail, 2 usage or template error.',
    );
  withJsonOption(designCmd);
  withProjectOption(designCmd);
  designCmd.action(async (files: string[], opts: ValidateDesignOpts) => {
    try {
      await validateDesignAction(files, opts);
    } catch (err) {
      handleError(err, 2);
    }
  });
}
