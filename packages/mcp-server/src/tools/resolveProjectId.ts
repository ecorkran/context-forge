import { ConfigManager } from '@context-forge/core/node';

/**
 * Resolves the project ID to use for an MCP tool call.
 *
 * Priority:
 * 1. explicitId — if provided, return it immediately
 * 2. default_project config key — if configured, return its value
 * 3. Throws a descriptive error with usage guidance
 *
 * @param explicitId - projectId from the MCP tool arguments (may be undefined)
 * @param configProjectPath - optional projectPath for reading project-level config
 */
export async function resolveProjectId(
  explicitId?: string,
  configProjectPath?: string
): Promise<string> {
  if (explicitId) {
    return explicitId;
  }

  const cm = new ConfigManager(configProjectPath);
  const result = await cm.get('default_project');
  const defaultId = result.value as string;

  if (defaultId) {
    return defaultId;
  }

  throw new Error(
    'No project ID provided and no default_project configured. ' +
      'Either pass a projectId argument or set a default with: config_set key="default_project" value="<id>" scope="user"'
  );
}
