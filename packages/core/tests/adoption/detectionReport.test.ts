import { describe, expect, it } from 'vitest';
import {
  DETECTION_ERROR_CODES,
  DetectionError,
  INIT_REPORT_VERSION,
  REPORT_VERSION,
  serializeDetectionReport,
  serializeErrorEnvelope,
  toDetectionReport,
  type AdoptionOutcome,
  type ProjectDetection,
} from '../../src/adoption/index.js';

const SOURCE = { files: 37, lines: 2000, capped: true };
const BROWNFIELD: AdoptionOutcome = { kind: 'brownfield', source: SOURCE };

function detection(overrides: Partial<ProjectDetection> = {}): ProjectDetection {
  return {
    projectRoot: '/abs/project',
    outcome: BROWNFIELD,
    source: { measured: true, ...SOURCE },
    history: { kind: 'known', commits: 412, shallow: false },
    docs: ['README.md'],
    adrs: ['docs/adr'],
    ci: ['.github/workflows/ci.yml'],
    ruleFiles: ['CLAUDE.md'],
    artifacts: { concept: null, derivedArchitectures: [], existingStatePlan: null },
    notices: ['a notice'],
    ...overrides,
  };
}

function roundTrip(d: ProjectDetection): unknown {
  return JSON.parse(serializeDetectionReport(toDetectionReport(d)));
}

describe('serializeDetectionReport', () => {
  it('produces the D3 shape with measured source and known history', () => {
    expect(roundTrip(detection())).toEqual({
      reportVersion: REPORT_VERSION,
      projectRoot: '/abs/project',
      outcome: 'brownfield',
      facts: {
        source: { measured: true, lines: 2000, files: 37, capped: true },
        history: { known: true, commits: 412, shallow: false },
        docs: ['README.md'],
        adrs: ['docs/adr'],
        ci: ['.github/workflows/ci.yml'],
        ruleFiles: ['CLAUDE.md'],
      },
      artifacts: { concept: null, derivedArchitectures: [], existingStatePlan: null },
      notices: ['a notice'],
    });
  });

  it('reports an unmeasured source and unknown history with their reasons', () => {
    const report = roundTrip(
      detection({
        outcome: { kind: 'already-planned', artifacts: ['x'], existingStatePlan: null },
        source: { measured: false, reason: 'walk failed' },
        history: { kind: 'unknown', reason: 'not a git repository' },
      }),
    ) as { outcome: string; facts: { source: unknown; history: unknown } };
    expect(report.outcome).toBe('already-planned');
    expect(report.facts.source).toEqual({ measured: false, reason: 'walk failed' });
    expect(report.facts.history).toEqual({ known: false, reason: 'not a git repository' });
  });

  it('passes every outcome kind straight through', () => {
    const outcomes: AdoptionOutcome[] = [
      { kind: 'opted-out' },
      { kind: 'adoption-incomplete', derivedArchitectures: ['a'] },
      { kind: 'already-planned', artifacts: ['x'], existingStatePlan: null },
      BROWNFIELD,
      { kind: 'greenfield', source: SOURCE },
    ];
    for (const outcome of outcomes) {
      expect(toDetectionReport(detection({ outcome })).outcome).toBe(outcome.kind);
    }
  });
});

describe('serializeErrorEnvelope', () => {
  it.each([REPORT_VERSION, INIT_REPORT_VERSION])('parses to exactly the D5 envelope (version %i)', (version) => {
    const envelope = JSON.parse(serializeErrorEnvelope(version, 'path-not-found', 'No such directory: /x'));
    expect(envelope).toEqual({
      reportVersion: version,
      error: { code: 'path-not-found', message: 'No such directory: /x' },
    });
  });
});

describe('DetectionError', () => {
  it('carries its code and cause', () => {
    const cause = new Error('inner');
    const error = new DetectionError(DETECTION_ERROR_CODES[0], 'outer', { cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe(DETECTION_ERROR_CODES[0]);
    expect(error.cause).toBe(cause);
  });
});
