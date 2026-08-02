import { describe, it, expect } from 'vitest';
import {
  FRONTMATTER_SCHEMAS,
  VALID_STATUSES,
  validateFrontmatter,
  inferDocTypeFromPath,
  inferFieldsFromPath,
} from '../../src/schema/frontmatterSchema.js';

/** The 8 canonical docTypes from file-naming-conventions.md */
const EXPECTED_DOC_TYPES = [
  'concept',
  'initiative-plan',
  'architecture',
  'slice-plan',
  'slice-design',
  'tasks',
  'review',
  'analysis',
];

describe('FRONTMATTER_SCHEMAS', () => {
  it('has an entry for every canonical docType', () => {
    for (const dt of EXPECTED_DOC_TYPES) {
      expect(FRONTMATTER_SCHEMAS[dt]).toBeDefined();
    }
  });

  it('every schema requires docType, status, dateCreated, dateUpdated', () => {
    const universalFields = ['docType', 'status', 'dateCreated', 'dateUpdated'];
    for (const [docType, schema] of Object.entries(FRONTMATTER_SCHEMAS)) {
      for (const field of universalFields) {
        expect(schema.fields[field], `${docType} missing ${field}`).toBeDefined();
        expect(schema.fields[field].required, `${docType}.${field} not required`).toBe(true);
      }
    }
  });

  it('status field on every schema uses VALID_STATUSES as values constraint', () => {
    for (const [docType, schema] of Object.entries(FRONTMATTER_SCHEMAS)) {
      const statusField = schema.fields.status;
      expect(statusField.values, `${docType} status has no values constraint`).toBeDefined();
      expect(statusField.values).toEqual([...VALID_STATUSES]);
    }
  });
});

describe('VALID_STATUSES', () => {
  it('includes all 5 canonical status values', () => {
    expect(VALID_STATUSES).toContain('not_started');
    expect(VALID_STATUSES).toContain('in_progress');
    expect(VALID_STATUSES).toContain('complete');
    expect(VALID_STATUSES).toContain('deferred');
    expect(VALID_STATUSES).toContain('deprecated');
    expect(VALID_STATUSES).toHaveLength(5);
  });
});

describe('validateFrontmatter', () => {
  it('returns finding when docType is missing', () => {
    const findings = validateFrontmatter('/test.md', {});
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain('docType');
  });

  it('returns no findings for unknown docType', () => {
    const findings = validateFrontmatter('/test.md', { docType: 'custom-thing' });
    expect(findings).toHaveLength(0);
  });

  it('returns no findings for valid architecture frontmatter', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'architecture',
      project: 'my-project',
      status: 'in_progress',
      archIndex: '140',
      component: 'api-layer',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(0);
  });

  it('returns findings for architecture missing project and status', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'architecture',
      archIndex: '140',
      component: 'api-layer',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(2);
    const fields = findings.map((f) => f.description);
    expect(fields.some((d) => d.includes("'project'"))).toBe(true);
    expect(fields.some((d) => d.includes("'status'"))).toBe(true);
  });

  it('returns finding for invalid status value', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'banana',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'banana'");
    expect(findings[0].description).toContain('Invalid value');
  });

  it('accepts completed as alias for complete', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'completed',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(0);
  });

  it('treats empty string as missing', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: '',
      status: 'in_progress',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'project'");
  });

  it('rejects draft as an invalid status value (not a defined status)', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'draft',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("Invalid value 'draft'");
  });

  it.each(['done', 'ready', 'pending', 'planned'])(
    'accepts %s as a normalizeStatus alias (unifies with cf list arch "unreadable")',
    (alias) => {
      const findings = validateFrontmatter('/test.md', {
        docType: 'architecture',
        project: 'test',
        status: alias,
        archIndex: '140',
        component: 'api-layer',
        dateCreated: '20260101',
        dateUpdated: '20260301',
      });
      expect(findings).toHaveLength(0);
    },
  );

  it('flags an architecture status that cf list arch would call "unreadable" (#63)', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'architecture',
      project: 'test',
      status: 'in-progres', // typo — not a recognized alias
      archIndex: '140',
      component: 'api-layer',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'in-progres'");
    expect(findings[0].description).toContain('Invalid value');
  });

  it('includes fixAction for missing dateUpdated, defaulting to dateCreated', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'in_progress',
      dateCreated: '20260101',
    });
    const dateFinding = findings.find((f) => f.description.includes("'dateUpdated'"));
    expect(dateFinding).toBeDefined();
    expect(dateFinding!.fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'dateUpdated',
      value: '20260101',
    });
  });

  it('no fixAction for missing dateUpdated when dateCreated is also missing', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'in_progress',
    });
    const dateFinding = findings.find((f) => f.description.includes("'dateUpdated'"));
    expect(dateFinding).toBeDefined();
    expect(dateFinding!.fixAction).toBeUndefined();
  });

  it('accepts in-progress (hyphenated) as alias for in_progress', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      status: 'in-progress',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    expect(findings).toHaveLength(0);
  });

  it('includes fixAction for missing status', () => {
    const findings = validateFrontmatter('/test.md', {
      docType: 'concept',
      project: 'test',
      dateCreated: '20260101',
      dateUpdated: '20260301',
    });
    const statusFinding = findings.find((f) => f.description.includes("'status'"));
    expect(statusFinding).toBeDefined();
    expect(statusFinding!.fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'status',
      value: 'not_started',
    });
  });

  it('includes fixAction for missing docType when inferrable from filename', () => {
    const findings = validateFrontmatter(
      '/project/project-documents/user/slices/165-slice.test-feature.md',
      { status: 'in_progress' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("inferred: 'slice-design'");
    expect(findings[0].fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'docType',
      value: 'slice-design',
    });
  });

  it('no fixAction for missing docType when filename is not inferrable', () => {
    const findings = validateFrontmatter('/project/readme.md', { status: 'in_progress' });
    expect(findings).toHaveLength(1);
    expect(findings[0].fixAction).toBeUndefined();
  });
});

describe('inferDocTypeFromPath', () => {
  it.each([
    ['140-arch.context-forge.md', 'architecture'],
    ['160-slices.project-workflow.md', 'slice-plan'],
    ['165-slice.test-feature.md', 'slice-design'],
    ['165-tasks.test-feature.md', 'tasks'],
    ['181-review.slice.foo.md', 'review'],
    ['900-analysis.perf.md', 'analysis'],
    ['001-concept.context-builder.md', 'concept'],
  ])('%s → %s', (filename, expected) => {
    expect(inferDocTypeFromPath(`/fake/${filename}`)).toBe(expected);
  });

  it('returns null for non-matching filenames', () => {
    expect(inferDocTypeFromPath('/fake/readme.md')).toBeNull();
    expect(inferDocTypeFromPath('/fake/guide.ai-project.process.md')).toBeNull();
  });
});

describe('inferFieldsFromPath', () => {
  it('infers docType and slice from slice-design filename', () => {
    const fields = inferFieldsFromPath('/fake/100-slice.foundation.md');
    expect(fields.docType).toBe('slice-design');
    expect(fields.slice).toBe('foundation');
  });

  it('infers docType and slice from tasks filename', () => {
    const fields = inferFieldsFromPath('/fake/165-tasks.test-feature.md');
    expect(fields.docType).toBe('tasks');
    expect(fields.slice).toBe('test-feature');
  });

  it('infers docType, archIndex, and component from architecture filename', () => {
    const fields = inferFieldsFromPath('/fake/140-arch.context-forge-restructure.md');
    expect(fields.docType).toBe('architecture');
    expect(fields.archIndex).toBe('140');
    expect(fields.component).toBe('context-forge-restructure');
  });

  it('does not infer slice for non-slice docTypes', () => {
    const fields = inferFieldsFromPath('/fake/160-slices.project-workflow.md');
    expect(fields.docType).toBe('slice-plan');
    expect(fields.slice).toBeUndefined();
  });

  it('returns empty for non-matching filenames', () => {
    expect(inferFieldsFromPath('/fake/readme.md')).toEqual({});
  });
});

describe('validateFrontmatter — field inference', () => {
  it('includes fixAction for missing slice on slice-design', () => {
    const findings = validateFrontmatter(
      '/project/user/slices/100-slice.foundation.md',
      { docType: 'slice-design', project: 'test', status: 'complete', dateCreated: '20260101', dateUpdated: '20260301' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'slice'");
    expect(findings[0].description).toContain("inferred: 'foundation'");
    expect(findings[0].fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'slice',
      value: 'foundation',
    });
  });

  it('includes fixAction for missing archIndex on architecture', () => {
    const findings = validateFrontmatter(
      '/project/user/architecture/140-arch.context-forge.md',
      { docType: 'architecture', project: 'test', status: 'complete', component: 'foo', dateCreated: '20260101', dateUpdated: '20260301' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'archIndex'");
    expect(findings[0].fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'archIndex',
      value: '140',
    });
  });

  it('includes fixAction for missing component on architecture', () => {
    const findings = validateFrontmatter(
      '/project/user/architecture/140-arch.context-forge-restructure.md',
      { docType: 'architecture', project: 'test', status: 'complete', archIndex: '140', dateCreated: '20260101', dateUpdated: '20260301' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'component'");
    expect(findings[0].fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'component',
      value: 'context-forge-restructure',
    });
  });

  it('includes fixAction for missing project when projectName provided', () => {
    const findings = validateFrontmatter(
      '/project/user/slices/100-slice.foundation.md',
      { docType: 'slice-design', slice: 'foundation', status: 'complete', dateCreated: '20260101', dateUpdated: '20260301' },
      { projectName: 'context-forge' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'project'");
    expect(findings[0].description).toContain("inferred: 'context-forge'");
    expect(findings[0].fixAction).toEqual({
      type: 'update-frontmatter',
      field: 'project',
      value: 'context-forge',
    });
  });

  it('no fixAction for missing project when projectName not provided', () => {
    const findings = validateFrontmatter(
      '/project/user/slices/100-slice.foundation.md',
      { docType: 'slice-design', slice: 'foundation', status: 'complete', dateCreated: '20260101', dateUpdated: '20260301' },
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'project'");
    expect(findings[0].fixAction).toBeUndefined();
  });
});

describe('validateFrontmatter — review field (#57, slice 911; renamed from codeReview, slice 914)', () => {
  const baseSliceDesign = {
    docType: 'slice-design',
    slice: 'docs-only-example',
    project: 'test',
    status: 'complete',
    dateCreated: '20260101',
    dateUpdated: '20260301',
  };

  it('review absent produces no finding (default: reviews required)', () => {
    const findings = validateFrontmatter('/test.md', baseSliceDesign);
    expect(findings).toHaveLength(0);
  });

  it('review: none produces no finding', () => {
    const findings = validateFrontmatter('/test.md', { ...baseSliceDesign, review: 'none' });
    expect(findings).toHaveLength(0);
  });

  it('an unrecognized review value produces an invalid-value finding', () => {
    const findings = validateFrontmatter('/test.md', { ...baseSliceDesign, review: 'skip' });
    expect(findings).toHaveLength(1);
    expect(findings[0].description).toContain("'skip'");
    expect(findings[0].description).toContain('review');
    expect(findings[0].description).toContain('Invalid value');
  });
});
