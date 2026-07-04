import { Command } from 'commander';
import { existsSync, statSync } from 'node:fs';
import { ConfigManager, FileProjectStore } from '@context-forge/core/node';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { withJsonOption, withProjectOption } from '../options.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success } from '../output/styles.js';

/**
 * Resolves --project to the project's actual projectPath, so ConfigManager reads/writes
 * the real .context-forge.toml at the project root rather than treating a bare registered
 * project name as a literal directory (the bug this fixes). Tries registry resolution
 * (name/id, then CWD) first; if that fails and the value is itself an existing directory,
 * falls back to using it directly — config is the one CLI surface that supports pointing
 * at an unregistered scratch directory, unlike next/status which require a full ProjectData.
 * Returns undefined (user-scope config) when no project can be resolved and none was requested.
 */
async function resolveConfigProjectPath(project?: string): Promise<string | undefined> {
  try {
    const store = new FileProjectStore();
    const { id, worktreeId } = await resolveProjectWorktree({ project }, store);
    const resolved = await resolveProject(store, id, worktreeId);
    if (resolved?.projectPath) return resolved.projectPath;
  } catch (err) {
    // resolveProjectWorktree throws UserError when no project matches — expected when
    // --project is a raw directory rather than a registered name; fall through to the
    // raw-path fallback below. Any other error (e.g. a corrupt project store) propagates.
    if (!(err instanceof UserError)) throw err;
  }
  if (project && existsSync(project) && statSync(project).isDirectory()) {
    return project;
  }
  if (project) {
    throw new Error(`Project '${project}' not found and is not an existing directory.`);
  }
  return undefined;
}

export function registerConfigCommand(program: Command): void {
  const cmd = program
    .command('config')
    .description('Manage Context Forge configuration (get, set)');

  const getCmd = cmd.command('get [key]').description('Get a configuration key, or show all keys if none specified');
  withJsonOption(getCmd);
  withProjectOption(getCmd);
  getCmd.action(async (key: string | undefined, opts: { json?: boolean; project?: string }) => {
      try {
        const projectPath = await resolveConfigProjectPath(opts.project);
        const cm = new ConfigManager(projectPath);

        if (!key) {
          // No key — show all config keys
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

  const setCmd = cmd.command('set <key> <value>').description('Set a configuration value');
  withProjectOption(setCmd);
  setCmd.action(async (key: string, val: string, opts: { project?: string }) => {
      try {
        const scope = opts.project ? 'project' : 'user';
        const projectPath = await resolveConfigProjectPath(opts.project);
        const cm = new ConfigManager(projectPath);

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
