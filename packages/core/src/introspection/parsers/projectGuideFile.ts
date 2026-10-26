import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Find the first file in the project's project-guides directory matching `pattern`. */
export async function findProjectGuideFile(projectPath: string, pattern: RegExp): Promise<string | null> {
  const guidesDir = join(projectPath, 'project-documents/user/project-guides');
  try {
    const files = await readdir(guidesDir);
    const match = files.find((f) => pattern.test(f));
    return match ? join(guidesDir, match) : null;
  } catch {
    // Missing directory means the artifact has not been created yet
    return null;
  }
}

/**
 * Locate the concept file for a project.
 * Convention: project-documents/user/project-guides/000-concept.*.md
 * Returns the full path, or null if not found.
 */
export function resolveConceptPath(projectPath: string): Promise<string | null> {
  return findProjectGuideFile(projectPath, /^000-concept\..*\.md$/i);
}
