import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildModel, scanDirectory, mergeProjectModels } from '../../src/introspection/ProjectModelBuilder.js';
import type { ProjectModel, Initiative } from '../../src/introspection/types.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');
const USER_DIR = join(PROJECT_ROOT, 'project-documents', 'user');

describe('scanDirectory', () => {
  it('returns correct number of docs from fixture', async () => {
    const docs = await scanDirectory(USER_DIR);
    // Fixture has: 100-arch, 100-slices, 100-slice, 100-tasks, 100-tasks-1,
    //              050-arch.hld, 002-spec, 900-tasks.maintenance, 780-slices.future.test-future,
    //              200-slice.design-only, 300-slice.all-done, 300-tasks.all-done
    expect(docs.length).toBe(12);
  });

  it('each DocEntry has expected fields', async () => {
    const docs = await scanDirectory(USER_DIR);
    for (const doc of docs) {
      expect(doc).toHaveProperty('index');
      expect(doc).toHaveProperty('docType');
      expect(doc).toHaveProperty('name');
      expect(doc).toHaveProperty('filename');
      expect(doc).toHaveProperty('filepath');
      expect(doc).toHaveProperty('status');
      expect(doc).toHaveProperty('taskItems');
      expect(typeof doc.index).toBe('number');
      expect(typeof doc.docType).toBe('string');
    }
  });

  it('task docs have taskItems populated', async () => {
    const docs = await scanDirectory(USER_DIR);
    const taskDocs = docs.filter((d) => d.docType === 'tasks');
    expect(taskDocs.length).toBeGreaterThan(0);
    for (const td of taskDocs) {
      expect(td.taskItems.length).toBeGreaterThan(0);
    }
  });

  it('returns empty array for non-existent directory', async () => {
    const docs = await scanDirectory('/tmp/nonexistent-dir-12345');
    expect(docs).toEqual([]);
  });
});

describe('buildModel', () => {
  it('foundation band: spec doc (002) appears in foundation[]', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const spec = model.foundation.find((f) => f.index === '002');
    expect(spec).toBeDefined();
    expect(spec!.type).toBe('spec');
    expect(spec!.name).toBe('test-project');
    expect(spec!.status).toBe('complete');
  });

  it('project architecture band: HLD (050) appears in projectArchitecture[]', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const hld = model.projectArchitecture.find((a) => a.index === '050');
    expect(hld).toBeDefined();
    expect(hld!.type).toBe('hld');
    expect(hld!.status).toBe('complete');
    expect(hld!.dateCreated).toBe('20260101');
    expect(hld!.dateUpdated).toBe('20260115');
  });

  it('initiative band: initiative "100" exists with arch, slicePlan, slices', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const init = model.initiatives['100'];
    expect(init).toBeDefined();
    expect(init.arch).toBeDefined();
    expect(init.arch!.index).toBe('100');
    expect(init.slicePlan).toBeDefined();
    expect(init.slicePlan!.index).toBe('100');
    expect(init.slices.length).toBeGreaterThan(0);
  });

  it('planned slice: slice plan entry without design file appears as planned: true', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const init = model.initiatives['100'];
    const planned = init.slices.find((s) => s.index === '101');
    expect(planned).toBeDefined();
    expect(planned!.planned).toBe(true);
    expect(planned!.name).toBe('Planned Feature');
    expect(planned!.status).toBe('not-started');
    // The actual designed slice (100) should still be present and NOT marked planned
    const actual = init.slices.find((s) => s.index === '100');
    expect(actual).toBeDefined();
    expect(actual!.planned).toBeUndefined();
  });

  it('plan-only initiative: plan entry without arch/slices doc appears as planned: true', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const init = model.initiatives['400'];
    expect(init).toBeDefined();
    expect(init.planned).toBe(true);
    expect(init.name).toBe('Plan Only Initiative');
    expect(init.status).toBe('not-started');
    expect(init.description).toContain('Exists only in the plan');
    expect(init.slices).toEqual([]);
    expect(init.arch).toBeUndefined();
    expect(init.slicePlan).toBeUndefined();
  });

  it('plan-only initiative: arch/slices-backed initiative (100) is not marked planned', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const init = model.initiatives['100'];
    expect(init.planned).toBeUndefined();
    // The plan entry must not overwrite the richer arch/slicePlan-backed model.
    expect(init.arch).toBeDefined();
    expect(init.slicePlan).toBeDefined();
  });

  it('plan-only initiative: 900+ plan entry flows into maintenanceInitiatives', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const maint = model.maintenanceInitiatives['900'];
    expect(maint).toBeDefined();
    expect(maint.planned).toBe(true);
    expect(maint.name).toBe('Maintenance');
    // Plan-only initiatives never land in the regular initiatives map.
    expect(model.initiatives['900']).toBeUndefined();
  });

  it('task merging: split task files merge into single task entry', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const init = model.initiatives['100'];
    const slice = init.slices.find((s) => s.index === '100');
    expect(slice).toBeDefined();
    expect(slice!.tasks).toBeDefined();
    // 100-tasks.test-feature has 2 items, 100-tasks.test-feature-1 has 2 items = 4 total
    expect(slice!.tasks!.taskCount).toBe(4);
    expect(slice!.tasks!.completedTasks).toBe(2); // Task one + Split task A
    expect(slice!.tasks!.items).toHaveLength(4);
  });

  it('operational band: maintenance task (900) appears in maintenance[]', async () => {
    const model = await buildModel(PROJECT_ROOT);
    const maint = model.maintenance.find((m) => m.index === '900');
    expect(maint).toBeDefined();
    expect(maint!.taskCount).toBe(3);
    expect(maint!.completedTasks).toBe(1);
  });

  it('devlog field is true for fixture project', async () => {
    const model = await buildModel(PROJECT_ROOT);
    expect(model.devlog).toBe(true);
  });

  it('empty project: returns valid ProjectModel with empty arrays', async () => {
    const model = await buildModel('/tmp/nonexistent-project-12345');
    expect(model.name).toBeDefined();
    expect(model.foundation).toEqual([]);
    expect(model.projectArchitecture).toEqual([]);
    expect(model.initiatives).toEqual({});
    expect(model.quality).toEqual([]);
    expect(model.investigation).toEqual([]);
    expect(model.maintenance).toEqual([]);
    expect(model.devlog).toBe(false);
  });

  it('name override: options.name overrides inferred project name', async () => {
    const model = await buildModel(PROJECT_ROOT, { name: 'Custom Name' });
    expect(model.name).toBe('Custom Name');
  });

  it('description override: options.description sets description', async () => {
    const model = await buildModel(PROJECT_ROOT, { description: 'A test project' });
    expect(model.description).toBe('A test project');
  });

  it('infers project name from frontmatter project field', async () => {
    const model = await buildModel(PROJECT_ROOT);
    // Fixture docs have project: "test-project", which title-cases to "Test Project"
    expect(model.name).toBe('Test Project');
  });
});

function makeModel(overrides: Partial<ProjectModel> = {}): ProjectModel {
  return {
    name: 'Test',
    description: '',
    foundation: [],
    projectArchitecture: [],
    initiatives: {},
    maintenanceInitiatives: {},
    futureSlices: [],
    quality: [],
    investigation: [],
    maintenance: [],
    devlog: false,
    ...overrides,
  };
}

function makeInitiative(name: string): Initiative {
  return { name, slices: [], features: [] };
}

describe('mergeProjectModels', () => {
  it('throws on empty array', () => {
    expect(() => mergeProjectModels([])).toThrow('No models to merge');
  });

  it('returns the single model as-is', () => {
    const model = makeModel({ name: 'Solo' });
    expect(mergeProjectModels([model])).toBe(model);
  });

  it('merges initiatives from two non-overlapping models', () => {
    const m1 = makeModel({ initiatives: { '100': makeInitiative('Auth') } });
    const m2 = makeModel({ initiatives: { '300': makeInitiative('API') } });
    const merged = mergeProjectModels([m1, m2]);
    expect(Object.keys(merged.initiatives)).toEqual(['100', '300']);
  });

  it('deduplicates initiatives by key (first wins)', () => {
    const m1 = makeModel({ initiatives: { '100': makeInitiative('Auth-v1') } });
    const m2 = makeModel({ initiatives: { '100': makeInitiative('Auth-v2') } });
    const merged = mergeProjectModels([m1, m2]);
    expect(merged.initiatives['100'].name).toBe('Auth-v1');
  });

  it('deduplicates foundation entries by name', () => {
    const entry = { index: '000', name: 'concept', status: 'complete', type: 'concept' };
    const m1 = makeModel({ foundation: [entry as any] });
    const m2 = makeModel({ foundation: [entry as any] });
    const merged = mergeProjectModels([m1, m2]);
    expect(merged.foundation).toHaveLength(1);
  });

  it('unions devlog flag (true if any model has devlog)', () => {
    const m1 = makeModel({ devlog: false });
    const m2 = makeModel({ devlog: true });
    expect(mergeProjectModels([m1, m2]).devlog).toBe(true);
  });

  it('preserves name and description from first model', () => {
    const m1 = makeModel({ name: 'First', description: 'Desc1' });
    const m2 = makeModel({ name: 'Second', description: 'Desc2' });
    const merged = mergeProjectModels([m1, m2]);
    expect(merged.name).toBe('First');
    expect(merged.description).toBe('Desc1');
  });
});
