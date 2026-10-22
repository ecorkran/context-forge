// Squadron capability probe (slice 262 D1-D3): constants, result types and the pure
// classifier. cf reads `probe_version` only; every other field is for the guide prompt.

export const SQUADRON_PROBE_COMMAND = { file: 'sq', args: ['probe', '--json'] } as const;
export const SUPPORTED_PROBE_VERSION = 1;
export const SQUADRON_PROBE_TIMEOUT_MS = 10_000;
export const SQUADRON_PROBE_MAX_BUFFER_BYTES = 1024 * 1024;

/** What happened when the probe process ran; produced by the process wrapper, nothing else. */
export type ProbeRun =
  | { kind: 'not-found' }
  | { kind: 'could-not-run'; detail: string }
  | { kind: 'exited'; exitCode: number; stdout: string; stderr: string };

export type ProbeUnavailableReason =
  | Exclude<ProbeRun, { kind: 'exited' }>
  | { kind: 'non-zero-exit'; exitCode: number }
  | { kind: 'unreadable-output' }
  // `value` is "missing" when the key is absent.
  | { kind: 'unsupported-version'; value: string };

export type ProbeOutcome =
  | { kind: 'available'; json: string; warnings: string[] }
  | { kind: 'unavailable'; reason: ProbeUnavailableReason; warnings: string[] };

const MISSING_VERSION = 'missing';

/** D3: stderr lines verbatim; trailing whitespace trimmed, empty lines dropped. */
function toWarnings(stderr: string): string[] {
  return stderr
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
}

/** Parsed stdout as a plain object, or undefined when it is not valid JSON or not an object. */
function parseJsonObject(stdout: string): Record<string, unknown> | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch (error) {
    // Only a SyntaxError means "stdout is not JSON", which is a stated outcome (D2 step 4);
    // anything else is a bug and propagates.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  return parsed as Record<string, unknown>; // narrowed above: non-null, non-array object
}

function classifyExit(run: Extract<ProbeRun, { kind: 'exited' }>): ProbeOutcome {
  const warnings = toWarnings(run.stderr);
  if (run.exitCode !== 0) {
    return {
      kind: 'unavailable',
      reason: { kind: 'non-zero-exit', exitCode: run.exitCode },
      warnings,
    };
  }
  const object = parseJsonObject(run.stdout);
  if (object === undefined) {
    return { kind: 'unavailable', reason: { kind: 'unreadable-output' }, warnings };
  }
  if (object.probe_version !== SUPPORTED_PROBE_VERSION) {
    const value =
      'probe_version' in object ? JSON.stringify(object.probe_version) : MISSING_VERSION;
    return {
      kind: 'unavailable',
      reason: { kind: 'unsupported-version', value },
      warnings,
    };
  }
  return { kind: 'available', json: run.stdout.trim(), warnings };
}

/** D2: turn a finished probe run into an outcome. Pure; never throws for bad probe output. */
export function classifyProbeRun(run: ProbeRun): ProbeOutcome {
  switch (run.kind) {
    case 'not-found':
    case 'could-not-run':
      return { kind: 'unavailable', reason: run, warnings: [] };
    case 'exited':
      return classifyExit(run);
    default: {
      const unreachable: never = run;
      throw new Error(`Unhandled probe run: ${JSON.stringify(unreachable)}`);
    }
  }
}
