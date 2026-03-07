// Submodule-based guide installation strategy
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { GUIDE_RELATIVE_PATH } from '../types.js';
import { gitExec, isGitAvailable, isGitRepo } from '../gitExec.js';

export class SubmoduleStrategy implements InstallStrategy {
  async detect(projectPath: string, targetDir: string): Promise<DetectionResult | null> {
    const gitmodulesPath = join(projectPath, '.gitmodules');
    if (!existsSync(gitmodulesPath)) return null;

    try {
      const content = readFileSync(gitmodulesPath, 'utf-8');
      if (!content.includes(GUIDE_RELATIVE_PATH)) return null;

      let version: string | null = null;
      try {
        const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
        version = stdout || null;
      } catch {
        // No tags or not initialized
      }

      // Extract URL from .gitmodules
      let source: string | null = null;
      const urlMatch = /url\s*=\s*(.+)/.exec(content);
      if (urlMatch) source = urlMatch[1].trim();

      return { method: 'submodule', version, source };
    } catch {
      return null;
    }
  }

  async install(projectPath: string, source: string, targetDir: string): Promise<InstallResult> {
    if (!(await isGitAvailable())) {
      throw new Error(
        'git is not available. Install git or use the "manual" strategy instead.'
      );
    }
    if (!(await isGitRepo(projectPath))) {
      throw new Error(
        `"${projectPath}" is not a git repository. ` +
        'The submodule strategy requires a git repo. Use --strategy clone or --strategy manual instead.'
      );
    }

    await gitExec(['submodule', 'add', source, GUIDE_RELATIVE_PATH], projectPath);

    let version: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      version = stdout || null;
    } catch {
      // No tags available
    }

    // Commit the submodule addition (.gitmodules + submodule pointer)
    await gitExec(['add', '.gitmodules', GUIDE_RELATIVE_PATH], projectPath);
    const versionSuffix = version ? ` ${version}` : '';
    await gitExec(
      ['commit', '-m', `docs: install ai-project-guide${versionSuffix}`],
      projectPath
    );

    return { success: true, version, method: 'submodule', path: targetDir };
  }

  async update(projectPath: string, targetDir: string): Promise<UpdateResult> {
    let previousVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      previousVersion = stdout || null;
    } catch {
      // No previous version
    }

    await gitExec(['submodule', 'update', '--remote', GUIDE_RELATIVE_PATH], projectPath);

    let newVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      newVersion = stdout || null;
    } catch {
      // No new version
    }

    // Stage and commit the submodule pointer change (skip if no version change)
    if (previousVersion !== newVersion) {
      await gitExec(['add', GUIDE_RELATIVE_PATH], projectPath);
      const versionSuffix = newVersion ? ` to ${newVersion}` : '';
      await gitExec(
        ['commit', '-m', `docs: update ai-project-guide${versionSuffix}`],
        projectPath
      );
    }

    return { success: true, previousVersion, newVersion, method: 'submodule' };
  }
}
