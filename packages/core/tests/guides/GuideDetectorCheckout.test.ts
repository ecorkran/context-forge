import { describe, it, expect } from 'vitest';
import { GuideDetector } from '../../src/guides/GuideDetector.js';
import {
  cloned,
  initialized,
  outOfSync,
  gitAvailable,
  submoduleStatus,
  type SubmoduleFixture,
} from './helpers/submoduleFixture.js';

// Real git repositories, not mocks: the #80 condition (gitlink present,
// working directory empty) cannot be reproduced with a mocked filesystem.
const maybe = gitAvailable() ? describe : describe.skip;

maybe('GuideDetector.detect() checkout state against real repositories', () => {
  const detector = new GuideDetector();

  async function withFixture(
    make: () => SubmoduleFixture,
    assertion: (fx: SubmoduleFixture) => Promise<void>
  ): Promise<void> {
    const fx = make();
    try {
      await assertion(fx);
    } finally {
      fx.cleanup();
    }
  }

  it('reports not_initialized for a clone without --recurse-submodules (#80)', async () => {
    await withFixture(cloned, async (fx) => {
      const info = await detector.detect(fx.hostPath);

      expect(info.installed).toBe(true);
      expect(info.method).toBe('submodule');
      expect(info.checkout).toBe('not_initialized');
    });
  });

  it('reports in_sync once the submodule is checked out', async () => {
    await withFixture(initialized, async (fx) => {
      const info = await detector.detect(fx.hostPath);

      expect(info.method).toBe('submodule');
      expect(info.checkout).toBe('in_sync');
    });
  });

  it('reports out_of_sync when the checkout is at a different commit', async () => {
    await withFixture(outOfSync, async (fx) => {
      const info = await detector.detect(fx.hostPath);

      expect(info.method).toBe('submodule');
      expect(info.checkout).toBe('out_of_sync');
    });
  });

  it('leaves the checkout untouched — detect() is read-only (D1)', async () => {
    await withFixture(cloned, async (fx) => {
      const before = submoduleStatus(fx.hostPath);

      await detector.detect(fx.hostPath);

      expect(submoduleStatus(fx.hostPath)).toBe(before);
      // Still uninitialized: no implicit `git submodule update` happened.
      expect(before.startsWith('-')).toBe(true);
    });
  });

  it('does not initialize an out_of_sync checkout either (D2)', async () => {
    await withFixture(outOfSync, async (fx) => {
      const before = submoduleStatus(fx.hostPath);

      await detector.detect(fx.hostPath);

      expect(submoduleStatus(fx.hostPath)).toBe(before);
    });
  });
});
