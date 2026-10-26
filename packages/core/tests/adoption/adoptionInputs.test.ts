import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { readAdoptionArtifacts, toRootRelative } from '../../src/adoption/index.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  ARCH_FILE,
  CONCEPT_FILE,
  PLAN_FILE,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../helpers/adoptionFixtures.js';

const GUIDES_DIR = 'project-documents/user/project-guides';
const ARCH_DIR = 'project-documents/user/architecture';

const roots: string[] = [];

function fixture(options: AdoptionFixtureOptions = {}): string {
  const { root } = createAdoptionFixture(options);
  roots.push(root);
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('readAdoptionArtifacts', () => {
  it('an empty directory has no artifacts', async () => {
    expect(await readAdoptionArtifacts(fixture())).toEqual({
      concept: null,
      derivedArchitectures: [],
      existingStatePlan: null,
    });
  });

  it('a concept alone', async () => {
    expect(await readAdoptionArtifacts(fixture({ concept: true }))).toEqual({
      concept: `${GUIDES_DIR}/${CONCEPT_FILE}`,
      derivedArchitectures: [],
      existingStatePlan: null,
    });
  });

  it('a derived architecture without a retroactive plan', async () => {
    expect(await readAdoptionArtifacts(fixture({ concept: true, arch: true }))).toEqual({
      concept: `${GUIDES_DIR}/${CONCEPT_FILE}`,
      derivedArchitectures: [`${ARCH_DIR}/${ARCH_FILE}`],
      existingStatePlan: null,
    });
  });

  it('a complete adoption sets all three', async () => {
    const artifacts = await readAdoptionArtifacts(
      fixture({ concept: true, arch: true, plan: ALL_RETROACTIVE_ENTRIES }),
    );
    expect(artifacts).toEqual({
      concept: `${GUIDES_DIR}/${CONCEPT_FILE}`,
      derivedArchitectures: [`${ARCH_DIR}/${ARCH_FILE}`],
      existingStatePlan: `${ARCH_DIR}/${PLAN_FILE}`,
    });
  });
});

describe('toRootRelative', () => {
  it('uses / separators for a path inside the root', () => {
    expect(toRootRelative(join('/r', 'p'), join('/r', 'p', 'a', 'b.md'))).toBe('a/b.md');
  });

  it('keeps climbing segments for a path outside the root', () => {
    expect(toRootRelative(join('/r', 'p', 'app'), join('/r', 'p', '.github', 'ci.yml'))).toBe('../.github/ci.yml');
  });
});
