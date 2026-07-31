import { Command } from 'commander';
import {
  FileProjectStore,
  GuideManager,
  ConfigManager,
  BranchGuardWarnError,
} from '@context-forge/core/node';
import type { GuideMethod } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { withJsonOption, withProjectOption, withYesOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success, warn } from '../output/styles.js';

interface GuideContext {
  projectPath: string;
  operationPath: string;
  worktreeId?: string;
}

/** Resolve project and worktree context for guide operations */
async function getGuideContext(projectOpt: string | undefined): Promise<GuideContext> {
  const store = new FileProjectStore();
  const { id, worktreeId } = await resolveProjectWorktree({ project: projectOpt }, store);
  const project = await store.getById(id);

  if (!project) {
    throw new UserError(`Project not found: '${id}'.`);
  }
  if (!project.projectPath) {
    throw new UserError(
      `Project '${project.name}' has no configured project path.\n` +
        '  Run cf init in the project directory to set the path.'
    );
  }

  let operationPath = project.projectPath;
  if (worktreeId && project.worktrees) {
    const wt = project.worktrees.find((w) => w.id === worktreeId);
    if (wt?.worktreePath) {
      operationPath = wt.worktreePath;
    }
  }

  return { projectPath: project.projectPath, operationPath, worktreeId };
}

/** Show guide status */
async function showStatus(opts: { json?: boolean; project?: string }): Promise<void> {
  const ctx = await getGuideContext(opts.project);
  const cm = new ConfigManager(ctx.projectPath);
  const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);
  const info = await manager.status();

  if (opts.json) {
    printJson(info);
    return;
  }

  console.log(label('Guide Status'));
  console.log(`  ${label('Installed:')}  ${info.installed ? valueStyle('yes') : dim('no')}`);
  if (info.installed) {
    console.log(`  ${label('Method:')}     ${valueStyle(info.method ?? 'unknown')}`);
    console.log(`  ${label('Version:')}    ${valueStyle(info.version ?? 'unknown')}`);
    console.log(`  ${label('Path:')}       ${dim(info.path)}`);
    if (info.updateAvailable) {
      console.log(`  ${label('Update:')}     ${warn(`${info.latestVersion} available`)}`);
    }
  } else {
    console.log(`  ${label('Guides:')}     ${dim('not installed (required for context generation)')}`);
    console.log(`  ${dim('  Run cf guides install to install guides.')}`);
  }
  if (info.latestVersion) {
    console.log(`  ${label('Latest:')}     ${dim(info.latestVersion)}`);
  }
}

/** Install guides for a project. Errors propagate to the caller. */
export async function guidesInstallAction(
  projectPath: string,
  opts?: { strategy?: GuideMethod; source?: string }
): Promise<void> {
  const cm = new ConfigManager(projectPath);
  const manager = new GuideManager(projectPath, cm);

  const result = await manager.install(opts?.strategy, opts?.source);

  console.log(success('Guide installed successfully.'));
  console.log(`  ${label('Version:')}  ${valueStyle(result.version ?? 'unknown')}`);
  console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
  console.log(`  ${label('Path:')}     ${dim(result.path)}`);
}

export function registerGuidesCommand(program: Command): void {
  const cmd = program
    .command('guides')
    .description('Manage AI project guide installation and updates');

  // cf guides info (also the default for bare `cf guides`)
  const infoCmd = new Command('info')
    .description('Show guide installation status (default)');
  withJsonOption(infoCmd);
  withProjectOption(infoCmd);
  infoCmd.action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await showStatus(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd.addCommand(infoCmd, { isDefault: true });

  // cf guides install
  const installCmd = cmd
    .command('install')
    .description('Install the AI project guide')
    .option('--strategy <method>', 'Installation strategy: submodule, clone, or manual')
    .option('--source <url>', 'Source repository URL');
  withProjectOption(installCmd);
  installCmd.action(async (opts: { strategy?: string; source?: string; project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        await guidesInstallAction(ctx.projectPath, { strategy: opts.strategy as GuideMethod | undefined, source: opts.source });
      } catch (err) {
        handleError(err);
      }
    });

  // cf guides uninstall
  const uninstallCmd = cmd
    .command('uninstall')
    .description('Uninstall the AI project guide (deinits submodule if applicable)');
  withProjectOption(uninstallCmd);
  uninstallCmd.action(async (opts: { project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        const cm = new ConfigManager(ctx.projectPath);
        const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);

        const result = await manager.uninstall();

        const isWorktree = ctx.operationPath !== ctx.projectPath;

        if (isWorktree) {
          console.log(success('Guide deinited from worktree.'));
          console.log(dim(`  You can now run: git worktree remove --force ${ctx.operationPath}`));
        } else {
          console.log(success('Guide uninstalled successfully.'));
        }
        console.log(`  ${label('Version:')}  ${valueStyle(result.version ?? 'unknown')}`);
        console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
        if (!isWorktree && result.method === 'submodule') {
          console.log(dim('  Note: submodule removal affects all worktrees. Run cf guides install to reinstall.'));
        }
      } catch (err) {
        handleError(err);
      }
    });

  // cf guides update
  const updateCmd = cmd
    .command('update')
    .description('Update an existing guide installation');
  withProjectOption(updateCmd);
  withYesOption(updateCmd);
  updateCmd.action(async (opts: { project?: string; yes?: boolean }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        const cm = new ConfigManager(ctx.projectPath);
        const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);

        let result;
        try {
          result = await manager.update();
        } catch (err) {
          if (err instanceof BranchGuardWarnError) {
            if (opts.yes) {
              result = await manager.update({ confirmed: true });
            } else {
              console.error(warn(err.message));
              const confirmed = await askConfirmation('Continue? (y/N) ');
              if (!confirmed) {
                console.log('Update cancelled.');
                return;
              }
              result = await manager.update({ confirmed: true });
            }
          } else {
            throw err;
          }
        }

        if (result.previousVersion === result.newVersion) {
          if (result.worktreeSynced) {
            // Host pointer was already current, but the worktree checkout was
            // synced — say so, or the message contradicts the file changes (GH #44).
            console.log(success('Guide already at latest (worktree synced).'));
          } else {
            console.log(success('Guide is already at the latest version.'));
          }
          console.log(`  ${label('Version:')}  ${valueStyle(result.newVersion ?? 'unknown')}`);
        } else {
          console.log(success('Guide updated successfully.'));
          console.log(
            `  ${label('Version:')}  ${dim(result.previousVersion ?? 'unknown')} → ${valueStyle(result.newVersion ?? 'unknown')}`
          );
          console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
        }
      } catch (err) {
        handleError(err);
      }
    });
}
