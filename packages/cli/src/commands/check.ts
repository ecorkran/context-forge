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

export function registerCheckCommand(program: Command): void {
  program
    .command('check')
    .description('Run consistency checks on project artifacts')
    .option('--json', 'Output as JSON')
    .option('--project <id>', 'Project ID or name (overrides default)')
    .option('--fix', 'Apply non-destructive corrections (when available)')
    .action(async (opts: { json?: boolean; project?: string; fix?: boolean }) => {
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

        const result = fixMode
          ? await checker.fix(project)
          : await checker.check(project);

        if (opts.json) {
          printJson(result);
          return;
        }

        // Terminal output
        const modeLabel = fixMode ? ' (fix mode)' : '';
        console.log(label(`Consistency Check: ${project.name}${modeLabel}`));
        console.log('');

        if (result.totalFindings === 0) {
          console.log('  No inconsistencies found');
          return;
        }

        const fixRes = isFixResult(result) ? result : undefined;

        for (const finding of result.findings) {
          console.log(formatFinding(finding, fixRes));
        }

        console.log('');

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
      } catch (err) {
        handleError(err);
      }
    });
}
