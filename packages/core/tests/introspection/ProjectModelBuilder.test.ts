import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { buildModel, scanDirectory } from '../../src/introspection/ProjectModelBuilder.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');
const USER_DIR = join(PROJECT_ROOT, 'project-documents', 'user');

describe('scanDirectory', () => {
  it('returns correct number of docs from fixture', async () => {
    const docs = await scanDirectory(USER_DIR);
    // Fixture has: 100-arch, 100-slices, 100-slice, 100-tasks, 100-tasks-1,
    //              050-arch.hld, 002-spec, 900-tasks.maintenance, 780-slices.future.test-future
    expect(docs.length).toBe(9);
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
