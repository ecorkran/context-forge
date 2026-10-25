// Regression fixture for slice 267, D6: artifacts that link outside project-documents/ are normal.
// The docs map and an architecture doc both link ../../../docs/adr/... and ../../../README.md;
// cf check must stay silent, the map must stay out of the ProjectModel, and 261's outcome must not move.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { writeDocsMap, docsMapPath } from '../../src/docs-map/index.js';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { buildModel } from '../../src/introspection/ProjectModelBuilder.js';
import { decideOutcome, decideStage } from '../../src/adoption/adoptionOutcome.js';
import { readPlanningFacts } from '../../src/adoption/planningFacts.js';
import { findPlanningArtifacts } from '../../src/detection/planningArtifacts.js';
import { measureSourceVolume } from '../../src/detection/sourceVolume.js';
import { createAdoptionFixture, ARCH_FILE, CONCEPT_FILE } from '../helpers/adoptionFixtures.js';

const PROJECT_NAME = 'scratch-project';
const BROWNFIELD_SOURCE_LINES = 2000;

async function put(root: string, relPath: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, relPath)), { recursive: true });
  await writeFile(join(root, relPath), content);
}

describe('out-of-tree links (slice 267, D6)', () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  describe('cf check and the project model', () => {
    let fixture: ReturnType<typeof createAdoptionFixture>;

    beforeEach(async () => {
      fixture = createAdoptionFixture();
      roots.push(fixture.root);
      await put(fixture.root, 'README.md', '# Acme Service\n');
      await put(fixture.root, 'docs/adr/0001-x.md', '# 1. Record architecture decisions\n');
      const common = `project: ${PROJECT_NAME}\nstatus: in_progress\ndateCreated: 20260101\ndateUpdated: 20260101\n`;
      await put(
        fixture.root,
        `project-documents/user/project-guides/${CONCEPT_FILE}`,
        `---\ndocType: concept\n${common}---\n\n# Concept\n`,
      );
      // The architecture doc links outside project-documents/, as the map does.
      await put(
        fixture.root,
        `project-documents/user/architecture/${ARCH_FILE}`,
        `---\ndocType: architecture\n${common}archIndex: 100\ncomponent: existing\n---\n\n# Architecture\n\n` +
          'See [the ADR](../../../docs/adr/0001-x.md) and [the README](../../../README.md).\n',
      );
      await writeDocsMap(fixture.root, PROJECT_NAME);
    });

    it('writes a map that links the same out-of-tree files', async () => {
      const map = await readFile(docsMapPath(fixture.root, PROJECT_NAME), 'utf8');
      expect(map).toContain('(../../../docs/adr/0001-x.md)');
      expect(map).toContain('(../../../README.md)');
    });

    it('cf check reports no findings', async () => {
      const checker = new ConsistencyChecker(new ArtifactIntrospector());
      const result = await checker.checkAll(fixture.project());
      expect(result.findings).toEqual([]);
    });

    it('the map is not in the ProjectModel', async () => {
      const model = await buildModel(fixture.root);
      expect(JSON.stringify(model)).not.toContain('docs-map');
    });
  });

  describe("261's adoption outcome", () => {
    let project: string;

    beforeEach(async () => {
      project = await mkdtemp(join(tmpdir(), 'cf-oot-project-'));
      roots.push(project);
      const body = Array.from({ length: BROWNFIELD_SOURCE_LINES }, (_, i) => `export const v${i} = ${i};`).join('\n');
      await put(project, 'src/big.ts', body);
      await put(project, 'README.md', '# Brownfield\n');
      await put(project, 'docs/adr/0001-x.md', '# 1. Record\n');
    });

    it('stays brownfield, and the map is not a planning artifact', async () => {
      const outcomeKind = async (): Promise<string> =>
        decideOutcome({
          stage: decideStage({ optedOut: false, facts: await readPlanningFacts(project) }),
          source: await measureSourceVolume(project),
        }).kind;
      expect(await outcomeKind()).toBe('brownfield');

      await writeDocsMap(project, PROJECT_NAME);

      expect(await outcomeKind()).toBe('brownfield');
      expect(await findPlanningArtifacts(project)).toEqual([]);
    });
  });
});
