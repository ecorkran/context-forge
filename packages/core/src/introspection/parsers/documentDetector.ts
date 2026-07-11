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
 * Find files in a directory matching an index-prefixed pattern like `140-slice.`.
 * Tolerates leading zeros on the index in the filename (e.g. an `idx` of `50`
 * matches both `50-arch.foo.md` and `050-arch.foo.md`) since the index is a
 * plain number everywhere except this filename-matching call site.
 * Returns full relative paths from projectPath.
 */
function matchFiles(files: string[], idx: string, suffix: string, dir: string): string[] {
  const escapedSuffix = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^0*${idx}${escapedSuffix}`);
  return files
    .filter((f) => pattern.test(f) && f.endsWith('.md'))
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
  reviewType?: string,
): Promise<DocumentDetectionResult> {
  const idx = String(sliceIndex);

  const slicesDir = join(projectPath, USER_DOCS, 'slices');
  const tasksDir = join(projectPath, USER_DOCS, 'tasks');
  const archDir = join(projectPath, USER_DOCS, 'architecture');
  const reviewsDir = join(projectPath, USER_DOCS, 'reviews');

  const [sliceFiles, taskFiles, archFiles, reviewFiles] = await Promise.all([
    safeReaddir(slicesDir),
    safeReaddir(tasksDir),
    safeReaddir(archDir),
    safeReaddir(reviewsDir),
  ]);

  // slices/{index}-slice.*.md → sliceDesign
  const sliceMatches = matchFiles(sliceFiles, idx, '-slice.', join(USER_DOCS, 'slices'));
  const sliceDesign = sliceMatches.length > 0 ? sliceMatches[0] : null;

  // tasks/{index}-tasks.*.md → taskFile (array, supports split files)
  const taskMatches = matchFiles(taskFiles, idx, '-tasks.', join(USER_DOCS, 'tasks'));
  const taskFile = taskMatches.length > 0 ? taskMatches : null;

  // architecture/{index}-arch.*.md → architecture
  const archMatches = matchFiles(archFiles, idx, '-arch.', join(USER_DOCS, 'architecture'));
  const architecture = archMatches.length > 0 ? archMatches[0] : null;

  // architecture/{index}-slices.*.md → slicePlan
  const planMatches = matchFiles(archFiles, idx, '-slices.', join(USER_DOCS, 'architecture'));
  const slicePlan = planMatches.length > 0 ? planMatches[0] : null;

  // reviews/{index}-review.{reviewType}.*.md → review
  // A missing or empty reviewType means "don't guess" — review stays null
  // rather than matching any review type. (Empty string is the default value
  // of every per-gate override key, so it must be treated the same as
  // undefined, not passed through into a malformed match prefix.) When a type
  // is supplied, reviews accrue over re-runs, so the lexicographically last
  // match (most recent) wins — unlike sibling detectors above, which take the
  // first match ([0]) because those documents are singular.
  let review: string | null = null;
  if (reviewType !== undefined && reviewType !== '') {
    const reviewMatches = matchFiles(
      reviewFiles,
      idx,
      `-review.${reviewType}.`,
      join(USER_DOCS, 'reviews'),
    );
    review = reviewMatches.at(-1) ?? null;
  }

  return { sliceDesign, taskFile, architecture, slicePlan, review };
}
