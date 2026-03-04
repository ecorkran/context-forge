import { ConfigManager, FileProjectStore } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { UserError } from './errors.js';

/**
 * Find a project by exact ID or case-insensitive name.
 * ID match takes priority over name match.
 */
export async function findByNameOrId(
  nameOrId: string,
  store: FileProjectStore,
): Promise<ProjectData | null> {
  const projects = await store.getAll();

  // Exact ID match first
  const byId = projects.find((p) => p.id === nameOrId);
  if (byId) return byId;

  // Case-insensitive name match
  const lower = nameOrId.toLowerCase();
  const byName = projects.find((p) => p.name?.toLowerCase() === lower);
  return byName ?? null;
}

/**
 * Find the project whose projectPath best matches the current working directory.
 * When multiple projects match (nested paths), the longest projectPath wins.
 * Projects without a projectPath are skipped.
 */
export async function findProjectByCwd(
  store: FileProjectStore,
): Promise<ProjectData | null> {
  const projects = await store.getAll();
  const cwd = process.cwd();

  const matches = projects
    .filter((p) => {
      if (!p.projectPath) return false;
      const path = p.projectPath.endsWith('/') ? p.projectPath.slice(0, -1) : p.projectPath;
      return cwd === path || cwd.startsWith(path + '/');
    })
    .sort((a, b) => (b.projectPath?.length ?? 0) - (a.projectPath?.length ?? 0));

  return matches[0] ?? null;
}

/**
 * Resolves which project ID to use.
 *
 * Priority:
 * 1. explicit — if provided via --project flag, return it
 * 2. default_project config — if configured, return its value
 * 3. Throw UserError with guidance
 */
export async function resolveProjectId(explicit?: string): Promise<string> {
  if (explicit) {
    return explicit;
  }

  const cm = new ConfigManager();
  const result = await cm.get('default_project');
  const defaultId = result.value as string;

  if (defaultId) {
    return defaultId;
  }

  throw new UserError(
    'No project ID specified. Use --project <id> or set a default:\n' +
      '  cf config set default_project <project-id>',
  );
}
