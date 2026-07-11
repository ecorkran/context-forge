import { join } from 'node:path';
import type { ConfigManager } from '../config/ConfigManager.js';
import { detectDocuments } from './parsers/documentDetector.js';
import { parseFrontmatter } from './parsers/frontmatterParser.js';

/** Frontmatter verdict vocabulary (uppercase, untrusted external data) */
export type Verdict = 'PASS' | 'CONCERNS' | 'FAIL' | 'UNKNOWN';

/** Config token for the verdict floor that clears a gate (lowercase, project policy) */
export type ThresholdToken = 'pass' | 'concerns';

/** Config token for how to treat an UNKNOWN/absent/unparseable verdict */
export type UnknownPolicy = 'fail' | 'concerns' | 'pass';

/** Outcome of evaluating a present review's verdict against policy */
export type GateOutcome = 'clears' | 'pending' | 'failed';

/** A lifecycle boundary at which a review may be owed */
export type Boundary = 'preSlicePlan' | 'preTasks' | 'preImplementation' | 'preAdvance';

/** Boundary → review type. Single source of truth: position derives the type, never configured. */
const BOUNDARY_REVIEW_TYPE = {
  preSlicePlan: 'arch',
  preTasks: 'slice',
  preImplementation: 'tasks',
  preAdvance: 'code',
} as const;

/**
 * Per-gate threshold override config key, keyed by boundary. Mirrors ConfigKeys.ts.
 * Key segments match BOUNDARY_REVIEW_TYPE's values (arch/slice/tasks/code), not the
 * boundary names, for consistency with the review-type vocabulary used elsewhere.
 */
const BOUNDARY_THRESHOLD_KEY: Record<Boundary, string> = {
  preSlicePlan: 'workflow.review_gates.arch.threshold',
  preTasks: 'workflow.review_gates.slice.threshold',
  preImplementation: 'workflow.review_gates.tasks.threshold',
  preAdvance: 'workflow.review_gates.code.threshold',
};

const KNOWN_VERDICTS: readonly Verdict[] = ['PASS', 'CONCERNS', 'FAIL', 'UNKNOWN'];
const KNOWN_THRESHOLDS: readonly ThresholdToken[] = ['pass', 'concerns'];
const KNOWN_UNKNOWN_POLICIES: readonly UnknownPolicy[] = ['fail', 'concerns', 'pass'];

/** Maps a lifecycle boundary to the review type owed at that boundary. */
export function positionToReviewType(boundary: Boundary): string {
  return BOUNDARY_REVIEW_TYPE[boundary];
}

/**
 * Normalizes a raw frontmatter verdict to the known vocabulary.
 * Untrusted external data: anything absent or unrecognized degrades to UNKNOWN, never throws.
 */
export function normalizeVerdict(raw: string | undefined): Verdict {
  if (raw === undefined) return 'UNKNOWN';
  const upper = raw.trim().toUpperCase();
  return (KNOWN_VERDICTS as readonly string[]).includes(upper) ? (upper as Verdict) : 'UNKNOWN';
}

function parseThresholdToken(raw: string, key: string): ThresholdToken {
  if ((KNOWN_THRESHOLDS as readonly string[]).includes(raw)) {
    return raw as ThresholdToken;
  }
  throw new Error(
    `Config key "${key}" must be one of [${KNOWN_THRESHOLDS.map((v) => `"${v}"`).join(', ')}], got "${raw}"`
  );
}

function parseUnknownPolicy(raw: string, key: string): UnknownPolicy {
  if ((KNOWN_UNKNOWN_POLICIES as readonly string[]).includes(raw)) {
    return raw as UnknownPolicy;
  }
  throw new Error(
    `Config key "${key}" must be one of [${KNOWN_UNKNOWN_POLICIES.map((v) => `"${v}"`).join(', ')}], got "${raw}"`
  );
}

/**
 * The verdict decision matrix (design TD-2). Returns only 'clears'/'failed' — the
 * 'pending' outcome belongs to the caller, derived from the absent-artifact signal.
 */
export function evaluateVerdict(
  verdict: Verdict,
  threshold: ThresholdToken,
  unknownAs: UnknownPolicy
): GateOutcome {
  switch (verdict) {
    case 'PASS':
      return 'clears';
    case 'FAIL':
      return 'failed';
    case 'CONCERNS':
      return threshold === 'concerns' ? 'clears' : 'failed';
    case 'UNKNOWN': {
      const standIn: Verdict = unknownAs === 'fail' ? 'FAIL' : unknownAs === 'concerns' ? 'CONCERNS' : 'PASS';
      return evaluateVerdict(standIn, threshold, unknownAs);
    }
  }
}

/** Resolved gate policy, ready for the navigator to evaluate any boundary. */
export interface ResolvedGate {
  threshold: ThresholdToken;
  unknownAs: UnknownPolicy;
  thresholdFor(boundary: Boundary): ThresholdToken;
  /** YYYYMMDD cutoff, or '' for no cutoff. Grandfathers artifacts dated earlier out of every boundary. */
  effectiveDate: string;
}

/**
 * Reads gate config and resolves policy. Returns null when gating is off (caller skips
 * — no artifact lookup). A missing config file is not a failure (ConfigManager already
 * falls through to the built-in default, i.e. gating off). A genuine read/parse failure
 * propagates (TD-8a). An out-of-vocabulary token throws a descriptive error (TD-8b) —
 * config is the project's own declared policy, so it fails fast rather than degrading
 * to UNKNOWN the way an untrusted frontmatter verdict does.
 */
export async function resolveGateConfig(config: ConfigManager): Promise<ResolvedGate | null> {
  const enabled = await config.get('workflow.review_enabled');
  if (enabled.value !== true) {
    return null;
  }

  const globalThresholdRaw = await config.get('workflow.review_threshold');
  const unknownAsRaw = await config.get('workflow.review_unknown_as');
  const globalThreshold = parseThresholdToken(
    String(globalThresholdRaw.value),
    'workflow.review_threshold'
  );
  const unknownAs = parseUnknownPolicy(String(unknownAsRaw.value), 'workflow.review_unknown_as');

  const overrides = new Map<Boundary, ThresholdToken>();
  for (const boundary of Object.keys(BOUNDARY_THRESHOLD_KEY) as Boundary[]) {
    const key = BOUNDARY_THRESHOLD_KEY[boundary];
    const overrideRaw = await config.get(key);
    const overrideValue = String(overrideRaw.value);
    if (overrideValue !== '') {
      overrides.set(boundary, parseThresholdToken(overrideValue, key));
    }
  }

  const effectiveDateRaw = await config.get('workflow.review_gate_effective_date');
  const effectiveDate = String(effectiveDateRaw.value);

  return {
    threshold: globalThreshold,
    unknownAs,
    effectiveDate,
    thresholdFor(boundary: Boundary): ThresholdToken {
      return overrides.get(boundary) ?? globalThreshold;
    },
  };
}

/** Gated status a boundary evaluation can produce, or null to keep the caller's existing status. */
type GateStatus = 'pending-review' | 'review-failed';

/** Result of evaluating a gate at a boundary: the status plus a human-readable rationale. */
export interface GateEvaluation {
  status: GateStatus;
  reviewType: string;
  rationale: string;
  /** Relative path (from projectPath) to the review artifact, when one was found.
   *  Absent for pending-review (no artifact exists yet). Lets callers point a
   *  finding's location at the artifact without a second detectDocuments call. */
  artifactPath?: string;
}

/**
 * Composite gate evaluation for one boundary of one slice/arch index.
 * Returns null when gating is off OR the review clears — i.e. "nothing to flag."
 * Returns a GateEvaluation when the review is absent (pending-review) or
 * present-but-not-clearing (review-failed). Pure I/O over the pure helpers;
 * both WorkflowNavigator and ConsistencyChecker call this.
 */
export async function evaluateReviewGate(
  projectPath: string,
  index: number,
  boundary: Boundary,
  config: ConfigManager,
  resolved?: ResolvedGate,
): Promise<GateEvaluation | null> {
  const gate = resolved ?? (await resolveGateConfig(config));
  if (gate === null) return null;

  const reviewType = positionToReviewType(boundary);
  const docs = await detectDocuments(projectPath, index, reviewType);

  // preSlicePlan gates an architecture index; every other boundary gates a
  // slice index — read whichever artifact's frontmatter is relevant to this
  // boundary, once, shared by both checks below.
  const gatedArtifactPath = boundary === 'preSlicePlan' ? docs.architecture : docs.sliceDesign;
  const gatedArtifactFrontmatter = gatedArtifactPath
    ? await parseFrontmatter(join(projectPath, gatedArtifactPath))
    : null;

  // Effective-date grandfather cutoff: a slice/architecture designed before this
  // date is exempt from every gate boundary, uniformly, so turning on gating on
  // a project with existing history doesn't retroactively demand reviews for
  // work that predates the gate. Checked before the docs-only declaration below
  // since a grandfathered slice needs no declaration at all.
  if (gate.effectiveDate !== '' && gatedArtifactFrontmatter) {
    const dateCreated = gatedArtifactFrontmatter.data.dateCreated;
    if (dateCreated && dateCreated < gate.effectiveDate) {
      return null;
    }
  }

  // Review-exempt declaration (#57): a slice-design frontmatter of review: none
  // clears every slice-scoped gate unconditionally — this slice cannot produce
  // slice/tasks/code reviews (docs, analysis, minimal-doc, etc). Absent (the
  // default) leaves gates unaffected. Does not apply to preSlicePlan, which
  // gates the architecture index, a different document from this slice-design.
  if (boundary !== 'preSlicePlan' && gatedArtifactFrontmatter?.data.review === 'none') {
    return null;
  }

  if (docs.review === null) {
    return {
      status: 'pending-review',
      reviewType,
      rationale: `Slice ${index} requires a ${reviewType} review before proceeding — no review artifact found.`,
    };
  }

  const frontmatter = await parseFrontmatter(join(projectPath, docs.review));
  const verdict = normalizeVerdict(frontmatter.data.verdict);
  const threshold = gate.thresholdFor(boundary);
  const outcome = evaluateVerdict(verdict, threshold, gate.unknownAs);

  if (outcome === 'clears') return null;

  return {
    status: 'review-failed',
    reviewType,
    rationale: `Review artifact present but verdict ${verdict} does not clear threshold '${threshold}' for slice ${index}.`,
    artifactPath: docs.review,
  };
}
