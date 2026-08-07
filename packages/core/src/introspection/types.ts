/** Normalized status values used across introspection results */
export const STATUS = {
  Complete: 'complete',
  InProgress: 'in_progress',
  NotStarted: 'not_started',
  Deprecated: 'deprecated',
  Deferred: 'deferred',
} as const;

export type NormalizedStatus = (typeof STATUS)[keyof typeof STATUS];

/**
 * A derived status, or the TD-2a degraded case for a signal that exists but
 * failed to resolve (e.g. an unrecognized frontmatter status value). Used
 * wherever a per-entry resolution failure must not abort the whole caller —
 * the entry is rendered/reported as degraded instead of throwing.
 */
export type DisplayStatus = NormalizedStatus | 'degraded';

/** Result of parsing a single slice plan entry */
export interface SlicePlanEntry {
  index: number;
  name: string;
  status: NormalizedStatus;
  isChecked: boolean;
  /** Zero-based line number in the source file (for checkbox fix operations) */
  lineIndex: number;
  /** Overview/description text from after the bold name (e.g., " — Summary text...") */
  description?: string;
  /**
   * Whether `index` came from a bolded `(NNN)` in the source ('explicit') or was
   * synthesized as a per-file sequential counter for unindexed entries ('fallback').
   * Fallback indices are not stable across files and must not enter cross-plan
   * aggregation (see ConsistencyChecker.checkAll()).
   */
  indexSource: 'explicit' | 'fallback';
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
  inferredStatus: NormalizedStatus;
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
  /** Description text after the title (e.g., text after " — " or ": ") */
  description?: string;
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
  review: string | null;
}

// --- ProjectModel types (for buildModel output, matching parse.py) ---

/** Base document shape produced by _d() in parse.py */
export interface DocSummary {
  index: string;
  name: string;
  status: string;
  dateCreated?: string;
  dateUpdated?: string;
  /** Overview or description text extracted from the document body */
  description?: string;
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
  filepath?: string;
  entries?: SlicePlanEntry[];
  futureWork: FutureWorkItem[];
}

/**
 * An initiative. Normally a base index in 100-799 backed by an arch or slices
 * doc. Initiatives that exist only in the initiative plan (named there but with
 * no arch/slices file written yet) are also surfaced, carrying `status` and
 * `description` from the plan entry and marked `planned`.
 */
export interface Initiative {
  name: string;
  slices: SliceModelEntry[];
  features: DocSummary[];
  arch?: DocSummary;
  slicePlan?: SlicePlanBlock;
  /** Status from the initiative-plan entry. Set when no arch/slicePlan provides one. */
  status?: string;
  /** Overview/description text from the initiative-plan entry. */
  description?: string;
  /** True when the initiative exists only in the plan (no arch/slices doc yet). */
  planned?: true;
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
  maintenanceInitiatives: Record<string, Initiative>;
  futureSlices: FutureSliceEntry[];
  quality: DocSummary[];
  investigation: DocSummary[];
  maintenance: MaintenanceEntry[];
  devlog: boolean;
}

// --- FutureWorkCollector types ---

/** A single future work item with source attribution */
export interface CollectedFutureWorkItem {
  index: string;
  name: string;
  done: boolean;
  sourceFile: string;
  sourceInitiativeIndex: string;
  sourceInitiativeName: string;
}

/** Future work grouped by source initiative */
export interface FutureWorkGroup {
  initiativeIndex: string;
  initiativeName: string;
  sourceFile: string;
  items: CollectedFutureWorkItem[];
  totalItems: number;
  pendingItems: number;
  completedItems: number;
}

/** Top-level result from FutureWorkCollector.collect() / workflow_future */
export interface FutureWorkCollectorResult {
  projectPath: string;
  groups: FutureWorkGroup[];
  totalItems: number;
  pendingItems: number;
  completedItems: number;
  markdown: string;
}

// --- ConsistencyChecker types ---

/** Severity level for consistency findings */
export type ConsistencySeverity = 'info' | 'warning' | 'error';

/** A single consistency finding from a detection rule */
export interface ConsistencyFinding {
  rule: string;
  severity: ConsistencySeverity;
  location: string;
  description: string;
  suggestedFix: string;
  fixable: boolean;
  fixAction?: {
    type: 'update-checkbox' | 'update-frontmatter';
    filePath: string;
    detail: Record<string, unknown>;
  };
}

/** Result of running all consistency checks on a project */
export interface ConsistencyCheckResult {
  projectPath: string;
  findings: ConsistencyFinding[];
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  summary: string;
}

/** Log entry for a single applied fix */
export interface FixLogEntry {
  rule: string;
  action: 'update-checkbox' | 'update-frontmatter';
  filePath: string;
  field?: string;
  before: string;
  after: string;
}

/** Result of running consistency checks with fix mode enabled */
export interface ConsistencyFixResult extends ConsistencyCheckResult {
  fixed: number;
  fixLog: FixLogEntry[];
  fixErrors: string[];
}

// --- WorkflowNavigator types ---

/** Status of the currently active slice */
export interface SliceStatus {
  name: string;
  index: number | null;
  status:
    | 'needs-design'
    | 'needs-tasks'
    | 'in-implementation'
    | 'complete'
    | 'no-active-slice'
    | 'pending-review'
    | 'review-failed';
  taskProgress?: {
    completed: number;
    total: number;
    inferredStatus: NormalizedStatus;
  };
  /** Set when status is 'pending-review' or 'review-failed'; carries the gate's rationale for getNext() to route without recomputing the gate. */
  gateInfo?: {
    reviewType: string;
    rationale: string;
  };
}

/** A slice-plan entry with its status resolved through the derivation lattice (TD-3). */
export interface ResolvedSlicePlanEntry extends Omit<SlicePlanEntry, 'status'> {
  status: DisplayStatus;
}

/** Full workflow status for a project */
export interface WorkflowStatus {
  project: string;
  phase: string | null;
  activeSlice: SliceStatus | null;
  slicePlan: {
    name: string;
    completed: number;
    total: number;
    entries: ResolvedSlicePlanEntry[];
  } | null;
  summary: string;
  /** Non-blocking warnings about entries that failed to resolve (TD-2a) — see DisplayStatus. */
  warnings?: string[];
}

/** Recommended next action from the workflow navigator */
export interface NextAction {
  recommendation: string;
  rationale: string;
  suggestedCommand?: string;
  slice?: string;
  phase?: string;
  summary: string;
  /** Non-blocking warnings about project configuration (e.g., index band mismatches) */
  warnings?: string[];
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
