import { describe, it, expect } from 'vitest';
import {
  resolveFieldName,
  resolvePhaseValue,
  validateFieldValue,
  getSchema,
  PROJECT_FIELDS,
  FIELD_ALIASES,
} from '../../src/schema/projectSchema.js';

describe('projectSchema', () => {
  describe('resolveFieldName', () => {
    it('resolves alias to canonical name', () => {
      expect(resolveFieldName('phase')).toBe('developmentPhase');
      expect(resolveFieldName('arch')).toBe('fileArch');
      expect(resolveFieldName('plan')).toBe('fileSlicePlan');
      expect(resolveFieldName('hld')).toBe('fileHLD');
      expect(resolveFieldName('spec')).toBe('fileSpec');
      expect(resolveFieldName('slice')).toBe('fileSlice');
      expect(resolveFieldName('tasks')).toBe('fileTasks');
      expect(resolveFieldName('path')).toBe('projectPath');
      expect(resolveFieldName('date')).toBe('dateProject');
    });

    it('passes through canonical field names', () => {
      expect(resolveFieldName('developmentPhase')).toBe('developmentPhase');
      expect(resolveFieldName('fileArch')).toBe('fileArch');
      expect(resolveFieldName('name')).toBe('name');
      expect(resolveFieldName('id')).toBe('id');
      expect(resolveFieldName('createdAt')).toBe('createdAt');
    });

    it('resolves case-insensitively', () => {
      expect(resolveFieldName('Phase')).toBe('developmentPhase');
      expect(resolveFieldName('ARCH')).toBe('fileArch');
      expect(resolveFieldName('DevelopmentPhase')).toBe('developmentPhase');
      expect(resolveFieldName('FILEARCH')).toBe('fileArch');
      expect(resolveFieldName('projectpath')).toBe('projectPath');
    });

    it('returns undefined for unknown fields', () => {
      expect(resolveFieldName('foobar')).toBeUndefined();
      expect(resolveFieldName('')).toBeUndefined();
      expect(resolveFieldName('xyz')).toBeUndefined();
    });
  });

  describe('resolvePhaseValue', () => {
    it('resolves phase numbers', () => {
      expect(resolvePhaseValue('1')).toBe('Phase 1: Concept');
      expect(resolvePhaseValue('4')).toBe('Phase 4: Slice Design');
      expect(resolvePhaseValue('6')).toBe('Phase 6: Implementation');
      expect(resolvePhaseValue('7')).toBe('Phase 7: Integration');
    });

    it('resolves short names', () => {
      expect(resolvePhaseValue('concept')).toBe('Phase 1: Concept');
      expect(resolvePhaseValue('implementation')).toBe('Phase 6: Implementation');
      expect(resolvePhaseValue('slice-design')).toBe('Phase 4: Slice Design');
      expect(resolvePhaseValue('task-breakdown')).toBe('Phase 5: Task Breakdown');
    });

    it('passes through full phase strings', () => {
      expect(resolvePhaseValue('Phase 4: Slice Design')).toBe('Phase 4: Slice Design');
      expect(resolvePhaseValue('Phase 6: Implementation')).toBe('Phase 6: Implementation');
    });

    it('resolves case-insensitively', () => {
      expect(resolvePhaseValue('Implementation')).toBe('Phase 6: Implementation');
      expect(resolvePhaseValue('CONCEPT')).toBe('Phase 1: Concept');
      expect(resolvePhaseValue('Slice-Design')).toBe('Phase 4: Slice Design');
    });

    it('resolves special phases', () => {
      expect(resolvePhaseValue('ad-hoc-tasks')).toBe('Ad-Hoc Tasks');
      expect(resolvePhaseValue('custom-instruction')).toBe('Custom Instruction');
      expect(resolvePhaseValue('Ad-Hoc Tasks')).toBe('Ad-Hoc Tasks');
    });

    it('returns undefined for invalid input', () => {
      expect(resolvePhaseValue('99')).toBeUndefined();
      expect(resolvePhaseValue('0')).toBeUndefined();
      expect(resolvePhaseValue('foobar')).toBeUndefined();
      expect(resolvePhaseValue('')).toBeUndefined();
    });
  });

  describe('validateFieldValue', () => {
    it('returns valid for correct enum values', () => {
      expect(validateFieldValue('workType', 'start')).toEqual({ valid: true });
      expect(validateFieldValue('workType', 'continue')).toEqual({ valid: true });
      expect(validateFieldValue('developmentPhase', 'Phase 4: Slice Design')).toEqual({ valid: true });
    });

    it('returns error for invalid enum values', () => {
      const result = validateFieldValue('workType', 'foo');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('foo');
      expect(result.error).toContain('start');
      expect(result.error).toContain('continue');
    });

    it('returns valid for non-enum fields (any value accepted)', () => {
      expect(validateFieldValue('name', 'anything')).toEqual({ valid: true });
      expect(validateFieldValue('projectPath', '/some/path')).toEqual({ valid: true });
      expect(validateFieldValue('fileArch', 'arch.md')).toEqual({ valid: true });
    });

    it('returns valid for unknown fields (no constraint)', () => {
      expect(validateFieldValue('unknownField', 'value')).toEqual({ valid: true });
    });
  });

  describe('getSchema', () => {
    it('returns object with fields, aliases, groups keys', () => {
      const schema = getSchema();
      expect(schema).toHaveProperty('fields');
      expect(schema).toHaveProperty('aliases');
      expect(schema).toHaveProperty('groups');
    });

    it('fields array contains all ProjectData fields', () => {
      const schema = getSchema();
      const fieldNames = schema.fields.map((f) => f.field);
      expect(fieldNames).toContain('name');
      expect(fieldNames).toContain('id');
      expect(fieldNames).toContain('projectPath');
      expect(fieldNames).toContain('template');
      expect(fieldNames).toContain('fileArch');
      expect(fieldNames).toContain('fileSlicePlan');
      expect(fieldNames).toContain('fileHLD');
      expect(fieldNames).toContain('fileSpec');
      expect(fieldNames).toContain('fileSlice');
      expect(fieldNames).toContain('fileTasks');
      expect(fieldNames).toContain('developmentPhase');
      expect(fieldNames).toContain('instruction');
      expect(fieldNames).toContain('workType');
      expect(fieldNames).toContain('dateProject');
      expect(fieldNames).toContain('createdAt');
      expect(fieldNames).toContain('updatedAt');
    });

    it('aliases object maps all defined aliases', () => {
      const schema = getSchema();
      expect(schema.aliases).toEqual({
        phase: 'developmentPhase',
        date: 'dateProject',
        arch: 'fileArch',
        slice: 'fileSlice',
        tasks: 'fileTasks',
        plan: 'fileSlicePlan',
        hld: 'fileHLD',
        spec: 'fileSpec',
        path: 'projectPath',
      });
    });

    it('groups array has correct order', () => {
      const schema = getSchema();
      expect(schema.groups).toEqual(['identity', 'artifacts', 'workflow', 'metadata']);
    });
  });

  describe('PROJECT_FIELDS consistency', () => {
    it('readonly fields are id, createdAt, updatedAt', () => {
      const readonlyFields = PROJECT_FIELDS.filter((f) => f.readonly).map((f) => f.field);
      expect(readonlyFields).toEqual(expect.arrayContaining(['id', 'createdAt', 'updatedAt']));
      expect(readonlyFields).toHaveLength(3);
    });

    it('every alias in FIELD_ALIASES maps to a valid field', () => {
      const fieldNames = new Set(PROJECT_FIELDS.map((f) => f.field));
      for (const canonical of Object.values(FIELD_ALIASES)) {
        expect(fieldNames.has(canonical)).toBe(true);
      }
    });
  });
});
