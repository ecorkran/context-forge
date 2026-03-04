import { Command } from 'commander';

export function registerFutureCommand(program: Command): void {
  program
    .command('future')
    .description('Show consolidated future work across slice plans')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--status <filter>', 'Filter by status: all, pending, completed', 'all')
    .action(async () => {
      console.log('cf future: not yet implemented');
    });
}
