import * as readline from 'node:readline';
import { Command } from 'commander';
import {
  FileProjectStore,
  ArtifactIntrospector,
  ConsistencyChecker,
  ConfigManager,
} from '@context-forge/core/node';
import type {
  ConsistencyCheckResult,
  ConsistencyFixResult,
  ConsistencyFinding,
} from '@context-forge/core';
import { resolveProjectId } from '../utils/project.js';
import { handleError, UserError } from '../utils/errors.js';
import { printJson } from '../output/formatter.js';
import { label, dim, error as errorStyle, warn as warnStyle } from '../output/styles.js';

const SEVERITY_ICON: Record<string, string> = {
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
};

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

function isFixResult(result: ConsistencyCheckResult): result is ConsistencyFixResult {
  return 'fixLog' in result;
}

function formatFinding(finding: ConsistencyFinding, fixResult?: ConsistencyFixResult): string {
  const icon = SEVERITY_ICON[finding.severity] ?? '?';
  const colorFn = finding.severity === 'error' ? errorStyle : finding.severity === 'warning' ? warnStyle : dim;
  const lines: string[] = [];
  lines.push(colorFn(`  ${icon} ${finding.description}`));

  if (fixResult && finding.fixable) {
    const logEntry = fixResult.fixLog.find((e) => e.rule === finding.rule);
    if (logEntry) {
      lines.push(dim(`    → Fixed: ${logEntry.before} → ${logEntry.after} in ${logEntry.filePath}`));
    }
  } else {
    lines.push(dim(`    → ${finding.suggestedFix}`));
  }

  return lines.join('\n');
}

/** Extract slice index prefix from a finding description like "[175] ..." */
function extractFindingSliceIndex(description: string): string | null {
  const match = /^\[(\d+)\]\s/.exec(description);
  return match ? match[1] : null;
}

/** Group findings by slice index prefix, with non-prefixed in a "Project-level" group */
function groupFindings(findings: ConsistencyFinding[]): Map<string, ConsistencyFinding[]> {
  const groups = new Map<string, ConsistencyFinding[]>();
  for (const finding of findings) {
    const idx = extractFindingSliceIndex(finding.description);
    const key = idx ?? 'project';
    const group = groups.get(key) ?? [];
    group.push(finding);
    groups.set(key, group);
  }
  return groups;
}

interface CheckOpts {
  json?: boolean;
  project?: string;
  fix?: boolean;
  slice?: string;
  yes?: boolean;
}

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run consistency checks on project artifacts')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--fix', 'Apply non-destructive corrections (when available)')
    .option('--slice <index>', 'Check only a specific slice by index')
    .option('--yes', 'Skip confirmation prompt in fix mode')
    .action(async (opts: CheckOpts) => {
      try {
        const store = new FileProjectStore();
        const { id } = await resolveProjectId(opts.project, store);
        const project = await store.getById(id);

        if (!project) {
          throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
        }

        const introspector = new ArtifactIntrospector();
        const checker = new ConsistencyChecker(introspector);

        // Determine fix mode: explicit flag > config key > false
        let fixMode = opts.fix ?? false;
        if (!fixMode) {
          try {
            const cm = new ConfigManager(project.projectPath);
            const autoFixResult = await cm.get('workflow.auto_fix');
            if (autoFixResult.value === true) {
              fixMode = true;
            }
          } catch {
            // Config read failed — default to check-only
          }
        }

        // Determine scope: --slice narrows to single slice, otherwise all-slices
        const singleSlice = opts.slice ? parseInt(opts.slice, 10) : null;
        if (singleSlice !== null && isNaN(singleSlice)) {
          throw new UserError(`Invalid slice index: '${opts.slice}'`);
        }

        let result: ConsistencyCheckResult;

        if (singleSlice !== null) {
          // Narrow to single slice — set fileSlice temporarily and use check()/fix()
          const sliceProject = { ...project, fileSlice: `${singleSlice}-slice` };
          result = fixMode
            ? await checker.fix(sliceProject)
            : await checker.check(sliceProject);
        } else if (fixMode) {
          // All-slices fix mode — prompt for confirmation unless --yes
          if (!opts.yes) {
            const dryRun = await checker.checkAll(project);
            const fixableCount = dryRun.findings.filter((f) => f.fixable).length;

            if (fixableCount === 0) {
              result = dryRun;
            } else {
              printCheckOutput(dryRun, project.name, false);
              const confirmed = await askConfirmation(
                `\nFound ${fixableCount} fixable finding${fixableCount !== 1 ? 's' : ''}. Apply fixes? [y/N] `,
              );
              if (!confirmed) {
                console.log('Aborted.');
                return;
              }
              result = await checker.fixAll(project);
            }
          } else {
            result = await checker.fixAll(project);
          }
        } else {
          result = await checker.checkAll(project);
        }

        if (opts.json) {
          printJson(result);
          return;
        }

        printCheckOutput(result, project.name, fixMode);
      } catch (err) {
        handleError(err);
      }
    });
}

function printCheckOutput(
  result: ConsistencyCheckResult,
  projectName: string,
  fixMode: boolean,
): void {
  const modeLabel = fixMode ? ' (fix mode)' : '';
  console.log(label(`Consistency Check: ${projectName}${modeLabel}`));
  console.log('');

  if (result.totalFindings === 0) {
    console.log('  No inconsistencies found');
    return;
  }

  const fixRes = isFixResult(result) ? result : undefined;
  const groups = groupFindings(result.findings);

  for (const [key, findings] of groups) {
    const groupLabel = key === 'project' ? 'Project-level' : `Slice ${key}`;
    console.log(label(`  ${groupLabel}`));

    for (const finding of findings) {
      console.log(formatFinding(finding, fixRes));
    }
    console.log('');
  }

  if (fixRes) {
    console.log(label(`Fixed ${fixRes.fixed} of ${result.totalFindings} findings`));
    if (fixRes.fixErrors.length > 0) {
      for (const err of fixRes.fixErrors) {
        console.log(errorStyle(`  Fix error: ${err}`));
      }
    }
  } else {
    console.log(dim(result.summary));
  }
}
