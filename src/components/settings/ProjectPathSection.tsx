import React, { useState, useEffect, useCallback } from 'react';
import type { PathValidationResult } from '../../main/services/project/types';

interface ProjectPathSectionProps {
  projectPath?: string;
  onPathChange: (path: string | undefined) => void;
}

/**
 * Settings section for browsing, validating, and displaying the project path.
 */
export const ProjectPathSection: React.FC<ProjectPathSectionProps> = ({
  projectPath,
  onPathChange,
}) => {
  const [validationResult, setValidationResult] = useState<PathValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  // Track the displayed path independently so we can show attempted (invalid) paths
  const [displayPath, setDisplayPath] = useState<string>(projectPath ?? '');

  const runValidation = useCallback(async (pathToValidate: string) => {
    setIsValidating(true);
    try {
      const result = await window.electronAPI.projectPath.validate(pathToValidate);
      setValidationResult(result);
      return result;
    } catch {
      const failResult: PathValidationResult = {
        valid: false,
        projectPath: pathToValidate,
        errors: ['Validation failed unexpectedly'],
        structure: { hasProjectDocuments: false, hasUserDir: false, subdirectories: [] },
      };
      setValidationResult(failResult);
      return failResult;
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Sync display path when prop changes (e.g. project switch)
  useEffect(() => {
    setDisplayPath(projectPath ?? '');
  }, [projectPath]);

  // Validate on mount if path is already set
  useEffect(() => {
    if (projectPath) {
      runValidation(projectPath);
    } else {
      setValidationResult(null);
    }
  }, [projectPath, runValidation]);

  const handleBrowse = async () => {
    const picked = await window.electronAPI.projectPath.pickFolder();
    if (!picked) return;

    // Show the selected path immediately so user sees what they picked
    setDisplayPath(picked.path);

    const result = await runValidation(picked.path);
    if (result?.valid) {
      onPathChange(picked.path);
    }
    // If invalid, displayPath still shows the attempted path and
    // validationResult shows the error — user can see what went wrong
  };

  const handleClear = () => {
    onPathChange(undefined);
    setDisplayPath('');
    setValidationResult(null);
  };

  return (
    <div>
      <h3 className="text-sm font-medium text-neutral-12 mb-3">Project Path</h3>

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={displayPath}
          placeholder="No path selected"
          className="flex-1 px-3 py-1.5 text-sm bg-neutral-2 border border-neutral-6 rounded-md text-neutral-11 placeholder:text-neutral-8 cursor-default"
        />
        <button
          onClick={handleBrowse}
          disabled={isValidating}
          className="px-3 py-1.5 text-sm font-medium text-neutral-11 hover:text-neutral-12 hover:bg-neutral-3 border border-neutral-6 rounded-md transition-colors disabled:opacity-50"
        >
          Browse...
        </button>
        {(projectPath || displayPath) && (
          <button
            onClick={handleClear}
            className="px-2 py-1.5 text-sm text-neutral-9 hover:text-neutral-12 hover:bg-neutral-3 rounded-md transition-colors"
            title="Clear project path"
          >
            &times;
          </button>
        )}
      </div>

      <div className="mt-2 text-sm">
        <ValidationFeedback
          validationResult={validationResult}
          isValidating={isValidating}
          hasPath={!!displayPath}
        />
      </div>
    </div>
  );
};

/** Inline validation status display. */
function ValidationFeedback({
  validationResult,
  isValidating,
  hasPath,
}: {
  validationResult: PathValidationResult | null;
  isValidating: boolean;
  hasPath: boolean;
}) {
  if (isValidating) {
    return <span className="text-neutral-9">Validating...</span>;
  }

  if (!hasPath) {
    return (
      <span className="text-neutral-9">
        No project path set &mdash; some features require a path
      </span>
    );
  }

  if (!validationResult) {
    return null;
  }

  if (validationResult.valid) {
    const count = validationResult.structure.subdirectories.length;
    const dirs = validationResult.structure.subdirectories.join(', ');
    return (
      <span className="text-green-600 dark:text-green-400">
        Path valid &mdash; {count} {count === 1 ? 'subdirectory' : 'subdirectories'} found
        {dirs ? ` (${dirs})` : ''}
      </span>
    );
  }

  const errorMsg = validationResult.errors[0] ?? 'Unknown validation error';
  return <span className="text-red-600 dark:text-red-400">{errorMsg}</span>;
}
