import * as path from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, INIT_REPORT_VERSION, serializeErrorEnvelope } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { withJsonOption } from '../options.js';
import { dim } from '../output/styles.js';
import { strategyHelpText } from './guides.js';
import { buildInitReport } from './initReport.js';
import {
  HUMAN_OUTPUT,
  JSON_OUTPUT,
  WORKTREE_REFUSAL,
  anyStepFailed,
  runGitStep,
  runGitignoreStep,
  runRegisterStep,
  runSetupSteps,
  type SetupOptions,
} from './initSteps.js';

interface InitOptions extends SetupOptions {
  name?: string;
  json?: boolean;
}

/** An error envelope on stdout and exit 1 (D8). Never `handleError` in JSON mode: it writes another shape to stderr. */
function writeJsonFailure(code: 'worktree-of-registered-project' | 'internal', message: string): void {
  process.stdout.write(serializeErrorEnvelope(INIT_REPORT_VERSION, code, message) + '\n');
  process.exitCode = 1;
}

export function registerInitCommand(program: Command): void {
  const initCmd = program
    .command('init')
    .description('Initialize a Context Forge project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory basename)')
    .option('--lite', 'Create project entry only, skip guides/commands/IDE setup')
    .option('--ide <target>', 'IDE target: claude, copilot, cursor, agents (aliases: openai, codex) (default: claude)')
    .option('--no-ide', 'Skip IDE configuration step')
    .option('--strategy <method>', strategyHelpText());
  withJsonOption(initCmd);
  initCmd.action(async (opts: InitOptions) => {
    // With --json, stdout carries only the report: every progress line goes to stderr.
    const out = opts.json ? JSON_OUTPUT : HUMAN_OUTPUT;
    try {
      const cwd = path.resolve(process.cwd());
      const store = new FileProjectStore();
      const all = await store.getAll();

      const git = runGitStep(cwd, out);
      const registration = await runRegisterStep(store, all, cwd, opts.name, out);
      if (registration.kind === 'worktree') {
        if (opts.json) writeJsonFailure('worktree-of-registered-project', WORKTREE_REFUSAL);
        return;
      }

      const steps = [git, registration.result, runGitignoreStep(cwd), ...(await runSetupSteps(cwd, opts, out))];
      const notices: string[] = [];

      // The one place the result is written: later additions go into `steps` and `notices` above.
      if (opts.json) {
        const report = buildInitReport({
          project: registration.project,
          projectPath: cwd,
          registration: registration.registration,
          steps,
          notices,
        });
        process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      } else {
        out.log(dim('──────────────────────────────────────'));
        out.log('Your project is ready. Run cf next to see recommended next steps.');
      }
      // A failed step still prints its warning above; the exit code now reports it too (D8).
      if (anyStepFailed(steps)) process.exitCode = 1;
    } catch (err) {
      if (opts.json) {
        writeJsonFailure('internal', err instanceof Error ? err.message : String(err));
        return;
      }
      handleError(err);
    }
  });
}
