import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { DocumentDetectionResult } from '../types.js';

const USER_DOCS = 'project-documents/user';

/**
 * Check if a file exists at the given path.
 */
export async function checkFileExists(projectPath: string, relativePath: string): Promise<boolean> {
  try {
    await access(join(projectPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a directory listing safely — returns empty array on error.
 */
async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/**
 * Find files in a directory matching a prefix pattern like `NNN-type.`.
 * Returns full relative paths from projectPath.
 */
function matchFiles(files: string[], prefix: string, dir: string): string[] {
  return files
    .filter((f) => f.startsWith(prefix) && f.endsWith('.md'))
    .sort()
    .map((f) => join(dir, f));
}

/**
 * Detect methodology documents for a given slice index under a project path.
 * Checks project-documents/user/ subdirectories for matching files.
 * Never throws — returns nulls for missing directories.
 */
export async function detectDocuments(
  projectPath: string,
  sliceIndex: number,
): Promise<DocumentDetectionResult> {
  const idx = String(sliceIndex);

  const slicesDir = join(projectPath, USER_DOCS, 'slices');
  const tasksDir = join(projectPath, USER_DOCS, 'tasks');
  const archDir = join(projectPath, USER_DOCS, 'architecture');

  const [sliceFiles, taskFiles, archFiles] = await Promise.all([
    safeReaddir(slicesDir),
    safeReaddir(tasksDir),
    safeReaddir(archDir),
  ]);

  // slices/{index}-slice.*.md → sliceDesign
  const sliceMatches = matchFiles(sliceFiles, `${idx}-slice.`, join(USER_DOCS, 'slices'));
  const sliceDesign = sliceMatches.length > 0 ? sliceMatches[0] : null;

  // tasks/{index}-tasks.*.md → taskFile (array, supports split files)
  const taskMatches = matchFiles(taskFiles, `${idx}-tasks.`, join(USER_DOCS, 'tasks'));
  const taskFile = taskMatches.length > 0 ? taskMatches : null;

  // architecture/{index}-arch.*.md → architecture
  const archMatches = matchFiles(archFiles, `${idx}-arch.`, join(USER_DOCS, 'architecture'));
  const architecture = archMatches.length > 0 ? archMatches[0] : null;

  // architecture/{index}-slices.*.md → slicePlan
  const planMatches = matchFiles(archFiles, `${idx}-slices.`, join(USER_DOCS, 'architecture'));
  const slicePlan = planMatches.length > 0 ? planMatches[0] : null;

  return { sliceDesign, taskFile, architecture, slicePlan };
}
