import { Command } from 'commander';

export function registerPromptCommand(program: Command): void {
  const cmd = program
    .command('prompt')
    .description('Access prompt templates with variable substitution');

  cmd
    .command('list')
    .description('List available prompt templates')
    .option('--json', 'Output as JSON')
    .action(async () => {
      console.log('cf prompt list: not yet implemented');
    });

  cmd
    .command('get <phase>')
    .description('Get a prompt template with project variables substituted')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--raw', 'Output raw template without variable substitution')
    .action(async () => {
      console.log('cf prompt get: not yet implemented');
    });
}
