import { describe, it, expect } from 'vitest';
import { CONFIG_KEYS } from '../../src/config/ConfigKeys.js';

describe('CONFIG_KEYS', () => {
  it('every entry has a valid scope', () => {
    for (const [key, def] of Object.entries(CONFIG_KEYS)) {
      expect(['shared', 'personal'], `${key} has an invalid scope`).toContain(def.scope);
    }
  });

  it('classifies git.integration_branch as personal', () => {
    expect(CONFIG_KEYS['git.integration_branch'].scope).toBe('personal');
  });

  it('classifies guide.source and workflow.review_enabled as shared', () => {
    expect(CONFIG_KEYS['guide.source'].scope).toBe('shared');
    expect(CONFIG_KEYS['workflow.review_enabled'].scope).toBe('shared');
  });
});
