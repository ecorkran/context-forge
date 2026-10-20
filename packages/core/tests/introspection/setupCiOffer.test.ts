import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, symlinkSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { evaluateSetupCiOffer } from '../../src/introspection/setupCiOffer.js';
import { SETUP_CI_OFFER_ID } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const KEY = 'workflow.setup_ci_offer';
const ENABLED = makeStubConfig({ [KEY]: true });
const MESSAGE_START = 'No CI detected for this project.';

function touch(base: string, relative: string): void {
  const full = join(base, relative);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, '');
}

describe('evaluateSetupCiOffer', () => {
  let parent: string;
  let project: string;

  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'cf-offer-'));
    project = join(parent, 'proj');
    mkdirSync(project);
    touch(project, 'package.json');
  });

  afterEach(() => {
    chmodSync(parent, 0o755);
    rmSync(parent, { recursive: true, force: true });
  });

  it('offers setup-ci when all conditions are met', async () => {
    const result = await evaluateSetupCiOffer(project, ENABLED);
    expect(result.warning).toBeNull();
    expect(result.offer?.id).toBe(SETUP_CI_OFFER_ID);
    expect(result.offer?.message).toContain(MESSAGE_START);
  });

  it('makes no offer when the key is false', async () => {
    const result = await evaluateSetupCiOffer(project, makeStubConfig({ [KEY]: false }));
    expect(result).toEqual({ offer: null, warning: null });
  });

  it('makes no offer without a build manifest', async () => {
    rmSync(join(project, 'package.json'));
    expect(await evaluateSetupCiOffer(project, ENABLED)).toEqual({ offer: null, warning: null });
  });

  it('makes no offer when CI is recognized', async () => {
    touch(project, '.github/workflows/ci.yml');
    expect(await evaluateSetupCiOffer(project, ENABLED)).toEqual({ offer: null, warning: null });
  });

  it.each(['.claude/skills/release/SKILL.md', '.agents/skills/release/SKILL.md'])(
    'makes no offer when %s exists',
    async (relative) => {
      touch(project, relative);
      expect(await evaluateSetupCiOffer(project, ENABLED)).toEqual({ offer: null, warning: null });
    }
  );

  it('rejects a non-boolean config value', async () => {
    await expect(evaluateSetupCiOffer(project, makeStubConfig({ [KEY]: 'yes' }))).rejects.toThrow(KEY);
  });

  describe('filesystem failures become a warning, never a throw', () => {
    it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
      'unreadable ancestor of projectPath',
      async () => {
        chmodSync(parent, 0o000);
        const result = await evaluateSetupCiOffer(project, ENABLED);
        expect(result.offer).toBeNull();
        expect(result.warning).toContain(parent);
      }
    );

    it('.github/workflows as a regular file (ENOTDIR)', async () => {
      touch(project, '.github/workflows');
      const result = await evaluateSetupCiOffer(project, ENABLED);
      expect(result.offer).toBeNull();
      expect(result.warning).toContain(join(project, '.github', 'workflows'));
    });

    it('package.json as a broken symlink', async () => {
      rmSync(join(project, 'package.json'));
      symlinkSync(join(project, 'nowhere'), join(project, 'package.json'));
      const result = await evaluateSetupCiOffer(project, ENABLED);
      expect(result.offer).toBeNull();
      expect(result.warning).toContain(join(project, 'package.json'));
    });

    it('.git as a self-referencing symlink (ELOOP)', async () => {
      symlinkSync('.git', join(project, '.git'));
      const result = await evaluateSetupCiOffer(project, ENABLED);
      expect(result.offer).toBeNull();
      expect(result.warning).toContain(join(project, '.git'));
    });
  });
});
