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

// --- ProjectModel types (for buildModel output, matching parse.py) ---

/** Base document shape produced by _d() in parse.py */
export interface DocSummary {
  index: string;
  name: string;
  status: string;
  dateCreated?: string;
  dateUpdated?: string;
}

/** Foundation band entry (index 000-009) */
export interface FoundationEntry extends DocSummary {
  type: string;
}

/** Project architecture band entry (index 050-099) */
export interface ArchEntry extends DocSummary {
  type: 'arch' | 'hld';
}

/** Task block within a slice */
export interface TaskModelEntry {
  index: string;
  name: string;
  status: string;
  taskCount: number;
  completedTasks: number;
  dateCreated?: string;
  dateUpdated?: string;
  items?: TaskItem[];
}

/** Slice within an initiative */
export interface SliceModelEntry extends DocSummary {
  tasks?: TaskModelEntry;
  features?: DocSummary[];
  planned?: true;
}

/** Slice plan block with future work items */
export interface SlicePlanBlock extends DocSummary {
  futureWork: FutureWorkItem[];
}

/** An initiative (base index in 100-799 with arch/slices doc) */
export interface Initiative {
  name: string;
  slices: SliceModelEntry[];
  features: DocSummary[];
  arch?: DocSummary;
  slicePlan?: SlicePlanBlock;
}

/** Standalone feature not claimed by any slice */
export interface FutureSliceEntry extends DocSummary {
  parent?: string;
}

/** Maintenance task entry (900+) */
export interface MaintenanceEntry extends DocSummary {
  taskCount?: number;
  completedTasks?: number;
}

/** Full project model — top-level output of buildModel() */
export interface ProjectModel {
  name: string;
  description: string;
  foundation: FoundationEntry[];
  projectArchitecture: ArchEntry[];
  initiatives: Record<string, Initiative>;
  futureSlices: FutureSliceEntry[];
  quality: DocSummary[];
  investigation: DocSummary[];
  maintenance: MaintenanceEntry[];
  devlog: boolean;
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
