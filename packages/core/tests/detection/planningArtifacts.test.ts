import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { findPlanningArtifacts } from '../../src/detection/planningArtifacts.js';
import { AdoptionError } from '../../src/adoption/contracts.js';

describe('findPlanningArtifacts', () => {
  let root: string;
  const guides = (): string => join(root, 'project-documents/user/project-guides');
  const arch = (): string => join(root, 'project-documents/user/architecture');

  async function put(dir: string, name: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, name);
    await writeFile(path, '# x');
    return path;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-planning-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] when project-documents does not exist', async () => {
    expect(await findPlanningArtifacts(root)).toEqual([]);
  });

  it('does not count a concept', async () => {
    await put(guides(), '000-concept.x.md');
    expect(await findPlanningArtifacts(root)).toEqual([]);
  });

  it('finds an initiative plan in project-guides', async () => {
    const path = await put(guides(), '001-initiative-plan.x.md');
    expect(await findPlanningArtifacts(root)).toEqual([path]);
  });

  it.each(['260-arch.x.md', '050-hld.x.md', '140-slices.x.md'])('finds %s in architecture', async (name) => {
    const path = await put(arch(), name);
    expect(await findPlanningArtifacts(root)).toEqual([path]);
  });

  it('finds an arch file in project-guides', async () => {
    const path = await put(guides(), '100-arch.x.md');
    expect(await findPlanningArtifacts(root)).toEqual([path]);
  });

  it('matches case-insensitively', async () => {
    const path = await put(arch(), '260-ARCH.x.MD');
    expect(await findPlanningArtifacts(root)).toEqual([path]);
  });

  it('does not count an initiative plan under architecture/', async () => {
    await put(arch(), '001-initiative-plan.x.md');
    expect(await findPlanningArtifacts(root)).toEqual([]);
  });

  it.each(['260-slice.x.md', '260-arch.x.txt'])('does not match %s', async (name) => {
    await put(arch(), name);
    expect(await findPlanningArtifacts(root)).toEqual([]);
  });

  it('returns absolute paths, sorted', async () => {
    const b = await put(arch(), '260-arch.b.md');
    const a = await put(guides(), '001-initiative-plan.a.md');
    expect(await findPlanningArtifacts(root)).toEqual([a, b].sort());
  });

  it('throws AdoptionError when architecture is a regular file (ENOTDIR)', async () => {
    await mkdir(join(root, 'project-documents/user'), { recursive: true });
    await writeFile(arch(), 'not a directory');
    const attempt = findPlanningArtifacts(root);
    await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
    await expect(attempt).rejects.toThrow(arch());
  });
});
