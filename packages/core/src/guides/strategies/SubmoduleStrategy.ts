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

    // Fetch latest refs inside the submodule first — without this,
    // `submodule update --remote` uses stale remote tracking refs
    // and reports "already up to date" even when a new version exists.
    // Use --init to handle cases where the submodule was deinited
    // (e.g., worktree removal with `submodule deinit` affects shared state).
    await gitExec(['fetch', '--tags', 'origin'], targetDir);
    await gitExec(['submodule', 'update', '--init', '--remote', GUIDE_RELATIVE_PATH], projectPath);

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

  /**
   * Sync a worktree's submodule checkout to match the primary worktree's pointer.
   * Reads the target commit from projectPath's HEAD, then checks it out in the
   * worktree's guide directory. This handles worktrees on different branches
   * where `git submodule update` would only sync to the worktree's own index.
   */
  async sync(worktreePath: string, projectPath: string): Promise<void> {
    // Read target commit from primary worktree
    const { stdout } = await gitExec(
      ['ls-tree', 'HEAD', GUIDE_RELATIVE_PATH],
      projectPath
    );
    const match = /^160000 commit ([0-9a-f]+)\t/.exec(stdout);
    if (!match) {
      throw new Error('Could not read submodule commit from project HEAD');
    }
    const targetCommit = match[1];

    // Ensure submodule is initialized in the worktree
    await gitExec(['submodule', 'update', '--init', GUIDE_RELATIVE_PATH], worktreePath);

    // Fetch latest objects so the target commit is available, then checkout
    const guidePath = join(worktreePath, GUIDE_RELATIVE_PATH);
    await gitExec(['fetch', 'origin'], guidePath);
    await gitExec(['checkout', targetCommit], guidePath);
  }
}
