import { FileProjectStore } from '@context-forge/core/node';

/** Project IDs start with the "project_" prefix */
const PROJECT_ID_RE = /^project_/;

/**
 * Resolves the project ID to use for an MCP tool call.
 * Accepts a project ID or name (case-insensitive name match).
 *
 * Priority:
 * 1. If value looks like an auto-generated ID, return it directly (no store lookup)
 * 2. Otherwise, search by ID then by name
 * 3. Throws a descriptive error with usage guidance
 *
 * @param explicitId - projectId or project name from MCP tool arguments (may be undefined)
 */
export async function resolveProjectId(
  explicitId?: string,
): Promise<string> {
  if (!explicitId) {
    throw new Error(
      'No project ID provided. Pass a projectId argument (ID or name).\n' +
        '  Use project_list to see available projects.\n' +
        '  Use project_create to register a new project.',
    );
  }

  // Fast path: project IDs pass through without store lookup
  if (PROJECT_ID_RE.test(explicitId)) {
    return explicitId;
  }

  // Name-based lookup: search all projects
  try {
    const store = new FileProjectStore();
    const projects = await store.getAll();

    // Try exact ID match first (for non-standard IDs)
    const byId = projects.find((p) => p.id === explicitId);
    if (byId) return byId.id;

    // Try case-insensitive name match
    const lower = explicitId.toLowerCase();
    const byName = projects.find((p) => p.name?.toLowerCase() === lower);
    if (byName) return byName.id;
  } catch {
    // Store unavailable — fall through to error
  }

  throw new Error(
    `Project not found: '${explicitId}'. Use the project_list tool to see available projects.`,
  );
}
