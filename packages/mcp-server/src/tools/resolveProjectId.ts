import { FileProjectStore } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';

/** Project IDs start with the "project_" prefix */
const PROJECT_ID_RE = /^project_/;

/**
 * Match CWD against registered project paths and worktree paths.
 * Returns the best match (longest path wins; worktree over project root on tie).
 */
function findProjectByCwd(projects: ProjectData[]): string | null {
  const cwd = process.cwd();

  interface Candidate { id: string; path: string; isWorktree: boolean }
  const candidates: Candidate[] = [];

  for (const p of projects) {
    if (p.projectPath) {
      candidates.push({ id: p.id, path: p.projectPath, isWorktree: false });
    }
    for (const wt of p.worktrees ?? []) {
      if (wt.worktreePath) {
        candidates.push({ id: p.id, path: wt.worktreePath, isWorktree: true });
      }
    }
  }

  const matches = candidates
    .filter((c) => {
      const path = c.path.endsWith('/') ? c.path.slice(0, -1) : c.path;
      return cwd === path || cwd.startsWith(path + '/');
    })
    .sort((a, b) => {
      const lenDiff = b.path.length - a.path.length;
      if (lenDiff !== 0) return lenDiff;
      if (a.isWorktree && !b.isWorktree) return -1;
      if (!a.isWorktree && b.isWorktree) return 1;
      return 0;
    });

  return matches.length > 0 ? matches[0].id : null;
}

/**
 * Resolves the project ID to use for an MCP tool call.
 * Accepts a project ID, name (case-insensitive), or omit to resolve from CWD.
 *
 * Priority:
 * 1. If value looks like an auto-generated ID, return it directly (no store lookup)
 * 2. Otherwise, search by ID then by name
 * 3. If no explicit ID, resolve from CWD (match against registered project/worktree paths)
 * 4. Throws a descriptive error with usage guidance
 *
 * @param explicitId - projectId or project name from MCP tool arguments (may be undefined)
 */
export async function resolveProjectId(
  explicitId?: string,
): Promise<string> {
  // Fast path: project IDs pass through without store lookup
  if (explicitId && PROJECT_ID_RE.test(explicitId)) {
    return explicitId;
  }

  // Need to consult the store for name lookup or CWD resolution
  let projects: ProjectData[];
  try {
    const store = new FileProjectStore();
    projects = await store.getAll();
  } catch {
    throw new Error(
      'No project ID provided and project store is unavailable.\n' +
        '  Use project_list to see available projects.\n' +
        '  Use project_create to register a new project.',
    );
  }

  if (explicitId) {
    // Try exact ID match first (for non-standard IDs)
    const byId = projects.find((p) => p.id === explicitId);
    if (byId) return byId.id;

    // Try case-insensitive name match
    const lower = explicitId.toLowerCase();
    const byName = projects.find((p) => p.name?.toLowerCase() === lower);
    if (byName) return byName.id;

    throw new Error(
      `Project not found: '${explicitId}'. Use the project_list tool to see available projects.`,
    );
  }

  // No explicit ID — resolve from CWD
  const cwdMatch = findProjectByCwd(projects);
  if (cwdMatch) return cwdMatch;

  throw new Error(
    'No project ID provided. Pass a projectId argument (ID or name).\n' +
      '  Use project_list to see available projects.\n' +
      '  Use project_create to register a new project.',
  );
}
