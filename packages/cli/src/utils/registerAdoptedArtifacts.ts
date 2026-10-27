import { basename } from 'node:path';
import { readAdoptionArtifacts } from '@context-forge/core/node';

/** The artifact fields a completed adoption leaves unset (#137), as `cf set` names them. */
const ARCH_FIELD = 'arch';
const CONCEPT_FIELD = 'concept';

/** `a/b/100-arch.foo.md` -> `100-arch.foo`: the stem form `cf set` stores. */
function toStem(relativePath: string): string {
  return basename(relativePath).replace(/\.md$/, '');
}

/**
 * Registers the architecture, slice plan and concept a completed adoption wrote to disk but never
 * set on the project (#137), so `cf next` and `cf list slices` see them. Adoption is complete when
 * a derived architecture and an existing-state plan both exist. A set `arch` also sets the plan.
 * With several derived architectures it does not guess: it says which, and leaves `arch` unset.
 * `setField` is `cf set`, so stems, worktree routing and the confirmation lines are its own.
 * Returns true when it set anything, so the caller re-reads the project.
 */
export async function registerAdoptedArtifacts(
  project: { projectPath?: string; fileArch?: string; fileConcept?: string },
  setField: (field: string, value: string) => Promise<void>,
): Promise<boolean> {
  if (!project.projectPath || (project.fileArch && project.fileConcept)) return false;

  const found = await readAdoptionArtifacts(project.projectPath);
  const adoptionComplete = found.derivedArchitectures.length > 0 && found.existingStatePlan !== null;
  if (!adoptionComplete) return false;

  let changed = false;
  if (!project.fileArch) {
    if (found.derivedArchitectures.length === 1) {
      await setField(ARCH_FIELD, toStem(found.derivedArchitectures[0]));
      changed = true;
    } else {
      process.stderr.write(
        `Several derived architectures found (${found.derivedArchitectures.join(', ')}); not guessing. ` +
          `Choose one with: cf set arch <index>\n`,
      );
    }
  }
  if (!project.fileConcept && found.concept !== null) {
    await setField(CONCEPT_FIELD, toStem(found.concept));
    changed = true;
  }
  return changed;
}
