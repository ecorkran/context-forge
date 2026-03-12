import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import type { ProjectData } from '../types/project.js';
import type { WorktreeInfo } from '../types/git.js';
import type { IArtifactIntrospector } from './interfaces.js';
import type {
  ConsistencyFinding,
  ConsistencyCheckResult,
  ConsistencyFixResult,
  SlicePlanEntry,
  SlicePlanResult,
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
   * Run detection rules against the active slice and return structured findings.
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

    const slicePlanResult = await this.safeParseSlicePlan(project, projectPath);
    const slicePlanPath = this.resolveSlicePlanPath(project, projectPath);

    const findings = await this.checkSlice(
      projectPath, sliceIndex, slicePlanResult, slicePlanPath,
    );

    return this.buildResult(projectPath, findings);
  }

  /**
   * Run detection rules against all slices in the plan and return aggregated findings.
   */
  async checkAll(project: ProjectData): Promise<ConsistencyCheckResult> {
    const projectPath = project.projectPath;
    if (!projectPath) {
      return this.emptyResult('');
    }

    const slicePlanResult = await this.safeParseSlicePlan(project, projectPath);
    if (!slicePlanResult || slicePlanResult.entries.length === 0) {
      return this.emptyResult(projectPath);
    }

    const slicePlanPath = this.resolveSlicePlanPath(project, projectPath);
    const allFindings: ConsistencyFinding[] = [];

    // Run rules 1-5 for each slice entry
    for (const entry of slicePlanResult.entries) {
      const sliceFindings = await this.checkSlice(
        projectPath, entry.index, slicePlanResult, slicePlanPath,
      );
      // Prefix each finding's description with [sliceIndex] for attribution
      for (const finding of sliceFindings) {
        finding.description = `[${entry.index}] ${finding.description}`;
      }
      allFindings.push(...sliceFindings);
    }

    // Run aggregate rules (6-9) across all discovered slice plans
    const discoveredPlans = await this.discoverAllSlicePlans(projectPath);
    // Merge configured plan with discovered plans (deduplicated)
    const allPlanPaths = new Set(discoveredPlans);
    if (slicePlanPath) allPlanPaths.add(slicePlanPath);

    for (const planPath of allPlanPaths) {
      // Reuse already-parsed result for the configured plan
      let planResult: SlicePlanResult;
      if (planPath === slicePlanPath) {
        planResult = slicePlanResult;
      } else {
        try {
          planResult = await this.introspector.parseSlicePlan(planPath);
        } catch {
          continue;
        }
      }

      allFindings.push(
        ...this.ruleDuplicateIndex(planResult.entries, planPath),
      );
      allFindings.push(
        ...await this.rulePlanStatusVsEntries(planPath, planResult),
      );
    }

    // Rule 8: arch status vs plan — for all discovered arch-plan pairs
    const archPlanPairs = await this.discoverArchPlanPairs(project, projectPath, allPlanPaths);
    for (const { archPath, planResult } of archPlanPairs) {
      allFindings.push(
        ...await this.ruleArchStatusVsPlans(archPath, planResult),
      );
    }

    // Rule 10: stale worktree paths
    allFindings.push(
      ...await this.ruleStaleWorktreePath(project, projectPath),
    );

    return this.buildResult(projectPath, allFindings);
  }

  /**
   * Run check(), then apply non-destructive corrections to fixable findings.
   */
  async fix(project: ProjectData): Promise<ConsistencyFixResult> {
    const checkResult = await this.check(project);
    return this.applyFixes(checkResult);
  }

  /**
   * Run checkAll(), then apply non-destructive corrections to fixable findings.
   * Single pass only — no re-checking after fixes.
   */
  async fixAll(project: ProjectData): Promise<ConsistencyFixResult> {
    const checkResult = await this.checkAll(project);
    return this.applyFixes(checkResult);
  }

  /** Apply fixes to a check result — shared by fix() and fixAll(). */
  async applyFixes(checkResult: ConsistencyCheckResult): Promise<ConsistencyFixResult> {
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

  // --- Per-slice check logic ---

  /** Run rules 1-5 against a single slice, returning raw findings (no prefix). */
  private async checkSlice(
    projectPath: string,
    sliceIndex: number,
    slicePlanResult: { entries: SlicePlanEntry[] } | null,
    slicePlanPath: string | null,
  ): Promise<ConsistencyFinding[]> {
    const docs = await this.safeDetectDocuments(projectPath, sliceIndex);
    const taskResult = await this.safeParseTaskFile(docs?.taskFile, projectPath);
    const sliceFrontmatter = await this.safeParseFrontmatter(docs?.sliceDesign, projectPath);

    const planEntry = slicePlanResult?.entries.find((e) => e.index === sliceIndex) ?? null;
    const sliceDesignRel = docs?.sliceDesign ?? null;

    const findings: ConsistencyFinding[] = [];

    findings.push(
      ...this.ruleTaskVsPlan(taskResult, planEntry, slicePlanPath, slicePlanResult, sliceIndex),
    );
    findings.push(
      ...this.ruleFrontmatterVsComputed(sliceFrontmatter, taskResult, sliceDesignRel, projectPath),
    );
    findings.push(
      ...this.ruleMissingArtifacts(docs, planEntry, sliceIndex),
    );
    findings.push(
      ...this.rulePlanVsFrontmatter(planEntry, sliceFrontmatter, slicePlanPath, sliceDesignRel, projectPath),
    );

    const taskFileFrontmatter = await this.safeParseTaskFileFrontmatter(docs?.taskFile, projectPath);
    findings.push(
      ...this.ruleTaskFileStatus(taskResult, taskFileFrontmatter),
    );

    return findings;
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
          detail: { lineIndex: planEntry.lineIndex, checked: true, entryIndex: sliceIndex },
        },
      });
    }

    if (sliceChecked && !tasksComplete) {
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
          detail: { lineIndex: planEntry.lineIndex, checked: false, entryIndex: sliceIndex },
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
          detail: { lineIndex: planEntry.lineIndex, checked: true },
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

  // --- Aggregate Rules (checkAll only) ---

  /** Rule 6: Duplicate slice index detection */
  private ruleDuplicateIndex(
    entries: SlicePlanEntry[],
    slicePlanPath: string,
  ): ConsistencyFinding[] {
    const findings: ConsistencyFinding[] = [];
    const indexMap = new Map<number, string[]>();

    for (const entry of entries) {
      const names = indexMap.get(entry.index) ?? [];
      names.push(entry.name);
      indexMap.set(entry.index, names);
    }

    for (const [index, names] of indexMap) {
      if (names.length > 1) {
        findings.push({
          rule: 'duplicate-index',
          severity: 'error',
          location: slicePlanPath,
          description: `Duplicate slice index ${index}: '${names.join("' and '")}'`,
          suggestedFix: 'Renumber one of the entries',
          fixable: false,
        });
      }
    }

    return findings;
  }

  /** Rule 7: Plan status vs. all-entries-complete */
  private async rulePlanStatusVsEntries(
    slicePlanPath: string,
    slicePlanResult: SlicePlanResult,
  ): Promise<ConsistencyFinding[]> {
    const findings: ConsistencyFinding[] = [];

    let planFrontmatter: FrontmatterResult;
    try {
      planFrontmatter = await this.introspector.parseFrontmatter(slicePlanPath);
    } catch {
      return findings;
    }

    if (!planFrontmatter.found) return findings;

    const allComplete = slicePlanResult.completedSlices === slicePlanResult.totalSlices;

    // Rule 9: Missing status field — infer from entry completion
    if (!planFrontmatter.data.status) {
      const inferredStatus = allComplete && slicePlanResult.totalSlices > 0 ? 'complete' : 'in-progress';
      findings.push({
        rule: 'missing-plan-status',
        severity: 'warning',
        location: slicePlanPath,
        description: `Slice plan frontmatter has no "status" field (inferred: "${inferredStatus}")`,
        suggestedFix: `Add status: ${inferredStatus} to slice plan frontmatter`,
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: slicePlanPath,
          detail: { key: 'status', value: inferredStatus },
        },
      });
      return findings;
    }

    const planStatus = planFrontmatter.data.status.toLowerCase();

    if (planStatus === 'complete' && !allComplete) {
      findings.push({
        rule: 'plan-status-vs-entries',
        severity: 'warning',
        location: slicePlanPath,
        description: `Plan status is "complete" but only ${slicePlanResult.completedSlices}/${slicePlanResult.totalSlices} entries are checked`,
        suggestedFix: 'Update plan frontmatter status to "in-progress"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: slicePlanPath,
          detail: { key: 'status', value: 'in-progress' },
        },
      });
    }

    if (planStatus !== 'complete' && allComplete && slicePlanResult.totalSlices > 0) {
      findings.push({
        rule: 'plan-status-vs-entries',
        severity: 'warning',
        location: slicePlanPath,
        description: `All ${slicePlanResult.totalSlices} entries are checked but plan status is "${planStatus}"`,
        suggestedFix: 'Update plan frontmatter status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: slicePlanPath,
          detail: { key: 'status', value: 'complete' },
        },
      });
    }

    return findings;
  }

  /** Rule 8: Architecture status vs. all-plans-complete */
  private async ruleArchStatusVsPlans(
    archPath: string,
    slicePlanResult: SlicePlanResult,
  ): Promise<ConsistencyFinding[]> {
    const findings: ConsistencyFinding[] = [];

    let archFrontmatter: FrontmatterResult;
    try {
      archFrontmatter = await this.introspector.parseFrontmatter(archPath);
    } catch {
      return findings;
    }

    if (!archFrontmatter.found || !archFrontmatter.data.status) return findings;

    const archStatus = archFrontmatter.data.status.toLowerCase();
    const allComplete = slicePlanResult.completedSlices === slicePlanResult.totalSlices;

    if (archStatus === 'complete' && !allComplete) {
      findings.push({
        rule: 'arch-status-vs-plans',
        severity: 'warning',
        location: archPath,
        description: `Architecture status is "complete" but plan has unchecked entries (${slicePlanResult.completedSlices}/${slicePlanResult.totalSlices})`,
        suggestedFix: 'Update architecture frontmatter status to "in-progress"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: archPath,
          detail: { key: 'status', value: 'in-progress' },
        },
      });
    }

    if (archStatus !== 'complete' && allComplete && slicePlanResult.totalSlices > 0) {
      findings.push({
        rule: 'arch-status-vs-plans',
        severity: 'warning',
        location: archPath,
        description: `All ${slicePlanResult.totalSlices} plan entries are checked but architecture status is "${archStatus}"`,
        suggestedFix: 'Update architecture frontmatter status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: archPath,
          detail: { key: 'status', value: 'complete' },
        },
      });
    }

    return findings;
  }

  /** Rule 10: Stale worktree paths — worktree path missing or not a git worktree */
  private async ruleStaleWorktreePath(
    project: ProjectData,
    projectPath: string,
    listWorktreesFn?: (repoPath: string) => Promise<WorktreeInfo[]>,
    pathExistsFn: (p: string) => boolean = existsSync,
  ): Promise<ConsistencyFinding[]> {
    if (!project.worktrees || project.worktrees.length === 0) return [];

    let gitWorktrees: WorktreeInfo[];
    try {
      if (listWorktreesFn) {
        gitWorktrees = await listWorktreesFn(projectPath);
      } else {
        // Dynamic import to avoid hard dependency on GitWorktreeDiscovery at module level
        const { GitWorktreeDiscovery } = await import('../git/index.js');
        gitWorktrees = await new GitWorktreeDiscovery().listWorktrees(projectPath);
      }
    } catch {
      return [];
    }

    const gitPaths = new Set(gitWorktrees.map((wt) => wt.path));
    const findings: ConsistencyFinding[] = [];

    for (const wt of project.worktrees) {
      if (!wt.worktreePath) continue;

      if (!pathExistsFn(wt.worktreePath)) {
        findings.push({
          rule: 'stale-worktree-path',
          severity: 'warning',
          location: projectPath,
          description: `Worktree '${wt.name}' path '${wt.worktreePath}' no longer exists on disk`,
          suggestedFix: `Run 'cf worktree update "${wt.name}" --path <new-path>' or 'cf worktree rm "${wt.name}"'`,
          fixable: false,
        });
      } else if (!gitPaths.has(wt.worktreePath)) {
        findings.push({
          rule: 'stale-worktree-path',
          severity: 'warning',
          location: projectPath,
          description: `Worktree '${wt.name}' path '${wt.worktreePath}' is not a registered git worktree`,
          suggestedFix: `Run 'cf worktree update "${wt.name}" --path <new-path>' or 'cf worktree rm "${wt.name}"'`,
          fixable: false,
        });
      }
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

  /** Discover all slice plan files in the architecture directory. */
  private async discoverAllSlicePlans(projectPath: string): Promise<string[]> {
    const archDir = join(projectPath, 'project-documents/user/architecture');
    try {
      const files = await readdir(archDir);
      return files
        .filter((f) => /^\d+-slices\..*\.md$/i.test(f))
        .sort()
        .map((f) => join(archDir, f));
    } catch {
      return [];
    }
  }

  /** Discover all architecture files in the architecture directory. */
  private async discoverAllArchFiles(projectPath: string): Promise<string[]> {
    const archDir = join(projectPath, 'project-documents/user/architecture');
    try {
      const files = await readdir(archDir);
      return files
        .filter((f) => /^\d+-arch\..*\.md$/i.test(f))
        .sort()
        .map((f) => join(archDir, f));
    } catch {
      return [];
    }
  }

  /** Extract numeric index prefix from a filename like "140-arch.foo.md" → 140. */
  private static extractFileIndex(filePath: string): number | null {
    const basename = filePath.split('/').pop() ?? '';
    const match = /^(\d+)-/.exec(basename);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Match discovered arch files to their slice plans by shared index prefix.
   * Also includes the project's configured fileArch as fallback (for tests / minimal setups).
   */
  private async discoverArchPlanPairs(
    project: ProjectData,
    projectPath: string,
    knownPlanPaths: Set<string>,
  ): Promise<{ archPath: string; planResult: SlicePlanResult }[]> {
    const archFiles = await this.discoverAllArchFiles(projectPath);

    // Merge configured arch into discovered set (dedup by full path)
    const allArchPaths = new Set(archFiles);
    if (project.fileArch) {
      const configuredArchRel = resolveArtifactPath('fileArch', project.fileArch);
      if (configuredArchRel) allArchPaths.add(join(projectPath, configuredArchRel));
    }

    // Build index → plan path map from discovered + known plans
    const plansByIndex = new Map<number, string>();
    const allPlanFiles = await this.discoverAllSlicePlans(projectPath);
    for (const planPath of allPlanFiles) {
      const idx = ConsistencyChecker.extractFileIndex(planPath);
      if (idx !== null) plansByIndex.set(idx, planPath);
    }
    for (const pp of knownPlanPaths) {
      const idx = ConsistencyChecker.extractFileIndex(pp);
      if (idx !== null && !plansByIndex.has(idx)) plansByIndex.set(idx, pp);
    }

    const pairs: { archPath: string; planResult: SlicePlanResult }[] = [];

    for (const archPath of allArchPaths) {
      const archIdx = ConsistencyChecker.extractFileIndex(archPath);
      if (archIdx === null) continue;

      const planPath = plansByIndex.get(archIdx);
      if (!planPath) continue;

      try {
        const planResult = await this.introspector.parseSlicePlan(planPath);
        pairs.push({ archPath, planResult });
      } catch {
        // Skip unparseable plans
      }
    }

    return pairs;
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
  ): Promise<SlicePlanResult | null> {
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
