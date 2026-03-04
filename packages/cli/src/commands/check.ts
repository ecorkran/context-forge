import { Command } from 'commander';

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run consistency checks on project artifacts')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--fix', 'Apply non-destructive corrections (when available)')
    .action(async () => {
      console.log('cf check: not yet implemented');
    });
}
