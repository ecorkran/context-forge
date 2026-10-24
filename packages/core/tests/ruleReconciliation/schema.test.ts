import { describe, it, expect } from 'vitest';
import {
  GENERATED_MARKER,
  MANAGED_BEGIN_MARKER,
  MANAGED_END_MARKER,
  RULE_RESOLUTIONS_VERSION,
  RuleResolutionsError,
  validateRuleResolutionsFile,
} from '../../src/ruleReconciliation/index.js';

const FILE = '/proj/.context-forge/rule-resolutions.json';
const valid = { guideRule: 'git.md', projectSource: 'CLAUDE.md', statement: 'Never merge locally.' };
const fileOf = (...resolutions: unknown[]) => ({ version: RULE_RESOLUTIONS_VERSION, resolutions });

function rejection(data: unknown): RuleResolutionsError {
  try {
    validateRuleResolutionsFile(data, FILE);
  } catch (error) {
    expect(error).toBeInstanceOf(RuleResolutionsError);
    return error as RuleResolutionsError;
  }
  throw new Error('expected validation to throw');
}

describe('validateRuleResolutionsFile', () => {
  it('accepts a valid file', () => {
    expect(validateRuleResolutionsFile(fileOf(valid), FILE).resolutions).toEqual([valid]);
  });

  it('accepts two records sharing a pair', () => {
    const second = { ...valid, statement: 'Another point.' };
    expect(validateRuleResolutionsFile(fileOf(valid, second), FILE).resolutions).toHaveLength(2);
  });

  it('rejects an unknown version, naming the file', () => {
    const error = rejection({ version: 2, resolutions: [] });
    expect(error.message).toContain(FILE);
    expect(error.message).toContain('version');
  });

  it.each([['null', null], ['an array', []], ['a string', 'x']])('rejects %s', (_label, data) => {
    expect(rejection(data).message).toContain(FILE);
  });

  it('rejects a non-array resolutions field', () => {
    expect(rejection({ version: RULE_RESOLUTIONS_VERSION, resolutions: {} }).message).toContain('resolutions');
  });

  it('rejects a non-object record', () => {
    expect(rejection(fileOf('nope')).message).toContain(FILE);
  });

  it.each(['guideRule', 'projectSource', 'statement'])('rejects a missing %s', (field) => {
    const record: Record<string, unknown> = { ...valid };
    delete record[field];
    expect(rejection(fileOf(record)).message).toContain(field);
  });

  it('rejects an empty statement', () => {
    expect(rejection(fileOf({ ...valid, statement: '' })).message).toContain('statement');
  });

  it.each([['\n'], ['\r']])('rejects a statement containing a line break (%j)', (lineBreak) => {
    expect(rejection(fileOf({ ...valid, statement: `one${lineBreak}two` })).message).toContain('statement');
  });

  it.each([MANAGED_BEGIN_MARKER, MANAGED_END_MARKER, GENERATED_MARKER])(
    'rejects a statement containing the marker %s',
    (marker) => {
      expect(rejection(fileOf({ ...valid, statement: `before ${marker} after` })).message).toContain('statement');
    },
  );

  it('rejects a backtick in guideRule', () => {
    expect(rejection(fileOf({ ...valid, guideRule: 'git`.md' })).message).toContain('guideRule');
  });

  it('rejects a backtick in projectSource', () => {
    expect(rejection(fileOf({ ...valid, projectSource: 'CL`AUDE.md' })).message).toContain('projectSource');
  });
});
