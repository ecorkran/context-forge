import { describe, it, expect, vi } from 'vitest';
import {
  positionToReviewType,
  normalizeVerdict,
  evaluateVerdict,
  resolveGateConfig,
  type Boundary,
  type ThresholdToken,
  type UnknownPolicy,
} from '../../src/introspection/reviewGate.js';
import type { ConfigManager, ConfigResult } from '../../src/config/ConfigManager.js';

describe('positionToReviewType', () => {
  it('maps each boundary to its review type', () => {
    const cases: [Boundary, string][] = [
      ['preSlicePlan', 'arch'],
      ['preTasks', 'slice'],
      ['preImplementation', 'tasks'],
      ['preAdvance', 'code'],
    ];
    for (const [boundary, expected] of cases) {
      expect(positionToReviewType(boundary)).toBe(expected);
    }
  });
});

describe('normalizeVerdict', () => {
  it('recognizes known verdicts case-insensitively and trims whitespace', () => {
    expect(normalizeVerdict('PASS')).toBe('PASS');
    expect(normalizeVerdict('pass')).toBe('PASS');
    expect(normalizeVerdict(' concerns ')).toBe('CONCERNS');
    expect(normalizeVerdict('Fail')).toBe('FAIL');
  });

  it('degrades absent or unrecognized verdicts to UNKNOWN', () => {
    expect(normalizeVerdict(undefined)).toBe('UNKNOWN');
    expect(normalizeVerdict('')).toBe('UNKNOWN');
    expect(normalizeVerdict('garbage')).toBe('UNKNOWN');
  });
});

describe('evaluateVerdict', () => {
  it('PASS always clears', () => {
    expect(evaluateVerdict('PASS', 'pass', 'fail')).toBe('clears');
    expect(evaluateVerdict('PASS', 'concerns', 'fail')).toBe('clears');
  });

  it('FAIL always fails', () => {
    expect(evaluateVerdict('FAIL', 'pass', 'pass')).toBe('failed');
    expect(evaluateVerdict('FAIL', 'concerns', 'pass')).toBe('failed');
  });

  it('CONCERNS clears only under threshold=concerns', () => {
    expect(evaluateVerdict('CONCERNS', 'pass', 'fail')).toBe('failed');
    expect(evaluateVerdict('CONCERNS', 'concerns', 'fail')).toBe('clears');
  });

  it('UNKNOWN substitutes the stand-in verdict per unknownAs, then applies the table', () => {
    expect(evaluateVerdict('UNKNOWN', 'concerns', 'fail')).toBe('failed');
    expect(evaluateVerdict('UNKNOWN', 'pass', 'fail')).toBe('failed');
    expect(evaluateVerdict('UNKNOWN', 'concerns', 'concerns')).toBe('clears');
    expect(evaluateVerdict('UNKNOWN', 'pass', 'concerns')).toBe('failed');
    expect(evaluateVerdict('UNKNOWN', 'pass', 'pass')).toBe('clears');
    expect(evaluateVerdict('UNKNOWN', 'concerns', 'pass')).toBe('clears');
  });
});

function makeStubConfig(values: Record<string, unknown>): ConfigManager {
  return {
    get: vi.fn(async (key: string): Promise<ConfigResult> => {
      if (!(key in values)) {
        throw new Error(`Unexpected config key requested in test: "${key}"`);
      }
      return {
        key,
        value: values[key] as string | boolean | number,
        source: 'default',
        description: '',
      };
    }),
  } as unknown as ConfigManager;
}

const BASE_VALUES = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns' as ThresholdToken,
  'workflow.review_unknown_as': 'fail' as UnknownPolicy,
  'workflow.review_gates.pre_slice_plan.threshold': '',
  'workflow.review_gates.pre_tasks.threshold': '',
  'workflow.review_gates.pre_implementation.threshold': '',
  'workflow.review_gates.pre_advance.threshold': '',
};

describe('resolveGateConfig', () => {
  it('returns null when review_enabled is false', async () => {
    const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_enabled': false });
    expect(await resolveGateConfig(config)).toBeNull();
  });

  it('returns null when review_enabled is missing/default', async () => {
    const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_enabled': false });
    expect(await resolveGateConfig(config)).toBeNull();
  });

  it('resolves global threshold and unknownAs when enabled with valid tokens', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const resolved = await resolveGateConfig(config);
    expect(resolved).not.toBeNull();
    expect(resolved?.threshold).toBe('concerns');
    expect(resolved?.unknownAs).toBe('fail');
    expect(resolved?.thresholdFor('preAdvance')).toBe('concerns');
  });

  it('per-gate threshold override beats the global threshold', async () => {
    const config = makeStubConfig({
      ...BASE_VALUES,
      'workflow.review_gates.pre_advance.threshold': 'pass',
    });
    const resolved = await resolveGateConfig(config);
    expect(resolved?.thresholdFor('preAdvance')).toBe('pass');
    expect(resolved?.thresholdFor('preTasks')).toBe('concerns');
  });

  it('empty override falls back to the global threshold', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const resolved = await resolveGateConfig(config);
    expect(resolved?.thresholdFor('preSlicePlan')).toBe('concerns');
  });

  it('throws a descriptive error for an invalid review_threshold token', async () => {
    const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_threshold': 'foobar' });
    await expect(resolveGateConfig(config)).rejects.toThrow(/workflow\.review_threshold/);
    await expect(resolveGateConfig(config)).rejects.toThrow(/foobar/);
  });

  it('throws a descriptive error for an invalid review_unknown_as token', async () => {
    const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_unknown_as': 'maybe' });
    await expect(resolveGateConfig(config)).rejects.toThrow(/workflow\.review_unknown_as/);
    await expect(resolveGateConfig(config)).rejects.toThrow(/maybe/);
  });

  it('propagates a config read failure rather than swallowing it', async () => {
    const config: ConfigManager = {
      get: vi.fn(async () => {
        throw new Error('disk read error');
      }),
    } as unknown as ConfigManager;
    await expect(resolveGateConfig(config)).rejects.toThrow(/disk read error/);
  });
});
