import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { resolveIntegrationBranchForPrompt } from '../../src/services/integrationBranchResolver.js';

describe('resolveIntegrationBranchForPrompt (#70)', () => {
  it('returns an empty string when git.integration_branch is unset', async () => {
    const checkout = mkdtempSync(join(tmpdir(), 'cf-ib-unset-'));
    expect(await resolveIntegrationBranchForPrompt(checkout)).toBe('');
  });

  it('resolves each checkout directory independently', async () => {
    const primary = mkdtempSync(join(tmpdir(), 'cf-ib-primary-'));
    const worktree = mkdtempSync(join(tmpdir(), 'cf-ib-worktree-'));
    await new ConfigManager(primary).set('git.integration_branch', 'dev/erik', 'project');
    await new ConfigManager(worktree).set('git.integration_branch', 'dev/erik/wt', 'project');

    expect(await resolveIntegrationBranchForPrompt(primary)).toBe('dev/erik');
    expect(await resolveIntegrationBranchForPrompt(worktree)).toBe('dev/erik/wt');
  });
});
