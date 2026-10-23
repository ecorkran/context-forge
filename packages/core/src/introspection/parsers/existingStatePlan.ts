// The existing-state slice plan (slices 263 and 264): the plan that records what an adopted
// project already is, marked by retroactive entries. One definition, shared by the build's
// adoption completion and by `cf next`.
import { basename } from 'path';
import {
  SLICE_PLAN_FILE_PATTERN,
  compareByFileIndex,
  findPlanningArtifacts,
} from '../../detection/planningArtifacts.js';
import { parseSlicePlan } from './slicePlanParser.js';

/**
 * The first slice plan, by index, with at least one retroactive entry. A plan without one does
 * not count, and a plan that cannot be read parses to no entries, so it is skipped too (264 D7).
 * Read-only. Returns an absolute path, or null.
 */
export async function findExistingStatePlan(checkoutPath: string): Promise<string | null> {
  const artifacts = await findPlanningArtifacts(checkoutPath);
  const plans = artifacts.filter((path) => SLICE_PLAN_FILE_PATTERN.test(basename(path))).sort(compareByFileIndex);
  for (const path of plans) {
    const plan = await parseSlicePlan(path);
    if (plan.entries.some((entry) => entry.retroactive)) return path;
  }
  return null;
}
