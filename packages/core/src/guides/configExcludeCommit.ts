// Decides whether .context-forge.toml belongs in the guide re-extract commit (slice 931, D3).
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { relative } from 'path';
import { isDeepStrictEqual } from 'util';
import { parse } from 'smol-toml';
import { getProjectConfigPath } from '../config/configPaths.js';
import { gitExec, isGitRepo } from './gitExec.js';

type TomlTable = Record<string, unknown>;

/** Reported when the config file has edits beyond guide.exclude and so stays out of the commit. */
export const CONFIG_LEFT_OUT_NOTICE =
  '.context-forge.toml has other uncommitted changes; it was left out of the guide commit';

export type ConfigCommitDecision =
  | { add: true; relativePath: string }
  | { add: false; notice?: string };

const EXCLUDE_TABLE = 'guide';
const EXCLUDE_KEY = 'exclude';

function asTable(value: unknown): TomlTable {
  return typeof value === 'object' && value !== null ? (value as TomlTable) : {};
}

function excludeValue(config: TomlTable): unknown {
  return asTable(config[EXCLUDE_TABLE])[EXCLUDE_KEY];
}

/** The config with guide.exclude removed, and an emptied [guide] table dropped with it. */
function withoutExclude(config: TomlTable): TomlTable {
  const rest = { ...config };
  const guideKeys = { ...asTable(rest[EXCLUDE_TABLE]) };
  delete rest[EXCLUDE_TABLE];
  delete guideKeys[EXCLUDE_KEY];
  return Object.keys(guideKeys).length > 0 ? { ...rest, [EXCLUDE_TABLE]: guideKeys } : rest;
}

/**
 * Whether the project's .context-forge.toml should join the guide commit
 * after guide.exclude changed. Only when guide.exclude is the file's sole
 * change against HEAD (or, for a file HEAD does not have yet, its only key):
 * anything else the user edited stays out, with a notice, so the commit never
 * sweeps in work that is not ours.
 *
 * The file's state comes from `git status --porcelain`, which answers without
 * failing for an untracked file or a repository with no commits. `git show`
 * runs only for a tracked, modified file, so any failure there is a real one
 * and propagates.
 */
export async function decideConfigCommit(projectPath: string): Promise<ConfigCommitDecision> {
  const configPath = getProjectConfigPath(projectPath);
  const relativePath = relative(projectPath, configPath);
  if (!existsSync(configPath) || !(await isGitRepo(projectPath))) return { add: false };

  const { stdout: status } = await gitExec(['status', '--porcelain', '--', relativePath], projectPath);
  if (status === '') return { add: false };

  const working = parse(await readFile(configPath, 'utf-8')) as TomlTable;
  // '??' is untracked and a leading 'A' is staged-as-new: HEAD has no copy to compare against.
  const notInHead = /^(\?\?|A)/.test(status);
  if (notInHead) {
    const soleKey = excludeValue(working) !== undefined && Object.keys(withoutExclude(working)).length === 0;
    return soleKey ? { add: true, relativePath } : { add: false, notice: CONFIG_LEFT_OUT_NOTICE };
  }

  const { stdout: headText } = await gitExec(['show', `HEAD:./${relativePath}`], projectPath);
  const head = parse(headText) as TomlTable;
  const excludeChanged = !isDeepStrictEqual(excludeValue(working), excludeValue(head));
  const restUnchanged = isDeepStrictEqual(withoutExclude(working), withoutExclude(head));
  return excludeChanged && restUnchanged
    ? { add: true, relativePath }
    : { add: false, notice: CONFIG_LEFT_OUT_NOTICE };
}
