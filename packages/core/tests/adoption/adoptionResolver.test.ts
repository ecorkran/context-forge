import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { createAdoptionResolver } from '../../src/adoption/adoptionResolver.js';
import { AdoptionError, BROWNFIELD_ADOPTION_INSTRUCTION } from '../../src/adoption/contracts.js';
import { readAdoptionState, writeAdoptionState } from '../../src/adoption/adoptionState.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import * as sourceVolume from '../../src/detection/sourceVolume.js';

vi.mock('../../src/detection/sourceVolume.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/detection/sourceVolume.js')>();
  return { ...actual, measureSourceVolume: vi.fn(actual.measureSourceVolume) };
});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const BROWNFIELD_GUIDE = join(FIXTURES, 'brownfield-guide', PROMPT_FILE_RELATIVE_PATH);
const PLAIN_GUIDE = join(FIXTURES, 'test-project', PROMPT_FILE_RELATIVE_PATH);
const CONCEPT = 'Phase 0: Concept';
const NOTICE = 'adoption.state was set to in_progress by this build';
const canChmod = process.platform !== 'win32' && !(typeof process.getuid === 'function' && process.getuid() === 0);

describe('createAdoptionResolver', () => {
  let dataDir: string;
  let project: string;
  let originalEnv: string | undefined;
  const persist = () => createAdoptionResolver({ stateWrites: 'persist' });
  const resolve = (instruction: string, resolver = persist()) => resolver(project, project, instruction);

  async function installGuide(source: string): Promise<void> {
    const target = join(project, PROMPT_FILE_RELATIVE_PATH);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
  }

  async function writeSource(lineCount: number): Promise<void> {
    await mkdir(join(project, 'src'), { recursive: true });
    const body = Array.from({ length: lineCount }, (_, i) => `export const v${i} = ${i};`).join('\n');
    await writeFile(join(project, 'src', 'big.ts'), body);
  }

  async function writePlan(): Promise<void> {
    const dir = join(project, 'project-documents/user/architecture');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, '100-arch.x.md'), '# arch');
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-resolver-data-'));
    project = await mkdtemp(join(tmpdir(), 'cf-resolver-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
    vi.mocked(sourceVolume.measureSourceVolume).mockClear();
    await installGuide(BROWNFIELD_GUIDE);
  });

  afterEach(async () => {
    if (originalEnv === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
    else process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    await rm(dataDir, { recursive: true, force: true });
    await rm(project, { recursive: true, force: true });
  });

  describe('selection (D4)', () => {
    it('does nothing and touches no filesystem for Phase 2', async () => {
      const result = await createAdoptionResolver({ stateWrites: 'persist' })(
        '/no/such/project',
        '/no/such/checkout',
        'Phase 2: Architecture',
      );
      expect(result).toEqual({ selected: false });
    });

    it('concept + empty repo → not selected, state unchanged', async () => {
      expect(await resolve(CONCEPT)).toEqual({ selected: false });
      expect(await readAdoptionState(project)).toBe('');
    });

    it('concept + 2000 lines → selected, state in_progress, notice in facts', async () => {
      await writeSource(2000);
      const result = await resolve(CONCEPT);
      expect(result).toMatchObject({ selected: true, instruction: BROWNFIELD_ADOPTION_INSTRUCTION });
      if (result.selected) expect(result.facts).toContain(NOTICE);
      expect(await readAdoptionState(project)).toBe('in_progress');
    });

    it('concept + in_progress + plan present → selected, no write, no notice', async () => {
      await writeAdoptionState(project, 'in_progress');
      await writePlan();
      const before = await readFile(join(project, '.context-forge.toml'), 'utf-8');
      const result = await resolve(CONCEPT);
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.facts).not.toContain(NOTICE);
      expect(await readFile(join(project, '.context-forge.toml'), 'utf-8')).toBe(before);
    });

    it('concept + declined + 5000 lines → not selected', async () => {
      await writeAdoptionState(project, 'declined');
      await writeSource(5000);
      expect(await resolve(CONCEPT)).toEqual({ selected: false });
    });

    it('concept + planned + 5000 lines → not selected and the walk never runs', async () => {
      await writePlan();
      await writeSource(5000);
      expect(await resolve(CONCEPT)).toEqual({ selected: false });
      expect(sourceVolume.measureSourceVolume).not.toHaveBeenCalled();
    });

    it('explicit brownfield-adoption on an empty repo → selected, not evaluated, state untouched, no walk', async () => {
      const result = await resolve(BROWNFIELD_ADOPTION_INSTRUCTION);
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.facts).toContain('not evaluated');
      expect(await readAdoptionState(project)).toBe('');
      expect(sourceVolume.measureSourceVolume).not.toHaveBeenCalled();
    });

    it('read-only + brownfield → selected, state still unset, no notice', async () => {
      await writeSource(2000);
      const result = await resolve(CONCEPT, createAdoptionResolver({ stateWrites: 'read-only' }));
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.facts).not.toContain(NOTICE);
      expect(await readAdoptionState(project)).toBe('');
    });
  });

  it('a facts probe failure leaves the state unwritten', async () => {
    await writeSource(2000);
    // A regular file named docs makes the docs/adr probe fail with ENOTDIR.
    await writeFile(join(project, 'docs'), 'not a directory');
    await expect(resolve(CONCEPT)).rejects.toThrow(/ENOTDIR/);
    expect(await readAdoptionState(project)).toBe('');
  });

  describe('guide check (D9)', () => {
    it('rejects a guide without the profile, before writing', async () => {
      await installGuide(PLAIN_GUIDE);
      await writeSource(2000);
      const attempt = resolve(CONCEPT);
      await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
      await expect(attempt).rejects.toThrow(/brownfield-adoption profile/);
      expect(await readAdoptionState(project)).toBe('');
    });

    it('rejects a guide with the profile but no prompt', async () => {
      const text = await readFile(BROWNFIELD_GUIDE, 'utf-8');
      const withoutPrompt = text.slice(0, text.indexOf('##### Brownfield Adoption'));
      await writeFile(join(project, PROMPT_FILE_RELATIVE_PATH), withoutPrompt);
      await writeSource(2000);
      const attempt = resolve(CONCEPT);
      await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
      await expect(attempt).rejects.toThrow(/brownfield-adoption prompt/);
      expect(await readAdoptionState(project)).toBe('');
    });
  });

  it.skipIf(!canChmod)('a read-only .context-forge.toml → AdoptionError naming the file and the explicit escape', async () => {
    await writeSource(2000);
    const file = join(project, '.context-forge.toml');
    await writeFile(file, '[git]\n');
    await chmod(file, 0o444);
    try {
      const attempt = resolve(CONCEPT);
      await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
      await expect(attempt).rejects.toThrow(/\.context-forge\.toml/);
      await expect(attempt).rejects.toThrow(/--it brownfield-adoption/);
    } finally {
      await chmod(file, 0o644);
    }
  });
});
