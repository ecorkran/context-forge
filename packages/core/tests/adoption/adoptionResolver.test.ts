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
import type { ProbeOutcome } from '../../src/detection/squadronProbe.js';
import type { SquadronProbe } from '../../src/adoption/contracts.js';

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

const FAKE_OUTCOME: ProbeOutcome = {
  kind: 'available',
  json: '{"probe_version":1,"fake":true}',
  warnings: [],
};

/** A probe that records the checkouts it was asked about and returns a fixed outcome. */
function fakeProbe(outcome: ProbeOutcome = FAKE_OUTCOME): SquadronProbe & { calls: string[] } {
  const calls: string[] = [];
  const probe = async (checkoutPath: string): Promise<ProbeOutcome> => {
    calls.push(checkoutPath);
    return outcome;
  };
  return Object.assign(probe, { calls });
}

describe('createAdoptionResolver', () => {
  let dataDir: string;
  let project: string;
  let originalEnv: string | undefined;
  let probe: ReturnType<typeof fakeProbe>;
  const persist = () => createAdoptionResolver({ stateWrites: 'persist', squadronProbe: probe });
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
    probe = fakeProbe();
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
      const result = await persist()(
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
      const result = await resolve(CONCEPT, createAdoptionResolver({ stateWrites: 'read-only', squadronProbe: probe }));
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.facts).not.toContain(NOTICE);
      expect(await readAdoptionState(project)).toBe('');
    });
  });

  describe('squadron probe (262)', () => {
    it('selected build: the probe runs once on the checkout and its rendering is in the facts', async () => {
      await writeSource(2000);
      const result = await resolve(CONCEPT);
      expect(probe.calls).toEqual([project]);
      if (!result.selected) throw new Error('expected a selected build');
      expect(result.facts).toContain('{"probe_version":1,"fake":true}');
    });

    it.each([
      ['greenfield', async () => undefined, CONCEPT],
      ['already planned', async () => { await writePlan(); await writeSource(2000); }, CONCEPT],
      ['adoption closed', async () => { await writeAdoptionState(project, 'declined'); await writeSource(2000); }, CONCEPT],
      ['Phase 2', async () => { await writeSource(2000); }, 'Phase 2: Architecture'],
    ])('%s: the probe is never called', async (_name, arrange, instruction) => {
      await arrange();
      expect(await resolve(instruction)).toEqual({ selected: false });
      expect(probe.calls).toEqual([]);
    });

    describe('comprehension document (D5)', () => {
      const DOC = 'user/analysis/944-analysis.codebase-comprehension.md';

      async function writeComprehension(): Promise<void> {
        const dir = join(project, 'project-documents/user/analysis');
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, '944-analysis.codebase-comprehension.md'),
          '---\ndocType: analysis\nproject: sample\n---\n# Comprehension\n',
        );
      }

      it('profile lists fileComprehension and the document exists → fileComprehension is set', async () => {
        await writeSource(2000);
        await writeComprehension();
        expect(await resolve(CONCEPT)).toMatchObject({ selected: true, fileComprehension: DOC });
      });

      it('profile omits fileComprehension → no fileComprehension key', async () => {
        const text = await readFile(BROWNFIELD_GUIDE, 'utf-8');
        await writeFile(
          join(project, PROMPT_FILE_RELATIVE_PATH),
          text.replace('fileSlicePlan, fileComprehension]', 'fileSlicePlan]'),
        );
        await writeSource(2000);
        await writeComprehension();
        const result = await resolve(CONCEPT);
        expect(result.selected).toBe(true);
        expect(result).not.toHaveProperty('fileComprehension');
      });

      it('no document → no fileComprehension key', async () => {
        await writeSource(2000);
        expect(await resolve(CONCEPT)).not.toHaveProperty('fileComprehension');
      });
    });

    it('an unavailable probe still selects the build', async () => {
      probe = fakeProbe({ kind: 'unavailable', reason: { kind: 'not-found' }, warnings: [] });
      await writeSource(2000);
      const result = await resolve(CONCEPT);
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.facts).toContain('- Squadron: unavailable. `sq` was not found on PATH.');
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

  describe('completion (slice 263 D5, R1, R5)', () => {
    const COMPLETION_NOTICE = 'adoption.state was set to complete by this build';
    const PLAN_RELATIVE = 'project-documents/user/architecture/100-slices.existing.md';

    async function writeExistingStatePlan(line: string): Promise<void> {
      const dir = join(project, 'project-documents/user/architecture');
      await mkdir(dir, { recursive: true });
      await writeFile(join(project, PLAN_RELATIVE), `---\ndocType: slice-plan\nproject: scratch\n---\n\n# Plan\n\n${line}\n`);
    }

    const RETROACTIVE = '1. [x] **(100) Existing System** `retroactive` — the system as built at adoption.';

    beforeEach(async () => {
      await writeAdoptionState(project, 'in_progress');
    });

    it('in_progress + persisting + a plan with a retroactive entry → selected, notice in facts, state complete', async () => {
      await writeExistingStatePlan(RETROACTIVE);
      const result = await resolve(CONCEPT);
      expect(result).toMatchObject({ selected: true, instruction: BROWNFIELD_ADOPTION_INSTRUCTION });
      if (result.selected) {
        expect(result.facts).toContain(COMPLETION_NOTICE);
        expect(result.facts).toContain(`existing-state slice plan found at ${PLAN_RELATIVE}`);
      }
      expect(await readAdoptionState(project)).toBe('complete');
    });

    it('read-only builds never complete: 261 in-progress flow, state stays in_progress', async () => {
      await writeExistingStatePlan(RETROACTIVE);
      const readOnly = createAdoptionResolver({ stateWrites: 'read-only', squadronProbe: probe });
      const result = await resolve(CONCEPT, readOnly);
      expect(result).toMatchObject({ selected: true });
      if (result.selected) expect(result.facts).not.toContain(COMPLETION_NOTICE);
      expect(await readAdoptionState(project)).toBe('in_progress');
    });

    it('a plan without retroactive entries leaves the state in_progress', async () => {
      await writeExistingStatePlan('1. [ ] **(100) New Work** — not started.');
      const result = await resolve(CONCEPT);
      expect(result).toMatchObject({ selected: true });
      if (result.selected) expect(result.facts).not.toContain(COMPLETION_NOTICE);
      expect(await readAdoptionState(project)).toBe('in_progress');
    });

    it('the build after completion is not selected', async () => {
      await writeExistingStatePlan(RETROACTIVE);
      await resolve(CONCEPT);
      expect(await resolve(CONCEPT)).toEqual({ selected: false });
    });

    it('a guide without the brownfield profile throws and the state is still in_progress', async () => {
      await installGuide(PLAIN_GUIDE);
      await writeExistingStatePlan(RETROACTIVE);
      await expect(resolve(CONCEPT)).rejects.toBeInstanceOf(AdoptionError);
      expect(await readAdoptionState(project)).toBe('in_progress');
    });

    it('an explicit brownfield-adoption instruction does not complete', async () => {
      await writeExistingStatePlan(RETROACTIVE);
      const result = await resolve(BROWNFIELD_ADOPTION_INSTRUCTION);
      expect(result).toMatchObject({ selected: true });
      if (result.selected) expect(result.facts).not.toContain(COMPLETION_NOTICE);
      expect(await readAdoptionState(project)).toBe('in_progress');
    });
  });
});
