import { join } from 'node:path';
import type { ProjectData } from '../types/project.js';
import type {
  SliceStatus,
  WorkflowStatus,
  SlicePlanResult,
  TaskFileResult,
} from './types.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { parseTaskFile } from './parsers/taskFileParser.js';
import { detectDocuments } from './parsers/documentDetector.js';

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
      const planPath = join(projectPath, project.fileSlicePlan);
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
