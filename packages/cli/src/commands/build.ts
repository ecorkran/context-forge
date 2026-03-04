import { Command } from 'commander';

export function registerBuildCommand(program: Command): void {
  program
    .command('build')
    .description('Generate and output a context prompt to stdout')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--phase <phase>', 'Override development phase')
    .option('--slice <slice>', 'Override slice name')
    .option('--instruction <instruction>', 'Override instruction type')
    .option('--tasks <tasks>', 'Override task file name')
    .option('--additional <text>', 'Additional instructions to append')
    .action(async () => {
      console.log('cf build: not yet implemented');
    });
}
