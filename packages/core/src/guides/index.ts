// Guide management — public exports
export { GuideManager } from './GuideManager.js';
export { GuideDetector } from './GuideDetector.js';
export {
  type GuideInfo,
  type GuideMethod,
  type InstallResult,
  type UpdateResult,
  type DetectionResult,
  type InstallStrategy,
  DEFAULT_SOURCE_GIT,
  DEFAULT_SOURCE_API,
  GUIDE_RELATIVE_PATH,
  VERSION_MARKER_FILE,
} from './types.js';
export {
  type BranchGuardVerdict,
  evaluateBranchGuard,
  BranchGuardBlockedError,
  BranchGuardWarnError,
} from './branchGuard.js';
