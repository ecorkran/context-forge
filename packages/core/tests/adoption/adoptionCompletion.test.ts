import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  completeAdoptionIfPlanRecorded,
  findRecordedPlan,
  persistAdoptionComplete,
} from '../../src/adoption/adoptionCompletion.js';
import { readAdoptionState, writeAdoptionState } from '../../src/adoption/adoptionState.js';
import { AdoptionError } from '../../src/adoption/contracts.js';

const ARCHITECTURE_DIR = join('project-documents', 'user', 'architecture');
const RETROACTIVE_LINE = '1. [x] **(100) Existing System** `retroactive` — the system as built at adoption.';
const ORDINARY_LINE = '1. [ ] **(100) New Work** — not started.';

describe('adoption completion (slice 263 D5, R1)', () => {
  let project: string;

  beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'cf-adopt-complete-'));
    await writeAdoptionState(project, 'in_progress');
  });

  afterEach(async () => {
    await rm(project, { recursive: true, force: true });
  });

  async function writeArchitectureFile(name: string, body: string): Promise<string> {
    const dir = join(project, ARCHITECTURE_DIR);
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    await writeFile(file, `---\ndocType: slice-plan\nproject: scratch\n---\n\n# Plan\n\n${body}\n`);
    return file;
  }

  it('1. no planning artifacts: nothing found, nothing written', async () => {
    expect(await findRecordedPlan(project)).toBeNull();
    expect(await completeAdoptionIfPlanRecorded(project)).toEqual({ completed: false });
    expect(await readAdoptionState(project)).toBe('in_progress');
  });

  it('2. a plan with only ordinary entries does not count', async () => {
    await writeArchitectureFile('100-slices.plain.md', ORDINARY_LINE);
    expect(await findRecordedPlan(project)).toBeNull();
  });

  it('3. a plan with the real-format retroactive line completes adoption', async () => {
    const plan = await writeArchitectureFile('100-slices.existing.md', RETROACTIVE_LINE);
    expect(await findRecordedPlan(project)).toBe(plan);
    expect(await completeAdoptionIfPlanRecorded(project)).toEqual({ completed: true, planPath: plan });
    expect(await readAdoptionState(project)).toBe('complete');
  });

  it('4. a retroactive line in an architecture file (not a slice plan) does not count', async () => {
    await writeArchitectureFile('100-arch.existing.md', RETROACTIVE_LINE);
    expect(await findRecordedPlan(project)).toBeNull();
  });

  it('5. with two plans, the marker in only the second finds the second; markers in both find the lowest-sorted', async () => {
    await writeArchitectureFile('100-slices.first.md', ORDINARY_LINE);
    const second = await writeArchitectureFile('200-slices.second.md', RETROACTIVE_LINE);
    expect(await findRecordedPlan(project)).toBe(second);

    const first = await writeArchitectureFile('100-slices.first.md', RETROACTIVE_LINE);
    expect(await findRecordedPlan(project)).toBe(first);
  });

  it('6. a failed write throws an AdoptionError naming the file and the manual remedy', async () => {
    // A directory where the config file belongs makes the write fail.
    await rm(join(project, '.context-forge.toml'), { force: true });
    await mkdir(join(project, '.context-forge.toml'));
    const failure = await persistAdoptionComplete(project).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AdoptionError);
    expect((failure as AdoptionError).message).toContain('.context-forge.toml');
    expect((failure as AdoptionError).message).toContain('cf config set adoption.state complete');
  });
});
