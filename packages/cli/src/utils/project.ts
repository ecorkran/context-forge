import { ConfigManager } from '@context-forge/core/node';
import { UserError } from './errors.js';

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
