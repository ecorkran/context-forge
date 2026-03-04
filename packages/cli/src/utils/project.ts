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

export type ResolutionSource = 'flag' | 'cwd' | 'default' | 'none';

export interface ResolvedProject {
  id: string;
  source: ResolutionSource;
}

/**
 * Resolves which project to use via a three-step chain:
 *
 * 1. explicit --project flag → findByNameOrId
 * 2. CWD detection → findProjectByCwd
 * 3. default_project config → findByNameOrId
 * 4. Throw UserError with guidance
 */
export async function resolveProjectId(
  explicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProject> {
  // Step 1: explicit --project flag
  if (explicit) {
    const project = await findByNameOrId(explicit, store);
    if (!project) {
      throw new UserError(
        `Project '${explicit}' not found.\n` +
          '  Check the spelling, or run cf project list to see available projects.',
      );
    }
    return { id: project.id, source: 'flag' };
  }

  // Step 2: CWD detection
  const cwdProject = await findProjectByCwd(store);
  if (cwdProject) {
    return { id: cwdProject.id, source: 'cwd' };
  }

  // Step 3: default_project config
  const cm = new ConfigManager();
  const result = await cm.get('default_project');
  const defaultRef = result.value as string;

  if (defaultRef) {
    const project = await findByNameOrId(defaultRef, store);
    if (!project) {
      throw new UserError(
        `default_project is set to '${defaultRef}' but no matching project was found.\n` +
          '  cf project list                        # see available projects\n' +
          '  cf config set default_project <name>   # update the default',
      );
    }
    return { id: project.id, source: 'default' };
  }

  // Step 4: no resolution
  throw new UserError(
    'No project specified and no registered project found at current path.\n' +
      '  Use --project <name> to specify a project, or\n' +
      '  cf config set default_project <name>   # set a default\n' +
      '  cf project list                        # see available projects',
  );
}
