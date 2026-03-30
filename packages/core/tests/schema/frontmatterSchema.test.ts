import { describe, it, expect } from 'vitest';
import {
  FRONTMATTER_SCHEMAS,
  VALID_STATUSES,
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
