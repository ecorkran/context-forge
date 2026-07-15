import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect, vi } from 'vitest';
import {
  positionToReviewType,
  normalizeVerdict,
  evaluateVerdict,
  resolveGateConfig,
  evaluateReviewGate,
  type Boundary,
  type ThresholdToken,
  type UnknownPolicy,
} from '../../src/introspection/reviewGate.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

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

  it('recognizes a known verdict annotated with a resolution note', () => {
    expect(normalizeVerdict('CONCERNS (resolved — see verifiedUpdate)')).toBe('CONCERNS');
    expect(normalizeVerdict('PASS (resolved - see notes)')).toBe('PASS');
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

const BASE_VALUES = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns' as ThresholdToken,
  'workflow.review_unknown_as': 'fail' as UnknownPolicy,
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
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
      'workflow.review_gates.code.threshold': 'pass',
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

describe('evaluateReviewGate', () => {
  it('returns null when gating is off', async () => {
    const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_enabled': false });
    const result = await evaluateReviewGate(PROJECT_ROOT, 300, 'preAdvance', config);
    expect(result).toBeNull();
  });

  it('returns pending-review with no artifactPath when the review is absent', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const result = await evaluateReviewGate(PROJECT_ROOT, 300, 'preAdvance', config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('pending-review');
    expect(result?.reviewType).toBe('code');
    expect(result?.artifactPath).toBeUndefined();
  });

  it('returns review-failed with artifactPath when the verdict does not clear', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const result = await evaluateReviewGate(PROJECT_ROOT, 400, 'preAdvance', config);
    expect(result).not.toBeNull();
    expect(result?.status).toBe('review-failed');
    expect(result?.rationale).toContain('FAIL');
    expect(result?.artifactPath).toBe('project-documents/user/reviews/400-review.code.first.md');
  });

  it('returns null when the verdict clears the threshold', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const result = await evaluateReviewGate(PROJECT_ROOT, 401, 'preAdvance', config);
    expect(result).toBeNull();
  });

  it('accepts a pre-resolved ResolvedGate and skips re-reading config', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const resolved = await resolveGateConfig(config);
    expect(resolved).not.toBeNull();

    vi.mocked(config.get).mockClear();
    const result = await evaluateReviewGate(PROJECT_ROOT, 400, 'preAdvance', config, resolved!);
    expect(result?.status).toBe('review-failed');
    expect(config.get).not.toHaveBeenCalled();
  });

  describe('review-exempt declaration (#57, slice 911; widened to all slice-scoped boundaries, slice 914)', () => {
    it('review: none at preAdvance clears the gate even with no review artifact present', async () => {
      // Fixture 405: complete tasks, review: none, no review artifact at all.
      const config = makeStubConfig(BASE_VALUES);
      const result = await evaluateReviewGate(PROJECT_ROOT, 405, 'preAdvance', config);
      expect(result).toBeNull();
    });

    it('review: none also clears preTasks and preImplementation — a review-exempt slice needs no reviews at all', async () => {
      // Fixture 405: review: none applies to every slice-scoped boundary, not just preAdvance.
      const config = makeStubConfig(BASE_VALUES);
      const preTasks = await evaluateReviewGate(PROJECT_ROOT, 405, 'preTasks', config);
      expect(preTasks).toBeNull();
      const preImplementation = await evaluateReviewGate(PROJECT_ROOT, 405, 'preImplementation', config);
      expect(preImplementation).toBeNull();
    });

    it('regression: a slice WITHOUT the review declaration, missing a code review, still returns pending-review at preAdvance', async () => {
      // Fixture 300: all-done, complete, no review field, no review artifact.
      const config = makeStubConfig(BASE_VALUES);
      const result = await evaluateReviewGate(PROJECT_ROOT, 300, 'preAdvance', config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending-review');
    });
  });

  describe('effective-date grandfather cutoff (slice 911)', () => {
    function writeSliceDesign(root: string, index: number, name: string, dateCreated: string): void {
      mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
      writeFileSync(
        join(root, 'project-documents', 'user', 'slices', `${index}-slice.${name}.md`),
        `---\nslice: ${name}\nstatus: complete\ndateCreated: ${dateCreated}\n---\n\n# Slice ${index}\n`,
      );
    }

    function writeArchDoc(root: string, index: number, name: string, dateCreated: string): void {
      mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
      writeFileSync(
        join(root, 'project-documents', 'user', 'architecture', `${index}-arch.${name}.md`),
        `---\ndocType: architecture\nproject: test\ndateCreated: ${dateCreated}\n---\n\n# Arch ${index}\n`,
      );
    }

    it('preAdvance: a slice dated before the cutoff clears the gate with no review artifact present', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-'));
      writeSliceDesign(root, 900, 'old-slice', '20260101');
      const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_gate_effective_date': '20260601' });
      const result = await evaluateReviewGate(root, 900, 'preAdvance', config);
      expect(result).toBeNull();
    });

    it('preAdvance: a slice dated on/after the cutoff still gates normally (pending-review)', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-'));
      writeSliceDesign(root, 900, 'new-slice', '20260701');
      const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_gate_effective_date': '20260601' });
      const result = await evaluateReviewGate(root, 900, 'preAdvance', config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending-review');
    });

    it('preSlicePlan: an architecture dated before the cutoff clears the gate (reads docs.architecture, not docs.sliceDesign)', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-arch-'));
      writeArchDoc(root, 900, 'old-arch', '20260101');
      const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_gate_effective_date': '20260601' });
      const result = await evaluateReviewGate(root, 900, 'preSlicePlan', config);
      expect(result).toBeNull();
    });

    it('preSlicePlan: an architecture dated on/after the cutoff still gates normally', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-arch-'));
      writeArchDoc(root, 900, 'new-arch', '20260701');
      const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_gate_effective_date': '20260601' });
      const result = await evaluateReviewGate(root, 900, 'preSlicePlan', config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending-review');
    });

    it('preSlicePlan: review: none on the slice-design does not clear it — that boundary reads docs.architecture, not docs.sliceDesign', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-review-exempt-arch-'));
      writeArchDoc(root, 900, 'new-arch', '20260701');
      mkdirSync(join(root, 'project-documents', 'user', 'slices'), { recursive: true });
      writeFileSync(
        join(root, 'project-documents', 'user', 'slices', '900-slice.exempt.md'),
        '---\nslice: exempt\nstatus: complete\nreview: none\n---\n\n# Slice 900\n',
      );
      const config = makeStubConfig(BASE_VALUES);
      const result = await evaluateReviewGate(root, 900, 'preSlicePlan', config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending-review');
    });

    it('empty cutoff (default) applies no grandfathering — an old-dated slice still gates normally', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-default-'));
      writeSliceDesign(root, 900, 'ancient-slice', '20200101');
      const config = makeStubConfig(BASE_VALUES); // effective_date: '' from BASE_VALUES
      const result = await evaluateReviewGate(root, 900, 'preAdvance', config);
      expect(result).not.toBeNull();
      expect(result?.status).toBe('pending-review');
    });

    it('a pre-resolved ResolvedGate carries the cutoff without re-reading config', async () => {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-cutoff-preresolved-'));
      writeSliceDesign(root, 900, 'old-slice', '20260101');
      const config = makeStubConfig({ ...BASE_VALUES, 'workflow.review_gate_effective_date': '20260601' });
      const resolved = await resolveGateConfig(config);
      expect(resolved?.effectiveDate).toBe('20260601');

      vi.mocked(config.get).mockClear();
      const result = await evaluateReviewGate(root, 900, 'preAdvance', config, resolved!);
      expect(result).toBeNull();
      expect(config.get).not.toHaveBeenCalled();
    });
  });
});
