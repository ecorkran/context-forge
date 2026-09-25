import { describe, it, expect } from 'vitest';
import { mergeCheckResults } from '../../src/introspection/mergeCheckResults.js';
import type { ConsistencyCheckResult, ConsistencyFinding } from '../../src/introspection/types.js';

function makeFinding(overrides: Partial<ConsistencyFinding> = {}): ConsistencyFinding {
  return {
    rule: 'review-gate',
    severity: 'warning',
    location: '/repo/project-documents/user/architecture/900-slices.maintenance-and-refactoring.md',
    description: 'Slice 917 requires a tasks review before proceeding — no review artifact found.',
    suggestedFix: 'Run the tasks review for slice 917',
    fixable: false,
    ...overrides,
  };
}

function makeResult(
  projectPath: string,
  findings: ConsistencyFinding[],
): ConsistencyCheckResult {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const infos = findings.filter((f) => f.severity === 'info').length;
  return {
    projectPath,
    findings,
    totalFindings: findings.length,
    errors,
    warnings,
    infos,
    summary: `${findings.length} findings`,
  };
}

describe('mergeCheckResults', () => {
  it('collapses an absolute-path location under two different roots to one finding, keeping the first result\'s original path', () => {
    const findingA = makeFinding({ location: '/repo/main/docs/foo.md' });
    const findingB = makeFinding({ location: '/repo/wt-2/docs/foo.md' });
    const results = [makeResult('/repo/main', [findingA]), makeResult('/repo/wt-2', [findingB])];

    const merged = mergeCheckResults(results);

    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0].location).toBe('/repo/main/docs/foo.md');
  });

  it('collapses a description embedding the root under two roots (personal-scope-key shape)', () => {
    const findingA = makeFinding({
      rule: 'personal-scope-key',
      location: 'config.json',
      description: 'Shared config at /repo/main/.cf/config.json holds a personal key',
    });
    const findingB = makeFinding({
      rule: 'personal-scope-key',
      location: 'config.json',
      description: 'Shared config at /repo/wt-2/.cf/config.json holds a personal key',
    });
    const results = [makeResult('/repo/main', [findingA]), makeResult('/repo/wt-2', [findingB])];

    const merged = mergeCheckResults(results);

    expect(merged.findings).toHaveLength(1);
  });

  it('does not let a view\'s root match as a bare prefix inside a sibling path (boundary: /repo vs /repo-other)', () => {
    // Both findings below are in the same view, whose root is /repo. Finding A's
    // location is legitimately under /repo, so normalizing it against that root
    // is correct. Finding B's location is under the sibling /repo-other, which
    // merely starts with the substring "/repo" — normalizing against root /repo
    // must not treat that as a match (no separator/end-of-string follows "/repo"
    // in "/repo-other"), so B's location must come through unnormalized and the
    // two must stay distinct after the merge.
    // A second (unrelated, two-view) result forces the real merge loop to run —
    // the results.length === 1 early return never calls dedupKey at all.
    const findingA = makeFinding({ location: '/repo/docs/foo.md', description: 'finding A' });
    const findingB = makeFinding({ location: '/repo-other/docs/foo.md', description: 'finding B' });
    const unrelated = makeFinding({ rule: 'other-rule', location: 'slice plan entry 1', description: 'unrelated' });
    const results = [
      makeResult('/repo', [findingA, findingB, unrelated]),
      makeResult('/repo/other-view', [unrelated]),
    ];

    const merged = mergeCheckResults(results);

    expect(merged.findings).toHaveLength(3);
    expect(merged.findings.map((f) => f.location)).toEqual(
      expect.arrayContaining(['/repo/docs/foo.md', '/repo-other/docs/foo.md', 'slice plan entry 1']),
    );
  });

  it('collapses a non-path location identical across views unchanged', () => {
    const findingA = makeFinding({ location: 'slice plan entry 250' });
    const findingB = makeFinding({ location: 'slice plan entry 250' });
    const results = [makeResult('/repo/main', [findingA]), makeResult('/repo/wt-2', [findingB])];

    const merged = mergeCheckResults(results);

    expect(merged.findings).toHaveLength(1);
  });

  it('collapses the real #100 shape: the 900-slices plan path under two checkout roots', () => {
    const findingA = makeFinding({
      location: '/repo/main/project-documents/user/architecture/900-slices.maintenance-and-refactoring.md',
    });
    const findingB = makeFinding({
      location: '/repo/wtrepro/project-documents/user/architecture/900-slices.maintenance-and-refactoring.md',
    });
    const results = [makeResult('/repo/main', [findingA]), makeResult('/repo/wtrepro', [findingB])];

    const merged = mergeCheckResults(results);

    expect(merged.findings).toHaveLength(1);
    expect(merged.findings[0].location).toBe(
      '/repo/main/project-documents/user/architecture/900-slices.maintenance-and-refactoring.md',
    );
  });

  it('single result is returned with only projectPath replaced by invokingPath, byte-identical otherwise', () => {
    const finding = makeFinding();
    const result = makeResult('/repo/main', [finding]);

    const merged = mergeCheckResults([result], '/repo/invoking');

    expect(merged).toEqual({ ...result, projectPath: '/repo/invoking' });
  });

  it('single result with no invokingPath is returned byte-identical', () => {
    const finding = makeFinding();
    const result = makeResult('/repo/main', [finding]);

    const merged = mergeCheckResults([result]);

    expect(merged).toBe(result);
  });

  it('counts reflect the deduped finding list', () => {
    const shared = makeFinding({ severity: 'error', location: '/repo/main/docs/foo.md' });
    const sharedOther = makeFinding({ severity: 'error', location: '/repo/wt-2/docs/foo.md' });
    const uniqueWarning = makeFinding({
      severity: 'warning',
      rule: 'other-rule',
      location: '/repo/wt-2/docs/bar.md',
      description: 'only in wt-2',
    });
    const results = [
      makeResult('/repo/main', [shared]),
      makeResult('/repo/wt-2', [sharedOther, uniqueWarning]),
    ];

    const merged = mergeCheckResults(results);

    expect(merged.totalFindings).toBe(2);
    expect(merged.errors).toBe(1);
    expect(merged.warnings).toBe(1);
    expect(merged.infos).toBe(0);
    expect(merged.summary).toContain('2 findings');
  });
});
