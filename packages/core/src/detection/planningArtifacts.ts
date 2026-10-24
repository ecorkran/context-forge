// "Already planned" check (slice 261, D6): a planning artifact file exists.
// A concept (000-concept.*) is not a planning artifact.
import { readdir } from 'fs/promises';
import { basename, join } from 'path';
import { AdoptionError } from '../adoption/contracts.js';
import { INITIATIVE_PLAN_FILE_PATTERN } from '../introspection/ArtifactIntrospector.js';
import { isEnoent } from './pathPresent.js';

const PROJECT_GUIDES_DIR = join('project-documents', 'user', 'project-guides');
const ARCHITECTURE_DIR = join('project-documents', 'user', 'architecture');

/** nnn-arch.*.md and nnn-hld.*.md, as ProjectModelBuilder parses them. */
export const ARCHITECTURE_FILE_PATTERN = /^\d{3}-(arch|hld)\..+\.md$/i;

/** nnn-slices.*.md, as ProjectModelBuilder parses them. */
export const SLICE_PLAN_FILE_PATTERN = /^\d{3}-slices\..+\.md$/i;

/** The 3-digit index prefix of a planning file name. */
export function fileIndexOf(path: string): string {
  return basename(path).slice(0, 3);
}

/** Orders absolute paths by the 3-digit index of the file name, then by full path. */
export function compareByFileIndex(a: string, b: string): number {
  const indexA = fileIndexOf(a);
  const indexB = fileIndexOf(b);
  if (indexA !== indexB) return indexA < indexB ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function isPlanningArtifactName(name: string): boolean {
  return ARCHITECTURE_FILE_PATTERN.test(name) || SLICE_PLAN_FILE_PATTERN.test(name);
}

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

/**
 * Absolute paths of the planning artifacts under `root`, sorted lexically by full path (not by
 * file-name index; callers that need index order sort with `compareByFileIndex`). Empty means
 * not yet planned.
 */
export async function findPlanningArtifacts(root: string): Promise<string[]> {
  const guidesDir = join(root, PROJECT_GUIDES_DIR);
  const archDir = join(root, ARCHITECTURE_DIR);
  const [guideNames, archNames] = await Promise.all([listFileNames(guidesDir), listFileNames(archDir)]);

  const found = [
    ...guideNames
      .filter((name) => INITIATIVE_PLAN_FILE_PATTERN.test(name) || isPlanningArtifactName(name))
      .map((name) => join(guidesDir, name)),
    ...archNames.filter(isPlanningArtifactName).map((name) => join(archDir, name)),
  ];
  return found.sort();
}

/** Absolute paths of the architecture artifacts under `root`, ordered by file-name index (R3). */
export async function findArchitectureArtifacts(root: string): Promise<string[]> {
  const guidesDir = join(root, PROJECT_GUIDES_DIR);
  const archDir = join(root, ARCHITECTURE_DIR);
  const [guideNames, archNames] = await Promise.all([listFileNames(guidesDir), listFileNames(archDir)]);

  const found = [
    ...guideNames.filter((name) => ARCHITECTURE_FILE_PATTERN.test(name)).map((name) => join(guidesDir, name)),
    ...archNames.filter((name) => ARCHITECTURE_FILE_PATTERN.test(name)).map((name) => join(archDir, name)),
  ];
  return found.sort(compareByFileIndex);
}
