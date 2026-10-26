// The detection report and its error envelope (slice 271, D3/D5). Pure types and serializers;
// `projectDetection.ts` gathers the facts. CLI and MCP share these so their output is byte-identical.
import type { HistoryFact } from '../detection/history.js';
import type { AdoptionArtifacts } from './adoptionInputs.js';
import type { AdoptionOutcome } from './adoptionOutcome.js';

// Bump rule (D3): raise when a field is removed or renamed, a type changes, or an outcome value is
// added, removed or changes meaning. Adding a field is not breaking. Squadron refuses a version it
// doesn't know. Each report kind versions separately: `cf init --json` is not a detection report.
export const REPORT_VERSION = 1;
export const INIT_REPORT_VERSION = 1;

/** The one place the error codes are written (D5). */
export const DETECTION_ERROR_CODES = [
  'path-not-found',
  'invalid-config',
  'unreadable-planning',
  'source-unmeasurable',
  'worktree-of-registered-project',
  'internal',
] as const;

export type DetectionErrorCode = (typeof DETECTION_ERROR_CODES)[number];

export class DetectionError extends Error {
  readonly code: DetectionErrorCode;

  constructor(code: DetectionErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'DetectionError';
    this.code = code;
  }
}

export type SourceFact =
  | { measured: true; lines: number; files: number; capped: boolean }
  | { measured: false; reason: string };

export type HistoryReportFact =
  | { known: true; commits: number; shallow: boolean }
  | { known: false; reason: string };

/** What `detectProject` returns: every fact, gathered on every call (D4). Paths are root-relative. */
export interface ProjectDetection {
  /** Absolute. */
  projectRoot: string;
  outcome: AdoptionOutcome;
  source: SourceFact;
  history: HistoryFact;
  docs: string[];
  adrs: string[];
  ci: string[];
  ruleFiles: string[];
  artifacts: AdoptionArtifacts;
  notices: string[];
}

/** The D3 JSON shape. */
export interface DetectionReport {
  reportVersion: typeof REPORT_VERSION;
  projectRoot: string;
  outcome: AdoptionOutcome['kind'];
  facts: {
    source: SourceFact;
    history: HistoryReportFact;
    docs: string[];
    adrs: string[];
    ci: string[];
    ruleFiles: string[];
  };
  artifacts: AdoptionArtifacts;
  notices: string[];
}

/** `HistoryFact.kind` becomes a boolean so consumers don't need cf's type names (D3). */
function toHistoryReportFact(history: HistoryFact): HistoryReportFact {
  return history.kind === 'known'
    ? { known: true, commits: history.commits, shallow: history.shallow }
    : { known: false, reason: history.reason };
}

export function toDetectionReport(detection: ProjectDetection): DetectionReport {
  return {
    reportVersion: REPORT_VERSION,
    projectRoot: detection.projectRoot,
    outcome: detection.outcome.kind,
    facts: {
      source: detection.source,
      history: toHistoryReportFact(detection.history),
      docs: detection.docs,
      adrs: detection.adrs,
      ci: detection.ci,
      ruleFiles: detection.ruleFiles,
    },
    artifacts: detection.artifacts,
    notices: detection.notices,
  };
}

const JSON_INDENT = 2;

export function serializeDetectionReport(report: DetectionReport): string {
  return JSON.stringify(report, null, JSON_INDENT);
}

/** The D5 envelope: `{ reportVersion, error: { code, message } }`. */
export function serializeErrorEnvelope(reportVersion: number, code: DetectionErrorCode, message: string): string {
  return JSON.stringify({ reportVersion, error: { code, message } }, null, JSON_INDENT);
}
