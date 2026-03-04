import { Command } from 'commander';
import { ConfigManager } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success } from '../output/styles.js';

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage Context Forge configuration');

  cmd
    .command('list')
    .description('List all configuration keys and values')
    .option('--json', 'Output as JSON')
    .option('--project <path>', 'Include project-level config from this path')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const cm = new ConfigManager(opts.project);
        const entries = await cm.list();

        if (opts.json) {
          printJson(entries);
          return;
        }

        const rows = entries.map((e) => [
          e.key,
          String(e.value ?? ''),
          e.source,
        ]);
        console.log(renderTable(['Key', 'Value', 'Source'], rows));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get <key>')
    .description('Get the value of a configuration key')
    .option('--json', 'Output as JSON')
    .option('--project <path>', 'Include project-level config from this path')
    .action(async (key: string, opts: { json?: boolean; project?: string }) => {
      try {
        const cm = new ConfigManager(opts.project);
        const result = await cm.get(key);

        if (opts.json) {
          printJson(result);
          return;
        }

        console.log(`${label('Key:')}     ${result.key}`);
        console.log(`${label('Value:')}   ${valueStyle(String(result.value ?? ''))}`);
        console.log(`${label('Source:')}  ${result.source}`);
        if (result.description) {
          console.log(`${label('About:')}   ${result.description}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('set <key> <value>')
    .description('Set a configuration value')
    .option('--project <path>', 'Write to project-level config at this path')
    .action(async (key: string, val: string, opts: { project?: string }) => {
      try {
        const scope = opts.project ? 'project' : 'user';
        const cm = new ConfigManager(opts.project);

        // Coerce booleans and numbers
        let coerced: string | boolean | number = val;
        if (val === 'true') coerced = true;
        else if (val === 'false') coerced = false;
        else if (/^\d+(\.\d+)?$/.test(val)) coerced = Number(val);

        await cm.set(key, coerced, scope);
        console.log(success(`Set ${key} = ${String(coerced)} (${scope})`));
      } catch (err) {
        handleError(err);
      }
    });
}
