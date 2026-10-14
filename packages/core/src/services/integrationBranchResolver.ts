import { ConfigManager } from '../config/ConfigManager.js';
import type { IntegrationBranchResolver } from './ContextIntegrator.js';

/**
 * Reads git.integration_branch for one checkout. The key is stored per checkout
 * directory, so each worktree resolves its own value. Returns '' when unset;
 * a failing config read propagates rather than silently targeting main.
 */
export const resolveIntegrationBranchForPrompt: IntegrationBranchResolver = async (checkoutPath) => {
  const { value } = await new ConfigManager(checkoutPath).get('git.integration_branch');
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string') {
    throw new Error(`git.integration_branch must be a string, got ${typeof value}`);
  }
  return value;
};
