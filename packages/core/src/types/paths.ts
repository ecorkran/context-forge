/** Result of validating a project path against expected directory structure. */
export interface PathValidationResult {
  valid: boolean;
  projectPath: string;
  errors: string[];
  structure: {
    hasProjectDocuments: boolean;
    hasUserDir: boolean;
    /** Which of slices/tasks/features/architecture exist under project-documents/user/ */
    subdirectories: string[];
  };
}

/** Result of listing files in a project subdirectory. */
export interface DirectoryListResult {
  files: string[];
  error?: string;
}
