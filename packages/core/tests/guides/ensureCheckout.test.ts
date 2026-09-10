import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { GuideManager } from '../../src/guides/GuideManager.js';
import { GUIDE_OFFLINE_REMEDIATION } from '../../src/guides/gitExec.js';
import {
  cloned,
  initialized,
  outOfSync,
  gitAvailable,
  submoduleStatus,
  type SubmoduleFixture,
} from './helpers/submoduleFixture.js';

const maybe = gitAvailable() ? describe : describe.skip;

// A ConfigManager stub: ensureCheckout() only reads guide.source, and these
// fixtures have no remote to consult.
function stubConfig() {
  return {
    get: vi.fn().mockResolvedValue({ value: '', source: 'default' }),
  } as never;
}

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

maybe('GuideManager.ensureCheckout()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes an uninitialized submodule and reports the commit (#80)', async () => {
    await withFixture(cloned, async (fx) => {
      const manager = new GuideManager(fx.hostPath, stubConfig());

      const result = await manager.ensureCheckout();

      expect(result.action).toBe('initialized');
      expect(result.commit).toMatch(/^[0-9a-f]{7,}$/);
      expect(result.message).toContain(result.commit as string);
      // The guide is actually readable now, which is the point of the fix.
      expect(existsSync(join(fx.guidePath, 'README.md'))).toBe(true);
      expect(submoduleStatus(fx.hostPath).startsWith(' ')).toBe(true);
    });
  });

  it('does nothing when the checkout is already in sync', async () => {
    await withFixture(initialized, async (fx) => {
      const manager = new GuideManager(fx.hostPath, stubConfig());
      const before = submoduleStatus(fx.hostPath);

      const result = await manager.ensureCheckout();

      expect(result.action).toBe('none');
      expect(result.message).toBeUndefined();
      expect(submoduleStatus(fx.hostPath)).toBe(before);
    });
  });

  it('warns without changing an out-of-sync checkout (D2)', async () => {
    await withFixture(outOfSync, async (fx) => {
      const manager = new GuideManager(fx.hostPath, stubConfig());
      const before = submoduleStatus(fx.hostPath);

      const result = await manager.ensureCheckout();

      expect(result.action).toBe('warned');
      expect(result.message).toContain('cf guides update');
      expect(result.message).toContain('left unchanged');
      // The user's deliberate checkout survives.
      expect(submoduleStatus(fx.hostPath)).toBe(before);
    });
  });

  it('is a no-op when no guide is installed', async () => {
    await withFixture(cloned, async (fx) => {
      // Point at a directory with no guide at all.
      const manager = new GuideManager(join(fx.hostPath, 'nonexistent'), stubConfig());

      const result = await manager.ensureCheckout();

      expect(result.action).toBe('none');
    });
  });

  it('appends offline remediation when the init fetch fails', async () => {
    await withFixture(cloned, async (fx) => {
      // Break the submodule's remote so the fetch cannot succeed.
      const { execFileSync } = await import('child_process');
      execFileSync('git', ['config', 'submodule.project-documents/ai-project-guide.url', '/nonexistent/guide-repo'], {
        cwd: fx.hostPath,
      });

      const manager = new GuideManager(fx.hostPath, stubConfig());

      await expect(manager.ensureCheckout()).rejects.toThrow(GUIDE_OFFLINE_REMEDIATION);
    });
  });
});

describe('GuideManager.ensureCheckout() for non-submodule installs', () => {
  it('is a no-op for a tarball install', async () => {
    const detect = vi.fn().mockResolvedValue({
      installed: true,
      method: 'tarball',
      checkout: null,
    });
    const manager = new GuideManager('/test/project', stubConfig());
    // Replace the detector with one reporting a tarball install.
    (manager as unknown as { detector: { detect: unknown } }).detector = { detect };

    const result = await manager.ensureCheckout();

    expect(result.action).toBe('none');
  });

  it('is a no-op for a clone install', async () => {
    const detect = vi.fn().mockResolvedValue({
      installed: true,
      method: 'clone',
      checkout: null,
    });
    const manager = new GuideManager('/test/project', stubConfig());
    (manager as unknown as { detector: { detect: unknown } }).detector = { detect };

    const result = await manager.ensureCheckout();

    expect(result.action).toBe('none');
  });
});
