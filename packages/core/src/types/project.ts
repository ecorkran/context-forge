/**
 * Core data structure for project information
 */
export interface ProjectData {
  id: string;
  name: string;
  template: string;
  fileSlice: string;
  fileTasks: string;
  instruction: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  dateProject?: string;
  /** Absolute path to project root (contains project-documents/) */
  projectPath?: string;
  /** Path to HLD document (relative to project root) */
  fileHLD?: string;
  /** Path to architecture document (relative to project root) */
  fileArch?: string;
  /** Path to current slice plan (relative to project root) */
  fileSlicePlan?: string;
  /** Path to project specification (relative to project root) */
  fileSpec?: string;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    availableTools?: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Type for creating a new project (without auto-generated fields).
 * instruction, workType and customData are optional during creation and will get defaults.
 */
export type CreateProjectData = Omit<
  ProjectData,
  'id' | 'createdAt' | 'updatedAt' | 'instruction' | 'developmentPhase' | 'workType' | 'fileTasks' | 'dateProject' | 'customData'
> & {
  instruction?: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  fileTasks?: string;
  dateProject?: string;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    availableTools?: string;
  };
};

/**
 * Type for updating an existing project (partial updates allowed)
 */
export type UpdateProjectData = Partial<
  Pick<
    ProjectData,
    | 'name'
    | 'template'
    | 'fileSlice'
    | 'fileTasks'
    | 'instruction'
    | 'developmentPhase'
    | 'workType'
    | 'dateProject'
    | 'projectPath'
    | 'fileHLD'
    | 'fileArch'
    | 'fileSlicePlan'
    | 'fileSpec'
    | 'customData'
  >
>;
