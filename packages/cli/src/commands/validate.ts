import { Command } from 'commander';
import {
  FileProjectStore,
  validateFrontmatterFiles,
  updateFrontmatterField,
} from '@context-forge/core/node';
import { formatDateProject } from '@context-forge/core';
import type { FrontmatterFinding } from '@context-forge/core';
import { resolveProjectWorktree } from '../utils/project.js';
import { withJsonOption, withProjectOption, withFixOption } from '../options.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, dim, error as errorStyle, warn as warnStyle } from '../output/styles.js';

const SEVERITY_ICON: Record<string, string> = {
  error: '✗',
  warning: '⚠',
};

interface ValidateFrontmatterOpts {
  json?: boolean;
  project?: string;
  fix?: boolean;
}

interface FixLogRecord {
  filePath: string;
  field: string;
  before: string;
  after: string;
}

/** Group findings by file path, preserving first-seen order. */
function groupByFile(findings: FrontmatterFinding[]): Map<string, FrontmatterFinding[]> {
  const groups = new Map<string, FrontmatterFinding[]>();
  for (const finding of findings) {
    const group = groups.get(finding.filePath) ?? [];
    group.push(finding);
    groups.set(finding.filePath, group);
  }
  return groups;
}

function printHumanOutput(
  findings: FrontmatterFinding[],
  filesChecked: number,
  fixLog: FixLogRecord[],
  fixErrors: string[],
): void {
  console.log(label('Frontmatter Validation'));
  console.log('');

  if (findings.length === 0) {
    console.log(`  No inconsistencies found (${filesChecked} file${filesChecked !== 1 ? 's' : ''} checked)`);
    return;
  }

  const groups = groupByFile(findings);
  for (const [filePath, fileFindings] of groups) {
    console.log(label(`  ${filePath}`));
    for (const finding of fileFindings) {
      const icon = SEVERITY_ICON[finding.severity] ?? '?';
      const colorFn = finding.severity === 'error' ? errorStyle : warnStyle;
      console.log(colorFn(`    ${icon} ${finding.description}`));

      const logEntry = fixLog.find((e) => e.filePath === filePath && e.field === finding.fixAction?.field);
      if (logEntry) {
        console.log(dim(`      → Fixed: ${logEntry.before} → ${logEntry.after}`));
      }
    }
    console.log('');
  }

  const summary = `${findings.length} finding${findings.length !== 1 ? 's' : ''} across ${groups.size} file${groups.size !== 1 ? 's' : ''} (${filesChecked} checked)`;
  console.log(dim(summary));

  if (fixLog.length > 0) {
    console.log(label(`Fixed ${fixLog.length} of ${findings.length} findings`));
  }
  if (fixErrors.length > 0) {
    for (const err of fixErrors) {
      console.log(errorStyle(`  Fix error: ${err}`));
    }
  }
}

async function validateFrontmatterAction(paths: string[], opts: ValidateFrontmatterOpts): Promise<void> {
  const store = new FileProjectStore();
  const { id } = await resolveProjectWorktree({ project: opts.project }, store);
  const project = await store.getById(id);

  if (!project) {
    throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
  }
  if (!project.projectPath) {
    throw new UserError('No projectPath configured. Set one with: cf set projectPath /path/to/project');
  }

  const { findings, filesChecked } = await validateFrontmatterFiles(
    project.projectPath,
    paths.length > 0 ? paths : undefined,
    { projectName: project.name },
  );

  const fixLog: FixLogRecord[] = [];
  const fixErrors: string[] = [];
  let remaining = findings;

  if (opts.fix) {
    const dateStamp = formatDateProject();
    const stillBroken: FrontmatterFinding[] = [];

    for (const finding of findings) {
      if (!finding.fixAction) {
        stillBroken.push(finding);
        continue;
      }
      try {
        const entry = await updateFrontmatterField(
          finding.filePath,
          finding.fixAction.field,
          finding.fixAction.value,
          dateStamp,
        );
        fixLog.push({ filePath: finding.filePath, field: finding.fixAction.field, before: entry.before, after: entry.after });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fixErrors.push(`Fix failed for ${finding.filePath} (${finding.fixAction.field}): ${msg}`);
        stillBroken.push(finding);
      }
    }

    remaining = stillBroken;
  }

  if (opts.json) {
    const jsonOutput: Record<string, unknown> = {
      filesChecked,
      totalFindings: findings.length,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      findings,
    };
    if (opts.fix) {
      jsonOutput.fixed = fixLog.length;
      jsonOutput.fixLog = fixLog;
      jsonOutput.fixErrors = fixErrors;
    }
    printJson(jsonOutput);
  } else {
    printHumanOutput(findings, filesChecked, fixLog, fixErrors);
  }

  if (remaining.length > 0 || fixErrors.length > 0) {
    process.exitCode = 1;
  }
}

export function registerValidateCommand(program: Command): void {
  const validateCmd = program
    .command('validate')
    .description('Validate project artifacts against their machine-readable schemas');

  const frontmatterCmd = validateCmd
    .command('frontmatter [paths...]')
    .description(
      'Validate YAML frontmatter against per-docType schema. ' +
        'With no paths, walks all methodology documents; with paths, validates only ' +
        'the in-root .md files among them (others are silently skipped). ' +
        'Unlike cf check --fix, --fix here applies without a confirmation prompt — ' +
        'findings are per-document and deterministic, and this command is meant for scripts.',
    );
  withJsonOption(frontmatterCmd);
  withProjectOption(frontmatterCmd);
  withFixOption(frontmatterCmd);
  frontmatterCmd.action(async (paths: string[], opts: ValidateFrontmatterOpts) => {
    try {
      await validateFrontmatterAction(paths, opts);
    } catch (err) {
      handleError(err, 2);
    }
  });
}
