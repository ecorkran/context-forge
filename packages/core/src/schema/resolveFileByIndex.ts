import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROJECT_FIELDS } from './projectSchema.js';

/** Maps artifact field names to their directory and file prefix pattern. */
const ARTIFACT_DIR_MAP: Record<string, { dir: string; prefixes: string[] }> = {
  fileSlice: { dir: 'project-documents/user/slices', prefixes: ['slice.'] },
  fileTasks: { dir: 'project-documents/user/tasks', prefixes: ['tasks.'] },
  fileArch: { dir: 'project-documents/user/architecture', prefixes: ['arch.'] },
  fileSlicePlan: { dir: 'project-documents/user/architecture', prefixes: ['slices.'] },
  fileHLD: { dir: 'project-documents/user/architecture', prefixes: ['hld.', 'arch.hld-'] },
  fileSpec: { dir: 'project-documents/user/architecture', prefixes: ['spec.'] },
};

/**
 * Resolve a bare numeric index to a filename stem for an artifact field.
 *
 * Scans the appropriate project-documents directory for files matching
 * `{index}-{doctype}.*.md` and returns the filename without `.md`.
 *
 * @returns The resolved filename stem, or null if the field is not an artifact field.
 * @throws If no matching file is found or multiple matches exist.
 */
export function resolveFileByIndex(
  projectPath: string,
  field: string,
  index: string,
): string | null {
  const mapping = ARTIFACT_DIR_MAP[field];
  if (!mapping) return null;

  // Verify the field is actually in the artifacts group
  const fieldDef = PROJECT_FIELDS.find((f) => f.field === field);
  if (!fieldDef || fieldDef.group !== 'artifacts') return null;

  const dirPath = join(projectPath, mapping.dir);

  let files: string[];
  try {
    files = readdirSync(dirPath);
  } catch {
    throw new Error(
      `Cannot scan directory '${mapping.dir}' — directory not found at ${dirPath}`,
    );
  }

  // Match files like {index}-{prefix}*.md
  const matches = files.filter((f) => {
    if (!f.endsWith('.md')) return false;
    return mapping.prefixes.some((prefix) => f.startsWith(`${index}-${prefix}`));
  });

  if (matches.length === 0) {
    throw new Error(
      `No file matching index '${index}' for field '${field}' in ${mapping.dir}/`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple files match index '${index}' for field '${field}': ${matches.join(', ')}`,
    );
  }

  // Return stem without .md extension
  return matches[0].replace(/\.md$/, '');
}

/**
 * Resolve an artifact stem (e.g. "160-slices.project-workflow-system") to its
 * full relative path within the project (e.g. "project-documents/user/architecture/160-slices.project-workflow-system.md").
 *
 * @returns The relative path including directory and .md extension, or null if the field is unknown.
 */
export function resolveArtifactPath(field: string, stem: string): string | null {
  const mapping = ARTIFACT_DIR_MAP[field];
  if (!mapping) return null;
  return join(mapping.dir, `${stem}.md`);
}
