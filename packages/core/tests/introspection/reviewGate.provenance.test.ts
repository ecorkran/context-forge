import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  evaluateReviewGate,
  resolveGateConfig,
  isBlockingGate,
  WEAK_PASS_KEY,
  type GateResult,
  type GateEvaluation,
} from '../../src/introspection/reviewGate.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const INDEX = 960;
const BASE_VALUES = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'pass',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_weak_pass_as': 'pass',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
};

/** One review part: a verdict plus any provenance frontmatter lines. */
interface PartSpec {
  verdict: string;
  provenance?: string[];
}

/** Writes code-review parts for INDEX into a fresh project; returns root and relative paths. */
function makeProject(parts: PartSpec[]): { root: string; paths: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'cf-gate-provenance-'));
  const relDir = join('project-documents', 'user', 'reviews');
  mkdirSync(join(root, relDir), { recursive: true });
  const paths = parts.map((part, i) => {
    const suffix = parts.length > 1 ? `.part-${i + 1}` : '';
    const relPath = join(relDir, `${INDEX}-review.code.feature${suffix}.md`);
    const lines = ['---', 'docType: review', `verdict: ${part.verdict}`, ...(part.provenance ?? []), '---', ''];
    writeFileSync(join(root, relPath), lines.join('\n'));
    return relPath;
  });
  return { root, paths };
}

function gate(root: string, overrides: Record<string, string> = {}): Promise<GateResult | null> {
  return evaluateReviewGate(root, INDEX, 'preAdvance', makeStubConfig({ ...BASE_VALUES, ...overrides }));
}

function asBlocking(result: GateResult | null): GateEvaluation {
  if (!isBlockingGate(result)) throw new Error(`expected a blocking gate, got ${JSON.stringify(result)}`);
  return result;
}

const DERIVED = ['verdictSource: derived'];
const RECOVERED = ['verdictSource: stated', 'recoveryTurn: true'];

describe('evaluateReviewGate — weak-provenance PASS (slice 928)', () => {
  it('1: key at default → derived PASS clears, reported in weakParts', async () => {
    const { root, paths } = makeProject([{ verdict: 'PASS', provenance: DERIVED }]);
    expect(await gate(root)).toEqual({ status: 'clears', weakParts: [paths[0]] });
  });

  it('2: concerns + threshold pass → derived PASS is review-failed, rationale names provenance and key', async () => {
    const { root, paths } = makeProject([{ verdict: 'PASS', provenance: DERIVED }]);
    const result = asBlocking(await gate(root, { [WEAK_PASS_KEY]: 'concerns' }));
    expect(result.status).toBe('review-failed');
    expect(result.artifactPath).toBe(paths[0]);
    expect(result.rationale).toContain('derived');
    expect(result.rationale).toContain(WEAK_PASS_KEY);
    expect(result.rationale).toContain('treated as CONCERNS');
  });

  it('3: recoveryTurn: true with verdictSource: stated behaves like 2', async () => {
    const { root } = makeProject([{ verdict: 'PASS', provenance: RECOVERED }]);
    const result = asBlocking(await gate(root, { [WEAK_PASS_KEY]: 'concerns' }));
    expect(result.status).toBe('review-failed');
    expect(result.rationale).toContain('recovered on a second prompt');
    expect(result.rationale).toContain(WEAK_PASS_KEY);
  });

  it('4: concerns + threshold concerns → derived PASS clears', async () => {
    const { root, paths } = makeProject([{ verdict: 'PASS', provenance: DERIVED }]);
    const result = await gate(root, { [WEAK_PASS_KEY]: 'concerns', 'workflow.review_threshold': 'concerns' });
    expect(result).toEqual({ status: 'clears', weakParts: [paths[0]] });
  });

  it('5: fail → derived PASS blocks at both thresholds', async () => {
    const { root } = makeProject([{ verdict: 'PASS', provenance: DERIVED }]);
    for (const threshold of ['pass', 'concerns']) {
      const result = await gate(root, { [WEAK_PASS_KEY]: 'fail', 'workflow.review_threshold': threshold });
      expect(asBlocking(result).status).toBe('review-failed');
    }
  });

  it('6: stated, absent, and recoveryTurn: false are never weak', async () => {
    for (const provenance of [['verdictSource: stated'], [], ['recoveryTurn: false']]) {
      const { root } = makeProject([{ verdict: 'PASS', provenance }]);
      expect(await gate(root, { [WEAK_PASS_KEY]: 'fail' })).toEqual({ status: 'clears', weakParts: [] });
    }
  });

  it('6: unrecognized values are weak and never throw', async () => {
    for (const provenance of [['verdictSource: garbage'], ['recoveryTurn: yes']]) {
      const { root, paths } = makeProject([{ verdict: 'PASS', provenance }]);
      expect(await gate(root)).toEqual({ status: 'clears', weakParts: [paths[0]] });
      expect(asBlocking(await gate(root, { [WEAK_PASS_KEY]: 'fail' })).status).toBe('review-failed');
    }
  });

  it('7: CONCERNS and FAIL results are identical with and without provenance keys', async () => {
    for (const verdict of ['CONCERNS', 'FAIL']) {
      for (const threshold of ['pass', 'concerns']) {
        const overrides = { [WEAK_PASS_KEY]: 'fail', 'workflow.review_threshold': threshold };
        const plain = await gate(makeProject([{ verdict }]).root, overrides);
        const weak = await gate(makeProject([{ verdict, provenance: [...DERIVED, 'recoveryTurn: true'] }]).root, overrides);
        expect(weak?.status).toBe(plain?.status);
        if (weak?.status === 'clears') expect(weak.weakParts).toEqual([]);
      }
    }
  });

  it('8: split review [stated PASS, derived PASS] under fail → review-failed on the derived part', async () => {
    const { root, paths } = makeProject([
      { verdict: 'PASS', provenance: ['verdictSource: stated'] },
      { verdict: 'PASS', provenance: DERIVED },
    ]);
    const result = asBlocking(await gate(root, { [WEAK_PASS_KEY]: 'fail' }));
    expect(result.status).toBe('review-failed');
    expect(result.artifactPath).toBe(paths[1]);
  });

  it('8: split review at default reports only the weak part in weakParts', async () => {
    const { root, paths } = makeProject([
      { verdict: 'PASS', provenance: ['verdictSource: stated'] },
      { verdict: 'PASS', provenance: DERIVED },
    ]);
    expect(await gate(root)).toEqual({ status: 'clears', weakParts: [paths[1]] });
  });
});

describe('resolveGateConfig — review_weak_pass_as', () => {
  it('resolves the configured policy', async () => {
    const resolved = await resolveGateConfig(makeStubConfig({ ...BASE_VALUES, [WEAK_PASS_KEY]: 'concerns' }));
    expect(resolved?.weakPassAs).toBe('concerns');
  });

  it('throws naming the key for an invalid value', async () => {
    await expect(
      resolveGateConfig(makeStubConfig({ ...BASE_VALUES, [WEAK_PASS_KEY]: 'maybe' })),
    ).rejects.toThrow(WEAK_PASS_KEY);
  });
});
