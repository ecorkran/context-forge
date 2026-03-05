// Orchestration layer for guide lifecycle management
import { join } from 'path';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { GuideInfo, GuideMethod, InstallResult, UpdateResult, InstallStrategy } from './types.js';
import { DEFAULT_SOURCE_GIT, GUIDE_RELATIVE_PATH } from './types.js';
import { GuideDetector } from './GuideDetector.js';
import { SubmoduleStrategy } from './strategies/SubmoduleStrategy.js';
import { CloneStrategy } from './strategies/CloneStrategy.js';
import { TarballStrategy } from './strategies/TarballStrategy.js';

export class GuideManager {
  private readonly projectPath: string;
  private readonly configManager?: ConfigManager;
  private readonly detector: GuideDetector;

  constructor(projectPath: string, configManager?: ConfigManager) {
    this.projectPath = projectPath;
    this.configManager = configManager;
    this.detector = new GuideDetector();
  }

  /** Get current guide installation status */
  async status(): Promise<GuideInfo> {
    const source = await this.resolveSource();
    return this.detector.detect(this.projectPath, source);
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
    return strategy.install(this.projectPath, source, targetDir);
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
    return strategy.update(this.projectPath, targetDir);
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
