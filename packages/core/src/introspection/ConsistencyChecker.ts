import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import type { ProjectData } from '../types/project.js';
import type { WorktreeInfo } from '../types/git.js';
import { validateFrontmatter } from '../schema/frontmatterSchema.js';
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
import { resolveInitiativePlanPath } from './ArtifactIntrospector.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import { resolveGateConfig, evaluateReviewGate, type ResolvedGate } from './reviewGate.js';

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
  constructor(
    private readonly introspector: IArtifactIntrospector,
    private readonly config?: ConfigManager,
  ) {}

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
    const resolvedGate = this.config ? await resolveGateConfig(this.config) : null;

    const findings = await this.checkSlice(
      projectPath, sliceIndex, slicePlanResult, slicePlanPath, resolvedGate,
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

    // Discover all slice plans in the project (not just the configured one)
    const discoveredPlans = await this.discoverAllSlicePlans(projectPath);
    const configuredPlanPath = this.resolveSlicePlanPath(project, projectPath);

    // Merge configured plan with discovered plans (deduplicated)
    const allPlanPaths = new Set(discoveredPlans);
    if (configuredPlanPath) allPlanPaths.add(configuredPlanPath);

    // Parse all plans and collect unique entries (first occurrence wins by index)
    const parsedPlans = new Map<string, SlicePlanResult>();
    const uniqueEntries = new Map<number, { entry: SlicePlanEntry; planPath: string; planResult: SlicePlanResult }>();

    for (const planPath of allPlanPaths) {
      try {
        const planResult = await this.introspector.parseSlicePlan(planPath);
        parsedPlans.set(planPath, planResult);
        for (const entry of planResult.entries) {
          if (!uniqueEntries.has(entry.index)) {
            uniqueEntries.set(entry.index, { entry, planPath, planResult });
          }
        }
      } catch {
        continue;
      }
    }

    const allFindings: ConsistencyFinding[] = [];
    const resolvedGate = this.config ? await resolveGateConfig(this.config) : null;

    // Run rules 1-5 for each unique slice entry across all plans
    for (const [, { entry, planPath, planResult }] of uniqueEntries) {
      const sliceFindings = await this.checkSlice(
        projectPath, entry.index, planResult, planPath, resolvedGate,
      );
      // Prefix each finding's description with [sliceIndex] for attribution
      for (const finding of sliceFindings) {
        finding.description = `[${entry.index}] ${finding.description}`;
      }
      allFindings.push(...sliceFindings);
    }

    // Run aggregate rules (6-9) across all discovered slice plans
    for (const [planPath, planResult] of parsedPlans) {
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

    // Rules 13 & 14: initiative plan checks
    const initiativePlanPath = await this.findInitiativePlan(projectPath);
    if (initiativePlanPath) {
      try {
        const initiativePlanResult = await this.introspector.parseSlicePlan(initiativePlanPath);
        allFindings.push(
          ...await this.ruleInitiativePlanStatusVsEntries(initiativePlanPath, initiativePlanResult),
        );
        allFindings.push(
          ...await this.ruleInitiativeEntryVsArch(initiativePlanPath, initiativePlanResult, projectPath),
        );
      } catch {
        // Skip if initiative plan is unparseable
      }
    }

    // Rule 12: frontmatter schema validation across all documents
    allFindings.push(
      ...await this.ruleFrontmatterSchema(projectPath, project.name),
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
    resolvedGate: ResolvedGate | null,
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

    findings.push(
      ...await this.ruleReviewGate(planEntry, sliceIndex, projectPath, slicePlanPath, resolvedGate),
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
    const hasSliceDesign = docs?.sliceDesign !== null && docs?.sliceDesign !== undefined;
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

    // Only flag missing task file when a slice design exists — otherwise the
    // slice is in normal pre-work state (planned but not yet designed), which
    // generates noise on every project with a long backlog.
    if (hasPlanEntry && hasSliceDesign && !hasTaskFile) {
      findings.push({
        rule: 'missing-artifact',
        severity: 'info',
        location: `slice plan entry ${sliceIndex}`,
        description: `Slice ${sliceIndex} (${planEntry.name}) has a design but no task file`,
        suggestedFix: 'Create a task file to begin implementation',
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

  /** Rule: slice marked complete in the plan but its code review is absent or failing. */
  private async ruleReviewGate(
    planEntry: SlicePlanEntry | null,
    sliceIndex: number,
    projectPath: string,
    slicePlanPath: string | null,
    resolvedGate: ResolvedGate | null,
  ): Promise<ConsistencyFinding[]> {
    if (!this.config || resolvedGate === null) return [];
    if (!planEntry?.isChecked) return [];
    if (slicePlanPath === null) return [];

    const result = await evaluateReviewGate(
      projectPath, sliceIndex, 'preAdvance', this.config, resolvedGate,
    );
    if (result === null) return [];

    if (result.status === 'pending-review') {
      return [{
        rule: 'review-gate',
        severity: 'warning',
        location: slicePlanPath,
        description: result.rationale,
        suggestedFix: `Run the code review for slice ${sliceIndex}`,
        fixable: false,
      }];
    }

    return [{
      rule: 'review-gate',
      severity: 'error',
      location: join(projectPath, result.artifactPath!),
      description: result.rationale,
      suggestedFix: `Resolve the review findings or rerun the review for slice ${sliceIndex}`,
      fixable: false,
    }];
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

    // Missing status is now handled by Rule 12 (frontmatter-schema)
    if (!planFrontmatter.data.status) return findings;

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


  /** Find the initiative plan file for a project. Delegates to shared utility. */
  private async findInitiativePlan(projectPath: string): Promise<string | null> {
    return resolveInitiativePlanPath(projectPath);
  }

  /** Rule 13: Initiative plan entry checkbox vs. arch doc status */
  private async ruleInitiativeEntryVsArch(
    initiativePlanPath: string,
    initiativePlanResult: SlicePlanResult,
    projectPath: string,
  ): Promise<ConsistencyFinding[]> {
    const findings: ConsistencyFinding[] = [];

    // Build index → arch file map
    const archFiles = await this.discoverAllArchFiles(projectPath);
    const archByIndex = new Map<number, string>();
    for (const archPath of archFiles) {
      const idx = ConsistencyChecker.extractFileIndex(archPath);
      if (idx !== null) archByIndex.set(idx, archPath);
    }

    for (const entry of initiativePlanResult.entries) {
      const archPath = archByIndex.get(entry.index);
      if (!archPath) continue;

      let archFrontmatter: FrontmatterResult;
      try {
        archFrontmatter = await this.introspector.parseFrontmatter(archPath);
      } catch {
        continue;
      }

      if (!archFrontmatter.found || !archFrontmatter.data.status) continue;

      const archStatus = archFrontmatter.data.status.toLowerCase();
      const archComplete = archStatus === 'complete';

      if (archComplete && !entry.isChecked) {
        findings.push({
          rule: 'initiative-entry-vs-arch',
          severity: 'warning',
          location: initiativePlanPath,
          description: `Architecture (${entry.index}) is complete but initiative plan entry "${entry.name}" is unchecked`,
          suggestedFix: `Check the initiative plan entry for (${entry.index})`,
          fixable: true,
          fixAction: {
            type: 'update-checkbox',
            filePath: initiativePlanPath,
            detail: { lineIndex: entry.lineIndex, checked: true, entryIndex: entry.index },
          },
        });
      }

      if (entry.isChecked && !archComplete) {
        findings.push({
          rule: 'initiative-entry-vs-arch',
          severity: 'warning',
          location: archPath,
          description: `Initiative plan entry "${entry.name}" (${entry.index}) is checked but architecture status is "${archStatus}"`,
          suggestedFix: 'Update architecture frontmatter status to "complete"',
          fixable: true,
          fixAction: {
            type: 'update-frontmatter',
            filePath: archPath,
            detail: { key: 'status', value: 'complete' },
          },
        });
      }

      // Check that the associated slice plan is fully complete before the initiative entry is checked
      if (entry.isChecked) {
        const slicePlans = await this.discoverAllSlicePlans(projectPath);
        const slicePlanPath = slicePlans.find((p) => {
          const base = p.split('/').pop() ?? '';
          return new RegExp(`^${entry.index}-slices\\.`).test(base);
        });
        if (slicePlanPath) {
          const slicePlan = await this.introspector.parseSlicePlan(slicePlanPath);
          const incomplete = slicePlan.totalSlices - slicePlan.completedSlices;
          if (incomplete > 0) {
            findings.push({
              rule: 'initiative-entry-vs-arch',
              severity: 'warning',
              location: initiativePlanPath,
              description: `Initiative plan entry "${entry.name}" (${entry.index}) is checked but slice plan has ${incomplete} incomplete slice${incomplete !== 1 ? 's' : ''}`,
              suggestedFix: `Uncheck the initiative entry or complete the remaining ${incomplete} slice${incomplete !== 1 ? 's' : ''}`,
              fixable: false,
            });
          }
        }
      }
    }

    return findings;
  }

  /** Rule 14: Initiative plan frontmatter status vs. all entries checked */
  private async ruleInitiativePlanStatusVsEntries(
    initiativePlanPath: string,
    initiativePlanResult: SlicePlanResult,
  ): Promise<ConsistencyFinding[]> {
    const findings: ConsistencyFinding[] = [];

    let planFrontmatter: FrontmatterResult;
    try {
      planFrontmatter = await this.introspector.parseFrontmatter(initiativePlanPath);
    } catch {
      return findings;
    }

    if (!planFrontmatter.found || !planFrontmatter.data.status) return findings;

    const planStatus = planFrontmatter.data.status.toLowerCase();
    const allComplete =
      initiativePlanResult.totalSlices > 0 &&
      initiativePlanResult.completedSlices === initiativePlanResult.totalSlices;

    if (planStatus === 'complete' && !allComplete) {
      findings.push({
        rule: 'initiative-plan-status-vs-entries',
        severity: 'warning',
        location: initiativePlanPath,
        description: `Initiative plan status is "complete" but only ${initiativePlanResult.completedSlices}/${initiativePlanResult.totalSlices} entries are checked`,
        suggestedFix: 'Update initiative plan frontmatter status to "in-progress"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: initiativePlanPath,
          detail: { key: 'status', value: 'in-progress' },
        },
      });
    }

    if (planStatus !== 'complete' && allComplete) {
      findings.push({
        rule: 'initiative-plan-status-vs-entries',
        severity: 'warning',
        location: initiativePlanPath,
        description: `All ${initiativePlanResult.totalSlices} initiative entries are checked but plan status is "${planStatus}"`,
        suggestedFix: 'Update initiative plan frontmatter status to "complete"',
        fixable: true,
        fixAction: {
          type: 'update-frontmatter',
          filePath: initiativePlanPath,
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

  // --- Document-wide rules ---

  /** Directories under project-documents/user/ to scan for methodology documents. */
  private static readonly DOC_SCAN_DIRS = [
    'architecture',
    'slices',
    'tasks',
    'project-guides',
    'reviews',
    'analysis',
  ];

  /** Discover all .md documents across methodology directories. */
  private async discoverAllDocuments(projectPath: string): Promise<string[]> {
    const userDir = join(projectPath, 'project-documents/user');
    const allPaths: string[] = [];

    for (const subdir of ConsistencyChecker.DOC_SCAN_DIRS) {
      const dir = join(userDir, subdir);
      try {
        const files = await readdir(dir);
        for (const f of files) {
          if (f.endsWith('.md')) {
            allPaths.push(join(dir, f));
          }
        }
      } catch {
        // Directory may not exist — skip
      }
    }

    return allPaths;
  }

  /** Rule 12: Validate frontmatter against per-docType schema. */
  private async ruleFrontmatterSchema(projectPath: string, projectName?: string): Promise<ConsistencyFinding[]> {
    const findings: ConsistencyFinding[] = [];
    const documents = await this.discoverAllDocuments(projectPath);

    for (const docPath of documents) {
      let fm;
      try {
        fm = await this.introspector.parseFrontmatter(docPath);
      } catch {
        continue;
      }

      if (!fm.found) continue;

      const schemaFindings = validateFrontmatter(docPath, fm.data, { projectName });
      const relPath = relative(projectPath, docPath);

      for (const sf of schemaFindings) {
        const finding: ConsistencyFinding = {
          rule: sf.rule,
          severity: sf.severity,
          location: docPath,
          description: `${relPath}: ${sf.description}`,
          suggestedFix: sf.fixAction
            ? `Add ${sf.fixAction.field}: ${sf.fixAction.value} to frontmatter`
            : `Add the missing field to frontmatter`,
          fixable: !!sf.fixAction,
        };

        if (sf.fixAction) {
          finding.fixAction = {
            type: sf.fixAction.type as 'update-frontmatter',
            filePath: docPath,
            detail: { key: sf.fixAction.field, value: sf.fixAction.value },
          };
        }

        findings.push(finding);
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
