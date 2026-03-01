import type { ProjectData } from '../types/project.js';
import type {
  SlicePlanResult,
  TaskFileResult,
  FrontmatterResult,
  FutureWorkResult,
  DocumentDetectionResult,
  IntrospectionSummary,
} from './types.js';

/** Public interface for artifact introspection — consumed by slices 164–166 and project_get enrichment */
export interface IArtifactIntrospector {
  /** Parse a slice plan and return entries with completion state */
  parseSlicePlan(slicePlanPath: string): Promise<SlicePlanResult>;

  /** Parse a task file (or merged split files) and return checkbox items */
  parseTaskFile(taskFilePaths: string | string[]): Promise<TaskFileResult>;

  /** Extract YAML frontmatter from a markdown file */
  parseFrontmatter(filePath: string): Promise<FrontmatterResult>;

  /** Parse the Future Work section from a slice plan */
  parseFutureWork(slicePlanPath: string, nextIndex?: number): Promise<FutureWorkResult>;

  /** Check what methodology documents exist for a given slice index */
  detectDocuments(projectPath: string, sliceIndex: number): Promise<DocumentDetectionResult>;

  /** Generate an introspection summary for a project (for enriching project_get) */
  summarize(project: ProjectData): Promise<IntrospectionSummary>;
}
