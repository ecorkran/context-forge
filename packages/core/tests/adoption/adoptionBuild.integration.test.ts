// Slice 261 integration fixtures: real temp projects through createContextPipeline.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { createContextPipeline } from '../../src/services/CoreServiceFactory.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import { AdoptionError } from '../../src/adoption/contracts.js';
import { readAdoptionState, writeAdoptionState } from '../../src/adoption/adoptionState.js';
import type { AdoptionStateWrites } from '../../src/adoption/adoptionResolver.js';
import type { SquadronProbe } from '../../src/adoption/contracts.js';
import { createTestProjectData } from '../helpers/testData.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const BROWNFIELD_GUIDE = join(FIXTURES, 'brownfield-guide', PROMPT_FILE_RELATIVE_PATH);
const PLAIN_GUIDE = join(FIXTURES, 'test-project', PROMPT_FILE_RELATIVE_PATH);

// Distinct text in each prompt of the brownfield-guide fixture.
const CONCEPT_PROMPT = 'Write the concept.';
const BROWNFIELD_PROMPT = 'We are adopting an existing codebase.';
const ARCHITECTURE_PROMPT = 'Design the architecture.';
const FACTS_HEADING = '### Adoption Facts';

const CONCEPT = 'Phase 0: Concept';

// Every build here selects the brownfield prompt at most through a fake probe, never the machine's `sq`.
const fakeProbe: SquadronProbe = async () => ({
  kind: 'unavailable',
  reason: { kind: 'not-found' },
  warnings: [],
});

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

describe('adoption through the build pipeline', () => {
  let dataDir: string;
  let root: string;
  let originalEnv: string | undefined;

  async function installGuide(dir: string, source = BROWNFIELD_GUIDE): Promise<void> {
    const target = join(dir, PROMPT_FILE_RELATIVE_PATH);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
  }

  async function writeLines(dir: string, relative: string, count: number): Promise<void> {
    const path = join(dir, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Array.from({ length: count }, (_, i) => `export const v${i} = ${i};`).join('\n'));
  }

  async function writeDoc(dir: string, relative: string): Promise<void> {
    const path = join(dir, 'project-documents/user', relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, '# doc');
  }

  async function build(
    dir: string,
    instruction = CONCEPT,
    stateWrites: AdoptionStateWrites = 'persist',
  ): Promise<string> {
    const { integrator } = createContextPipeline(dir, { adoptionStateWrites: stateWrites, squadronProbe: fakeProbe });
    const project = createTestProjectData({ projectPath: dir, instruction });
    const output = await integrator.generateContextFromProject(project);
    // generateContextFromProject turns non-adoption errors into a stub; none is expected here.
    expect(output).not.toContain('Error generating context');
    return output;
  }

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-adopt-int-data-'));
    root = await mkdtemp(join(tmpdir(), 'cf-adopt-int-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await installGuide(root);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
    else process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    await rm(dataDir, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  function expectConcept(output: string): void {
    expect(output).toContain(CONCEPT_PROMPT);
    expect(output).not.toContain(BROWNFIELD_PROMPT);
    expect(output).not.toContain(FACTS_HEADING);
  }

  function expectBrownfield(output: string): void {
    expect(output).toContain(BROWNFIELD_PROMPT);
    expect(output).not.toContain(CONCEPT_PROMPT);
    expect(output).toContain(FACTS_HEADING);
  }

  it('1. empty project → concept prompt, no facts, state unset', async () => {
    expectConcept(await build(root));
    expect(await readAdoptionState(root)).toBe('');
  });

  it('2. scaffold only (~200 source lines, manifests, README, LICENSE) → same as empty', async () => {
    await writeLines(root, 'src/index.ts', 200);
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'pnpm-lock.yaml'), 'lock');
    await writeFile(join(root, 'README.md'), '# app');
    await writeFile(join(root, 'LICENSE'), 'MIT');
    expectConcept(await build(root));
    expect(await readAdoptionState(root)).toBe('');
  });

  it('3. brownfield (2000+ lines, no planning docs) → brownfield prompt and facts, state in_progress', async () => {
    await writeLines(root, 'src/index.ts', 2100);
    expectBrownfield(await build(root));
    expect(await readAdoptionState(root)).toBe('in_progress');
  });

  it('4. shallow clone of a brownfield repo → brownfield, facts report shallow', async () => {
    const source = join(root, 'source');
    await mkdir(source);
    git(source, 'init', '-q');
    git(source, 'config', 'user.name', 'Test');
    git(source, 'config', 'user.email', 'test@example.com');
    await writeLines(source, 'src/index.ts', 2100);
    git(source, 'add', '-A');
    git(source, 'commit', '-q', '-m', 'one');
    await writeLines(source, 'src/more.ts', 10);
    git(source, 'add', '-A');
    git(source, 'commit', '-q', '-m', 'two');
    const clone = join(root, 'clone');
    git(root, 'clone', '-q', '--depth', '1', `file://${source}`, clone);
    await installGuide(clone);

    const output = await build(clone);
    expectBrownfield(output);
    expect(output).toContain('shallow clone');
  });

  describe('5. monorepo subdirectory', () => {
    async function monorepo(libLines: number, appLines: number): Promise<string> {
      git(root, 'init', '-q');
      await mkdir(join(root, '.github/workflows'), { recursive: true });
      await writeFile(join(root, '.github/workflows/ci.yml'), 'on: push');
      await writeLines(root, 'packages/lib/index.ts', libLines);
      await writeLines(root, 'packages/app/index.ts', appLines);
      const app = join(root, 'packages/app');
      await installGuide(app);
      return app;
    }

    it('code elsewhere in the repo does not count → concept prompt', async () => {
      expectConcept(await build(await monorepo(3000, 100)));
    });

    it('code in the project folder counts → brownfield, facts list the root CI file', async () => {
      const output = await build(await monorepo(100, 3000));
      expectBrownfield(output);
      // Relative to the project folder, like the other path facts; the file is at the repository root.
      expect(output).toContain(`- CI: ${join('..', '..', '.github/workflows/ci.yml')}`);
    });
  });

  it('6. concept only + 2000 lines → brownfield', async () => {
    await writeDoc(root, 'project-guides/000-concept.x.md');
    await writeLines(root, 'src/index.ts', 2100);
    expectBrownfield(await build(root));
  });

  it('7. planned (an arch file) + 5000 lines → concept prompt', async () => {
    await writeDoc(root, 'architecture/100-arch.x.md');
    await writeLines(root, 'src/index.ts', 5000);
    expectConcept(await build(root));
    expect(await readAdoptionState(root)).toBe('');
  });

  it('8. resume: in_progress with concept and arch present → brownfield prompt', async () => {
    await writeAdoptionState(root, 'in_progress');
    await writeDoc(root, 'project-guides/000-concept.x.md');
    await writeDoc(root, 'architecture/100-arch.x.md');
    expectBrownfield(await build(root));
  });

  describe('9. overrides', () => {
    it('declined + 5000 lines → concept prompt', async () => {
      await writeAdoptionState(root, 'declined');
      await writeLines(root, 'src/index.ts', 5000);
      expectConcept(await build(root));
    });

    it('in_progress on an empty repo → brownfield prompt', async () => {
      await writeAdoptionState(root, 'in_progress');
      expectBrownfield(await build(root));
    });

    it('re-detect: declined, then "", then build → brownfield and state in_progress', async () => {
      await writeLines(root, 'src/index.ts', 2100);
      await writeAdoptionState(root, 'declined');
      expectConcept(await build(root));
      await writeAdoptionState(root, '');
      expectBrownfield(await build(root));
      expect(await readAdoptionState(root)).toBe('in_progress');
    });
  });

  it('10. Phase 2 with state in_progress → the Phase 2 prompt, no facts', async () => {
    await writeAdoptionState(root, 'in_progress');
    const output = await build(root, 'Phase 2: Architecture');
    expect(output).toContain(ARCHITECTURE_PROMPT);
    expect(output).not.toContain(BROWNFIELD_PROMPT);
    expect(output).not.toContain(FACTS_HEADING);
  });

  it('11. explicit brownfield-adoption on an empty repo → brownfield prompt, "not evaluated", state unset', async () => {
    const output = await build(root, 'brownfield-adoption');
    expectBrownfield(output);
    expect(output).toContain('not evaluated');
    expect(await readAdoptionState(root)).toBe('');
  });

  it('12. brownfield repo with a guide lacking the profile → AdoptionError, state unset', async () => {
    await installGuide(root, PLAIN_GUIDE);
    await writeLines(root, 'src/index.ts', 2100);
    await expect(build(root)).rejects.toBeInstanceOf(AdoptionError);
    expect(await readAdoptionState(root)).toBe('');
  });

  it('13. template_preview path (read-only) → brownfield prompt and facts, state still unset', async () => {
    await writeLines(root, 'src/index.ts', 2100);
    expectBrownfield(await build(root, CONCEPT, 'read-only'));
    expect(await readAdoptionState(root)).toBe('');
  });
});
