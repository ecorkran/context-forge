import { Command } from 'commander';
import { ConfigManager } from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success } from '../output/styles.js';

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

        // Aligned text output matching orchestration style
        const maxKey = Math.max(...entries.map((e) => e.key.length));
        const maxVal = Math.max(...entries.map((e) => String(e.value ?? '').length), 5);
        for (const e of entries) {
          const val = String(e.value ?? '');
          console.log(`  ${e.key.padEnd(maxKey)}  ${valueStyle(val.padEnd(maxVal))}  ${dim(e.source)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get [key]')
    .description('Get a configuration key, or list all keys if none specified')
    .option('--json', 'Output as JSON')
    .option('--project <path>', 'Include project-level config from this path')
    .action(async (key: string | undefined, opts: { json?: boolean; project?: string }) => {
      try {
        const cm = new ConfigManager(opts.project);

        if (!key) {
          // No key — list all (same as cf config list)
          const entries = await cm.list();
          if (opts.json) {
            printJson(entries);
            return;
          }
          const maxKey = Math.max(...entries.map((e) => e.key.length));
          const maxVal = Math.max(...entries.map((e) => String(e.value ?? '').length), 5);
          for (const e of entries) {
            const val = String(e.value ?? '');
            console.log(`  ${e.key.padEnd(maxKey)}  ${valueStyle(val.padEnd(maxVal))}  ${dim(e.source)}`);
          }
          return;
        }

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
