import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPlanningFacts } from '../../src/adoption/index.js';
import { DERIVED_PROVENANCE } from '../../src/schema/frontmatterSchema.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  ARCH_FILE,
  CONCEPT_FILE,
  PLAN_FILE,
  createAdoptionFixture,
} from '../helpers/adoptionFixtures.js';

const ARCH_DIR = ['project-documents', 'user', 'architecture'];
const GUIDES_DIR = ['project-documents', 'user', 'project-guides'];
const OTHER_ARCH_FILE = '200-arch.other.md';
const COMPACT_DERIVED = `---\ndocType: architecture\nprovenance: ${DERIVED_PROVENANCE}\n---\n\n# Architecture\n`;
// The layout the guide's architecture template writes, with provenance among the other fields.
const GUIDE_LAYOUT_DERIVED = [
  '---',
  'docType: architecture',
  'layer: project',
  'project: scratch-project',
  'archIndex: 100',
  'component: existing',
  `provenance: ${DERIVED_PROVENANCE}`,
  'dateCreated: 20261025',
  'dateUpdated: 20261025',
  'status: in_progress',
  '---',
  '',
  '# Architecture',
  '',
].join('\n');
const NOT_DERIVED = '---\ndocType: architecture\nproject: scratch-project\n---\n\n# Architecture\n';
const NO_FRONTMATTER = '# Architecture\n\nNo frontmatter here.\n';
const MALFORMED_FRONTMATTER = `---\ndocType: architecture\nprovenance: ${DERIVED_PROVENANCE}\n\n# never closed\n`;

describe('readPlanningFacts', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-planning-facts-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function put(dir: string[], name: string, body: string): string {
    mkdirSync(join(root, ...dir), { recursive: true });
    const path = join(root, ...dir, name);
    writeFileSync(path, body);
    return path;
  }

  it('keeps a compact derived architecture', async () => {
    const path = put(ARCH_DIR, ARCH_FILE, COMPACT_DERIVED);
    expect(await readPlanningFacts(root)).toEqual({
      artifacts: [path],
      derivedArchitectures: [path],
      existingStatePlan: null,
    });
  });

  it('keeps a derived architecture in the guide layout', async () => {
    const path = put(ARCH_DIR, ARCH_FILE, GUIDE_LAYOUT_DERIVED);
    expect((await readPlanningFacts(root)).derivedArchitectures).toEqual([path]);
  });

  it('counts a non-derived architecture as an artifact only', async () => {
    const derived = put(ARCH_DIR, ARCH_FILE, COMPACT_DERIVED);
    const other = put(ARCH_DIR, OTHER_ARCH_FILE, NOT_DERIVED);
    const facts = await readPlanningFacts(root);
    expect(facts.artifacts).toEqual([derived, other]);
    expect(facts.derivedArchitectures).toEqual([derived]);
  });

  it.each([
    ['absent', NO_FRONTMATTER],
    ['malformed', MALFORMED_FRONTMATTER],
  ])('treats an architecture with %s frontmatter as not derived', async (_label, body) => {
    const path = put(ARCH_DIR, ARCH_FILE, body);
    const facts = await readPlanningFacts(root);
    expect(facts.artifacts).toEqual([path]);
    expect(facts.derivedArchitectures).toEqual([]);
  });

  it('treats an unreadable architecture file as not derived', async () => {
    // A directory named like an architecture file fails to read the same way everywhere, even as root.
    const path = join(root, ...ARCH_DIR, ARCH_FILE);
    mkdirSync(path, { recursive: true });
    const facts = await readPlanningFacts(root);
    expect(facts.artifacts).toEqual([path]);
    expect(facts.derivedArchitectures).toEqual([]);
  });

  it('reports the slice plan with a retroactive entry', async () => {
    const fixture = createAdoptionFixture({ arch: true, plan: ALL_RETROACTIVE_ENTRIES });
    try {
      const facts = await readPlanningFacts(fixture.root);
      expect(facts.existingStatePlan).toBe(join(fixture.root, ...ARCH_DIR, PLAN_FILE));
      expect(facts.derivedArchitectures).toEqual([join(fixture.root, ...ARCH_DIR, ARCH_FILE)]);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it('finds nothing in a concept-only repo', async () => {
    put(GUIDES_DIR, CONCEPT_FILE, '---\ndocType: concept\n---\n\n# Concept\n');
    expect(await readPlanningFacts(root)).toEqual({ artifacts: [], derivedArchitectures: [], existingStatePlan: null });
  });

  it('finds nothing in an empty repo', async () => {
    expect(await readPlanningFacts(root)).toEqual({ artifacts: [], derivedArchitectures: [], existingStatePlan: null });
  });
});
