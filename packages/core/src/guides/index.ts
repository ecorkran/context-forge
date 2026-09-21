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
  type SubmoduleCheckoutState,
  type EnsureCheckoutResult,
  CHECKOUT_STATE_LABELS,
  GUIDE_INIT_TIMEOUT_MS,
  GUIDE_MANAGED_NOTICE,
  GUIDE_METHODS,
  GUIDE_METHOD_DEPRECATED_ALIASES,
  normalizeGuideMethod,
  isDeprecatedGuideMethodAlias,
  DEFAULT_SOURCE_GIT,
  DEFAULT_SOURCE_API,
  GUIDE_RELATIVE_PATH,
  VERSION_MARKER_FILE,
  GUIDE_STRATEGIES,
  DEFAULT_GUIDE_METHOD,
  describeGuideStrategy,
  guideMethodDeprecationMessage,
} from './types.js';
// gitExec itself stays internal; only the shared remediation text is public (#78).
export { GUIDE_OFFLINE_REMEDIATION } from './gitExec.js';
export {
  type BranchGuardVerdict,
  evaluateBranchGuard,
  BranchGuardBlockedError,
  BranchGuardWarnError,
} from './branchGuard.js';
