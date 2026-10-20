import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import {
  PERMISSIVENESS_FRAGMENT_DIR,
  PERMISSIVENESS_PHASES,
  resolvePermissivenessForPrompt,
} from '../../src/services/permissivenessResolver.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { getProjectConfigPath } from '../../src/config/configPaths.js';
import { PERMISSIVENESS_LEVELS, STANDARD_PERMISSIVENESS } from '../../src/config/ConfigKeys.js';
import type { PermissivenessLevel } from '../../src/config/ConfigKeys.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import { ARCHITECTURE_PHASE, IMPLEMENTATION_PHASE, PHASE_MAP } from '../../src/schema/projectSchema.js';

const TESTS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURE_FRAGMENTS = join(TESTS_DIR, 'fixtures', 'permissiveness');
const FIXTURE_PROMPT = join(TESTS_DIR, 'fixtures', 'test-project', PROMPT_FILE_RELATIVE_PATH);

// Levels that load a fragment (every level except the one that adds nothing).
const FRAGMENT_LEVELS = PERMISSIVENESS_LEVELS.filter((level) => level !== STANDARD_PERMISSIVENESS);
const [AUTONOMOUS_LEVEL] = FRAGMENT_LEVELS;
const APPLICABLE_PHASES = [...PERMISSIVENESS_PHASES];

function fixtureText(level: PermissivenessLevel): string {
  return readFileSync(join(FIXTURE_FRAGMENTS, `${level}.md`), 'utf-8');
}

describe('resolvePermissivenessForPrompt', () => {
  let root: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-permissiveness-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = join(root, 'user-data');
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    rmSync(root, { recursive: true, force: true });
  });

  interface CheckoutOptions {
    level?: string;
    guide?: boolean;
    fragments?: readonly PermissivenessLevel[];
  }

  /** A temp checkout: optional guide prompt file, fixture fragments, and a configured level. */
  async function makeCheckout(name: string, opts: CheckoutOptions = {}): Promise<string> {
    const { level, guide = true, fragments = FRAGMENT_LEVELS } = opts;
    const checkout = join(root, name);
    mkdirSync(checkout, { recursive: true });
    if (guide) {
      const promptPath = join(checkout, PROMPT_FILE_RELATIVE_PATH);
      mkdirSync(dirname(promptPath), { recursive: true });
      cpSync(FIXTURE_PROMPT, promptPath);
      const fragmentDir = join(dirname(promptPath), PERMISSIVENESS_FRAGMENT_DIR);
      mkdirSync(fragmentDir, { recursive: true });
      for (const fragment of fragments) {
        cpSync(join(FIXTURE_FRAGMENTS, `${fragment}.md`), join(fragmentDir, `${fragment}.md`));
      }
    }
    if (level !== undefined) {
      await new ConfigManager(checkout).set('workflow.permissiveness', level, 'project');
    }
    return checkout;
  }

  function fragmentPath(checkout: string, level: PermissivenessLevel): string {
    return join(dirname(join(checkout, PROMPT_FILE_RELATIVE_PATH)), PERMISSIVENESS_FRAGMENT_DIR, `${level}.md`);
  }

  describe('applicable phases', () => {
    const cases = APPLICABLE_PHASES.flatMap((phase) => FRAGMENT_LEVELS.map((level) => ({ phase, level })));

    it.each(cases)('$level in "$phase" returns the fragment body without frontmatter', async ({ phase, level }) => {
      const checkout = await makeCheckout('proj', { level });
      const body = await resolvePermissivenessForPrompt(checkout, phase);
      expect(body.startsWith(`### Permissiveness: ${level}`)).toBe(true);
      expect(body).not.toContain('---');
      expect(body).not.toContain('name:');
      expect(fixtureText(level)).toContain(body);
    });

    it('returns "" for the key unset, even with no fragment files present', async () => {
      const checkout = await makeCheckout('proj', { fragments: [] });
      for (const phase of APPLICABLE_PHASES) {
        expect(await resolvePermissivenessForPrompt(checkout, phase)).toBe('');
      }
    });

    it('returns "" for the standard level, even with no fragment files present', async () => {
      const checkout = await makeCheckout('proj', { level: STANDARD_PERMISSIVENESS, fragments: [] });
      for (const phase of APPLICABLE_PHASES) {
        expect(await resolvePermissivenessForPrompt(checkout, phase)).toBe('');
      }
    });
  });

  describe('non-applicable instructions', () => {
    // No guide at all: proves the phase check runs before the guide is touched.
    const nonApplicable = [
      ['an architecture phase', ARCHITECTURE_PHASE],
      ['the concept phase', PHASE_MAP['0']],
      ['a custom instruction', 'Review the auth module and list risks'],
      ['the integrator default for an unset instruction', 'implementation'],
    ];

    it.each(nonApplicable)('%s returns "" with no guide installed', async (_label, instruction) => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL, guide: false });
      expect(await resolvePermissivenessForPrompt(checkout, instruction)).toBe('');
    });
  });

  describe('failures (no fallback to standard)', () => {
    it('no guide installed: names the missing prompt file', async () => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL, guide: false });
      await expect(resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE)).rejects.toThrow(
        /No prompt file found/
      );
    });

    it('missing fragment: names the level, the path, and the guides update command', async () => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL, fragments: [] });
      const attempt = resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE);
      await expect(attempt).rejects.toThrow(AUTONOMOUS_LEVEL);
      await expect(attempt).rejects.toThrow(fragmentPath(checkout, AUTONOMOUS_LEVEL));
      await expect(attempt).rejects.toThrow('cf guides update');
    });

    it('unreadable fragment: a directory where the file should be', async () => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL, fragments: [] });
      mkdirSync(fragmentPath(checkout, AUTONOMOUS_LEVEL), { recursive: true });
      await expect(resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE)).rejects.toThrow(
        /could not be read/
      );
    });

    it.each([
      ['empty', ''],
      ['whitespace-only', '  \n\t\n  '],
      ['frontmatter-only', '---\nname: x\ndescription: y\n---\n'],
      ['empty-frontmatter-only', '---\n---\n'],
    ])('%s fragment has no body', async (_label, content) => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL });
      writeFileSync(fragmentPath(checkout, AUTONOMOUS_LEVEL), content);
      await expect(resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE)).rejects.toThrow(
        /has no body/
      );
    });

    it('a hand-edited config value outside the levels fails and lists the levels', async () => {
      const checkout = await makeCheckout('proj');
      const configPath = getProjectConfigPath(checkout);
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '[workflow]\npermissiveness = "bogus"\n');
      const attempt = resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE);
      for (const level of PERMISSIVENESS_LEVELS) {
        await expect(attempt).rejects.toThrow(level);
      }
    });
  });

  describe('frontmatter stripping', () => {
    it('gives the same body for CRLF line endings and padded delimiter lines', async () => {
      const checkout = await makeCheckout('proj', { level: AUTONOMOUS_LEVEL });
      const expected = await resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE);
      const original = fixtureText(AUTONOMOUS_LEVEL);
      const variants = [
        original.replace(/\n/g, '\r\n'),
        original.replace(/^---\n/, '---  \n').replace(/\n---\n/, '\n---\t\n'),
      ];
      for (const variant of variants) {
        writeFileSync(fragmentPath(checkout, AUTONOMOUS_LEVEL), variant);
        expect(await resolvePermissivenessForPrompt(checkout, IMPLEMENTATION_PHASE)).toBe(expected);
      }
    });
  });

  it('resolves per checkout: two worktrees with different levels each get their own fragment', async () => {
    const [first, second] = FRAGMENT_LEVELS;
    const checkoutA = await makeCheckout('worktree-a', { level: first });
    const checkoutB = await makeCheckout('worktree-b', { level: second });
    const a = await resolvePermissivenessForPrompt(checkoutA, IMPLEMENTATION_PHASE);
    const b = await resolvePermissivenessForPrompt(checkoutB, IMPLEMENTATION_PHASE);
    expect(a.startsWith(`### Permissiveness: ${first}`)).toBe(true);
    expect(b.startsWith(`### Permissiveness: ${second}`)).toBe(true);
  });
});
