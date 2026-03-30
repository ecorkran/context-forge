import * as os from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { FileProjectStore, resolveFileByIndex, resolveArtifactPath, deriveArtifactStem, parseSlicePlan, WorktreeService, computeAutoSetFields } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import {
  resolveFieldName,
  resolvePhaseValue,
  validateFieldValue,
  PROJECT_FIELDS,
  FIELD_GROUPS,
  applyWorktreeOverlay,
  WORKTREE_SCOPED_FIELDS,
  PROJECT_TO_WORKTREE_FIELD,
  formatDateProject,
} from '@context-forge/core';
import type { FieldGroup } from '@context-forge/core';
import { resolveProjectId, resolveProjectWorktree, findProjectByCwd } from '../utils/project.js';
import { resolveProject } from '@context-forge/core';
import { resolveOperationPath, getWorktreeIndexRange, getWorktreeRangeOverride, isInIndexRange } from '../utils/worktree-overlay.js';
import { handleError, UserError } from '../utils/errors.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { renderTable } from '../output/tables.js';
import { label, value as valueStyle, success, dim, warn } from '../output/styles.js';

/** Matches `N. [ ] **(NNN) Initiative Name** — ...` in initiative plan files */
const INITIATIVE_ENTRY_RE = /^\d+\.\s+\[[ xX]\]\s+\*\*\((\d+)\)\s+(.+?)\*\*/;

/**
 * Find and parse the initiative plan file (e.g., 001-initiative-plan.*.md)
 * in project-guides/. Returns entries with index and name.
 */
async function parseInitiativePlanEntries(
  basePath: string,
): Promise<{ index: number; name: string }[]> {
  const guidesDir = join(basePath, 'project-documents/user/project-guides');
  let files: string[];
  try {
    files = readdirSync(guidesDir);
  } catch {
    return [];
  }

  const planFile = files.find((f) => f.includes('initiative-plan') && f.endsWith('.md'));
  if (!planFile) return [];

  const content = await readFile(join(guidesDir, planFile), 'utf-8');
  const entries: { index: number; name: string }[] = [];

  for (const line of content.split('\n')) {
    const m = INITIATIVE_ENTRY_RE.exec(line.trim());
    if (m) {
      entries.push({ index: parseInt(m[1], 10), name: m[2].trim() });
    }
  }

  return entries;
}

/**
 * When a numeric index doesn't match an existing file, try to derive the stem
 * from the appropriate plan document.
 *
 * - fileSlice / fileTasks: looks up the slice plan
 * - fileArch / fileSlicePlan: looks up the initiative plan
 */
async function deriveFromPlan(
  project: ProjectData,
  field: string,
  index: string,
  operationPath?: string,
): Promise<string | null> {
  const basePath = operationPath ?? project.projectPath;
  if (!basePath) return null;
  const numericIndex = parseInt(index, 10);

  // fileSlice / fileTasks: derive from slice plan
  if (field === 'fileSlice' || field === 'fileTasks') {
    if (!project.fileSlicePlan) return null;
    const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
    if (!planRelPath) return null;

    const plan = await parseSlicePlan(join(basePath, planRelPath));
    const entry = plan.entries.find((e) => e.index === numericIndex);
    if (!entry) return null;

    return deriveArtifactStem(field, index, entry.name);
  }

  // fileArch / fileSlicePlan: derive from initiative plan
  if (field === 'fileArch' || field === 'fileSlicePlan') {
    const entries = await parseInitiativePlanEntries(basePath);
    const entry = entries.find((e) => e.index === numericIndex);
    if (!entry) return null;

    return deriveArtifactStem(field, index, entry.name);
  }

  return null;
}

/** Shorten an absolute path by replacing the home directory with ~. */
function shortenPath(p: string): string {
  const home = os.homedir();
  if (p === home) return '~';
  if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
  return p;
}


function isWorktreeField(field: string): boolean {
  return WORKTREE_SCOPED_FIELDS.has(field);
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
  opts: { project?: string; projectLevel?: boolean },
): Promise<void> {
  const resolvedField = resolveFieldName(field);
  if (!resolvedField) {
    throw new UserError(
      `Unknown field: '${field}'.`,
      'FIELD_NOT_FOUND',
      `Run 'cf project --schema' to see available fields.`,
    );
  }

  const fieldDef = PROJECT_FIELDS.find((f) => f.field === resolvedField);
  if (fieldDef?.readonly) {
    throw new UserError(`Field '${resolvedField}' is read-only and cannot be set.`, 'READ_ONLY');
  }

  let resolvedValue = val;
  if (resolvedField === 'developmentPhase' || resolvedField === 'instruction') {
    const phaseVal = resolvePhaseValue(val);
    if (!phaseVal) {
      const allowed = fieldDef?.enumValues?.join(', ') ?? '';
      throw new UserError(
        `Invalid value "${val}" for field "${resolvedField}".`,
        'INVALID_VALUE',
        `Allowed values: ${allowed}`,
      );
    }
    resolvedValue = phaseVal;
  }

  // Shorthand: `cf set date now` or `cf set date` → today's date in YYYYMMDD
  if (resolvedField === 'dateProject' && (!resolvedValue || resolvedValue === 'now')) {
    resolvedValue = formatDateProject();
  }

  const validation = validateFieldValue(resolvedField, resolvedValue);
  if (!validation.valid) {
    throw new UserError(validation.error!, 'INVALID_VALUE');
  }

  const store = new FileProjectStore();
  const resolved = await resolveProjectWorktree({ project: opts.project }, store);
  const id = resolved.id;
  const worktreeId = resolved.worktreeId;

  const existing = await store.getById(id);
  if (!existing) {
    throw new UserError(
      `Project not found: '${id}'.`,
      'PROJECT_NOT_FOUND',
      `Run cf project list to see available projects.`,
    );
  }

  // Index-based file resolution: cf set slice 171 → scans for matching file
  // Falls back to slice plan entry name if file doesn't exist on disk
  const opPath = resolveOperationPath(existing, worktreeId);

  // Warn on non-numeric artifact values that don't match expected patterns
  // Valid patterns: numeric index (handled below), or NNN-type.name stem
  if (fieldDef?.group === 'artifacts' && !/^\d+$/.test(resolvedValue) && !/^\d+-\w+\./.test(resolvedValue)) {
    process.stderr.write(
      `Warning: '${resolvedValue}' doesn't look like a valid artifact value.\n` +
      `  Expected a numeric index (e.g. 200) or artifact stem (e.g. 200-slice.my-feature).\n` +
      `  Setting anyway — use cf unset ${fieldDef.aliases[0] ?? resolvedField} to revert.\n`,
    );
  }

  if (fieldDef?.group === 'artifacts' && /^\d+$/.test(resolvedValue) && opPath) {
    // Use worktree-resolved project for slice plan lookup (project-level fields
    // may be cleared after migration, but the worktree context has the values)
    const overlaid = await resolveProject(store, id, worktreeId) ?? existing;
    try {
      const fileResolved = resolveFileByIndex(opPath, resolvedField, resolvedValue);
      if (fileResolved !== null) {
        resolvedValue = fileResolved;
      }
    } catch {
      // File doesn't exist — try deriving from slice plan
      const derived = await deriveFromPlan(overlaid, resolvedField, resolvedValue, opPath);
      if (derived) {
        resolvedValue = derived;
      } else {
        const searchedPlan = (resolvedField === 'fileSlice' || resolvedField === 'fileTasks')
          ? overlaid.fileSlicePlan
          : 'initiative plan';
        const hint = searchedPlan
          ? `Searched '${searchedPlan}' — no entry for index ${resolvedValue}. If this index belongs to a different initiative, switch with cf set arch <initiative-index> first.`
          : `No slice plan is set. Set one with: cf set arch <initiative-index>`;
        throw new UserError(
          `No file matching index '${resolvedValue}' for field '${resolvedField}'.`,
          'ARTIFACT_NOT_FOUND',
          hint,
        );
      }
    }

    // Warn if index is outside worktree's range (suppressed when worktree has rangeOverride)
    const indexRange = getWorktreeIndexRange(existing, worktreeId);
    const numericIndex = parseInt(resolvedValue, 10) || parseInt(/^(\d+)/.exec(resolvedValue)?.[1] ?? '', 10);
    const worktreeHasOverride = getWorktreeRangeOverride(existing, worktreeId);
    if (indexRange && !isNaN(numericIndex) && !isInIndexRange(numericIndex, indexRange) && !worktreeHasOverride) {
      process.stderr.write(warn(`Warning: index ${numericIndex} is outside this worktree's range [${indexRange[0]}-${indexRange[1]}]\n`));
    }
  }

  // Determine worktree context name for display
  const worktreeName = worktreeId
    ? (existing.worktrees ?? []).find((wt) => wt.id === worktreeId)?.name
    : undefined;

  // Idempotency check: skip write if value is already set
  const currentValue = (() => {
    if (worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel) {
      const wt = (existing.worktrees ?? []).find((w) => w.id === worktreeId);
      if (wt) {
        const wtField = PROJECT_TO_WORKTREE_FIELD[resolvedField] ?? resolvedField;
        return (wt as unknown as Record<string, unknown>)[wtField] as string | undefined;
      }
      return undefined;
    }
    if (resolvedField.startsWith('customData.')) {
      const subField = resolvedField.split('.')[1];
      return (existing.customData as Record<string, string> | undefined)?.[subField];
    }
    return (existing as unknown as Record<string, unknown>)[resolvedField] as string | undefined;
  })();

  if (currentValue === resolvedValue) {
    const displayName = fieldDef?.aliases[0] ?? resolvedField;
    const scope = worktreeName ? ` on worktree context "${worktreeName}"` : '';
    process.stderr.write(`${displayName} already set to ${resolvedValue}${scope}\n`);
    return;
  }

  // Route worktree-scoped fields to WorktreeService when worktree is resolved
  if (worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel) {
    const svc = new WorktreeService(store);
    const wtField = PROJECT_TO_WORKTREE_FIELD[resolvedField] ?? resolvedField;

    // Compute auto-set derived fields
    const autoSet = computeAutoSetFields(resolvedField, resolvedValue, opPath);

    // Build worktree update: primary field + derived fields (mapped to worktree names)
    const wtUpdate: Record<string, string> = { [wtField]: resolvedValue };
    for (const [derivedField, derivedValue] of Object.entries(autoSet.derivedUpdates)) {
      const derivedWtField = PROJECT_TO_WORKTREE_FIELD[derivedField] ?? derivedField;
      wtUpdate[derivedWtField] = derivedValue;
    }
    await svc.updateWorktree(id, worktreeId, wtUpdate);

    // Log auto-set descriptions to stderr (status output, not data)
    for (const desc of autoSet.descriptions) {
      process.stderr.write(success(`Updated ${desc} on worktree context "${worktreeName}"`) + '\n');
    }

    const displayName = fieldDef?.aliases[0] ?? resolvedField;
    process.stderr.write(success(`Updated ${displayName} = ${resolvedValue} on worktree context "${worktreeName}"`) + '\n');
    return;
  }

  // Project-level update (no worktree, or --project-level, or non-worktree field)
  // Compute auto-set derived fields
  const autoSet = computeAutoSetFields(resolvedField, resolvedValue, opPath);
  const allUpdates = { [resolvedField]: resolvedValue, ...autoSet.derivedUpdates };

  if (resolvedField.startsWith('customData.')) {
    const subField = resolvedField.split('.')[1];
    const merged = { ...existing.customData, [subField]: resolvedValue };
    await store.update(id, { customData: merged });
    // Apply any derived updates separately (unlikely for customData, but consistent)
    if (Object.keys(autoSet.derivedUpdates).length > 0) {
      await store.update(id, autoSet.derivedUpdates);
    }
  } else {
    await store.update(id, allUpdates);
  }

  // Log auto-set descriptions to stderr (status output, not data)
  for (const desc of autoSet.descriptions) {
    process.stderr.write(success(`Updated ${desc}`) + '\n');
  }

  const displayName = fieldDef?.aliases[0] ?? resolvedField;
  process.stderr.write(success(`Updated ${displayName} = ${resolvedValue} on project ${existing.name}`) + '\n');
}

/** Shared action handler for `cf unset` and `cf project unset`. */
export async function projectUnsetAction(
  field: string,
  opts: { project?: string; projectLevel?: boolean },
): Promise<void> {
  const resolvedField = resolveFieldName(field);
  if (!resolvedField) {
    throw new UserError(
      `Unknown field: '${field}'.`,
      'FIELD_NOT_FOUND',
      `Run 'cf project --schema' to see available fields.`,
    );
  }

  const fieldDef = PROJECT_FIELDS.find((f) => f.field === resolvedField);
  if (fieldDef?.required) {
    throw new UserError(`Cannot unset required field '${resolvedField}'.`, 'INVALID_ARGUMENT');
  }
  if (fieldDef?.readonly) {
    throw new UserError(`Cannot unset read-only field '${resolvedField}'.`, 'READ_ONLY');
  }

  const store = new FileProjectStore();
  const resolved = await resolveProjectWorktree({ project: opts.project }, store);
  const id = resolved.id;
  const worktreeId = resolved.worktreeId;

  const existing = await store.getById(id);
  if (!existing) {
    throw new UserError(`Project not found: '${id}'.`, 'PROJECT_NOT_FOUND', `Run cf project list to see available projects.`);
  }

  const worktreeName = worktreeId
    ? (existing.worktrees ?? []).find((wt) => wt.id === worktreeId)?.name
    : undefined;

  const displayName = fieldDef?.aliases[0] ?? resolvedField;

  if (worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel) {
    const svc = new WorktreeService(store);
    const wtField = PROJECT_TO_WORKTREE_FIELD[resolvedField] ?? resolvedField;
    await svc.updateWorktree(id, worktreeId, { [wtField]: undefined });
    process.stderr.write(success(`Unset ${displayName} on worktree context "${worktreeName}"`) + '\n');
  } else {
    await store.update(id, { [resolvedField]: undefined });
    process.stderr.write(success(`Unset ${displayName} on project ${existing.name}`) + '\n');
  }
}

/** Shared action handler for `cf get` and `cf project get`. */
export async function projectGetAction(
  opts: { json?: boolean; project?: string; projectLevel?: boolean },
): Promise<void> {
  const store = new FileProjectStore();
  const resolved = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await store.getById(resolved.id);

  if (!project) {
    throw new UserError(`Project not found: '${resolved.id}'.`, 'PROJECT_NOT_FOUND', `Run cf project list to see available projects.`);
  }

  const worktreeId = resolved.worktreeId;
  const worktree = worktreeId && !opts.projectLevel
    ? (project.worktrees ?? []).find((wt) => wt.id === worktreeId)
    : undefined;

  if (opts.json) {
    const data = worktreeId ? applyWorktreeOverlay(project, worktreeId) : project;
    if (worktree) {
      printJson({ ...data, worktree });
    } else {
      printJson(data);
    }
    return;
  }

  const groupLabels: Record<FieldGroup, string> = {
    identity: 'Identity',
    artifacts: 'Artifacts',
    workflow: 'Workflow',
    metadata: 'Metadata',
    custom: 'Custom',
  };

  // Show worktree header when active
  if (worktree) {
    console.log(`\n${label('Worktree')}`);
    console.log(`  ${label('Name:'.padEnd(16))}${valueStyle(worktree.name)}`);
    console.log(`  ${label('Range:'.padEnd(16))}${valueStyle(`${worktree.indexRange[0]}-${worktree.indexRange[1]}`)}`);
    if (worktree.worktreePath) {
      console.log(`  ${label('Path:'.padEnd(16))}${valueStyle(worktree.worktreePath)}`);
    }
  }

  // Build a worktree overlay map for worktree-scoped fields
  const wtOverlay: Record<string, string | undefined> = {};
  if (worktree) {
    wtOverlay['developmentPhase'] = worktree.developmentPhase;
    wtOverlay['instruction'] = worktree.instruction;
    wtOverlay['workType'] = worktree.workType;
    wtOverlay['fileArch'] = worktree.archDoc;
    wtOverlay['fileSlicePlan'] = worktree.slicePlan;
    wtOverlay['fileSlice'] = worktree.activeSlice;
    wtOverlay['fileTasks'] = worktree.activeTaskFile;
  }

  const projectRecord = project as unknown as Record<string, unknown>;
  const customData = project.customData as Record<string, unknown> | undefined;

  for (const group of FIELD_GROUPS) {
    const groupFields = PROJECT_FIELDS.filter((f) => f.group === group);

    console.log(`\n${label(groupLabels[group])}`);

    for (const f of groupFields) {
      let v: unknown;
      if (f.field.startsWith('customData.')) {
        const subField = f.field.split('.')[1];
        v = customData?.[subField];
      } else if (worktree && isWorktreeField(f.field)) {
        // Worktree overlay: use worktree value directly, no fallback to project
        v = wtOverlay[f.field];
      } else {
        v = projectRecord[f.field];
      }
      const hasValue = v !== undefined && v !== null && v !== '';
      const display = hasValue ? valueStyle(String(v)) : dim('—');
      console.log(`  ${label(`${f.label}:`.padEnd(16))}${display}`);
    }
  }
}

/** Shared action handler for listing all projects. */
export async function projectListAction(opts: { json?: boolean }): Promise<void> {
  const store = new FileProjectStore();
  const projects = await store.getAll();

  const cwdMatch = await findProjectByCwd(store);
  const activeId = cwdMatch?.project.id ?? null;

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
        await projectListAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('get')
    .description('Get details for the active project')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--project-level', 'Show project-level fields only (skip worktree overlay)')
    .action(async (opts: { json?: boolean; project?: string; projectLevel?: boolean }) => {
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
    .option('--project-level', 'Force update at project level (skip worktree routing)')
    .addHelpText('after', buildSettableFieldsHelp)
    .action(async (field: string | undefined, val: string | undefined, opts: { project?: string; projectLevel?: boolean }) => {
      // Allow `cf project set date` (no value) as shorthand for `cf project set date now`
      const resolvedVal = (!val && field && /^date/i.test(field)) ? 'now' : val;
      if (!field || !resolvedVal) {
        console.log(`Usage: cf project set [options] <field> <value>  —  run cf project set --help for details`);
        return;
      }
      try {
        await projectSetAction(field, resolvedVal, opts);
      } catch (err) {
        handleError(err);
      }
    });

  cmd
    .command('unset [field]')
    .description('Unset (clear) a field on the active project')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--project-level', 'Force unset at project level (skip worktree routing)')
    .action(async (field: string | undefined, opts: { project?: string; projectLevel?: boolean }) => {
      if (!field) {
        console.log(`Usage: cf project unset [options] <field>  —  run cf project unset --help for details`);
        return;
      }
      try {
        await projectUnsetAction(field, opts);
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
          throw new UserError(`Project not found: '${id}'.`, 'PROJECT_NOT_FOUND', `Run cf project list to see available projects.`);
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

