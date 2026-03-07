// Clone-based guide installation strategy
import { existsSync } from 'fs';
import { join } from 'path';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { GUIDE_RELATIVE_PATH } from '../types.js';
import { gitExec, isGitAvailable, isGitRepo } from '../gitExec.js';

export class CloneStrategy implements InstallStrategy {
  async detect(_projectPath: string, targetDir: string): Promise<DetectionResult | null> {
    if (!existsSync(join(targetDir, '.git'))) return null;

    let version: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      version = stdout || null;
    } catch {
      // No tags
    }

    let source: string | null = null;
    try {
      const { stdout } = await gitExec(['remote', 'get-url', 'origin'], targetDir);
      source = stdout || null;
    } catch {
      // No remote
    }

    return { method: 'clone', version, source };
  }

  async install(projectPath: string, source: string, targetDir: string): Promise<InstallResult> {
    if (!(await isGitAvailable())) {
      throw new Error(
        'git is not available. Install git or use the "manual" strategy instead.'
      );
    }

    await gitExec(['clone', source, targetDir], process.cwd());

    let version: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      version = stdout || null;
    } catch {
      // No tags
    }

    // Commit the cloned directory if the parent project is a git repo
    if (await isGitRepo(projectPath)) {
      await gitExec(['add', GUIDE_RELATIVE_PATH], projectPath);
      const versionSuffix = version ? ` ${version}` : '';
      await gitExec(
        ['commit', '-m', `docs: install ai-project-guide${versionSuffix}`],
        projectPath
      );
    }

    return { success: true, version, method: 'clone', path: targetDir };
  }

  async update(projectPath: string, targetDir: string): Promise<UpdateResult> {
    let previousVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      previousVersion = stdout || null;
    } catch {
      // No previous version
    }

    // Fetch latest from remote, then try pull. If pull fails (e.g. detached HEAD),
    // fetch + checkout the latest tag instead.
    await gitExec(['fetch', '--tags', 'origin'], targetDir);
    try {
      await gitExec(['pull', '--ff-only'], targetDir);
    } catch {
      // Detached HEAD or no tracking branch — checkout latest tag
      const { stdout: latestTag } = await gitExec(
        ['describe', '--tags', '--abbrev=0', 'origin/HEAD'],
        targetDir
      ).catch(async () => {
        // origin/HEAD may not exist; fall back to sorting tags
        const { stdout: tags } = await gitExec(
          ['tag', '--sort=-v:refname'],
          targetDir
        );
        const first = tags.split('\n')[0]?.trim();
        if (!first) throw new Error('No tags found after fetch');
        return { stdout: first, stderr: '' };
      });
      await gitExec(['checkout', latestTag], targetDir);
    }

    let newVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      newVersion = stdout || null;
    } catch {
      // No new version
    }

    // Commit the updated files if the parent project is a git repo and version changed
    if (previousVersion !== newVersion && (await isGitRepo(projectPath))) {
      await gitExec(['add', GUIDE_RELATIVE_PATH], projectPath);
      const versionSuffix = newVersion ? ` to ${newVersion}` : '';
      await gitExec(
        ['commit', '-m', `docs: update ai-project-guide${versionSuffix}`],
        projectPath
      );
    }

    return { success: true, previousVersion, newVersion, method: 'clone' };
  }
}
