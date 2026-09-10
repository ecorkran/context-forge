// Orchestration layer for guide lifecycle management
import { join } from 'path';
import { mkdirSync, rmSync, existsSync } from 'fs';
import type { ConfigManager } from '../config/ConfigManager.js';
import type { GuideInfo, GuideMethod, InstallResult, UpdateResult, UninstallResult, InstallStrategy, SyncResult, EnsureCheckoutResult } from './types.js';
import {
  DEFAULT_SOURCE_GIT,
  GUIDE_RELATIVE_PATH,
  GUIDE_INIT_TIMEOUT_MS,
  normalizeGuideMethod,
  isDeprecatedGuideMethodAlias,
} from './types.js';
import { GUIDE_OFFLINE_REMEDIATION } from './gitExec.js';
import { CONFIG_KEYS } from '../config/ConfigKeys.js';
import { GuideDetector } from './GuideDetector.js';
import { SubmoduleStrategy } from './strategies/SubmoduleStrategy.js';
import { CloneStrategy } from './strategies/CloneStrategy.js';
import { TarballStrategy } from './strategies/TarballStrategy.js';
import { evaluateBranchGuard, BranchGuardBlockedError, BranchGuardWarnError } from './branchGuard.js';

/**
 * A strategy resolved from an input boundary, plus the original spelling when
 * that input used a deprecated alias (D5). Used for both the config path and
 * the explicit `--strategy` flag so callers warn identically for each.
 */
export interface ResolvedStrategy {
  method: GuideMethod;
  deprecatedAlias?: string;
}

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

  /**
   * Install the guide into the project.
   *
   * `strategyOverride` is a raw string from an input boundary (a `--strategy`
   * flag or an MCP parameter), normalized here so the flag and the config path
   * share one validation and one deprecation report. When either path supplied
   * a deprecated alias, the returned result carries it in `deprecatedAlias` so
   * the caller can warn (D5).
   */
  async install(strategyOverride?: string, sourceOverride?: string): Promise<InstallResult> {
    const source = sourceOverride || (await this.resolveSource());
    const resolved: ResolvedStrategy = strategyOverride
      ? this.resolveStrategyOverride(strategyOverride)
      : await this.resolveStrategy();
    const method = resolved.method;
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

    return resolved.deprecatedAlias
      ? { ...result, deprecatedAlias: resolved.deprecatedAlias }
      : result;
  }

  /**
   * Normalize a strategy name supplied explicitly by a caller (CLI flag, MCP
   * parameter). Same validation and same alias reporting as the config path.
   */
  private resolveStrategyOverride(input: string): ResolvedStrategy {
    const method = normalizeGuideMethod(input);
    return isDeprecatedGuideMethodAlias(input)
      ? { method, deprecatedAlias: input.trim() }
      : { method };
  }

  /**
   * Make the guide readable before a command consumes it.
   *
   * Auto-acts on exactly one state: an uninitialized submodule, which has a
   * single correct resolution — check out the commit the host pins (#80). An
   * out-of-sync checkout may be deliberate, so it is reported and left alone
   * rather than reset (D2). Every other case is a no-op, including a missing
   * install, which the calling command still reports as it does today.
   *
   * Read-only for clone and tarball installs.
   */
  async ensureCheckout(): Promise<EnsureCheckoutResult> {
    const source = await this.resolveSource();
    // Local detection only: this runs inside every read command, and the
    // remote's latest version is not needed to decide whether to init (D10).
    const info = await this.detector.detectLocal(this.projectPath, source, this.operationPath);

    if (!info.installed || info.method !== 'submodule') {
      return { action: 'none' };
    }

    // checkout was resolved by detect(); do not ask git a second time.
    switch (info.checkout) {
      case 'in_sync':
      case null:
        return { action: 'none' };

      case 'out_of_sync':
        return {
          action: 'warned',
          message:
            `The guide submodule at ${GUIDE_RELATIVE_PATH} is checked out at a different ` +
            'commit than this project pins. It was left unchanged. Run cf guides update ' +
            '(or git submodule update) to match the pinned commit.',
        };

      case 'not_initialized': {
        const operationPath = this.operationPath || this.projectPath;
        const { commit } = await this.initGuideCheckout(operationPath);
        return {
          action: 'initialized',
          commit,
          message: `Initialized the guide submodule at ${GUIDE_RELATIVE_PATH} (${commit}).`,
        };
      }
    }
  }

  /**
   * Check out an uninitialized guide submodule, bounded so a read command
   * cannot hang on an unresponsive remote (D10), and append the shared offline
   * remediation text when the fetch cannot complete.
   */
  private async initGuideCheckout(operationPath: string): Promise<{ commit: string }> {
    const strategy = new SubmoduleStrategy();
    try {
      return await strategy.init(operationPath, { timeoutMs: GUIDE_INIT_TIMEOUT_MS });
    } catch (err) {
      // Re-thrown with remediation, never swallowed: proceeding against an
      // empty guide tree would fail later with a far less useful message.
      const message = err instanceof Error ? err.message : String(err);
      // gitExec already appends the remediation for recognizable network
      // failures (including our own timeout); add it only when it did not,
      // so the user never reads the same guidance twice.
      throw new Error(
        message.includes(GUIDE_OFFLINE_REMEDIATION)
          ? message
          : `${message}\n  ${GUIDE_OFFLINE_REMEDIATION}`
      );
    }
  }

  /** Update an existing guide installation */
  async update(opts?: { confirmed?: boolean }): Promise<UpdateResult> {
    const source = await this.resolveSource();
    const targetDir = join(this.projectPath, GUIDE_RELATIVE_PATH);

    const info = await this.detector.detect(this.projectPath, source);
    if (!info.installed || !info.method) {
      throw new Error(
        'Guide is not installed. Use guide_install (or cf guides install) to install it first.'
      );
    }

    const verdict = await evaluateBranchGuard(this.projectPath, this.configManager);
    if (verdict.outcome === 'block') {
      throw new BranchGuardBlockedError(verdict.trunk, verdict.current);
    }
    if (verdict.outcome === 'warn' && opts?.confirmed !== true) {
      throw new BranchGuardWarnError(verdict.trunk, verdict.current, verdict.ancestry);
    }

    const strategy = this.getStrategy(info.method);
    const result = await strategy.update(this.projectPath, targetDir);

    // Sync the worktree's submodule checkout if operating from a non-default worktree
    if (this.operationPath && this.operationPath !== this.projectPath && info.method === 'submodule') {
      const submoduleStrategy = strategy as SubmoduleStrategy;
      await submoduleStrategy.sync(this.operationPath, this.projectPath);
      return { ...result, worktreeSynced: true };
    }

    return result;
  }

  /** Uninstall the guide from the project */
  async uninstall(): Promise<UninstallResult> {
    const source = await this.resolveSource();
    const info = await this.detector.detect(this.projectPath, source);

    if (!info.installed || !info.method) {
      throw new Error('Guide is not installed. Nothing to uninstall.');
    }

    const targetDir = join(this.projectPath, GUIDE_RELATIVE_PATH);
    const method = info.method;
    const version = info.version;

    if (method === 'submodule') {
      const { gitExec } = await import('./gitExec.js');
      const isWorktree = this.operationPath && this.operationPath !== this.projectPath;

      // Deinit the submodule — scoped to operationPath (worktree) or projectPath (main)
      await gitExec(
        ['submodule', 'deinit', '-f', GUIDE_RELATIVE_PATH],
        isWorktree ? this.operationPath : this.projectPath,
      );

      if (isWorktree) {
        // Worktree deinit: physically remove the submodule directory from the worktree.
        // `submodule deinit` affects shared .git/config but may not clean the worktree's
        // physical files. Remove the directory to ensure git worktree remove --force succeeds.
        const worktreeGuideDir = join(this.operationPath, GUIDE_RELATIVE_PATH);
        if (existsSync(worktreeGuideDir)) {
          rmSync(worktreeGuideDir, { recursive: true, force: true });
        }
      } else {
        // Full uninstall: remove shared state and commit
        const modulesPath = join(this.projectPath, '.git', 'modules', GUIDE_RELATIVE_PATH);
        if (existsSync(modulesPath)) {
          rmSync(modulesPath, { recursive: true, force: true });
        }
        // Remove the submodule entry from index and .gitmodules
        await gitExec(['rm', '-f', GUIDE_RELATIVE_PATH], this.projectPath);
        // Commit the removal
        const versionSuffix = version ? ` ${version}` : '';
        await gitExec(
          ['commit', '-m', `docs: uninstall ai-project-guide${versionSuffix}`],
          this.projectPath,
        );
      }
    } else {
      // clone or manual — just remove the directory
      if (existsSync(targetDir)) {
        rmSync(targetDir, { recursive: true, force: true });
      }
    }

    return { success: true, method, version };
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

  /**
   * Resolve the guide source URL from config.
   *
   * Config read errors propagate (D7): a malformed config file must fail the
   * command rather than silently installing from the default source. Without a
   * ConfigManager there is no config to read, so the module default applies.
   */
  private async resolveSource(): Promise<string> {
    if (!this.configManager) {
      return DEFAULT_SOURCE_GIT;
    }
    const result = await this.configManager.get('guide.source');
    if (typeof result.value === 'string' && result.value.length > 0) {
      return result.value;
    }
    return DEFAULT_SOURCE_GIT;
  }

  /**
   * Resolve the install strategy from config.
   *
   * An unset key already yields the ConfigKeys default, so there is no
   * fallback branch here. Config read errors propagate (D7). `deprecatedAlias`
   * carries the original spelling when the config value was a deprecated name,
   * so the caller can print the D5 deprecation warning.
   */
  private async resolveStrategy(): Promise<ResolvedStrategy> {
    if (!this.configManager) {
      return { method: normalizeGuideMethod(CONFIG_KEYS['guide.git_strategy'].default as string) };
    }
    const result = await this.configManager.get('guide.git_strategy');
    if (typeof result.value !== 'string') {
      throw new Error(
        `Config key 'guide.git_strategy' must be a string, got ${typeof result.value}.`
      );
    }
    const method = normalizeGuideMethod(result.value);
    return isDeprecatedGuideMethodAlias(result.value)
      ? { method, deprecatedAlias: result.value.trim() }
      : { method };
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
      case 'tarball':
        return new TarballStrategy();
    }
  }
}
