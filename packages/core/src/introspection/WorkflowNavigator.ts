import { join } from 'node:path';
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
      // No architecture → recommend creating architecture first
      if (!project.fileArch && !status.slicePlan) {
        return {
          recommendation: 'Create architecture document',
          rationale: 'No architecture document or slice plan is configured. Architecture defines the high-level structure before slicing into deliverable increments.',
          suggestedCommand: 'cf set arch <index>',
          summary: 'Create an architecture document to define project structure',
        };
      }
      // Architecture exists but no slice plan
      if (!status.slicePlan) {
        return {
          recommendation: 'Create or assign a slice plan',
          rationale: 'Architecture is set but no slice plan is configured. A slice plan breaks the architecture into deliverable increments.',
          suggestedCommand: 'cf set slicePlan <path>',
          summary: 'Create a slice plan from the architecture',
        };
      }
      return {
        recommendation: 'Set active slice',
        rationale: 'No active slice is set. Choose a slice from the plan to work on.',
        suggestedCommand: 'cf set slice <index>',
        summary: 'Set an active slice to begin work',
      };
    }

    // Priority 3: needs-design
    if (slice.status === 'needs-design') {
      return {
        recommendation: 'Create slice design (Phase 4)',
        rationale: `Slice ${slice.index ?? slice.name} has no design document. Create a slice design before proceeding.`,
        slice: project.fileSlice,
        phase: 'Phase 4: Slice Design',
        summary: `Create design for slice ${slice.index ?? slice.name}`,
      };
    }

    // Priority 4: needs-tasks
    if (slice.status === 'needs-tasks') {
      return {
        recommendation: 'Create task breakdown (Phase 5)',
        rationale: `Slice ${slice.index ?? slice.name} has a design but no task file. Break the design into actionable tasks.`,
        slice: project.fileSlice,
        phase: 'Phase 5: Task Breakdown',
        summary: `Create task breakdown for slice ${slice.index ?? slice.name}`,
      };
    }

    // Priority 5: in-implementation
    if (slice.status === 'in-implementation') {
      const remaining = slice.taskProgress
        ? slice.taskProgress.total - slice.taskProgress.completed
        : 0;
      return {
        recommendation: `Continue implementation — ${remaining} task${remaining !== 1 ? 's' : ''} remaining`,
        rationale: `Slice ${slice.index ?? slice.name} is in progress with ${remaining} task${remaining !== 1 ? 's' : ''} left to complete.`,
        slice: project.fileSlice,
        phase: 'Phase 6: Implementation',
        summary: `Continue slice ${slice.index ?? slice.name} — ${remaining} tasks remaining`,
      };
    }

    // Priority 6: complete → check for next slice in plan
    if (slice.status === 'complete' && status.slicePlan) {
      const nextEntry = status.slicePlan.entries.find((e) => !e.isChecked);
      if (nextEntry) {
        return {
          recommendation: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
          rationale: `Current slice is complete. The next unstarted slice in the plan is ${nextEntry.index}: ${nextEntry.name}.`,
          suggestedCommand: `cf set slice ${nextEntry.index}`,
          slice: project.fileSlice,
          summary: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
        };
      }
      return {
        recommendation: 'Slice plan complete. Review architecture for next initiative',
        rationale: 'All slices in the current plan are complete. Review the architecture for the next body of work.',
        slice: project.fileSlice,
        summary: 'Slice plan complete — review architecture for next initiative',
      };
    }

    // Priority 7 (fallback): complete but no plan
    if (slice.status === 'complete') {
      return {
        recommendation: 'Create or assign a slice plan',
        rationale: 'Current slice is complete but no slice plan is configured to determine next steps.',
        suggestedCommand: 'cf set slicePlan <path>',
        slice: project.fileSlice,
        summary: 'Slice complete — create or assign a slice plan',
      };
    }

    // Should not reach here, but provide a safe fallback
    return {
      recommendation: 'Review project status',
      rationale: 'Unable to determine next action from current project state.',
      summary: 'Review project status',
    };
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
