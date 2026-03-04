import { Command } from 'commander';

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage Context Forge configuration');

  cmd
    .command('list')
    .description('List all configuration keys and values')
    .option('--json', 'Output as JSON')
    .option('--project <path>', 'Include project-level config from this path')
    .action(async () => {
      console.log('cf config list: not yet implemented');
    });

  cmd
    .command('get <key>')
    .description('Get the value of a configuration key')
    .option('--json', 'Output as JSON')
    .option('--project <path>', 'Include project-level config from this path')
    .action(async () => {
      console.log('cf config get: not yet implemented');
    });

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('--project <path>', 'Write to project-level config at this path')
    .action(async () => {
      console.log('cf config set: not yet implemented');
    });
}
