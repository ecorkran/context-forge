// Planning facts (slice 269, D4/D5): what the project's files say about adoption progress.
// Derived on every read and never stored. Read-only.
import { findArchitectureArtifacts, findPlanningArtifacts } from '../detection/planningArtifacts.js';
import { findExistingStatePlan } from '../introspection/parsers/existingStatePlan.js';
import { parseFrontmatter } from '../introspection/parsers/frontmatterParser.js';
import { DERIVED_PROVENANCE } from '../schema/frontmatterSchema.js';

export interface PlanningFacts {
  /** Absolute paths of every planning artifact (initiative plans, architectures, slice plans). */
  artifacts: string[];
  /** Absolute paths of architecture files whose frontmatter has `provenance: derived`. */
  derivedArchitectures: string[];
  /** The first slice plan with a retroactive entry, or null. */
  existingStatePlan: string | null;
}

/**
 * Reads the planning facts under `root`. Failures follow the called functions' contracts (D4):
 * a missing directory has no artifacts, other `readdir` errors throw `AdoptionError`, and an
 * architecture file without readable frontmatter is not derived.
 */
export async function readPlanningFacts(root: string): Promise<PlanningFacts> {
  const [artifacts, architectures, existingStatePlan] = await Promise.all([
    findPlanningArtifacts(root),
    findArchitectureArtifacts(root),
    findExistingStatePlan(root),
  ]);
  const frontmatters = await Promise.all(architectures.map((path) => parseFrontmatter(path)));
  const derivedArchitectures = frontmatters
    .filter((result) => result.data.provenance === DERIVED_PROVENANCE)
    .map((result) => result.filePath);
  return { artifacts, derivedArchitectures, existingStatePlan };
}
