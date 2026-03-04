import { Command } from 'commander';

export function registerProjectCommand(program: Command): void {
  const cmd = program
    .command('project')
    .description('Manage Context Forge projects');

  cmd
    .command('list')
    .description('List all projects')
    .option('--json', 'Output as JSON')
    .action(async () => {
      console.log('cf project list: not yet implemented');
    });

  cmd
    .command('get')
    .description('Get details for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async () => {
      console.log('cf project get: not yet implemented');
    });

  cmd
    .command('set <field> <value>')
    .description('Update a field on the active project')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async () => {
      console.log('cf project set: not yet implemented');
    });
}
