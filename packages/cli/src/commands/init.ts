import * as path from 'node:path';
import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { dim } from '../output/styles.js';
import { strategyHelpText } from './guides.js';
import {
  ensurePersonalConfigGitignored,
  runCommandsStep,
  runGitStep,
  runGuidesStep,
  runIdeStep,
  runRegisterStep,
  type IdeOption,
} from './initSteps.js';

interface InitOptions {
  name?: string;
  lite?: boolean;
  ide?: IdeOption;
  strategy?: string;
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
        const cwd = path.resolve(process.cwd());
        const store = new FileProjectStore();
        const all = await store.getAll();

        runGitStep(cwd);
        const registration = await runRegisterStep(store, all, cwd, opts.name);
        if (registration.kind === 'worktree') return;

        // Ensure the personal config file is gitignored — repo hygiene, so this runs
        // regardless of --lite (unlike guides/commands/IDE setup below).
        ensurePersonalConfigGitignored(cwd);

        if (!opts.lite) {
          await runGuidesStep(cwd, opts.strategy);
          runCommandsStep(opts.ide);
          await runIdeStep(cwd, opts.ide);
        }

        console.log(dim('──────────────────────────────────────'));
        console.log('Your project is ready. Run cf next to see recommended next steps.');
      } catch (err) {
        handleError(err);
      }
    });
}
