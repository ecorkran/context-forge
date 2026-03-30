import { describe, it, expect } from 'vitest';
import {
  FRONTMATTER_SCHEMAS,
  VALID_STATUSES,
  validateFrontmatter,
  inferDocTypeFromPath,
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
