import { describe, it, expect } from 'vitest';
import { cloned, initialized, outOfSync, gitAvailable, submoduleStatus } from './submoduleFixture.js';

const maybe = gitAvailable() ? describe : describe.skip;

maybe('submodule fixture states', () => {
  it('cloned() leaves the submodule uninitialized (status prefix "-")', () => {
    const fx = cloned();
    try {
      expect(submoduleStatus(fx.hostPath).startsWith('-')).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it('initialized() checks out the pinned commit (status prefix " ")', () => {
    const fx = initialized();
    try {
      expect(submoduleStatus(fx.hostPath).startsWith(' ')).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it('outOfSync() checks out a different commit (status prefix "+")', () => {
    const fx = outOfSync();
    try {
      expect(submoduleStatus(fx.hostPath).startsWith('+')).toBe(true);
    } finally {
      fx.cleanup();
    }
  });

  it('cleanup removes the fixture directory tree', async () => {
    const { existsSync } = await import('fs');
    const fx = cloned();
    expect(existsSync(fx.hostPath)).toBe(true);
    fx.cleanup();
    expect(existsSync(fx.hostPath)).toBe(false);
  });
});
