import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ABSENT_ARTIFACT,
  ADOPTION_INPUTS_HEADING,
  ADOPTION_INPUT_LABELS,
  NO_COMPREHENSION_SENTENCE,
  readAdoptionArtifacts,
  renderAdoptionInputs,
  toRootRelative,
  type AdoptionArtifacts,
} from '../../src/adoption/index.js';
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

describe('renderAdoptionInputs', () => {
  const root = join('/r', 'project');
  const none: AdoptionArtifacts = { concept: null, derivedArchitectures: [], existingStatePlan: null };
  const full: AdoptionArtifacts = {
    concept: 'project-documents/user/project-guides/000-concept.p.md',
    derivedArchitectures: ['project-documents/user/architecture/100-arch.a.md', 'project-documents/user/architecture/200-arch.b.md'],
    existingStatePlan: 'project-documents/user/architecture/100-slices.a.md',
  };
  const lines = (text: string): string[] => text.split('\n');

  it('starts with the heading', () => {
    expect(lines(renderAdoptionInputs(root, null, none))[0]).toBe(ADOPTION_INPUTS_HEADING);
  });

  it('without a comprehension path: the sentence, and none for every absent artifact', () => {
    expect(lines(renderAdoptionInputs(root, null, none))).toEqual([
      ADOPTION_INPUTS_HEADING,
      `- ${NO_COMPREHENSION_SENTENCE}`,
      `- ${ADOPTION_INPUT_LABELS.concept}: ${ABSENT_ARTIFACT}`,
      `- ${ADOPTION_INPUT_LABELS.derivedArchitecture}: ${ABSENT_ARTIFACT}`,
      `- ${ADOPTION_INPUT_LABELS.existingStatePlan}: ${ABSENT_ARTIFACT}`,
    ]);
  });

  it('a comprehension path inside the root shows root-relative with / separators', () => {
    const inside = join(root, 'project-documents', 'user', 'analysis', 'c.md');
    expect(lines(renderAdoptionInputs(root, inside, none))[1]).toBe(
      `- ${ADOPTION_INPUT_LABELS.comprehension}: project-documents/user/analysis/c.md`,
    );
  });

  it('a comprehension path outside the root stays absolute', () => {
    const outside = join('/elsewhere', 'c.md');
    expect(lines(renderAdoptionInputs(root, outside, none))[1]).toBe(
      `- ${ADOPTION_INPUT_LABELS.comprehension}: ${outside}`,
    );
  });

  it('a sibling directory that merely shares the root prefix is outside', () => {
    const sibling = join('/r', 'project-two', 'c.md');
    expect(lines(renderAdoptionInputs(root, sibling, none))[1]).toContain(sibling);
  });

  it('lists the artifacts, joining several derived architectures on one line', () => {
    expect(lines(renderAdoptionInputs(root, null, full)).slice(2)).toEqual([
      `- ${ADOPTION_INPUT_LABELS.concept}: ${full.concept}`,
      `- ${ADOPTION_INPUT_LABELS.derivedArchitecture}: ${full.derivedArchitectures.join(', ')}`,
      `- ${ADOPTION_INPUT_LABELS.existingStatePlan}: ${full.existingStatePlan}`,
    ]);
  });
});
