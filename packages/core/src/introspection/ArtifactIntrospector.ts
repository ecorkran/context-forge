import { join } from 'node:path';
import type { ProjectData } from '../types/project.js';
import type { IArtifactIntrospector } from './interfaces.js';
import type {
  SlicePlanResult,
  TaskFileResult,
  FrontmatterResult,
  FutureWorkResult,
  DocumentDetectionResult,
  IntrospectionSummary,
} from './types.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { parseTaskFile } from './parsers/taskFileParser.js';
import { parseFrontmatter } from './parsers/frontmatterParser.js';
import { parseFutureWork } from './parsers/futureWorkParser.js';
import { detectDocuments, checkFileExists } from './parsers/documentDetector.js';

/**
 * Orchestrator that delegates to individual parser functions.
 * Each method resolves file paths from projectPath as needed.
 */
export class ArtifactIntrospector implements IArtifactIntrospector {
  async parseSlicePlan(slicePlanPath: string): Promise<SlicePlanResult> {
    return parseSlicePlan(slicePlanPath);
  }

  async parseTaskFile(taskFilePaths: string | string[]): Promise<TaskFileResult> {
    return parseTaskFile(taskFilePaths);
  }

  async parseFrontmatter(filePath: string): Promise<FrontmatterResult> {
    return parseFrontmatter(filePath);
  }

  async parseFutureWork(slicePlanPath: string, nextIndex?: number): Promise<FutureWorkResult> {
    return parseFutureWork(slicePlanPath, nextIndex);
  }

  async detectDocuments(projectPath: string, sliceIndex: number): Promise<DocumentDetectionResult> {
    return detectDocuments(projectPath, sliceIndex);
  }

  /**
   * Generate an introspection summary for a project.
   * Each operation is individually try/caught — failure in one doesn't prevent others.
   */
  async summarize(project: ProjectData): Promise<IntrospectionSummary> {
    const summary: IntrospectionSummary = {
      artifacts: {
        hasSlicePlan: false,
        hasHLD: false,
        hasArch: false,
        hasSpec: false,
        hasCurrentSliceDesign: false,
        hasCurrentTaskFile: false,
      },
    };

    const projectPath = project.projectPath;
    if (!projectPath) return summary;

    // Parse slice plan if available
    try {
      if (project.fileSlicePlan) {
        const planPath = join(projectPath, project.fileSlicePlan);
        const planResult = await parseSlicePlan(planPath);
        if (planResult.totalSlices > 0) {
          summary.slicePlan = {
            totalSlices: planResult.totalSlices,
            completedSlices: planResult.completedSlices,
            summary: `${planResult.completedSlices} of ${planResult.totalSlices} slices complete`,
          };
        }
      }
    } catch {
      // Slice plan parsing failed — continue with other operations
    }

    // Parse task file if available
    try {
      if (project.fileTasks) {
        // Detect actual task file(s) using the slice index
        const sliceIndex = extractSliceIndex(project.fileSlice);
        let taskPaths: string[] = [];

        if (sliceIndex !== null) {
          const docs = await detectDocuments(projectPath, sliceIndex);
          if (docs.taskFile) {
            taskPaths = docs.taskFile.map((p) => join(projectPath, p));
          }
        }

        // Fall back to direct path if detection found nothing
        if (taskPaths.length === 0) {
          taskPaths = [join(projectPath, 'project-documents/user/tasks', project.fileTasks)];
        }

        const taskResult = await parseTaskFile(taskPaths);
        if (taskResult.totalTasks > 0) {
          summary.currentTasks = {
            totalTasks: taskResult.totalTasks,
            completedTasks: taskResult.completedTasks,
            inferredStatus: taskResult.inferredStatus,
            summary: `${taskResult.completedTasks} of ${taskResult.totalTasks} tasks done`,
          };
        }
      }
    } catch {
      // Task parsing failed — continue with other operations
    }

    // Check artifact existence
    try {
      if (project.fileSlicePlan) {
        summary.artifacts.hasSlicePlan = await checkFileExists(projectPath, project.fileSlicePlan);
      }
    } catch { /* continue */ }

    try {
      if (project.fileHLD) {
        summary.artifacts.hasHLD = await checkFileExists(projectPath, project.fileHLD);
      }
    } catch { /* continue */ }

    try {
      if (project.fileArch) {
        summary.artifacts.hasArch = await checkFileExists(projectPath, project.fileArch);
      }
    } catch { /* continue */ }

    try {
      if (project.fileSpec) {
        summary.artifacts.hasSpec = await checkFileExists(projectPath, project.fileSpec);
      }
    } catch { /* continue */ }

    // Check current slice design and task file existence
    try {
      const sliceIndex = extractSliceIndex(project.fileSlice);
      if (sliceIndex !== null) {
        const docs = await detectDocuments(projectPath, sliceIndex);
        summary.artifacts.hasCurrentSliceDesign = docs.sliceDesign !== null;
        summary.artifacts.hasCurrentTaskFile = docs.taskFile !== null;
      }
    } catch { /* continue */ }

    return summary;
  }
}

/**
 * Extract the numeric slice index from a fileSlice value like "163-slice.artifact-introspection.md".
 * Returns null if no leading number found.
 */
function extractSliceIndex(fileSlice: string | undefined): number | null {
  if (!fileSlice) return null;
  const match = /^(\d+)-/.exec(fileSlice);
  return match ? parseInt(match[1], 10) : null;
}
