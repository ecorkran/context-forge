// Regression fixture for slice 267, D6: artifacts that link outside project-documents/ are normal.
// The docs map and an architecture doc both link ../../../docs/adr/... and ../../../README.md;
// cf check must stay silent, the map must stay out of the ProjectModel, and 261's outcome must not move.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { writeDocsMap, docsMapPath } from '../../src/docs-map/index.js';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { buildModel } from '../../src/introspection/ProjectModelBuilder.js';
import { createAdoptionResolver } from '../../src/adoption/adoptionResolver.js';
import { findPlanningArtifacts } from '../../src/detection/planningArtifacts.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import type { SquadronProbe } from '../../src/adoption/contracts.js';
import { createAdoptionFixture, ARCH_FILE, CONCEPT_FILE } from '../helpers/adoptionFixtures.js';

const BROWNFIELD_GUIDE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'brownfield-guide',
  PROMPT_FILE_RELATIVE_PATH,
);
const CONCEPT = 'Phase 0: Concept';
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
    let dataDir: string;
    let originalEnv: string | undefined;
    const noProbe: SquadronProbe = async () => ({ kind: 'available', json: '{}', warnings: [] });

    beforeEach(async () => {
      dataDir = await mkdtemp(join(tmpdir(), 'cf-oot-data-'));
      project = await mkdtemp(join(tmpdir(), 'cf-oot-project-'));
      roots.push(dataDir, project);
      originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
      process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
      const guideTarget = join(project, PROMPT_FILE_RELATIVE_PATH);
      await mkdir(dirname(guideTarget), { recursive: true });
      await cp(BROWNFIELD_GUIDE, guideTarget);
      const body = Array.from({ length: BROWNFIELD_SOURCE_LINES }, (_, i) => `export const v${i} = ${i};`).join('\n');
      await put(project, 'src/big.ts', body);
      await put(project, 'README.md', '# Brownfield\n');
      await put(project, 'docs/adr/0001-x.md', '# 1. Record\n');
    });

    afterEach(() => {
      if (originalEnv === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
      else process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    });

    it('stays brownfield, and the map is not a planning artifact', async () => {
      const resolve = createAdoptionResolver({ stateWrites: 'read-only', squadronProbe: noProbe });
      expect((await resolve(project, project, CONCEPT)).selected).toBe(true);

      await writeDocsMap(project, PROJECT_NAME);

      expect((await resolve(project, project, CONCEPT)).selected).toBe(true);
      expect(await findPlanningArtifacts(project)).toEqual([]);
    });
  });
});
