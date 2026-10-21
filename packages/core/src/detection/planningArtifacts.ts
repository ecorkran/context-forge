// "Already planned" check (slice 261, D6): a planning artifact file exists.
// A concept (000-concept.*) is not a planning artifact.
import { readdir } from 'fs/promises';
import { join } from 'path';
import { AdoptionError } from '../adoption/contracts.js';
import { INITIATIVE_PLAN_FILE_PATTERN } from '../introspection/ArtifactIntrospector.js';
import { isEnoent } from './pathPresent.js';

const PROJECT_GUIDES_DIR = join('project-documents', 'user', 'project-guides');
const ARCHITECTURE_DIR = join('project-documents', 'user', 'architecture');

/** nnn-arch.*.md, nnn-hld.*.md and nnn-slices.*.md, as ProjectModelBuilder parses them. */
export const ARCH_FILE_PATTERN = /^\d{3}-(arch|hld|slices)\..+\.md$/i;

const OVERRIDE_REMEDY =
  'To skip detection run `cf config set adoption.state in_progress` or `cf config set adoption.state declined`.';

/** File names in a directory; a missing directory (ENOENT) has none. Other errors throw. */
async function listFileNames(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch (error) {
    if (isEnoent(error)) return [];
    const detail = error instanceof Error ? error.message : String(error);
    throw new AdoptionError(`Cannot check for planning artifacts in ${dir}: ${detail}. ${OVERRIDE_REMEDY}`, {
      cause: error,
    });
  }
}

/** Absolute, sorted paths of the planning artifacts under `root`. Empty means not yet planned. */
export async function findPlanningArtifacts(root: string): Promise<string[]> {
  const guidesDir = join(root, PROJECT_GUIDES_DIR);
  const archDir = join(root, ARCHITECTURE_DIR);
  const [guideNames, archNames] = await Promise.all([listFileNames(guidesDir), listFileNames(archDir)]);

  const found = [
    ...guideNames
      .filter((name) => INITIATIVE_PLAN_FILE_PATTERN.test(name) || ARCH_FILE_PATTERN.test(name))
      .map((name) => join(guidesDir, name)),
    ...archNames.filter((name) => ARCH_FILE_PATTERN.test(name)).map((name) => join(archDir, name)),
  ];
  return found.sort();
}
