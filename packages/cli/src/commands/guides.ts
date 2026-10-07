import { Command } from 'commander';
import {
  CHECKOUT_STATE_LABELS,
  GUIDE_MANAGED_NOTICE,
  GUIDE_STRATEGIES,
  describeGuideStrategy,
  guideExcludeNotices,
  guideMethodDeprecationMessage,
  type GuideExcludeNoticeSource,
  type GuidePreview,
  type GuideVersionChange,
  type UpdateResult,
} from '@context-forge/core';
import {
  FileProjectStore,
  GuideManager,
  ConfigManager,
  BranchGuardWarnError,
  GuideExcludeError,
  sameExcludeList,
} from '@context-forge/core/node';
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

/**
 * A bad guide.exclude value is a config mistake the user fixes, so it prints
 * as a user error (message only) rather than an unexpected failure.
 */
function asUserError(err: unknown): unknown {
  return err instanceof GuideExcludeError ? new UserError(err.message, 'INVALID_VALUE') : err;
}

/** Print guide.exclude warnings for an install or update result to stderr. */
function printExcludeNotices(result: GuideExcludeNoticeSource): void {
  for (const notice of guideExcludeNotices(result)) {
    console.error(warn(notice));
  }
}

/** Status lines for guide.exclude: applied list, pending change, or ignored key. */
function showExcludeStatus(info: Awaited<ReturnType<GuideManager['status']>>): void {
  if (info.excludeApplied.length > 0) {
    console.log(`  ${label('Excluded:')}   ${valueStyle(info.excludeApplied.join(', '))}`);
  }
  if (info.method === 'tarball') {
    if (!sameExcludeList(info.excludeConfigured, info.excludeApplied)) {
      console.log(`  ${warn('guide.exclude changed — run cf guides update to apply')}`);
    }
  } else if (info.method && info.excludeConfigured.length > 0) {
    for (const notice of guideExcludeNotices({ method: info.method, excludeIgnored: true })) {
      console.log(`  ${warn(notice)}`);
    }
  }
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
    // Only submodule installs have a checkout state (D1).
    if (info.checkout) {
      console.log(`  ${label('Checkout:')}   ${valueStyle(CHECKOUT_STATE_LABELS[info.checkout])}`);
    }
    console.log(`  ${label('Version:')}    ${valueStyle(info.version ?? 'unknown')}`);
    console.log(`  ${label('Path:')}       ${dim(info.path)}`);
    showExcludeStatus(info);
    if (info.updateAvailable) {
      console.log(`  ${label('Update:')}     ${warn(`${info.latestVersion} available`)}`);
    }
    console.log();
    console.log(dim(`  ${GUIDE_MANAGED_NOTICE}`));
  } else {
    console.log(`  ${label('Guides:')}     ${dim('not installed (required for context generation)')}`);
    console.log(`  ${dim('  Run cf guides install to install guides.')}`);
  }
  if (info.latestVersion) {
    console.log(`  ${label('Latest:')}     ${dim(info.latestVersion)}`);
  }
}

// The strategy descriptor lives in core so the MCP server renders the same
// text (D8); re-exported here for the CLI tests that read it.
export { GUIDE_STRATEGIES };

/**
 * Render the shared `--strategy` help text from GUIDE_STRATEGIES, so
 * `cf init` and `cf guides install` cannot describe strategies differently.
 */
export function strategyHelpText(): string {
  const rendered = Object.entries(GUIDE_STRATEGIES)
    .map(([name, { summary }]) => describeGuideStrategy(name, summary))
    .join('; ');
  return `Installation strategy — ${rendered}`;
}

/**
 * Install guides for a project. Errors propagate to the caller.
 *
 * `strategy` is the raw `--strategy` string; GuideManager.install() validates
 * it and reports a deprecated alias, so the flag path and the config path
 * produce the same warning here (D5). The warning goes to stderr so stdout
 * stays machine-readable (D4).
 */
export async function guidesInstallAction(
  projectPath: string,
  opts?: { strategy?: string; source?: string; version?: string }
): Promise<void> {
  const cm = new ConfigManager(projectPath);
  const manager = new GuideManager(projectPath, cm);

  // A relative local --source is relative to where the user typed it.
  const result = await manager.install(opts?.strategy, opts?.source, {
    version: opts?.version,
    sourceRoot: process.cwd(),
  });

  if (result.deprecatedAlias) {
    console.error(warn(guideMethodDeprecationMessage(result.deprecatedAlias, result.method)));
  }

  console.log(success('Guide installed successfully.'));
  console.log(`  ${label('Version:')}  ${valueStyle(result.version ?? 'unknown')}`);
  console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
  console.log(`  ${label('Path:')}     ${dim(result.path)}`);
  reportCommitted(result.committed);
  if (result.persistedStrategy) {
    console.log(
      `  ${label('Config:')}   guide.git_strategy = ${valueStyle(result.persistedStrategy)} ` +
        dim('(saved to the shared project config; commit it so teammates get the same strategy)')
    );
  }
  if (result.exclude) {
    console.log(`  ${label('Excluded:')} ${valueStyle(result.exclude.join(', '))}`);
  }
  printExcludeNotices(result);
}

/**
 * Say whether the guide change was committed. Silent when the strategy reports
 * nothing (`undefined`), so strategies with no commit step print no line.
 */
function reportCommitted(committed: boolean | undefined): void {
  if (committed === undefined) return;
  console.log(
    `  ${label('Commit:')}   ${
      committed
        ? valueStyle('committed (not pushed)')
        : dim('not committed — not a git repository, or the guide path is gitignored')
    }`
  );
}

function describePreview(preview: GuidePreview): string {
  return `${preview.added} added, ${preview.removed} removed, ${preview.changed} changed`;
}

/**
 * Show what the update would change, then ask. EOF or a closed stdin answers
 * no (askConfirmation), so an unattended run declines rather than proceeds;
 * --yes is the way to run unattended.
 */
async function confirmPreview(preview: GuidePreview, versions: GuideVersionChange): Promise<boolean> {
  console.log(`Guide update: ${versions.from ?? 'unknown'} → ${versions.to}`);
  console.log(`  ${describePreview(preview)}`);
  return askConfirmation(CONTINUE_PROMPT);
}

/** The one spelling of the confirmation question, shared by the branch guard and the preview. */
const CONTINUE_PROMPT = 'Continue? (y/N) ';

type UpdateOptions = NonNullable<Parameters<GuideManager['update']>[0]>;

/**
 * Run the update, answering the branch guard's warning with a prompt (or
 * --yes). Returns null when the user declines the guard. Nothing has been
 * downloaded at that point: the guard runs first.
 */
async function updateWithGuardPrompt(
  manager: GuideManager,
  options: UpdateOptions,
  assumeYes: boolean
): Promise<UpdateResult | null> {
  try {
    return await manager.update(options);
  } catch (err) {
    if (!(err instanceof BranchGuardWarnError)) throw err;
    if (!assumeYes) {
      console.error(warn(err.message));
      if (!(await askConfirmation(CONTINUE_PROMPT))) return null;
    }
    return manager.update({ ...options, confirmed: true });
  }
}

/** Print the outcome of an update. `requestedVersion` is the --version the user passed, if any. */
function reportUpdateResult(result: UpdateResult, requestedVersion: string | undefined): void {
  const version = result.newVersion ?? 'unknown';
  if (result.unchanged) {
    console.log(success(`Guide is already up to date (${version}).`));
  } else if (result.cancelled) {
    console.log('Update cancelled; guide unchanged.');
  } else if (result.excludeChanged) {
    console.log(success('Guide re-extracted with updated excludes.'));
    console.log(`  ${label('Version:')}  ${valueStyle(version)}`);
    console.log(`  ${label('Excluded:')} ${result.exclude ? valueStyle(result.exclude.join(', ')) : dim('none')}`);
    reportCommitted(result.committed);
  } else if (result.previousVersion === result.newVersion && !result.preview) {
    if (result.worktreeSynced) {
      // Host pointer was already current, but the worktree checkout was
      // synced — say so, or the message contradicts the file changes (GH #44).
      console.log(success('Guide already at latest (worktree synced).'));
    } else if (requestedVersion) {
      // A pinned tag is not necessarily the latest one.
      console.log(success(`Guide is already at ${version}.`));
    } else {
      console.log(success('Guide is already at the latest version.'));
    }
    console.log(`  ${label('Version:')}  ${valueStyle(version)}`);
  } else {
    console.log(success('Guide updated successfully.'));
    console.log(`  ${label('Version:')}  ${dim(result.previousVersion ?? 'unknown')} → ${valueStyle(version)}`);
    console.log(`  ${label('Method:')}   ${valueStyle(result.method)}`);
    if (result.preview) {
      console.log(`  ${label('Changes:')}  ${describePreview(result.preview)}`);
    }
    if (result.exclude) {
      console.log(`  ${label('Excluded:')} ${valueStyle(result.exclude.join(', '))}`);
    }
    reportCommitted(result.committed);
  }
  printExcludeNotices(result);
}

const SOURCE_OPTION_HELP =
  'Source repository URL, or a local .tgz/.tar.gz archive (tarball installs only; recorded as version "local")';
const VERSION_OPTION_HELP = 'Install this release tag instead of the newest (tarball installs only)';

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
        handleError(asUserError(err));
      }
    });

  cmd.addCommand(infoCmd, { isDefault: true });

  // cf guides install
  const installCmd = cmd
    .command('install')
    .description('Install the AI project guide')
    .option('--strategy <method>', strategyHelpText())
    .option('--source <url|path.tgz>', SOURCE_OPTION_HELP)
    .option('--version <tag>', VERSION_OPTION_HELP);
  withProjectOption(installCmd);
  installCmd.action(async (opts: { strategy?: string; source?: string; version?: string; project?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        await guidesInstallAction(ctx.projectPath, {
          strategy: opts.strategy,
          source: opts.source,
          version: opts.version,
        });
      } catch (err) {
        handleError(asUserError(err));
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
    .description('Update an existing guide installation')
    .option('--source <url|path.tgz>', SOURCE_OPTION_HELP)
    .option('--version <tag>', VERSION_OPTION_HELP);
  withProjectOption(updateCmd);
  withYesOption(updateCmd);
  updateCmd.action(async (opts: { project?: string; yes?: boolean; source?: string; version?: string }) => {
      try {
        const ctx = await getGuideContext(opts.project);
        const cm = new ConfigManager(ctx.projectPath);
        const manager = new GuideManager(ctx.projectPath, cm, ctx.operationPath);
        // A relative local --source is relative to where the user typed it.
        // --yes also answers the preview question (D6), so no callback then.
        const sourceOptions = {
          source: opts.source,
          version: opts.version,
          sourceRoot: process.cwd(),
          ...(opts.yes ? {} : { confirm: confirmPreview }),
        };

        const result = await updateWithGuardPrompt(manager, sourceOptions, opts.yes === true);
        if (!result) {
          console.log('Update cancelled.');
          return;
        }
        reportUpdateResult(result, opts.version);
      } catch (err) {
        handleError(asUserError(err));
      }
    });
}
