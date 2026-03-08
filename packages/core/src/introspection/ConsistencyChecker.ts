import { join } from 'node:path';
import type { ProjectData } from '../types/project.js';
import type { IArtifactIntrospector } from './interfaces.js';
import type {
  ConsistencyFinding,
  ConsistencyCheckResult,
  ConsistencyFixResult,
  SlicePlanEntry,
  TaskFileResult,
  FrontmatterResult,
} from './types.js';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
import { updateCheckbox, updateFrontmatterField } from './writers/markdownWriter.js';

/**
 * Extract numeric slice index from a fileSlice value like "165-slice.workflow-navigator".
 */
function extractSliceIndex(fileSlice: string | undefined): number | null {
  if (!fileSlice) return null;
  const match = /^(\d+)-/.exec(fileSlice);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Compares related artifact states within a project and flags mismatches.
 * Optionally applies non-destructive corrections to fixable findings.
 */
export class ConsistencyChecker {
  private readonly introspector: IArtifactIntrospector;

  constructor(introspector: IArtifactIntrospector) {
    this.introspector = introspector;
  }

  /**
   * Run all detection rules against a project and return structured findings.
   */
  async check(project: ProjectData): Promise<ConsistencyCheckResult> {
    const projectPath = project.projectPath;
    if (!projectPath) {
      return this.emptyResult('');
    }

    const sliceIndex = extractSliceIndex(project.fileSlice);
    if (sliceIndex === null) {
      return this.emptyResult(projectPath);
    }

    // Gather data from introspector — each call individually try/caught
    const docs = await this.safeDetectDocuments(projectPath, sliceIndex);
    const slicePlanResult = await this.safeParseSlicePlan(project, projectPath);
    const taskResult = await this.safeParseTaskFile(docs?.taskFile, projectPath);
    const sliceFrontmatter = await this.safeParseFrontmatter(docs?.sliceDesign, projectPath);

    // Find the matching slice plan entry
    const planEntry = slicePlanResult?.entries.find((e) => e.index === sliceIndex) ?? null;
    const slicePlanPath = this.resolveSlicePlanPath(project, projectPath);

    const findings: ConsistencyFinding[] = [];

    // Rule 1: task completion vs. slice plan checkbox
    findings.push(
      ...this.ruleTaskVsPlan(taskResult, planEntry, slicePlanPath, slicePlanResult, sliceIndex),
    );

    const sliceDesignRel = docs?.sliceDesign ?? null;

    // Rule 2: frontmatter status vs. computed state
    findings.push(
      ...this.ruleFrontmatterVsComputed(
        sliceFrontmatter,
        taskResult,
        sliceDesignRel,
        projectPath,
      ),
    );

    // Rule 3: missing artifact cross-references
    findings.push(
      ...this.ruleMissingArtifacts(docs, planEntry, sliceIndex),
    );

    // Rule 4: plan checkbox vs. slice frontmatter status
    findings.push(
      ...this.rulePlanVsFrontmatter(
        planEntry,
        sliceFrontmatter,
        slicePlanPath,
        sliceDesignRel,
        projectPath,
      ),
    );

    // Rule 5: task file frontmatter status vs. computed task completion
    const taskFileFrontmatter = await this.safeParseTaskFileFrontmatter(docs?.taskFile, projectPath);
    findings.push(
      ...this.ruleTaskFileStatus(taskResult, taskFileFrontmatter),
    );

    return this.buildResult(projectPath, findings);
  }

  /**
   * Run check(), then apply non-destructive corrections to fixable findings.
   */
  async fix(project: ProjectData): Promise<ConsistencyFixResult> {
    const checkResult = await this.check(project);
    const fixLog: ConsistencyFixResult['fixLog'] = [];
    const fixErrors: string[] = [];
    let fixed = 0;

    for (const finding of checkResult.findings) {
      if (!finding.fixable || !finding.fixAction) continue;

      try {
        if (finding.fixAction.type === 'update-checkbox') {
          const { lineIndex, checked } = finding.fixAction.detail as {
            lineIndex: number;
            checked: boolean;
          };
          const entry = await updateCheckbox(finding.fixAction.filePath, lineIndex, checked);
          entry.rule = finding.rule;
          fixLog.push(entry);
          fixed++;
        } else if (finding.fixAction.type === 'update-frontmatter') {
          const { key, value } = finding.fixAction.detail as { key: string; value: string };
          const entry = await updateFrontmatterField(finding.fixAction.filePath, key, value);
          entry.rule = finding.rule;
          fixLog.push(entry);
          fixed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        fixErrors.push(`Fix failed for ${finding.rule}: ${msg}`);
      }
    }

    return { ...checkResult, fixed, fixLog, fixErrors };
  }

  // --- Detection Rules ---

  /** Rule 1: Task completion vs. slice plan checkbox */
  private ruleTaskVsPlan(
    taskResult: TaskFileResult | null,
    planEntry: SlicePlanEntry | null,
    slicePlanPath: string | null,
    slicePlanResult: { entries: SlicePlanEntry[] } | null,
    sliceIndex: number,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];

    if (!taskResult || !planEntry || !slicePlanPath || !slicePlanResult) return findings;

    const tasksComplete = taskResult.inferredStatus === 'complete';
    const sliceChecked = planEntry.isChecked;

    if (tasksComplete && !sliceChecked) {
      // Find the line index of this entry in the plan file for fixing
      const entryIdx = slicePlanResult.entries.findIndex((e) => e.index === sliceIndex);
      findings.push({
        rule: 'task-vs-plan',
        severity: 'warning',
        location: slicePlanPath,
        description: `Tasks complete (${taskResult.completedTasks}/${taskResult.totalTasks}) but slice ${sliceIndex} is unchecked in plan`,
        suggestedFix: `Check the slice plan entry for (${sliceIndex})`,
        fixable: true,
        fixAction: {
          type: 'update-checkbox',
          filePath: slicePlanPath,
          detail: { lineIndex: entryIdx, checked: true, entryIndex: sliceIndex },
        },
      });
    }

    if (sliceChecked && !tasksComplete) {
      const entryIdx = slicePlanResult.entries.findIndex((e) => e.index === sliceIndex);
      findings.push({
        rule: 'task-vs-plan',
        severity: 'error',
        location: slicePlanPath,
        description: `Slice ${sliceIndex} is checked in plan but tasks are incomplete (${taskResult.completedTasks}/${taskResult.totalTasks})`,
        suggestedFix: `Uncheck the slice plan entry for (${sliceIndex})`,
        fixable: true,
        fixAction: {
          type: 'update-checkbox',
          filePath: slicePlanPath,
          detail: { lineIndex: entryIdx, checked: false, entryIndex: sliceIndex },
        },
      });
    }

    return findings;
  }

  /** Rule 2: Frontmatter status vs. computed state */
  private ruleFrontmatterVsComputed(
    frontmatter: FrontmatterResult | null,
    taskResult: TaskFileResult | null,
    sliceDesignRelPath: string | null,
    projectPath: string,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];

    if (!frontmatter?.found || !frontmatter.data.status) return findings;
    if (!taskResult) return findings;

    const fmStatus = frontmatter.data.status.toLowerCase();
    const tasksComplete = taskResult.inferredStatus === 'complete';
    const sliceDesignFullPath = sliceDesignRelPath
      ? join(projectPath, sliceDesignRelPath)
      : frontmatter.filePath;

    if (fmStatus === 'complete' && !tasksComplete) {
      findings.push({
        rule: 'frontmatter-vs-computed',
        severity: 'error',
        location: sliceDesignFullPath,
        description: `Frontmatter status is "complete" but tasks are incomplete (${taskResult.completedTasks}/${taskResult.totalTasks})`,
        suggestedFix: 'Update frontmatter status to "in-progress"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: sliceDesignFullPath,
          detail: { key: 'status', value: 'in-progress' },
        },
      });
    }

    if ((fmStatus === 'in-progress' || fmStatus === 'not-started') && tasksComplete) {
      findings.push({
        rule: 'frontmatter-vs-computed',
        severity: 'warning',
        location: sliceDesignFullPath,
        description: `Frontmatter status is "${fmStatus}" but all tasks are complete (${taskResult.completedTasks}/${taskResult.totalTasks})`,
        suggestedFix: 'Update frontmatter status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: sliceDesignFullPath,
          detail: { key: 'status', value: 'complete' },
        },
      });
    }

    return findings;
  }

  /** Rule 3: Missing artifact cross-references */
  private ruleMissingArtifacts(
    docs: { taskFile: string[] | null; sliceDesign: string | null } | null,
    planEntry: SlicePlanEntry | null,
    sliceIndex: number,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];

    const hasTaskFile = docs?.taskFile !== null && docs?.taskFile !== undefined;
    const hasPlanEntry = planEntry !== null;

    if (hasTaskFile && !hasPlanEntry) {
      findings.push({
        rule: 'missing-artifact',
        severity: 'info',
        location: docs!.taskFile![0],
        description: `Task file exists for slice ${sliceIndex} but no matching slice plan entry found`,
        suggestedFix: 'Add an entry for this slice to the slice plan',
        fixable: false,
      });
    }

    if (hasPlanEntry && !hasTaskFile) {
      findings.push({
        rule: 'missing-artifact',
        severity: 'info',
        location: `slice plan entry ${sliceIndex}`,
        description: `Slice plan entry exists for ${sliceIndex} (${planEntry.name}) but no task file found`,
        suggestedFix: 'Create a task file when ready to begin implementation',
        fixable: false,
      });
    }

    return findings;
  }

  /** Rule 4: Plan checkbox vs. slice frontmatter status */
  private rulePlanVsFrontmatter(
    planEntry: SlicePlanEntry | null,
    frontmatter: FrontmatterResult | null,
    slicePlanPath: string | null,
    sliceDesignRelPath: string | null,
    projectPath: string,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];

    if (!planEntry || !frontmatter?.found || !frontmatter.data.status) return findings;

    const fmStatus = frontmatter.data.status.toLowerCase();
    const planChecked = planEntry.isChecked;
    const sliceDesignFullPath = sliceDesignRelPath
      ? join(projectPath, sliceDesignRelPath)
      : frontmatter.filePath;

    if (planChecked && fmStatus !== 'complete') {
      findings.push({
        rule: 'plan-vs-frontmatter',
        severity: 'warning',
        location: sliceDesignFullPath,
        description: `Slice plan entry is checked but frontmatter status is "${fmStatus}"`,
        suggestedFix: 'Update frontmatter status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: sliceDesignFullPath,
          detail: { key: 'status', value: 'complete' },
        },
      });
    }

    if (!planChecked && fmStatus === 'complete' && slicePlanPath) {
      findings.push({
        rule: 'plan-vs-frontmatter',
        severity: 'warning',
        location: slicePlanPath,
        description: `Frontmatter status is "complete" but slice plan entry is unchecked`,
        suggestedFix: 'Check the slice plan entry',
        fixable: true,
        fixAction: {
          type: 'update-checkbox',
          filePath: slicePlanPath,
          detail: { lineIndex: -1, checked: true },
        },
      });
    }

    return findings;
  }

  /** Rule 5: Task file frontmatter status vs. computed task completion */
  private ruleTaskFileStatus(
    taskResult: TaskFileResult | null,
    taskFrontmatter: FrontmatterResult | null,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];

    if (!taskResult || !taskFrontmatter?.found || !taskFrontmatter.data.status) return findings;

    const fmStatus = taskFrontmatter.data.status.toLowerCase().replace(/_/g, '-');
    const computed = taskResult.inferredStatus; // 'complete' | 'in-progress' | 'not-started'
    const taskFilePath = taskFrontmatter.filePath;

    // Map task file status values to normalized form for comparison
    // Task files use not_started/in_progress/complete in frontmatter
    if (fmStatus === 'complete' && computed !== 'complete') {
      findings.push({
        rule: 'task-file-status',
        severity: 'error',
        location: taskFilePath,
        description: `Task file status is "complete" but tasks are incomplete (${taskResult.completedTasks}/${taskResult.totalTasks})`,
        suggestedFix: 'Update task file status to "in_progress"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: taskFilePath,
          detail: { key: 'status', value: 'in_progress' },
        },
      });
    }

    if (fmStatus !== 'complete' && computed === 'complete') {
      findings.push({
        rule: 'task-file-status',
        severity: 'warning',
        location: taskFilePath,
        description: `Task file status is "${taskFrontmatter.data.status}" but all tasks are complete (${taskResult.completedTasks}/${taskResult.totalTasks})`,
        suggestedFix: 'Update task file status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: taskFilePath,
          detail: { key: 'status', value: 'complete' },
        },
      });
    }

    return findings;
  }

  // --- Helper methods ---

  private emptyResult(projectPath: string): ConsistencyCheckResult {
    return {
      projectPath,
      findings: [],
      totalFindings: 0,
      errors: 0,
      warnings: 0,
      infos: 0,
      summary: 'No inconsistencies found',
    };
  }

  private buildResult(projectPath: string, findings: ConsistencyFinding[]): ConsistencyCheckResult {
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    const infos = findings.filter((f) => f.severity === 'info').length;
    const total = findings.length;

    let summary: string;
    if (total === 0) {
      summary = 'No inconsistencies found';
    } else {
      const parts: string[] = [];
      if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
      if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
      if (infos > 0) parts.push(`${infos} info${infos !== 1 ? 's' : ''}`);
      summary = `${total} finding${total !== 1 ? 's' : ''}: ${parts.join(', ')}`;
    }

    return { projectPath, findings, totalFindings: total, errors, warnings, infos, summary };
  }

  private resolveSlicePlanPath(project: ProjectData, projectPath: string): string | null {
    if (!project.fileSlicePlan) return null;
    const relPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
    return relPath ? join(projectPath, relPath) : null;
  }

  private async safeDetectDocuments(
    projectPath: string,
    sliceIndex: number,
  ): Promise<{ taskFile: string[] | null; sliceDesign: string | null } | null> {
    try {
      const docs = await this.introspector.detectDocuments(projectPath, sliceIndex);
      return { taskFile: docs.taskFile, sliceDesign: docs.sliceDesign };
    } catch {
      return null;
    }
  }

  private async safeParseSlicePlan(
    project: ProjectData,
    projectPath: string,
  ): Promise<{ entries: SlicePlanEntry[] } | null> {
    const planPath = this.resolveSlicePlanPath(project, projectPath);
    if (!planPath) return null;
    try {
      return await this.introspector.parseSlicePlan(planPath);
    } catch {
      return null;
    }
  }

  private async safeParseTaskFile(
    taskFilePaths: string[] | null | undefined,
    projectPath: string,
  ): Promise<TaskFileResult | null> {
    if (!taskFilePaths || taskFilePaths.length === 0) return null;
    try {
      const fullPaths = taskFilePaths.map((p) => join(projectPath, p));
      return await this.introspector.parseTaskFile(fullPaths);
    } catch {
      return null;
    }
  }

  private async safeParseFrontmatter(
    sliceDesignRelPath: string | null | undefined,
    projectPath: string,
  ): Promise<FrontmatterResult | null> {
    if (!sliceDesignRelPath) return null;
    try {
      return await this.introspector.parseFrontmatter(join(projectPath, sliceDesignRelPath));
    } catch {
      return null;
    }
  }

  private async safeParseTaskFileFrontmatter(
    taskFilePaths: string[] | null | undefined,
    projectPath: string,
  ): Promise<FrontmatterResult | null> {
    if (!taskFilePaths || taskFilePaths.length === 0) return null;
    // Parse frontmatter from the first task file (primary file has the frontmatter)
    try {
      return await this.introspector.parseFrontmatter(join(projectPath, taskFilePaths[0]));
    } catch {
      return null;
    }
  }
}
