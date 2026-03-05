import * as os from 'node:os';
import * as readline from 'node:readline';
import { Command } from 'commander';
import { FileProjectStore, ConfigManager } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import {
  resolveFieldName,
  resolvePhaseValue,
  validateFieldValue,
  PROJECT_FIELDS,
  FIELD_GROUPS,
} from '@context-forge/core';
import type { FieldGroup } from '@context-forge/core';
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


/** Display the project schema grouped by category. */
function displaySchema(): void {
  const groupLabels: Record<FieldGroup, string> = {
    identity: 'Identity',
    artifacts: 'Artifacts',
    workflow: 'Workflow',
    metadata: 'Metadata',
  };

  console.log(label('\nProject Schema'));
  console.log('══════════════');

  for (const group of FIELD_GROUPS) {
    const groupFields = PROJECT_FIELDS.filter((f) => f.group === group);
    console.log(`\n${label(groupLabels[group])}`);

    for (const f of groupFields) {
      const flags: string[] = [];
      if (f.required) flags.push('required');
      if (f.readonly) flags.push('readonly');
      const flagStr = flags.length > 0 ? `  (${flags.join(', ')})` : '';

      console.log(`  ${f.field.padEnd(18)}${f.type.padEnd(10)}${flagStr}  ${f.description}`);

      if (f.aliases.length > 0) {
        console.log(`${''.padEnd(20)}Aliases: ${f.aliases.join(', ')}`);
      }
      if (f.enumValues) {
        console.log(`${''.padEnd(20)}Values: ${f.enumValues.join(', ')}`);
      }
    }
  }
}

export function registerProjectCommand(program: Command): void {
  const cmd = program
    .command('project')
    .description('Manage Context Forge projects')
    .option('--schema', 'Display project field schema')
    .action((opts: { schema?: boolean }) => {
      if (opts.schema) {
        displaySchema();
      } else {
        cmd.outputHelp();
      }
    });

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

        // Grouped display — iterate by group, skip empty groups
        const groupLabels: Record<FieldGroup, string> = {
          identity: 'Identity',
          artifacts: 'Artifacts',
          workflow: 'Workflow',
          metadata: 'Metadata',
        };

        const projectRecord = project as unknown as Record<string, unknown>;

        for (const group of FIELD_GROUPS) {
          const groupFields = PROJECT_FIELDS.filter((f) => f.group === group);
          const populated = groupFields.filter((f) => {
            const val = projectRecord[f.field];
            return val !== undefined && val !== null && val !== '';
          });

          if (populated.length === 0) continue;

          console.log(`\n${label(groupLabels[group])}`);

          for (const f of populated) {
            const val = String(projectRecord[f.field]);
            console.log(`  ${label(`${f.label}:`.padEnd(16))}${valueStyle(val)}`);
          }
        }

        // Display customData sub-fields if populated
        const custom = project.customData;
        if (custom) {
          const customEntries: [string, string][] = [
            ['Recent Events', custom.recentEvents ?? ''],
            ['Notes', custom.additionalNotes ?? ''],
            ['Tools', custom.availableTools ?? ''],
          ];
          const populated = customEntries.filter(([, v]) => v);
          if (populated.length > 0) {
            console.log(`\n${label('Custom Data')}`);
            for (const [k, v] of populated) {
              console.log(`  ${label(`${k}:`.padEnd(16))}${valueStyle(v)}`);
            }
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

  cmd
    .command('rm [nameOrId]')
    .description('Remove a project from Context Forge (files on disk are not deleted)')
    .option('--project <id>', 'Project ID (overrides default)')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (nameOrId: string | undefined, opts: { project?: string; yes?: boolean }) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(nameOrId ?? opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        if (!opts.yes) {
          const answer = await askConfirmation(
            `Remove project '${project.name}' at ${project.projectPath ?? 'unknown'} from Context Forge? (files on disk will not be deleted) [y/N] `,
          );
          if (!answer) {
            console.log('Cancelled.');
            return;
          }
        }

        await store.delete(id);
        console.log(success(`Project '${project.name}' removed.`));
      } catch (err) {
        handleError(err);
      }
    });
}

/** Prompt user for y/N confirmation via stdin. Returns true if confirmed. */
function askConfirmation(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
