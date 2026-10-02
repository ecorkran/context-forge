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
  evaluateExemption,
  isBlockingGate,
  EXEMPT_REASON,
  type Boundary,
  type GateEvaluation,
  type GateResult,
  type ResolvedGate,
  type ThresholdToken,
  type StandInPolicy,
} from '../../src/introspection/reviewGate.js';
import type { ConfigManager } from '../../src/config/ConfigManager.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

/** Narrows to a blocking result so its GateEvaluation fields can be asserted. */
function asBlocking(result: GateResult | null): GateEvaluation {
  if (!isBlockingGate(result)) throw new Error(`expected a blocking gate, got ${JSON.stringify(result)}`);
  return result;
}

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
  'workflow.review_unknown_as': 'fail' as StandInPolicy,
  'workflow.review_weak_pass_as': 'pass' as StandInPolicy,
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
    const result = asBlocking(await evaluateReviewGate(PROJECT_ROOT, 300, 'preAdvance', config));
    expect(result.status).toBe('pending-review');
    expect(result.reviewType).toBe('code');
    expect(result.artifactPath).toBeUndefined();
  });

  it('returns review-failed with artifactPath when the verdict does not clear', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const result = asBlocking(await evaluateReviewGate(PROJECT_ROOT, 400, 'preAdvance', config));
    expect(result.status).toBe('review-failed');
    expect(result.rationale).toContain('FAIL');
    expect(result.artifactPath).toBe('project-documents/user/reviews/400-review.code.first.md');
  });

  it('returns clears with no weak parts when the verdict clears the threshold', async () => {
    const config = makeStubConfig(BASE_VALUES);
    const result = await evaluateReviewGate(PROJECT_ROOT, 401, 'preAdvance', config);
    expect(result).toEqual({ status: 'clears', weakParts: [] });
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

  describe('split tasks reviews (#106)', () => {
    function makeRoot(verdicts: Array<string | null>): string {
      const root = mkdtempSync(join(tmpdir(), 'cf-gate-parts-'));
      const dir = join(root, 'project-documents', 'user', 'reviews');
      mkdirSync(dir, { recursive: true });
      verdicts.forEach((verdict, i) => {
        const verdictLine = verdict === null ? '' : `verdict: ${verdict}\n`;
        writeFileSync(
          join(dir, `950-review.tasks.big.part-${i + 1}.md`),
          `---\ndocType: review\n${verdictLine}---\n`,
        );
      });
      return root;
    }

    it('blocks when an earlier part fails even though the last part passes', async () => {
      const root = makeRoot(['FAIL', 'PASS']);
      const result = asBlocking(await evaluateReviewGate(root, 950, 'preImplementation', makeStubConfig(BASE_VALUES)));
      expect(result.status).toBe('review-failed');
      expect(result.artifactPath).toContain('part-1');
    });

    it('clears when every part passes', async () => {
      const root = makeRoot(['PASS', 'PASS', 'PASS']);
      const result = await evaluateReviewGate(root, 950, 'preImplementation', makeStubConfig(BASE_VALUES));
      expect(result).toEqual({ status: 'clears', weakParts: [] });
    });

    it('treats a part with no verdict as UNKNOWN through unknownAs', async () => {
      const root = makeRoot(['PASS', null]);
      const strict = makeStubConfig({ ...BASE_VALUES, 'workflow.review_unknown_as': 'fail' });
      const lenient = makeStubConfig({ ...BASE_VALUES, 'workflow.review_unknown_as': 'pass' });
      expect((await evaluateReviewGate(root, 950, 'preImplementation', strict))?.status).toBe('review-failed');
      expect(await evaluateReviewGate(root, 950, 'preImplementation', lenient)).toEqual({ status: 'clears', weakParts: [] });
    });
  });

  describe('review-exempt declaration (#57, slice 911; widened to all slice-scoped boundaries, slice 914)', () => {
    it('review: none at preAdvance clears the gate even with no review artifact present', async () => {
      // Fixture 405: complete tasks, review: none, no review artifact at all.
      const config = makeStubConfig(BASE_VALUES);
      const result = await evaluateReviewGate(PROJECT_ROOT, 405, 'preAdvance', config);
      expect(result).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.ReviewNone });
    });

    it('review: none also clears preTasks and preImplementation — a review-exempt slice needs no reviews at all', async () => {
      // Fixture 405: review: none applies to every slice-scoped boundary, not just preAdvance.
      const config = makeStubConfig(BASE_VALUES);
      const preTasks = await evaluateReviewGate(PROJECT_ROOT, 405, 'preTasks', config);
      expect(preTasks).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.ReviewNone });
      const preImplementation = await evaluateReviewGate(PROJECT_ROOT, 405, 'preImplementation', config);
      expect(preImplementation).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.ReviewNone });
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
      expect(result).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.Grandfathered });
      expect(result?.status === 'exempt' && result.rationale).toContain('20260601');
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
      expect(result).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.Grandfathered });
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
      expect(result).toMatchObject({ status: 'exempt', reason: EXEMPT_REASON.Grandfathered });
      expect(config.get).not.toHaveBeenCalled();
    });
  });
});

describe('evaluateExemption', () => {
  const gate = (effectiveDate: string): ResolvedGate => ({
    threshold: 'pass',
    unknownAs: 'fail',
    weakPassAs: 'pass',
    effectiveDate,
    thresholdFor: () => 'pass',
  });
  const SLICE_BOUNDARIES: Boundary[] = ['preTasks', 'preImplementation', 'preAdvance'];

  it('review: none exempts every slice boundary but not preSlicePlan', () => {
    for (const boundary of SLICE_BOUNDARIES) {
      expect(evaluateExemption(boundary, gate(''), { review: 'none' })?.reason).toBe(EXEMPT_REASON.ReviewNone);
    }
    expect(evaluateExemption('preSlicePlan', gate(''), { review: 'none' })).toBeNull();
  });

  it('grandfathers an artifact created before the effective date, at every boundary', () => {
    const fm = { dateCreated: '20260101' };
    for (const boundary of [...SLICE_BOUNDARIES, 'preSlicePlan'] as Boundary[]) {
      const result = evaluateExemption(boundary, gate('20260601'), fm);
      expect(result?.reason).toBe(EXEMPT_REASON.Grandfathered);
      expect(result?.rationale).toContain('20260601');
    }
  });

  it('grandfather wins over review: none', () => {
    const result = evaluateExemption('preAdvance', gate('20260601'), { dateCreated: '20260101', review: 'none' });
    expect(result?.reason).toBe(EXEMPT_REASON.Grandfathered);
  });

  it('applies no cutoff when the effective date is empty or the artifact is newer', () => {
    expect(evaluateExemption('preAdvance', gate(''), { dateCreated: '20200101' })).toBeNull();
    expect(evaluateExemption('preAdvance', gate('20260601'), { dateCreated: '20260601' })).toBeNull();
  });

  it('returns null for null or empty frontmatter', () => {
    expect(evaluateExemption('preAdvance', gate('20260601'), null)).toBeNull();
    expect(evaluateExemption('preAdvance', gate('20260601'), {})).toBeNull();
  });
});

describe('isBlockingGate', () => {
  it('is true only for pending-review and review-failed', () => {
    expect(isBlockingGate(null)).toBe(false);
    expect(isBlockingGate({ status: 'clears', weakParts: [] })).toBe(false);
    expect(isBlockingGate({ status: 'exempt', reason: EXEMPT_REASON.ReviewNone, rationale: '' })).toBe(false);
    expect(isBlockingGate({ status: 'pending-review', reviewType: 'code', rationale: '' })).toBe(true);
    expect(isBlockingGate({ status: 'review-failed', reviewType: 'code', rationale: '' })).toBe(true);
  });
});
