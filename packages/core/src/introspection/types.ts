/** Normalized status values used across introspection results */
export type NormalizedStatus = 'complete' | 'in-progress' | 'not-started' | 'deprecated';

/** Result of parsing a single slice plan entry */
export interface SlicePlanEntry {
  index: number;
  name: string;
  status: NormalizedStatus;
  isChecked: boolean;
}

/** Result of parsing a slice plan document */
export interface SlicePlanResult {
  filePath: string;
  entries: SlicePlanEntry[];
  totalSlices: number;
  completedSlices: number;
}

/** A single task checkbox item */
export interface TaskItem {
  name: string;
  done: boolean;
}

/** Result of parsing a task file (or merged split files) */
export interface TaskFileResult {
  filePath: string;
  items: TaskItem[];
  totalTasks: number;
  completedTasks: number;
  /** Inferred status based on checkbox state */
  inferredStatus: 'complete' | 'in-progress' | 'not-started';
}

/** Extracted YAML frontmatter fields */
export interface FrontmatterData {
  [key: string]: string;
}

/** Result of frontmatter extraction */
export interface FrontmatterResult {
  filePath: string;
  found: boolean;
  data: FrontmatterData;
}

/** A single future work item */
export interface FutureWorkItem {
  index: string;
  name: string;
  done: boolean;
}

/** Result of future work section parsing */
export interface FutureWorkResult {
  filePath: string;
  items: FutureWorkItem[];
}

/** Result of checking what documents exist for a given slice index */
export interface DocumentDetectionResult {
  sliceDesign: string | null;
  taskFile: string[] | null;
  architecture: string | null;
  slicePlan: string | null;
}

/** Introspection summary suitable for enriching project_get */
export interface IntrospectionSummary {
  slicePlan?: {
    totalSlices: number;
    completedSlices: number;
    summary: string;
  };
  currentTasks?: {
    totalTasks: number;
    completedTasks: number;
    inferredStatus: NormalizedStatus;
    summary: string;
  };
  artifacts: {
    hasSlicePlan: boolean;
    hasHLD: boolean;
    hasArch: boolean;
    hasSpec: boolean;
    hasCurrentSliceDesign: boolean;
    hasCurrentTaskFile: boolean;
  };
}
