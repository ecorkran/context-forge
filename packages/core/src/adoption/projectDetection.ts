// detectProject (slice 271, D2/D4/D5): what is in this directory and which adoption outcome follows.
// Read-only: it writes no config, no store and runs no git command that writes.
import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { TomlError } from 'smol-toml';
import { recognizeCi } from '../detection/ciDetection.js';
import { readHistory } from '../detection/history.js';
import { ADR_DIRS, DOC_PATHS, RULE_FILE_PATHS, presentPaths } from '../detection/presentPaths.js';
import { isEnoent } from '../detection/pathPresent.js';
import { measureSourceVolume } from '../detection/sourceVolume.js';
import { readAdoptionArtifacts, toRootRelative } from './adoptionInputs.js';
import { outcomeLine, type SourceVolumeMeasurer } from './adoptionLines.js';
import { decideOutcome, decideStage, type AdoptionOutcome } from './adoptionOutcome.js';
import { legacyAdoptionStateNotice, readAdoptionOptOut } from './adoptionState.js';
import { AdoptionError } from './contracts.js';
import { DetectionError, type DetectionErrorCode, type ProjectDetection, type SourceFact } from './detectionReport.js';
import { readPlanningFacts } from './planningFacts.js';

type WrappedErrorType = new (...args: never[]) => Error;

/** Runs `read`; an error of one of the `wrapped` types becomes a `DetectionError` with `code` (D5). */
async function readAs<T>(code: DetectionErrorCode, wrapped: readonly WrappedErrorType[], read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof Error && wrapped.some((type) => error instanceof type)) {
      throw new DetectionError(code, error.message, { cause: error });
    }
    throw error;
  }
}

async function assertDirectory(root: string): Promise<void> {
  if (!isAbsolute(root)) {
    throw new Error(`detectProject: root must be an absolute path, got "${root}"`);
  }
  try {
    if ((await stat(root)).isDirectory()) return;
  } catch (error) {
    if (!isEnoent(error)) throw error;
    throw new DetectionError('path-not-found', `Path does not exist: ${root}`, { cause: error });
  }
  throw new DetectionError('path-not-found', `Path is not a directory: ${root}`);
}

/** A failed walk is a stated fact, never a guess (D4). Other errors are bugs and propagate. */
async function measureSource(root: string, measure: SourceVolumeMeasurer): Promise<SourceFact> {
  try {
    const { lines, files, capped } = await measure(root);
    return { measured: true, lines, files, capped };
  } catch (error) {
    if (!(error instanceof AdoptionError)) throw error;
    return { measured: false, reason: error.message };
  }
}

/** Judges the directory `root` (absolute) as given, without walking up to a registered project or git root (D2). */
export async function detectProject(
  root: string,
  measure: SourceVolumeMeasurer = measureSourceVolume,
): Promise<ProjectDetection> {
  await assertDirectory(root);

  const optOut = await readAs('invalid-config', [AdoptionError, TomlError], () => readAdoptionOptOut(root));
  const facts = await readAs('unreadable-planning', [AdoptionError], () => readPlanningFacts(root));
  const artifacts = await readAs('unreadable-planning', [AdoptionError], () => readAdoptionArtifacts(root));
  const source = await measureSource(root, measure);

  const stage = decideStage({ optedOut: optOut.optedOut, facts });
  let outcome: AdoptionOutcome;
  if (stage.kind === 'unplanned') {
    // The outcome depends on source volume, so an unmeasured walk can't be decided (D4).
    if (!source.measured) throw new DetectionError('source-unmeasurable', source.reason);
    const { lines, files, capped } = source;
    outcome = decideOutcome({ stage, source: { lines, files, capped } });
  } else {
    outcome = stage;
  }

  const line = outcomeLine(outcome);
  const notices = [
    ...(optOut.ignoredLegacyValue === null ? [] : [legacyAdoptionStateNotice(optOut.ignoredLegacyValue)]),
    ...(line === null ? [] : [line]),
  ];

  return {
    projectRoot: root,
    outcome,
    source,
    history: await readHistory(root),
    docs: presentPaths(root, DOC_PATHS),
    adrs: presentPaths(root, ADR_DIRS),
    ci: recognizeCi(root).matches.map((match) => toRootRelative(root, match)),
    ruleFiles: presentPaths(root, RULE_FILE_PATHS),
    artifacts,
    notices,
  };
}
