import * as os from 'node:os';
import { Command } from 'commander';
import { FileProjectStore, ConfigManager } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import {
  resolveFieldName,
  resolvePhaseValue,
  validateFieldValue,
  PROJECT_FIELDS,
} from '@context-forge/core';
import { resolveProjectId, findByNameOrId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success } from '../output/styles.js';

/** Shorten an absolute path by replacing the home directory with ~. */
function shortenPath(p: string): string {
  const home = os.homedir();
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
  return p;
}


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

        // Read default_project config to determine which project is the default
        const cm = new ConfigManager();
        const defaultRef = (await cm.get('default_project')).value as string;
        let defaultProject: ProjectData | null = null;
        if (defaultRef) {
          defaultProject = await findByNameOrId(defaultRef, store);
        }

        if (opts.json) {
          printJson(projects.map((p) => ({
            id: p.id,
            name: p.name,
            projectPath: p.projectPath,
            fileSlice: p.fileSlice,
            isDefault: defaultProject?.id === p.id,
          })));
          return;
        }

        const rows = projects.map((p) => [
          p.name,
          shortenPath(p.projectPath ?? ''),
          p.fileSlice,
          defaultProject?.id === p.id ? '●' : '',
        ]);
        console.log(renderTable(['Name', 'Path', 'Slice', 'Default'], rows));
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

        // Formatted key-value output — suppress empty/null fields
        const fields: [string, string][] = [
          ['Name', project.name],
          ['ID', project.id],
          ['Path', project.projectPath ?? ''],
          ['Template', project.template],
          ['Phase', project.developmentPhase ?? ''],
          ['Slice', project.fileSlice],
          ['Tasks', project.fileTasks],
          ['Instruction', project.instruction],
          ['Work Type', project.workType ?? ''],
          ['Date', project.dateProject ?? ''],
        ];

        for (const [k, v] of fields) {
          if (v) {
            console.log(`${label(`${k}:`.padEnd(14))}${valueStyle(v)}`);
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
        const resolvedField = resolveFieldName(field);
        if (!resolvedField) {
          throw new UserError(
            `Unknown field: '${field}'. Run 'cf project --schema' to see available fields.`,
          );
        }

        const fieldDef = PROJECT_FIELDS.find((f) => f.field === resolvedField);
        if (fieldDef?.readonly) {
          throw new UserError(`Field '${resolvedField}' is read-only and cannot be set.`);
        }

        // Resolve phase/instruction values (number, short name, or full string)
        let resolvedValue = val;
        if (resolvedField === 'developmentPhase' || resolvedField === 'instruction') {
          const phaseVal = resolvePhaseValue(val);
          if (!phaseVal) {
            const allowed = fieldDef?.enumValues?.join(', ') ?? '';
            throw new UserError(
              `Invalid value "${val}" for field "${resolvedField}". Allowed values: ${allowed}`,
            );
          }
          resolvedValue = phaseVal;
        }

        // Validate against enum constraints
        const validation = validateFieldValue(resolvedField, resolvedValue);
        if (!validation.valid) {
          throw new UserError(validation.error!);
        }

        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);

        const existing = await store.getById(id);
        if (!existing) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        await store.update(id, { [resolvedField]: resolvedValue });
        console.log(success(`Updated ${resolvedField} = ${resolvedValue} on project ${existing.name}`));
      } catch (err) {
        handleError(err);
      }
    });
}
