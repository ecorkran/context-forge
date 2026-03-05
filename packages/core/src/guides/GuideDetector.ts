// Detect guide installation state, method, and version
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  type GuideInfo,
  type GuideMethod,
  DEFAULT_SOURCE_GIT,
  GUIDE_RELATIVE_PATH,
  VERSION_MARKER_FILE,
} from './types.js';
import { gitExec } from './gitExec.js';

/**
 * Parse the highest semver tag from `git ls-remote --tags` output.
 * Returns null if no valid tags found.
 */
function parseHighestTag(lsRemoteOutput: string): string | null {
  const tagPattern = /refs\/tags\/(v?\d+\.\d+\.\d+)$/;
  const tags: string[] = [];

  for (const line of lsRemoteOutput.split('\n')) {
    const match = tagPattern.exec(line.trim());
    if (match) {
      tags.push(match[1]);
    }
  }

  if (tags.length === 0) return null;

  // Sort by semver descending
  tags.sort((a, b) => {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  });

  return tags[0];
}

/**
 * Compare two semver version strings. Returns true if latest > current.
 */
export function isNewerVersion(current: string | null, latest: string | null): boolean {
  if (!current || !latest) return false;
  const ca = current.replace(/^v/, '').split('.').map(Number);
  const la = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (la[i] > ca[i]) return true;
    if (la[i] < ca[i]) return false;
  }
  return false;
}

export class GuideDetector {
  /**
   * Detect guide installation state for a project.
   * @param projectPath - absolute path to the project root
   * @param source - override source URL (defaults to DEFAULT_SOURCE_GIT)
   */
  async detect(projectPath: string, source?: string): Promise<GuideInfo> {
    const resolvedSource = source || DEFAULT_SOURCE_GIT;
    const guidePath = join(projectPath, GUIDE_RELATIVE_PATH);

    const baseInfo: GuideInfo = {
      installed: false,
      method: null,
      version: null,
      path: guidePath,
      source: resolvedSource,
      latestVersion: null,
      updateAvailable: false,
      usingBundledPrompt: true,
    };

    if (!existsSync(guidePath)) {
      // Check latest version even when not installed
      baseInfo.latestVersion = await this.fetchLatestVersion(resolvedSource);
      return baseInfo;
    }

    // Guide directory exists — determine method
    const method = this.detectMethod(projectPath, guidePath);
    const version = await this.detectVersion(guidePath, method);
    const latestVersion = await this.fetchLatestVersion(resolvedSource);
    const updateAvailable = isNewerVersion(version, latestVersion);

    return {
      installed: true,
      method,
      version,
      path: guidePath,
      source: resolvedSource,
      latestVersion,
      updateAvailable,
      usingBundledPrompt: false,
    };
  }

  /** Determine installation method by inspecting filesystem */
  private detectMethod(projectPath: string, guidePath: string): GuideMethod {
    // Check .gitmodules first — submodules also have a .git entry inside
    // the guide directory, so checking .git first would misidentify them as clones
    const gitmodulesPath = join(projectPath, '.gitmodules');
    if (existsSync(gitmodulesPath)) {
      try {
        const content = readFileSync(gitmodulesPath, 'utf-8');
        if (content.includes(GUIDE_RELATIVE_PATH)) {
          return 'submodule';
        }
      } catch {
        // Fall through
      }
    }

    // Check for .git subdirectory → clone (only reached if not a submodule)
    if (existsSync(join(guidePath, '.git'))) {
      return 'clone';
    }

    return 'manual';
  }

  /** Detect current version based on method */
  private async detectVersion(guidePath: string, method: GuideMethod): Promise<string | null> {
    if (method === 'submodule' || method === 'clone') {
      try {
        const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], guidePath);
        return stdout || null;
      } catch {
        return null;
      }
    }

    // Manual: read version marker file
    const markerPath = join(guidePath, VERSION_MARKER_FILE);
    try {
      return readFileSync(markerPath, 'utf-8').trim() || null;
    } catch {
      return null;
    }
  }

  /** Fetch latest version from remote. Returns null on any failure. */
  private async fetchLatestVersion(source: string): Promise<string | null> {
    try {
      const { stdout } = await gitExec(
        ['ls-remote', '--tags', '--sort=-v:refname', source],
        process.cwd()
      );
      return parseHighestTag(stdout);
    } catch {
      return null;
    }
  }
}
