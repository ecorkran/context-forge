export { recognizeCi, CI_SIGNATURES, type CiRecognition, type CiSignature } from './ciDetection.js';
export { hasBuildManifest, BUILD_MANIFESTS } from './buildManifest.js';
export { measureSourceVolume, type SourceVolume } from './sourceVolume.js';
export { readHistory, type HistoryFact } from './history.js';
export { findPlanningArtifacts } from './planningArtifacts.js';
export {
  runSquadronProbe,
  classifyProbeRun,
  SQUADRON_PROBE_COMMAND,
  SUPPORTED_PROBE_VERSION,
  SQUADRON_PROBE_TIMEOUT_MS,
  SQUADRON_PROBE_MAX_BUFFER_BYTES,
  type ProbeRun,
  type ProbeOutcome,
  type ProbeUnavailableReason,
} from './squadronProbe.js';
