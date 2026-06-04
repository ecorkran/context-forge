import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ProjectData } from '../types/project.js';
import type {
  SliceStatus,
  WorkflowStatus,
  NextAction,
  SlicePlanResult,
  TaskFileResult,
} from './types.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { parseTaskFile } from './parsers/taskFileParser.js';
import { detectDocuments } from './parsers/documentDetector.js';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';

/**
 * Extract numeric slice index from a fileSlice value like "165-slice.workflow-navigator.md".
 * Returns null if no leading number found.
 */
export function extractSliceIndex(fileSlice: string | undefined): number | null {
  if (!fileSlice) return null;
  const match = /^(\d+)-/.exec(fileSlice);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract the hundred-block for an index (e.g., 904 → 900, 125 → 100).
 */
function hundredBlock(index: number): number {
  return Math.floor(index / 100) * 100;
}

/**
 * Extract a human-readable slice name from a fileSlice value.
 * "165-slice.workflow-navigator.md" → "workflow-navigator"
 */
function extractSliceName(fileSlice: string): string {
  const withoutExt = fileSlice.replace(/\.md$/, '');
  const match = /^\d+-slice\.(.+)$/.exec(withoutExt);
  return match ? match[1] : withoutExt;
}

/**
 * Stateless workflow navigator that derives project status and next actions
 * from project data and filesystem state.
 */
export class WorkflowNavigator {
  /**
   * Derive the full workflow status for a project.
   */
  async getStatus(project: ProjectData): Promise<WorkflowStatus> {
    const status: WorkflowStatus = {
      project: project.name,
      phase: project.developmentPhase ?? null,
      activeSlice: null,
      slicePlan: null,
      summary: '',
    };

    const projectPath = project.projectPath;
    if (!projectPath) {
      status.summary = `${project.name} — no project path configured`;
      return status;
    }

    // Derive active slice status
    status.activeSlice = await this.deriveSliceStatus(project, projectPath);

    // Parse slice plan if set
    status.slicePlan = await this.parseSlicePlanSafe(project, projectPath);

    // Build summary
    status.summary = this.buildSummary(status);

    return status;
  }

  /**
   * Determine the recommended next action for a project.
   * Uses a priority-ordered state machine based on getStatus().
   */
  async getNext(project: ProjectData): Promise<NextAction> {
    // Priority 1: No projectPath
    if (!project.projectPath) {
      return {
        recommendation: 'Set projectPath',
        rationale: 'A project path is required for workflow navigation and artifact detection.',
        suggestedCommand: 'cf set projectPath /path/to/project',
        summary: 'Set projectPath to enable workflow navigation',
      };
    }

    const status = await this.getStatus(project);
    const slice = status.activeSlice;

    // Priority 2: No fileSlice
    if (!slice || slice.status === 'no-active-slice') {
      // Determine whether the arch file actually exists on disk
      const archRelPath = project.fileArch ? resolveArtifactPath('fileArch', project.fileArch) : null;
      const archFileExists = archRelPath !== null && project.projectPath
        ? existsSync(join(project.projectPath, archRelPath))
        : false;

      // First-run guidance: enriched recommendations for sparse/fresh project states (FR-1–FR-4)
      const firstRunAction = this.detectFirstRunContext(project, archFileExists, status);
      if (firstRunAction !== null) {
        return firstRunAction;
      }

      // No architecture (or arch set but file not yet created) → recommend creating architecture first
      if (!archFileExists && !status.slicePlan) {
        return {
          recommendation: 'Create architecture document',
          rationale: project.fileArch
            ? `Architecture is set to '${project.fileArch}' but the file does not exist yet. Create the architecture document before planning slices.`
            : 'No architecture document or slice plan is configured. Architecture defines the high-level structure before slicing into deliverable increments.',
          suggestedCommand: 'cf set arch <index>',
          summary: 'Create an architecture document to define project structure',
        };
      }
      // Architecture exists but no slice plan
      if (!status.slicePlan) {
        if (project.fileSlicePlan) {
          const currentPhaseNoSlice = project.developmentPhase?.trim() ?? '';
          const inPhase3 = currentPhaseNoSlice.startsWith('Phase 3');
          return {
            recommendation: 'Create the slice plan document',
            rationale: inPhase3
              ? `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Create the slice plan document to define deliverable increments.`
              : `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Switch to Phase 3 (Slice Planning) first, then run cf build to create the slice plan.`,
            suggestedCommand: inPhase3 ? 'cf build' : "cf set phase 'Phase 3: Slice Planning'",
            phase: 'Phase 3: Slice Planning',
            summary: inPhase3 ? 'Create the slice plan document' : 'Switch to Phase 3 then create the slice plan document',
          };
        }
        return {
          recommendation: 'Create or assign a slice plan',
          rationale: 'Architecture is set but no slice plan is configured. A slice plan breaks the architecture into deliverable increments.',
          suggestedCommand: 'cf set plan <stem>',
          summary: 'Create a slice plan from the architecture',
        };
      }
      // Slice plan exists but no active slice — suggest first unchecked entry
      const firstEntry = status.slicePlan.entries.find((e) => !e.isChecked);
      const sliceCmd = firstEntry ? `cf set slice ${firstEntry.index}` : 'cf set slice <index>';
      const sliceLabel = firstEntry ? `slice ${firstEntry.index}: ${firstEntry.name}` : 'your first slice';
      return {
        recommendation: 'You have a slice plan but no active slice. Pick your first slice to begin.',
        rationale: 'Choose the first unchecked slice from your plan. Then advance your phase: cf set phase 4',
        suggestedCommand: sliceCmd,
        summary: `Pick ${sliceLabel} — then cf set phase 4`,
      };
    }

    // --- Compute warnings and arch-existence for active slice path ---
    const warnings: string[] = [];

    // Check if arch file exists on disk (reused below for recommendation override)
    const archRelPath = project.fileArch ? resolveArtifactPath('fileArch', project.fileArch) : null;
    const archFileExists = archRelPath !== null && project.projectPath
      ? existsSync(join(project.projectPath, archRelPath))
      : false;

    // Index band mismatch: warn when the slice index is outside the declared range.
    // Source of truth, in order:
    //   1. If worktrees are configured, the active slice should fall inside some worktree's
    //      indexRange. A worktree's range may span multiple hundred-blocks (e.g. [100, 799]),
    //      so the legacy hundred-block check below is wrong in that case.
    //   2. If no worktrees are configured, fall back to comparing the slice's hundred-block
    //      against the architecture's hundred-block (legacy behaviour).
    if (slice.index !== null) {
      const sliceIdx = slice.index;
      const worktrees = project.worktrees ?? [];
      if (worktrees.length > 0) {
        const owningWorktree = worktrees.find(
          (wt) => sliceIdx >= wt.indexRange[0] && sliceIdx <= wt.indexRange[1],
        );
        if (!owningWorktree) {
          const ranges = worktrees
            .map((wt) => `${wt.name} [${wt.indexRange[0]}–${wt.indexRange[1]}]`)
            .join(', ');
          warnings.push(
            `Slice ${sliceIdx} is outside all configured worktree ranges (${ranges}).`,
          );
        }
      } else {
        const archIndex = extractSliceIndex(project.fileArch);
        if (archIndex !== null && hundredBlock(sliceIdx) !== hundredBlock(archIndex)) {
          warnings.push(
            `Slice ${sliceIdx} is outside the ${hundredBlock(archIndex)}-band of architecture '${project.fileArch}'.`,
          );
        }
      }
    }

    // Priority 2.5: Arch set but file doesn't exist — recommend creating arch first
    if (project.fileArch && !archFileExists) {
      return {
        recommendation: 'Create architecture document',
        rationale: `Architecture '${project.fileArch}' is set but the file does not exist. Create the architecture document before designing slices.`,
        suggestedCommand: "cf set phase 'Phase 2: Architecture'",
        phase: 'Phase 2: Architecture',
        slice: project.fileSlice,
        summary: `Create architecture '${project.fileArch}' before proceeding with slice ${slice.index ?? slice.name}`,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    // Helper to attach warnings and phase-set suggestion to any returned action
    const currentPhase = project.developmentPhase?.trim() ?? '';
    const enrich = (action: NextAction): NextAction => {
      const result = warnings.length > 0 ? { ...action, warnings } : { ...action };
      // When the recommended phase differs from the current phase, suggest setting it
      // (only if the action doesn't already have a more specific suggestedCommand)
      if (action.phase && !action.suggestedCommand && !currentPhase.startsWith(action.phase.split(':')[0])) {
        result.suggestedCommand = `cf set phase '${action.phase}'`;
      }
      return result;
    };

    // Priority 3: needs-design
    if (slice.status === 'needs-design') {
      return enrich({
        recommendation: 'Create slice design (Phase 4)',
        rationale: `Slice ${slice.index ?? slice.name} has no design document. Create a slice design before proceeding.`,
        slice: project.fileSlice,
        phase: 'Phase 4: Slice Design',
        summary: `Create design for slice ${slice.index ?? slice.name}`,
      });
    }

    // Priority 4: needs-tasks
    if (slice.status === 'needs-tasks') {
      return enrich({
        recommendation: 'Create task breakdown (Phase 5)',
        rationale: `Slice ${slice.index ?? slice.name} has a design but no task file. Break the design into actionable tasks.`,
        slice: project.fileSlice,
        phase: 'Phase 5: Task Breakdown',
        summary: `Create task breakdown for slice ${slice.index ?? slice.name}`,
      });
    }

    // Priority 5: in-implementation
    if (slice.status === 'in-implementation') {
      const remaining = slice.taskProgress
        ? slice.taskProgress.total - slice.taskProgress.completed
        : 0;
      return enrich({
        recommendation: `Continue implementation — ${remaining} task${remaining !== 1 ? 's' : ''} remaining`,
        rationale: `Slice ${slice.index ?? slice.name} is in progress with ${remaining} task${remaining !== 1 ? 's' : ''} left to complete.`,
        slice: project.fileSlice,
        phase: 'Phase 6: Implementation',
        summary: `Continue slice ${slice.index ?? slice.name} — ${remaining} tasks remaining`,
      });
    }

    // Priority 6: complete → check for next slice in plan
    if (slice.status === 'complete' && status.slicePlan) {
      const nextEntry = status.slicePlan.entries.find((e) => !e.isChecked);
      if (nextEntry) {
        return enrich({
          recommendation: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
          rationale: `Current slice is complete. The next unstarted slice in the plan is ${nextEntry.index}: ${nextEntry.name}.`,
          suggestedCommand: `cf set slice ${nextEntry.index}`,
          slice: project.fileSlice,
          summary: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
        });
      }
      return enrich({
        recommendation: 'Slice plan complete. Review architecture for next initiative',
        rationale: 'All slices in the current plan are complete. Review the architecture for the next body of work.',
        slice: project.fileSlice,
        summary: 'Slice plan complete — review architecture for next initiative',
      });
    }

    // Priority 7 (fallback): complete but no plan
    if (slice.status === 'complete') {
      if (project.fileSlicePlan) {
        const inPhase3 = currentPhase.startsWith('Phase 3');
        return enrich({
          recommendation: 'Create the slice plan document',
          rationale: inPhase3
            ? `Current slice is complete. Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Create the slice plan document.`
            : `Current slice is complete. Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Switch to Phase 3 (Slice Planning) first, then run cf build to create the slice plan.`,
          suggestedCommand: inPhase3 ? 'cf build' : undefined,
          phase: 'Phase 3: Slice Planning',
          slice: project.fileSlice,
          summary: inPhase3
            ? 'Slice complete — create the slice plan document'
            : 'Slice complete — switch to Phase 3 then create the slice plan document',
        });
      }
      return enrich({
        recommendation: 'Create or assign a slice plan',
        rationale: 'Current slice is complete but no slice plan is configured to determine next steps.',
        suggestedCommand: 'cf set plan <stem>',
        slice: project.fileSlice,
        summary: 'Slice complete — create or assign a slice plan',
      });
    }

    // Should not reach here, but provide a safe fallback
    return enrich({
      recommendation: 'Review project status',
      rationale: 'Unable to determine next action from current project state.',
      summary: 'Review project status',
    });
  }

/**
   * Returns true if the project has a concept doc file set AND that file exists on disk.
   * fileConcept is stored as a relative path directly (not a bare stem), so we resolve
   * via resolveArtifactPath first; if the field isn't mapped, fall back to treating the
   * value as a direct relative path within the project.
   */
  private conceptDocExists(project: ProjectData): boolean {
    if (!project.fileConcept || !project.projectPath) return false;
    const resolved = resolveArtifactPath('fileConcept', project.fileConcept);
    const relPath = resolved ?? project.fileConcept;
    return existsSync(join(project.projectPath, relPath));
  }

  /**
   * Returns enriched guidance for sparse/fresh project states (FR-1–FR-4).
   * Only called when no active slice is set AND the project lacks established artifacts.
   * Returns null if no first-run condition matches (falls through to standard Priority 2 logic).
   */
  private detectFirstRunContext(
    project: ProjectData,
    archFileExists: boolean,
    status: WorkflowStatus,
  ): NextAction | null {
    // Only applies to projects without both arch and slice plan
    if (archFileExists && status.slicePlan !== null) return null;

    const phase = project.developmentPhase?.trim() ?? '';

    // FR-1: No phase set
    if (!phase) {
      return {
        recommendation: 'Welcome to Context Forge! Start by setting your project phase.',
        rationale:
          "Your project is registered but no development phase is set. Phases guide what to do next — start with Phase 0 (Concept) to define what you're building.",
        suggestedCommand: "cf set phase 'Phase 0: Concept'",
        summary: 'Set a development phase to get started',
      };
    }

    // Phase 0, no concept doc → create concept
    if (
      phase.startsWith('Phase 0') &&
      !archFileExists &&
      status.slicePlan === null &&
      !this.conceptDocExists(project)
    ) {
      return {
        recommendation: 'Your project is in Phase 0 (Concept). Start by describing what you want to build.',
        rationale:
          'Use a concept prompt to guide a conversation with your AI agent about the project idea. This produces a concept document that drives the initiative plan and architecture phases.',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 0 — generate a concept prompt with cf build',
      };
    }

    // Phase 0, concept doc exists → advance to Phase 1 (Initiative Plan)
    if (
      phase.startsWith('Phase 0') &&
      this.conceptDocExists(project)
    ) {
      return {
        recommendation: 'Concept document exists. Advance to Phase 1 (Initiative Plan).',
        rationale:
          'Your concept is complete. The next step is to decompose it into named initiatives — use cf build to generate an initiative plan prompt.',
        suggestedCommand: "cf set phase 'Phase 1: Initiative Plan'",
        summary: 'Advance to Phase 1 — create an initiative plan from your concept',
      };
    }

    // Phase 1, no initiative plan → create initiative plan
    if (
      phase.startsWith('Phase 1') &&
      !archFileExists &&
      status.slicePlan === null
    ) {
      return {
        recommendation: 'Your project is in Phase 1 (Initiative Plan). Create an initiative plan from your concept.',
        rationale:
          'The initiative plan decomposes your concept into named initiatives with index assignments and dependencies. This drives all subsequent architecture work.',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 1 — generate an initiative plan prompt with cf build',
      };
    }

    // Phase 2, no arch and no plan
    if (phase.startsWith('Phase 2') && !archFileExists && status.slicePlan === null) {
      return {
        recommendation: 'Your project is in Phase 2 (Architecture). Create an architecture document.',
        rationale:
          'Use an architecture prompt to define the high-level structure. For small projects, you can skip architecture and go straight to a slice plan.',
        suggestedCommand: 'cf build --phase architecture',
        summary: 'Start Phase 2 — generate an architecture prompt with cf build --phase architecture',
      };
    }

    // FR-3b: Phase 2, arch exists but no slice plan → advance to Phase 3
    if (phase.startsWith('Phase 2') && archFileExists && status.slicePlan === null) {
      return {
        recommendation: 'Architecture document exists. Advance to Phase 3 and create a slice plan.',
        rationale:
          'Your architecture document is complete. Set your phase to Phase 3 (Slice Planning) and create a slice plan to break the architecture into deliverable increments.',
        suggestedCommand: "cf set phase 'Phase 3: Slice Planning'",
        summary: 'Advance to Phase 3 — set phase and create a slice plan',
      };
    }

    // FR-4: Phase 3, no slice plan
    if (phase.startsWith('Phase 3') && status.slicePlan === null) {
      if (project.fileSlicePlan) {
        return {
          recommendation: 'Your project is in Phase 3 (Slice Planning). Create the slice plan document.',
          rationale:
            `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Use a slice-planning prompt to create it.`,
          suggestedCommand: 'cf build',
          summary: 'Start Phase 3 — create the slice plan document with cf build',
        };
      }
      return {
        recommendation: 'Your project is in Phase 3 (Slice Planning). Create a slice plan from your architecture.',
        rationale:
          'A slice plan breaks the architecture into deliverable increments. Use a slice-planning prompt to guide the conversation. After creating the file, register it: cf set plan <stem>',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 3 — generate a slice-planning prompt with cf build',
      };
    }

    return null;
  }

  /**
   * Derive the status of the currently active slice.
   */
  private async deriveSliceStatus(
    project: ProjectData,
    projectPath: string,
  ): Promise<SliceStatus> {
    if (!project.fileSlice) {
      return { name: '', index: null, status: 'no-active-slice' };
    }

    const index = extractSliceIndex(project.fileSlice);
    const name = extractSliceName(project.fileSlice);
    const base: SliceStatus = { name, index, status: 'no-active-slice' };

    if (index === null) {
      return base;
    }

    try {
      const docs = await detectDocuments(projectPath, index);

      // No slice design file → needs-design
      if (!docs.sliceDesign) {
        return { ...base, status: 'needs-design' };
      }

      // Design exists but no task file → needs-tasks
      if (!docs.taskFile) {
        return { ...base, status: 'needs-tasks' };
      }

      // Task file exists — parse to determine progress
      const taskPaths = docs.taskFile.map((p) => join(projectPath, p));
      const taskResult = await this.parseTaskFileSafe(taskPaths);

      if (!taskResult || taskResult.totalTasks === 0) {
        return { ...base, status: 'needs-tasks' };
      }

      const taskProgress = {
        completed: taskResult.completedTasks,
        total: taskResult.totalTasks,
        inferredStatus: taskResult.inferredStatus,
      };

      if (taskResult.inferredStatus === 'complete') {
        return { ...base, status: 'complete', taskProgress };
      }

      return { ...base, status: 'in-implementation', taskProgress };
    } catch {
      return base;
    }
  }

  private async parseTaskFileSafe(taskPaths: string[]): Promise<TaskFileResult | null> {
    try {
      return await parseTaskFile(taskPaths);
    } catch {
      return null;
    }
  }

  private async parseSlicePlanSafe(
    project: ProjectData,
    projectPath: string,
  ): Promise<WorkflowStatus['slicePlan']> {
    if (!project.fileSlicePlan) return null;

    try {
      const relativePath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
      if (!relativePath) return null;
      const planPath = join(projectPath, relativePath);
      const result: SlicePlanResult = await parseSlicePlan(planPath);

      if (result.totalSlices === 0) return null;

      // Extract filename from the path for display
      const planName = project.fileSlicePlan.split('/').pop() ?? project.fileSlicePlan;

      return {
        name: planName,
        completed: result.completedSlices,
        total: result.totalSlices,
        entries: result.entries,
      };
    } catch {
      return null;
    }
  }

  private buildSummary(status: WorkflowStatus): string {
    const parts: string[] = [status.project];

    if (status.phase) {
      parts.push(`— ${status.phase}`);
    }

    if (status.activeSlice) {
      const s = status.activeSlice;
      if (s.status === 'no-active-slice') {
        parts.push('— no active slice');
      } else {
        const sliceLabel = s.index !== null ? `slice ${s.index}` : s.name;
        parts.push(`— ${sliceLabel} ${s.status}`);
        if (s.taskProgress) {
          parts.push(`(${s.taskProgress.completed}/${s.taskProgress.total} tasks)`);
        }
      }
    }

    if (status.slicePlan) {
      parts.push(`[plan: ${status.slicePlan.completed}/${status.slicePlan.total}]`);
    }

    return parts.join(' ');
  }
}
