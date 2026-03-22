import { resolveFileByIndex } from './schema/resolveFileByIndex.js';
import type { AutoSetResult } from './project-defaults.js';

/**
 * Given a field being set and its value, compute any additional fields
 * that should be auto-set. Caller is responsible for applying the updates.
 *
 * @param field - The field name being set (project-level name, e.g. 'fileSlice')
 * @param value - The value being set
 * @param projectPath - Absolute path to project root (for file resolution)
 */
export function computeAutoSetFields(
  field: string,
  value: string,
  projectPath: string | undefined,
): AutoSetResult {
  const derivedUpdates: Record<string, string> = {};
  const descriptions: string[] = [];

  // Rule 1: developmentPhase → instruction
  if (field === 'developmentPhase') {
    derivedUpdates.instruction = value;
    descriptions.push(`instruction = ${value} (auto-set from developmentPhase)`);
  }

  // Rule 2: fileArch → fileSlicePlan
  if (field === 'fileArch' && projectPath) {
    const archIndex = /^(\d+)-/.exec(value);
    if (archIndex) {
      let resolved: string | null = null;
      try {
        resolved = resolveFileByIndex(projectPath, 'fileSlicePlan', archIndex[1]);
      } catch {
        const derived = value.replace(/^(\d+)-arch\./, '$1-slices.');
        if (derived !== value) resolved = derived;
      }
      if (resolved !== null) {
        derivedUpdates.fileSlicePlan = resolved;
        descriptions.push(`fileSlicePlan = ${resolved} (auto-set from fileArch)`);
      }
    }
  }

  // Rule 3: fileSlice → fileTasks
  if (field === 'fileSlice' && projectPath) {
    const sliceIndex = /^(\d+)-/.exec(value);
    if (sliceIndex) {
      let resolved: string | null = null;
      try {
        resolved = resolveFileByIndex(projectPath, 'fileTasks', sliceIndex[1]);
      } catch {
        const derived = value.replace(/^(\d+)-slice\./, '$1-tasks.');
        if (derived !== value) resolved = derived;
      }
      if (resolved !== null) {
        derivedUpdates.fileTasks = resolved;
        descriptions.push(`fileTasks = ${resolved} (auto-set from fileSlice)`);
      }
    }
  }

  return { derivedUpdates, descriptions };
}
