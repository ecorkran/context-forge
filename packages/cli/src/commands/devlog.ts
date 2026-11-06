/**
 * `cf devlog archive`: move older DEVLOG.md day sections into quarterly archives (slice 936).
 * Wiring and output only; all logic lives in core.
 */
import { Command } from 'commander';
import { formatDateProject, resolveProject } from '@context-forge/core';
import {
  ConfigManager,
  FileProjectStore,
  NO_MOVE_REASON_TEXT,
  archiveDevlog,
  readDevlogLimits,
  type ArchiveDevlogResult,
} from '@context-forge/core/node';
import { handleError, UserError } from '../utils/errors.js';
import { withProjectOption } from '../options.js';
import { resolveProjectWorktree } from '../utils/project.js';

const DEVLOG_NAME = 'DEVLOG.md';

function report(result: ArchiveDevlogResult, maxBytes: number, targetBytes: number): void {
  if (result.status === 'within-limit') {
    console.log(`${DEVLOG_NAME}: ${result.sizeBytes} bytes, within devlog.max_bytes (${maxBytes}). Nothing to archive.`);
    return;
  }
  if (result.status === 'nothing-movable') {
    console.log(`${DEVLOG_NAME}: ${result.sizeBytes} bytes, over devlog.max_bytes (${maxBytes}).`);
    console.log(NO_MOVE_REASON_TEXT[result.reason]);
    return;
  }
  const verb = result.status === 'dry-run' ? 'Would move' : 'Moved';
  console.log(
    `${DEVLOG_NAME}: ${result.beforeBytes} → ${result.afterBytes} bytes (limit ${maxBytes}, target ${targetBytes})`
  );
  console.log(`${verb} ${result.movedCount} sections:`);
  for (const archive of result.archives) console.log(`  ${archive.relPath}  ${archive.sectionCount}`);
}

export function registerDevlogCommand(program: Command): void {
  const devlogCmd = program.command('devlog').description('Manage the project DEVLOG.md');

  const archiveCmd = devlogCmd
    .command('archive')
    .description('Move older DEVLOG.md day sections into quarterly archives when it passes devlog.max_bytes')
    .option('--dry-run', 'Print the plan without writing any file');
  withProjectOption(archiveCmd);
  archiveCmd.action(async (opts: { project?: string; dryRun?: boolean }) => {
    try {
      const store = new FileProjectStore();
      const { id, worktreeId } = await resolveProjectWorktree({ project: opts.project }, store);
      const project = await resolveProject(store, id, worktreeId);
      if (!project) {
        throw new UserError(`Project not found: '${id}'.`, 'PROJECT_NOT_FOUND', 'Run cf project list to see available projects.');
      }
      if (!project.projectPath) {
        throw new UserError(
          `Project '${project.name}' has no configured project path.\n` +
            '  Run cf init in the project directory to set the path.',
        );
      }

      const { maxBytes, targetBytes } = await readDevlogLimits(new ConfigManager(project.projectPath));
      const result = await archiveDevlog({
        checkoutPath: project.projectPath,
        maxBytes,
        targetBytes,
        projectName: project.name,
        today: formatDateProject(),
        dryRun: opts.dryRun === true,
      });
      report(result, maxBytes, targetBytes);
    } catch (err) {
      handleError(err);
    }
  });
}
