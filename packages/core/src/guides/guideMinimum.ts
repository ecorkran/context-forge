// Minimum ai-project-guide version context-forge needs (slice 260, D8).
import { GuideDetector, isNewerVersion } from './GuideDetector.js';
import { LOCAL_VERSION_MARKER } from './types.js';

export const MIN_GUIDE_VERSION = '0.22.6';

const UPDATE_HINT = 'Run: cf guides update';

/** Tags may carry a leading "v"; messages add their own. */
function bareVersion(version: string): string {
  return version.replace(/^v/i, '');
}

/**
 * A warning when the installed guide is older than MIN_GUIDE_VERSION or its
 * version cannot be determined; null when it is current or no guide is installed
 * (the build's own missing-guide error covers that case).
 */
export async function checkGuideMinimum(projectPath: string): Promise<string | null> {
  const info = await new GuideDetector().detectLocal(projectPath);
  if (!info.installed) return null;

  // A local archive is not a release version, so it counts as unknown.
  if (info.version === null || info.version === LOCAL_VERSION_MARKER) {
    return `Installed ai-project-guide version is unknown; context-forge needs v${MIN_GUIDE_VERSION} or newer. ${UPDATE_HINT}`;
  }
  if (isNewerVersion(info.version, MIN_GUIDE_VERSION)) {
    return `Installed ai-project-guide is v${bareVersion(info.version)}; context-forge needs v${MIN_GUIDE_VERSION} or newer. ${UPDATE_HINT}`;
  }
  return null;
}
