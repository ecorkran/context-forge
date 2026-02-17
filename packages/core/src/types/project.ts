/**
 * Core data structure for project information
 */
export interface ProjectData {
  id: string;
  name: string;
  template: string;
  slice: string;
  taskFile: string;
  instruction: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  projectDate?: string;
  isMonorepo: boolean;
  isMonorepoEnabled?: boolean;
  /** Absolute path to project root (contains project-documents/) */
  projectPath?: string;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    monorepoNote?: string;
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
  'id' | 'createdAt' | 'updatedAt' | 'instruction' | 'developmentPhase' | 'workType' | 'taskFile' | 'projectDate' | 'customData'
> & {
  instruction?: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  taskFile?: string;
  projectDate?: string;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    monorepoNote?: string;
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
    | 'slice'
    | 'taskFile'
    | 'instruction'
    | 'developmentPhase'
    | 'workType'
    | 'projectDate'
    | 'isMonorepo'
    | 'isMonorepoEnabled'
    | 'projectPath'
    | 'customData'
  >
>;
