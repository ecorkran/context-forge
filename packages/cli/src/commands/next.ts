import { Command } from 'commander';

export function registerNextCommand(program: Command): void {
  program
    .command('next')
    .description('Show recommended next action for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async () => {
      console.log('cf next: not yet implemented');
    });
}
