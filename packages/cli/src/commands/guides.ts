import { Command } from 'commander';
import { FileProjectStore, GuideManager, ConfigManager } from '@context-forge/core/node';
import type { GuideMethod } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, value as valueStyle, dim, success, warn } from '../output/styles.js';

/** Resolve project path from --project flag or CWD/default */
async function getProjectPath(projectOpt: string | undefined): Promise<string> {
  const store = new FileProjectStore();
  const { id } = await resolveProjectId(projectOpt, store);
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
  return project.projectPath;
}

/** Show guide status */
async function showStatus(opts: { json?: boolean; project?: string }): Promise<void> {
  const projectPath = await getProjectPath(opts.project);
  const cm = new ConfigManager(projectPath);
  const manager = new GuideManager(projectPath, cm);
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
    console.log(`  ${label('Bundled:')}    ${valueStyle('using bundled system prompt')}`);
    console.log(`  ${dim('  Run cf guides install to install the full guide.')}`);
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
        const projectPath = await getProjectPath(opts.project);
        await guidesInstallAction(projectPath, { strategy: opts.strategy as GuideMethod | undefined, source: opts.source });
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
        const projectPath = await getProjectPath(opts.project);
        const cm = new ConfigManager(projectPath);
        const manager = new GuideManager(projectPath, cm);

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
