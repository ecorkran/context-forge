import * as os from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { FileProjectStore, ConfigManager, resolveFileByIndex, resolveArtifactPath, deriveArtifactStem, parseSlicePlan } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import {
  resolveFieldName,
  resolvePhaseValue,
  validateFieldValue,
  PROJECT_FIELDS,
  FIELD_GROUPS,
} from '@context-forge/core';
import type { FieldGroup } from '@context-forge/core';
import { resolveProjectId, findByNameOrId, findProjectByCwd } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success, dim } from '../output/styles.js';

/**
 * When a numeric index doesn't match an existing file, try to derive the stem
 * from the slice plan. Only works for fileSlice and fileTasks fields.
 */
async function deriveFromSlicePlan(
  project: ProjectData,
  field: string,
  index: string,
): Promise<string | null> {
  if (!project.fileSlicePlan || !project.projectPath) return null;
  if (field !== 'fileSlice' && field !== 'fileTasks') return null;

  const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
  if (!planRelPath) return null;

  const planPath = join(project.projectPath, planRelPath);
  const plan = await parseSlicePlan(planPath);
  const entry = plan.entries.find((e) => e.index === parseInt(index, 10));
  if (!entry) return null;

  return deriveArtifactStem(field, index, entry.name);
}

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
    custom: 'Custom',
  };

  const rows: string[][] = [];
  const rowPrefixes: string[] = [];
  const enumFields: { name: string; values: string[] }[] = [];

  for (const group of FIELD_GROUPS) {
    const groupFields = PROJECT_FIELDS.filter((f) => f.group === group);

    // Group separator row
    rows.push([label(groupLabels[group]), '', '']);
    rowPrefixes.push('  ');

    for (const f of groupFields) {
      const alias = f.aliases.length > 0 ? f.aliases.join(', ') : '';
      const flags: string[] = [];
      if (f.required) flags.push('required');
      if (f.readonly) flags.push('readonly');
      const desc = flags.length > 0 ? `${f.description} ${dim(`(${flags.join(', ')})`)}` : f.description;
      rows.push([f.field, alias, desc]);
      rowPrefixes.push('    ');

      if (f.enumValues) {
        enumFields.push({ name: f.aliases[0] ?? f.field, values: f.enumValues });
      }
    }
  }

  console.log(label('\nProject Schema') + dim('  (all fields are strings)'));
  console.log('══════════════');
  console.log(renderTable(['Field', 'Alias', 'Description'], rows, rowPrefixes));

  if (enumFields.length > 0) {
    console.log(dim('\n  Allowed values:'));
    for (const { name, values } of enumFields) {
      console.log(dim(`    ${name}: ${values.join(' | ')}`));
    }
  }
}

/** Generate help text showing settable fields grouped by category. */
export function buildSettableFieldsHelp(): string {
  const groupLabels: Record<FieldGroup, string> = {
    identity: 'Identity',
    artifacts: 'Artifacts',
    workflow: 'Workflow',
    metadata: 'Metadata',
    custom: 'Custom',
  };

  const lines: string[] = ['', 'Settable fields:'];

  for (const group of FIELD_GROUPS) {
    const groupFields = PROJECT_FIELDS.filter(
      (f) => f.group === group && !f.readonly,
    );
    if (groupFields.length === 0) continue;

    lines.push(`  ${groupLabels[group]}`);
    for (const f of groupFields) {
      const aliasStr = f.aliases.length > 0 ? ` (${f.aliases.join(', ')})` : '';
      lines.push(`    ${(f.field + aliasStr).padEnd(30)} ${f.description}`);
    }
  }

  lines.push('', "Run 'cf project --schema' for full details including allowed values.");
  return lines.join('\n');
}

/** Shared action handler for `cf set` and `cf project set`. */
export async function projectSetAction(
  field: string,
  val: string,
  opts: { project?: string },
): Promise<void> {
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

  // Index-based file resolution: cf set slice 171 → scans for matching file
  // Falls back to slice plan entry name if file doesn't exist on disk
  if (fieldDef?.group === 'artifacts' && /^\d+$/.test(resolvedValue) && existing.projectPath) {
    try {
      const resolved = resolveFileByIndex(existing.projectPath, resolvedField, resolvedValue);
      if (resolved !== null) {
        resolvedValue = resolved;
      }
    } catch {
      // File doesn't exist — try deriving from slice plan
      const derived = await deriveFromSlicePlan(existing, resolvedField, resolvedValue);
      if (derived) {
        resolvedValue = derived;
      } else {
        throw new UserError(
          `No file matching index '${resolvedValue}' for field '${resolvedField}', and no slice plan entry found to derive from.`,
        );
      }
    }
  }

  // customData fields use dot-notation; merge into the nested object
  if (resolvedField.startsWith('customData.')) {
    const subField = resolvedField.split('.')[1];
    const merged = { ...existing.customData, [subField]: resolvedValue };
    await store.update(id, { customData: merged });
  } else if (resolvedField === 'developmentPhase') {
    // Auto-set instruction to match when phase changes
    await store.update(id, { [resolvedField]: resolvedValue, instruction: resolvedValue });
  } else {
    await store.update(id, { [resolvedField]: resolvedValue });
  }

  // Auto-set fileSlicePlan when fileArch changes
  if (resolvedField === 'fileArch' && existing.projectPath) {
    const archIndex = /^(\d+)-/.exec(resolvedValue);
    if (archIndex) {
      let planResolved: string | null = null;
      try {
        planResolved = resolveFileByIndex(existing.projectPath, 'fileSlicePlan', archIndex[1]);
      } catch {
        // File doesn't exist yet — derive stem from arch value
        const derived = resolvedValue.replace(/^(\d+)-arch\./, '$1-slices.');
        if (derived !== resolvedValue) {
          planResolved = derived;
        }
      }
      if (planResolved !== null) {
        await store.update(id, { fileSlicePlan: planResolved });
        console.log(success(`Updated plan = ${planResolved} (auto-set from arch)`));
      }
    }
  }

  // Auto-set fileTasks when fileSlice changes
  if (resolvedField === 'fileSlice' && existing.projectPath) {
    const sliceIndex = /^(\d+)-/.exec(resolvedValue);
    if (sliceIndex) {
      let tasksResolved: string | null = null;
      try {
        tasksResolved = resolveFileByIndex(existing.projectPath, 'fileTasks', sliceIndex[1]);
      } catch {
        // File doesn't exist yet — derive stem from slice value
        const derived = resolvedValue.replace(/^(\d+)-slice\./, '$1-tasks.');
        if (derived !== resolvedValue) {
          tasksResolved = derived;
        }
      }
      if (tasksResolved !== null) {
        await store.update(id, { fileTasks: tasksResolved });
        console.log(success(`Updated tasks = ${tasksResolved} (auto-set from slice)`));
      }
    }
  }

  // Show alias-friendly name in confirmation
  const displayName = fieldDef?.aliases[0] ?? resolvedField;
  console.log(success(`Updated ${displayName} = ${resolvedValue} on project ${existing.name}`));
  if (resolvedField === 'developmentPhase') {
    console.log(success(`Updated instruction = ${resolvedValue} (auto-set from phase)`));
  }
}

/** Shared action handler for `cf get` and `cf project get`. */
export async function projectGetAction(
  opts: { json?: boolean; project?: string },
): Promise<void> {
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

  const groupLabels: Record<FieldGroup, string> = {
    identity: 'Identity',
    artifacts: 'Artifacts',
    workflow: 'Workflow',
    metadata: 'Metadata',
    custom: 'Custom',
  };

  const projectRecord = project as unknown as Record<string, unknown>;
  const customData = project.customData as Record<string, unknown> | undefined;

  for (const group of FIELD_GROUPS) {
    const groupFields = PROJECT_FIELDS.filter((f) => f.group === group);

    console.log(`\n${label(groupLabels[group])}`);

    for (const f of groupFields) {
      // Read from customData sub-object for dot-notation fields
      let v: unknown;
      if (f.field.startsWith('customData.')) {
        const subField = f.field.split('.')[1];
        v = customData?.[subField];
      } else {
        v = projectRecord[f.field];
      }
      const hasValue = v !== undefined && v !== null && v !== '';
      const display = hasValue ? valueStyle(String(v)) : dim('—');
      console.log(`  ${label(`${f.label}:`.padEnd(16))}${display}`);
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
        console.log(`Usage: ${label('cf project')} [options] [command]  —  run ${dim('cf project --help')} for details`);
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

        const cwdMatch = await findProjectByCwd(store);
        const activeId = cwdMatch?.project.id ?? defaultProject?.id ?? null;

        if (opts.json) {
          printJson(projects.map((p) => ({
            id: p.id,
            name: p.name,
            projectPath: p.projectPath,
            fileSlice: p.fileSlice,
            isActive: p.id === activeId,
          })));
          return;
        }

        const rows = projects.map((p) => {
          const active = p.id === activeId;
          const name = p.name;
          const path = shortenPath(p.projectPath ?? '');
          const slice = p.fileSlice ?? '';
          return active
            ? [success(name), success(path), success(slice)]
            : [name, path, slice];
        });
        const prefixes = projects.map((p) =>
          p.id === activeId ? success('* ') : '  ',
        );
        console.log(renderTable(['Name', 'Path', 'Slice'], rows, prefixes));
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get')
    .description('Get details for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await projectGetAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('set [field] [value]')
    .description('Update a field on the active project')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .addHelpText('after', buildSettableFieldsHelp)
    .action(async (field: string | undefined, val: string | undefined, opts: { project?: string }) => {
      if (!field || !val) {
        console.log(`Usage: cf project set [options] <field> <value>  —  run cf project set --help for details`);
        return;
      }
      try {
        await projectSetAction(field, val, opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('rm [nameOrId]')
    .description('Remove a project from Context Forge (files on disk are not deleted)')
    .option('--project <id>', 'Project ID or name (overrides default)')
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

