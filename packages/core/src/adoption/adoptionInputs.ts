// Adoption artifacts (slice 271, D3): the three planning files `sq onboard` needs to resume an
// adoption, reported as root-relative paths so consumers need not know cf's file names. Read-only.
import { relative, sep } from 'node:path';
import { resolveConceptPath } from '../introspection/parsers/projectGuideFile.js';
import { readPlanningFacts } from './planningFacts.js';

export interface AdoptionArtifacts {
  concept: string | null;
  derivedArchitectures: string[];
  existingStatePlan: string | null;
}

/**
 * A path relative to `root` with `/` separators (D3). A path outside the root keeps its climbing
 * `../` segments, which is how a monorepo's root-level CI file is reported (D2).
 */
export function toRootRelative(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join('/');
}

/**
 * The concept, derived architectures and existing-state plan under `root`. Planning-file read
 * errors (`AdoptionError`) propagate unchanged; the caller attaches the error code.
 */
export async function readAdoptionArtifacts(root: string): Promise<AdoptionArtifacts> {
  const [conceptPath, facts] = await Promise.all([resolveConceptPath(root), readPlanningFacts(root)]);
  const relativeToRoot = (path: string): string => toRootRelative(root, path);
  return {
    concept: conceptPath === null ? null : relativeToRoot(conceptPath),
    derivedArchitectures: facts.derivedArchitectures.map(relativeToRoot),
    existingStatePlan: facts.existingStatePlan === null ? null : relativeToRoot(facts.existingStatePlan),
  };
}
