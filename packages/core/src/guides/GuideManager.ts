// Orchestration layer for guide lifecycle management
import { join } from 'path';
import { mkdirSync } from 'fs';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { GuideInfo, GuideMethod, InstallResult, UpdateResult, InstallStrategy, SyncResult } from './types.js';
import { DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from './types.js';
import { GuideDetector } from './GuideDetector.js';
import { SubmoduleStrategy } from './strategies/SubmoduleStrategy.js';
import { CloneStrategy } from './strategies/CloneStrategy.js';
import { TarballStrategy } from './strategies/TarballStrategy.js';

export class GuideManager {
  private readonly projectPath: string;
  private readonly configManager?: ConfigManager;
  private readonly detector: GuideDetector;
  private readonly operationPath?: string;

  constructor(projectPath: string, configManager?: ConfigManager, operationPath?: string) {
    this.projectPath = projectPath;
    this.configManager = configManager;
    this.detector = new GuideDetector();
    this.operationPath = operationPath;
  }

  /** Get current guide installation status */
  async status(): Promise<GuideInfo> {
    const source = await this.resolveSource();
    return this.detector.detect(this.projectPath, source, this.operationPath);
  }

  /** Install the guide into the project */
  async install(strategyOverride?: GuideMethod, sourceOverride?: string): Promise<InstallResult> {
    const source = sourceOverride || (await this.resolveSource());
    const method = strategyOverride || (await this.resolveStrategy());
    const targetDir = join(this.projectPath, GUIDE_RELATIVE_PATH);

    // Check if already installed
    const info = await this.detector.detect(this.projectPath, source);
    if (info.installed) {
      throw new Error(
        'Guide is already installed. Use guide_update (or cf guides update) to update it.'
      );
    }

    const strategy = this.getStrategy(method);
    const result = await strategy.install(this.projectPath, source, targetDir);

    // Create user artifact directories so the project is ready to use
    this.createUserDirectories();

    return result;
  }

  /** Update an existing guide installation */
  async update(): Promise<UpdateResult> {
    const source = await this.resolveSource();
    const targetDir = join(this.projectPath, GUIDE_RELATIVE_PATH);

    const info = await this.detector.detect(this.projectPath, source);
    if (!info.installed || !info.method) {
      throw new Error(
        'Guide is not installed. Use guide_install (or cf guides install) to install it first.'
      );
    }

    const strategy = this.getStrategy(info.method);
    const result = await strategy.update(this.projectPath, targetDir);

    // Sync the worktree's submodule checkout if operating from a non-default worktree
    if (this.operationPath && this.operationPath !== this.projectPath && info.method === 'submodule') {
      const submoduleStrategy = strategy as SubmoduleStrategy;
      await submoduleStrategy.sync(this.operationPath, this.projectPath);
    }

    return result;
  }

  /** Sync guide submodule checkout in multiple worktrees */
  async syncWorktrees(worktreePaths: string[]): Promise<SyncResult[]> {
    const source = await this.resolveSource();
    const info = await this.detector.detect(this.projectPath, source);
    if (info.method !== 'submodule') return [];

    const strategy = new SubmoduleStrategy();
    const results: SyncResult[] = [];

    for (const worktreePath of worktreePaths) {
      try {
        await strategy.sync(worktreePath, this.projectPath);
        results.push({ worktreePath, success: true });
      } catch (err) {
        results.push({
          worktreePath,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  /** Resolve source URL from config or default */
  private async resolveSource(): Promise<string> {
    if (this.configManager) {
      try {
        const result = await this.configManager.get('guide.source');
        if (result.value && typeof result.value === 'string' && result.value.length > 0) {
          return result.value;
        }
      } catch {
        // Fall through to default
      }
    }
    return DEFAULT_SOURCE_GIT;
  }

  /** Resolve strategy from config or default */
  private async resolveStrategy(): Promise<GuideMethod> {
    if (this.configManager) {
      try {
        const result = await this.configManager.get('guide.git_strategy');
        if (result.value && typeof result.value === 'string') {
          return result.value as GuideMethod;
        }
      } catch {
        // Fall through to default
      }
    }
    return 'submodule';
  }

  /** Create user artifact directories alongside the guide */
  private createUserDirectories(): void {
    const userDirs = [
      'project-documents/user',
      'project-documents/user/architecture',
      'project-documents/user/slices',
      'project-documents/user/tasks',
      'project-documents/user/project-guides',
    ];
    for (const dir of userDirs) {
      mkdirSync(join(this.projectPath, dir), { recursive: true });
    }
  }

  /** Map method name to strategy instance */
  private getStrategy(method: GuideMethod): InstallStrategy {
    switch (method) {
      case 'submodule':
        return new SubmoduleStrategy();
      case 'clone':
        return new CloneStrategy();
      case 'manual':
        return new TarballStrategy();
    }
  }
}
