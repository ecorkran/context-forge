/**
 * `cf docs map`: write or refresh the docs map in project-documents (slice 267).
 * The map links the project's existing README, docs/ and ADRs in place; the
 * discovery and the file handling live in core.
 */
import { relative, sep } from 'node:path';
import { Command } from 'commander';
import { resolveProject } from '@context-forge/core';
import { FileProjectStore, writeDocsMap } from '@context-forge/core/node';
import { handleError, UserError } from '../utils/errors.js';
import { withProjectOption } from '../options.js';
import { resolveProjectWorktree } from '../utils/project.js';

export function registerDocsCommand(program: Command): void {
  const docsCmd = program.command('docs').description('Map the project\'s existing docs and ADRs');

  const mapCmd = docsCmd
    .command('map')
    .description('Generate or refresh the docs map in project-documents');
  withProjectOption(mapCmd);
  mapCmd.action(async (opts: { project?: string }) => {
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

      const result = await writeDocsMap(project.projectPath, project.name);
      const shownPath = relative(project.projectPath, result.path).split(sep).join('/');
      console.log(`Docs map: ${shownPath} (${result.status})`);
      console.log(`  ADRs: ${result.adrs}   Docs: ${result.docs}`);
      if (result.skippedSymlinks.length > 0) {
        console.log(`  Skipped symlinks (not followed): ${result.skippedSymlinks.join(', ')}`);
      }
    } catch (err) {
      handleError(err);
    }
  });
}
