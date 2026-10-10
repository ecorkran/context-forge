import { detectDocuments } from '../introspection/parsers/documentDetector.js';
import { extractSliceIndex } from '../introspection/WorkflowNavigator.js';
import type { TaskFilesResolver } from './ContextIntegrator.js';

// detectDocuments returns paths from the checkout root; prompts address task
// files relative to project-documents/ (e.g. `user/tasks/...`).
const DOCS_ROOT_PREFIX = 'project-documents/';
const TASK_FILE_SEPARATOR = ', ';

/**
 * Finds the slice's task file(s) on disk, using the same detection as
 * `cf next` / `cf check`, so a split tasks file (`-1`, `-2`, ...) yields every
 * part in order. Returns undefined when the slice has no index or no task file.
 */
export const resolveTaskFilesForPrompt: TaskFilesResolver = async (checkoutPath, fileSlice) => {
  const sliceIndex = extractSliceIndex(fileSlice);
  if (sliceIndex === null) return undefined;

  const { taskFile } = await detectDocuments(checkoutPath, sliceIndex);
  if (!taskFile) return undefined;

  // Numeric-aware sort so part -10 follows -9 rather than -1
  const ordered = [...taskFile].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ordered
    .map((p) => (p.startsWith(DOCS_ROOT_PREFIX) ? p.slice(DOCS_ROOT_PREFIX.length) : p))
    .join(TASK_FILE_SEPARATOR);
};
