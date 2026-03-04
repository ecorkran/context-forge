import { Command } from 'commander';
import { dim } from '../output/styles.js';

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run consistency checks on project artifacts')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--fix', 'Apply non-destructive corrections (when available)')
    .action(async () => {
      console.log(dim('cf check: Consistency checker not yet available. Depends on slice 166.'));
    });
}
