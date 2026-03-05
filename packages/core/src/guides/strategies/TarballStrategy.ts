// Tarball-based (manual) guide installation strategy
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { extract } from 'tar';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { VERSION_MARKER_FILE, DEFAULT_SOURCE_GIT } from '../types.js';
import { gitExec } from '../gitExec.js';

/**
 * Parse owner/repo from a GitHub source URL.
 * Supports: https://github.com/{owner}/{repo}.git and https://github.com/{owner}/{repo}
 */
export function parseGitHubOwnerRepo(source: string): { owner: string; repo: string } {
  const match = /github\.com\/([^/]+)\/([^/.]+)/.exec(source);
  if (!match) {
    throw new Error(`Cannot parse GitHub owner/repo from source URL: ${source}`);
  }
  return { owner: match[1], repo: match[2] };
}

export class TarballStrategy implements InstallStrategy {
  async detect(_projectPath: string, targetDir: string): Promise<DetectionResult | null> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    if (!existsSync(markerPath)) return null;

    try {
      const version = readFileSync(markerPath, 'utf-8').trim() || null;
      return { method: 'manual', version, source: null };
    } catch {
      return null;
    }
  }

  async install(_projectPath: string, source: string, targetDir: string): Promise<InstallResult> {
    const resolvedSource = source || DEFAULT_SOURCE_GIT;
    const latestTag = await this.fetchLatestTag(resolvedSource);
    if (!latestTag) {
      throw new Error('Could not determine latest version from remote.');
    }

    await this.downloadAndExtract(resolvedSource, latestTag, targetDir);
    writeFileSync(join(targetDir, VERSION_MARKER_FILE), latestTag, 'utf-8');

    return { success: true, version: latestTag, method: 'manual', path: targetDir };
  }

  async update(_projectPath: string, targetDir: string): Promise<UpdateResult> {
    const markerPath = join(targetDir, VERSION_MARKER_FILE);
    let previousVersion: string | null = null;
    try {
      previousVersion = readFileSync(markerPath, 'utf-8').trim() || null;
    } catch {
      // No previous version
    }

    // Determine source from the default (marker doesn't store it)
    const source = DEFAULT_SOURCE_GIT;
    const latestTag = await this.fetchLatestTag(source);
    if (!latestTag) {
      throw new Error('Could not determine latest version from remote.');
    }

    if (previousVersion === latestTag) {
      return { success: true, previousVersion, newVersion: latestTag, method: 'manual' };
    }

    // Remove existing contents and re-download
    rmSync(targetDir, { recursive: true, force: true });
    await this.downloadAndExtract(source, latestTag, targetDir);
    writeFileSync(join(targetDir, VERSION_MARKER_FILE), latestTag, 'utf-8');

    return { success: true, previousVersion, newVersion: latestTag, method: 'manual' };
  }

  /** Fetch latest tag from remote using git ls-remote */
  private async fetchLatestTag(source: string): Promise<string | null> {
    try {
      const { stdout } = await gitExec(
        ['ls-remote', '--tags', '--sort=-v:refname', source],
        process.cwd()
      );

      const tagPattern = /refs\/tags\/(v?\d+\.\d+\.\d+)$/;
      const tags: string[] = [];
      for (const line of stdout.split('\n')) {
        const match = tagPattern.exec(line.trim());
        if (match) tags.push(match[1]);
      }

      if (tags.length === 0) return null;

      // Sort descending
      tags.sort((a, b) => {
        const pa = a.replace(/^v/, '').split('.').map(Number);
        const pb = b.replace(/^v/, '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (pa[i] !== pb[i]) return pb[i] - pa[i];
        }
        return 0;
      });

      return tags[0];
    } catch {
      return null;
    }
  }

  /** Download tarball from GitHub API and extract to targetDir */
  private async downloadAndExtract(
    source: string,
    tag: string,
    targetDir: string
  ): Promise<void> {
    const { owner, repo } = parseGitHubOwnerRepo(source);
    const url = `https://api.github.com/repos/${owner}/${repo}/tarball/${tag}`;

    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Failed to download tarball: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Empty response body when downloading tarball');
    }

    mkdirSync(targetDir, { recursive: true });

    // GitHub tarballs have a top-level directory like {owner}-{repo}-{hash}/
    // We strip 1 level and extract directly into targetDir
    const nodeStream = Readable.fromWeb(response.body as never);
    await pipeline(
      nodeStream,
      createGunzip(),
      extract({ cwd: targetDir, strip: 1 })
    );
  }
}
