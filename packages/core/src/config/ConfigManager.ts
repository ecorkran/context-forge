import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { parse, stringify } from 'smol-toml';
import { CONFIG_KEYS, type ConfigKeyDefinition } from './ConfigKeys.js';
import { getUserConfigPath, getProjectConfigPath, getProjectPersonalConfigPath } from './configPaths.js';

export interface ConfigResult {
  key: string;
  value: string | boolean | number;
  source: 'project-personal' | 'project' | 'user' | 'default';
  description: string;
}

export interface ConfigListEntry extends ConfigResult {
  type: 'string' | 'boolean' | 'number';
  defaultValue: string | boolean | number;
}

type TomlObject = Record<string, unknown>;

async function readToml(filePath: string): Promise<TomlObject> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parse(content) as TomlObject;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw err;
  }
}

async function writeToml(filePath: string, data: TomlObject): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, stringify(data as Parameters<typeof stringify>[0]), 'utf-8');
}

function resolveKey(obj: TomlObject, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as TomlObject)[part];
  }
  return current;
}

function setKey(obj: TomlObject, key: string, value: unknown): void {
  const parts = key.split('.');
  let current: TomlObject = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as TomlObject;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Removes the leaf key at the dotted path, then prunes any now-empty parent
 * tables left behind so `stringify` doesn't emit a dangling `[section]`
 * header. No-op if the key or an intermediate table doesn't exist.
 */
function deleteKey(obj: TomlObject, key: string): void {
  const parts = key.split('.');
  const chain: TomlObject[] = [obj];
  let current: TomlObject = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      return;
    }
    current = current[part] as TomlObject;
    chain.push(current);
  }
  const leaf = parts[parts.length - 1];
  if (!(leaf in current)) return;
  delete current[leaf];

  // Walk back up, pruning any table left empty by the deletion above.
  for (let i = chain.length - 1; i > 0; i--) {
    const table = chain[i];
    if (Object.keys(table).length > 0) break;
    const parent = chain[i - 1];
    delete parent[parts[i - 1]];
  }
}

function validateValue(
  key: string,
  value: string | boolean | number,
  def: ConfigKeyDefinition
): void {
  if (typeof value !== def.type) {
    throw new Error(
      `Config key "${key}" expects type "${def.type}", got "${typeof value}"`
    );
  }
  if (def.enum && typeof value === 'string' && !def.enum.includes(value)) {
    throw new Error(
      `Config key "${key}" must be one of [${def.enum.map((v) => `"${v}"`).join(', ')}], got "${value}"`
    );
  }
  if (def.validate) {
    const error = def.validate(value);
    if (error !== null) {
      throw new Error(`Config key "${key}" validation failed: ${error}`);
    }
  }
}

export class ConfigManager {
  private readonly projectPath: string | undefined;

  constructor(projectPath?: string) {
    this.projectPath = projectPath;
  }

  async get(key: string): Promise<ConfigResult> {
    const def = CONFIG_KEYS[key];
    if (!def) {
      throw new Error(`Unknown config key: "${key}"`);
    }

    // Check project config first (personal file before shared file, for personal-scope keys)
    if (this.projectPath) {
      if (def.scope === 'personal') {
        const personalConfig = await readToml(getProjectPersonalConfigPath(this.projectPath));
        const personalValue = resolveKey(personalConfig, key);
        if (personalValue !== undefined) {
          return {
            key,
            value: personalValue as string | boolean | number,
            source: 'project-personal',
            description: def.description,
          };
        }
      }

      // Shared project file — normal case for shared keys, and the pre-migration
      // fallback for a personal key that still lives in the shared file.
      const projectConfig = await readToml(getProjectConfigPath(this.projectPath));
      const projectValue = resolveKey(projectConfig, key);
      if (projectValue !== undefined) {
        return {
          key,
          value: projectValue as string | boolean | number,
          source: 'project',
          description: def.description,
        };
      }
    }

    // Then user config
    const userConfig = await readToml(getUserConfigPath());
    const userValue = resolveKey(userConfig, key);
    if (userValue !== undefined) {
      return {
        key,
        value: userValue as string | boolean | number,
        source: 'user',
        description: def.description,
      };
    }

    // Fall back to built-in default
    return {
      key,
      value: def.default,
      source: 'default',
      description: def.description,
    };
  }

  async set(
    key: string,
    value: string | boolean | number,
    scope: 'user' | 'project'
  ): Promise<void> {
    const def = CONFIG_KEYS[key];
    if (!def) {
      throw new Error(`Unknown config key: "${key}"`);
    }
    if (scope === 'project' && !this.projectPath) {
      throw new Error(`Cannot set project-scoped config: no projectPath provided`);
    }

    validateValue(key, value, def);

    const filePath = this.resolveProjectScopeFilePath(def, scope);

    const existing = await readToml(filePath);
    setKey(existing, key, value);
    await writeToml(filePath, existing);
  }

  async delete(key: string, scope: 'user' | 'project'): Promise<void> {
    const def = CONFIG_KEYS[key];
    if (!def) {
      throw new Error(`Unknown config key: "${key}"`);
    }
    if (scope === 'project' && !this.projectPath) {
      throw new Error(`Cannot unset project-scoped config: no projectPath provided`);
    }

    const filePath = this.resolveProjectScopeFilePath(def, scope);

    const existing = await readToml(filePath);
    deleteKey(existing, key);
    await writeToml(filePath, existing);
  }

  /**
   * Resolves the physical file for a `set`/`delete` call. `scope: 'user'` always
   * targets the user config file regardless of the key's own classification —
   * only `scope: 'project'` is routed further, to the personal or shared project
   * file based on `def.scope`.
   */
  private resolveProjectScopeFilePath(
    def: ConfigKeyDefinition,
    scope: 'user' | 'project'
  ): string {
    if (scope === 'user') {
      return getUserConfigPath();
    }
    return def.scope === 'personal'
      ? getProjectPersonalConfigPath(this.projectPath!)
      : getProjectConfigPath(this.projectPath!);
  }

  /**
   * Reads a key's raw value directly from each project-scope file, bypassing the
   * fallback-merged result `get()` returns. Used where a caller must distinguish
   * "absent from personal" vs. "present in shared" independently — e.g. the
   * personal-config-in-shared-file consistency check and `cf config migrate-personal`,
   * both of which need to know what each file actually contains, not just the
   * precedence-resolved value.
   */
  async getRawProjectFileValues(
    key: string
  ): Promise<{ personal: string | boolean | number | undefined; shared: string | boolean | number | undefined }> {
    if (!this.projectPath) {
      throw new Error('Cannot read project-scoped config: no projectPath provided');
    }
    const personalConfig = await readToml(getProjectPersonalConfigPath(this.projectPath));
    const sharedConfig = await readToml(getProjectConfigPath(this.projectPath));
    return {
      personal: resolveKey(personalConfig, key) as string | boolean | number | undefined,
      shared: resolveKey(sharedConfig, key) as string | boolean | number | undefined,
    };
  }

  /**
   * Deletes a key from the shared project file specifically, bypassing the
   * scope-based routing `delete()` applies. Needed by `cf config migrate-personal`:
   * that command's whole purpose is to remove a personal-scope key from the
   * *shared* file once it's confirmed safe to do so (identical value already in
   * the personal file, or successfully copied there) — routed `delete()` would
   * send a personal key's deletion to the personal file instead, deleting the
   * very value the migration just confirmed or wrote.
   */
  async deleteFromSharedProjectFile(key: string): Promise<void> {
    if (!this.projectPath) {
      throw new Error('Cannot delete project-scoped config: no projectPath provided');
    }
    const filePath = getProjectConfigPath(this.projectPath);
    const existing = await readToml(filePath);
    deleteKey(existing, key);
    await writeToml(filePath, existing);
  }

  async list(): Promise<ConfigListEntry[]> {
    const results: ConfigListEntry[] = [];
    for (const [key, def] of Object.entries(CONFIG_KEYS)) {
      const result = await this.get(key);
      results.push({
        ...result,
        type: def.type,
        defaultValue: def.default,
      });
    }
    return results;
  }
}
