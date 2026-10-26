import * as path from 'node:path';
import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { dim } from '../output/styles.js';
import { strategyHelpText } from './guides.js';
import {
  HUMAN_OUTPUT,
  anyStepFailed,
  runGitStep,
  runGitignoreStep,
  runRegisterStep,
  runSetupSteps,
  type SetupOptions,
} from './initSteps.js';

interface InitOptions extends SetupOptions {
  name?: string;
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a Context Forge project in the current directory')
    .option('--name <name>', 'Project name (defaults to directory basename)')
    .option('--lite', 'Create project entry only, skip guides/commands/IDE setup')
    .option('--ide <target>', 'IDE target: claude, copilot, cursor, agents (aliases: openai, codex) (default: claude)')
    .option('--no-ide', 'Skip IDE configuration step')
    .option('--strategy <method>', strategyHelpText())
    .action(async (opts: InitOptions) => {
      try {
        const out = HUMAN_OUTPUT;
        const cwd = path.resolve(process.cwd());
        const store = new FileProjectStore();
        const all = await store.getAll();

        const git = runGitStep(cwd, out);
        const registration = await runRegisterStep(store, all, cwd, opts.name, out);
        if (registration.kind === 'worktree') return;

        const steps = [git, registration.result, runGitignoreStep(cwd), ...(await runSetupSteps(cwd, opts, out))];

        console.log(dim('──────────────────────────────────────'));
        console.log('Your project is ready. Run cf next to see recommended next steps.');
        // A failed step still prints its warning above; the exit code now reports it too (D8).
        if (anyStepFailed(steps)) process.exitCode = 1;
      } catch (err) {
        handleError(err);
      }
    });
}
