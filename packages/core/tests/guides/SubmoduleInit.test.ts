import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { SubmoduleStrategy } from '../../src/guides/strategies/SubmoduleStrategy.js';
import { cloned, initialized, gitAvailable, type SubmoduleFixture } from './helpers/submoduleFixture.js';

const maybe = gitAvailable() ? describe : describe.skip;

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  }).trim();
}

maybe('SubmoduleStrategy.init() against real repositories', () => {
  const strategy = new SubmoduleStrategy();

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

  it('populates an uninitialized guide directory and reports the commit', async () => {
    await withFixture(cloned, async (fx) => {
      expect(existsSync(join(fx.guidePath, 'README.md'))).toBe(false);

      const result = await strategy.init(fx.hostPath);

      expect(existsSync(join(fx.guidePath, 'README.md'))).toBe(true);
      expect(result.commit).toBe(git(['rev-parse', '--short', 'HEAD'], fx.guidePath));
    });
  });

  it('leaves the host index clean — no git add, so the branch guard is untouched', async () => {
    await withFixture(cloned, async (fx) => {
      await strategy.init(fx.hostPath);

      expect(git(['status', '--porcelain'], fx.hostPath)).toBe('');
    });
  });

  it('brings the checkout in sync with the pinned commit', async () => {
    await withFixture(cloned, async (fx) => {
      await strategy.init(fx.hostPath);

      // A space prefix means the checkout matches what the host pins.
      const status = execFileSync('git', ['submodule', 'status', 'project-documents/ai-project-guide'], {
        cwd: fx.hostPath,
        encoding: 'utf-8',
      });
      expect(status.startsWith(' ')).toBe(true);
    });
  });

  it('is a no-op on an already-initialized submodule and returns the same commit', async () => {
    await withFixture(initialized, async (fx) => {
      const before = git(['rev-parse', 'HEAD'], fx.guidePath);

      const result = await strategy.init(fx.hostPath);

      expect(git(['rev-parse', 'HEAD'], fx.guidePath)).toBe(before);
      expect(result.commit).toBe(git(['rev-parse', '--short', 'HEAD'], fx.guidePath));
      expect(git(['status', '--porcelain'], fx.hostPath)).toBe('');
    });
  });
});
