import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
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
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';

/**
 * Locate the initiative plan file for a project.
 * Convention: project-documents/user/project-guides/001-initiative-plan.*.md
 * Returns the full path, or null if not found.
 */
export async function resolveInitiativePlanPath(projectPath: string): Promise<string | null> {
  const guidesDir = join(projectPath, 'project-documents/user/project-guides');
  try {
    const files = await readdir(guidesDir);
    const match = files.find((f) => /^001-initiative-plan\..*\.md$/i.test(f));
    return match ? join(guidesDir, match) : null;
  } catch {
    return null;
  }
}

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
        const planRelPath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
        const planPath = planRelPath ? join(projectPath, planRelPath) : null;
        const planResult = planPath ? await parseSlicePlan(planPath) : null;
        if (planResult && planResult.totalSlices > 0) {
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

    // Check artifact existence (resolve stems to full relative paths)
    const checkArtifact = async (field: string, stem: string | undefined): Promise<boolean> => {
      if (!stem) return false;
      const relPath = resolveArtifactPath(field, stem);
      if (!relPath) return false;
      return checkFileExists(projectPath, relPath);
    };

    try { summary.artifacts.hasSlicePlan = await checkArtifact('fileSlicePlan', project.fileSlicePlan); } catch { /* continue */ }
    try { summary.artifacts.hasHLD = await checkArtifact('fileHLD', project.fileHLD); } catch { /* continue */ }
    try { summary.artifacts.hasArch = await checkArtifact('fileArch', project.fileArch); } catch { /* continue */ }
    try { summary.artifacts.hasSpec = await checkArtifact('fileSpec', project.fileSpec); } catch { /* continue */ }

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
