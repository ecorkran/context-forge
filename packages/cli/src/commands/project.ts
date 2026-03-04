import { Command } from 'commander';
import { FileProjectStore } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success } from '../output/styles.js';

/** Fields visible in the project list table. */
function toListRow(p: ProjectData): string[] {
  return [p.id, p.name, p.projectPath ?? '', p.fileSlice];
}

/** Updatable fields on ProjectData (matches UpdateProjectData keys). */
const UPDATABLE_FIELDS = new Set([
  'name', 'template', 'fileSlice', 'fileTasks', 'instruction',
  'developmentPhase', 'workType', 'dateProject', 'isMonorepo',
  'isMonorepoEnabled', 'projectPath', 'fileHLD', 'fileArch',
  'fileSlicePlan', 'fileSpec',
]);

export function registerProjectCommand(program: Command): void {
  const cmd = program
    .command('project')
    .description('Manage Context Forge projects');

  cmd
    .command('list')
    .description('List all projects')
    .option('--json', 'Output as JSON')
    .action(async (opts: { json?: boolean }) => {
      try {
        const store = new FileProjectStore();
        const projects = await store.getAll();

        if (opts.json) {
          printJson(projects.map((p) => ({
            id: p.id, name: p.name, projectPath: p.projectPath, fileSlice: p.fileSlice,
          })));
          return;
        }

        const rows = projects.map(toListRow);
        console.log(renderTable(['ID', 'Name', 'Path', 'Slice'], rows));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get')
    .description('Get details for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        if (opts.json) {
          printJson(project);
          return;
        }

        // Formatted key-value output
        const fields: [string, string][] = [
          ['ID', project.id],
          ['Name', project.name],
          ['Template', project.template],
          ['Slice', project.fileSlice],
          ['Tasks', project.fileTasks],
          ['Instruction', project.instruction],
          ['Phase', project.developmentPhase ?? ''],
          ['Work Type', project.workType ?? ''],
          ['Date', project.dateProject ?? ''],
          ['Monorepo', String(project.isMonorepo)],
          ['Path', project.projectPath ?? ''],
        ];

        for (const [k, v] of fields) {
          if (v) {
            console.log(`${label(`${k}:`).padEnd(22)} ${valueStyle(v)}`);
          }
        }
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('set <field> <value>')
    .description('Update a field on the active project')
    .option('--project <id>', 'Project ID (overrides default)')
    .action(async (field: string, val: string, opts: { project?: string }) => {
      try {
        if (!UPDATABLE_FIELDS.has(field)) {
          throw new UserError(
            `Unknown field: '${field}'. Updatable fields: ${[...UPDATABLE_FIELDS].join(', ')}`,
          );
        }

        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);

        const existing = await store.getById(id);
        if (!existing) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        // Coerce booleans
        let coerced: string | boolean = val;
        if (val === 'true') coerced = true;
        else if (val === 'false') coerced = false;

        await store.update(id, { [field]: coerced });
        console.log(success(`Updated ${field} = ${String(coerced)} on project ${existing.name}`));
      } catch (err) {
        handleError(err);
      }
    });
}
