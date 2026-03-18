/**
 * Resolves the project ID to use for an MCP tool call.
 *
 * Priority:
 * 1. explicitId — if provided, return it immediately
 * 2. Throws a descriptive error with usage guidance
 *
 * @param explicitId - projectId from the MCP tool arguments (may be undefined)
 */
export async function resolveProjectId(
  explicitId?: string,
): Promise<string> {
  if (explicitId) {
    return explicitId;
  }

  throw new Error(
    'No project ID provided. Either pass a projectId argument, or ensure the ' +
      'MCP client is running from a registered project directory.\n' +
      '  Use project_list to see available projects.\n' +
      '  Use project_create to register a new project.'
  );
}
