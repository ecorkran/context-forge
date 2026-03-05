// Clone-based guide installation strategy
import { existsSync } from 'fs';
import { join } from 'path';
import type { InstallStrategy, InstallResult, UpdateResult, DetectionResult } from '../types.js';
import { gitExec, isGitAvailable } from '../gitExec.js';

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

  async install(_projectPath: string, source: string, targetDir: string): Promise<InstallResult> {
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

    return { success: true, version, method: 'clone', path: targetDir };
  }

  async update(_projectPath: string, targetDir: string): Promise<UpdateResult> {
    let previousVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      previousVersion = stdout || null;
    } catch {
      // No previous version
    }

    await gitExec(['-C', targetDir, 'pull', '--ff-only'], process.cwd());

    let newVersion: string | null = null;
    try {
      const { stdout } = await gitExec(['describe', '--tags', '--abbrev=0'], targetDir);
      newVersion = stdout || null;
    } catch {
      // No new version
    }

    return { success: true, previousVersion, newVersion, method: 'clone' };
  }
}
