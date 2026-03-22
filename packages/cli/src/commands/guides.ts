import { Command } from 'commander';
import { FileProjectStore, GuideManager, ConfigManager } from '@context-forge/core/node';
import type { GuideMethod } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
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
    .description('Show guide installation status (default)')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await showStatus(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd.addCommand(infoCmd, { isDefault: true });

  // cf guides install
  cmd
    .command('install')
    .description('Install the AI project guide')
    .option('--strategy <method>', 'Installation strategy: submodule, clone, or manual')
    .option('--source <url>', 'Source repository URL')
    .option('--project <name|id>', 'Project name or ID')
    .action(async (opts: { strategy?: string; source?: string; project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        await guidesInstallAction(ctx.projectPath, { strategy: opts.strategy as GuideMethod | undefined, source: opts.source });
      } catch (err) {
        handleError(err);
      }
    });

  // cf guides uninstall
  cmd
    .command('uninstall')
    .description('Uninstall the AI project guide (deinits submodule if applicable)')
    .option('--project <name|id>', 'Project name or ID')
    .action(async (opts: { project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        const cm = new ConfigManager(ctx.projectPath);
        const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);

        const result = await manager.uninstall();

        console.log(success('Guide uninstalled successfully.'));
        console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
      } catch (err) {
        handleError(err);
      }
    });

  // cf guides update
  cmd
    .command('update')
    .description('Update an existing guide installation')
    .option('--project <name|id>', 'Project name or ID')
    .action(async (opts: { project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        const cm = new ConfigManager(ctx.projectPath);
        const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);

        const result = await manager.update();

        if (result.previousVersion === result.newVersion) {
          console.log(success('Guide is already at the latest version.'));
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
