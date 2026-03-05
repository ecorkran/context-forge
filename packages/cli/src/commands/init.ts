import * as path from 'node:path';
import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { success, warn } from '../output/styles.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Register the current directory as a Context Forge project')
    .option('--name <name>', 'Project name (defaults to directory basename)')
    .action(async (opts: { name?: string }) => {
      try {
        const cwd = path.resolve(process.cwd());
        const store = new FileProjectStore();
        const all = await store.getAll();

        // Check if a project with this path already exists
        const existing = all.find((p) => p.projectPath === cwd);
        if (existing) {
          console.log(warn(`Project '${existing.name}' is already registered at this path.`));
          return;
        }

        const projectName = opts.name || path.basename(cwd);

        await store.create({
          name: projectName,
          projectPath: cwd,
          template: 'default',
          fileSlice: '',
          instruction: 'implementation',
        });

        console.log(success(`Initialized project '${projectName}' at ${cwd}`));
      } catch (err) {
        handleError(err);
      }
    });
}
