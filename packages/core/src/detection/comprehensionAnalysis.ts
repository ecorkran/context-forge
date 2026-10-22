// Squadron 362's codebase-comprehension document (slice 262 D5): the newest one in the
// checkout's analysis folder, as a path relative to project-documents/.
import { readdir, readFile } from 'fs/promises';
import { join, posix } from 'path';
import { AdoptionError } from '../adoption/contracts.js';
import { parseFrontmatterText } from '../introspection/parsers/frontmatterParser.js';
import { isEnoent } from './pathPresent.js';

const PROJECT_DOCUMENTS_DIR = 'project-documents';
const ANALYSIS_DIR_SEGMENTS = ['user', 'analysis'] as const;

export const COMPREHENSION_FILE_PATTERN = /^(\d+)-analysis\.codebase-comprehension\.md$/i;
export const COMPREHENSION_DOC_TYPE = 'analysis';
/** Name of the brownfield-adoption profile variable this document fills. */
export const COMPREHENSION_PROFILE_VARIABLE = 'fileComprehension';

interface Candidate {
  name: string;
  index: number;
}

function describeFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Matching file names, highest numeric index first (1000 sorts above 999). */
async function listCandidates(analysisDir: string): Promise<Candidate[]> {
  let names: string[];
  try {
    names = await readdir(analysisDir);
  } catch (error) {
    if (isEnoent(error)) return [];
    throw new AdoptionError(`Cannot list ${analysisDir}: ${describeFailure(error)}`, { cause: error });
  }
  return names
    .flatMap((name) => {
      const match = COMPREHENSION_FILE_PATTERN.exec(name);
      return match ? [{ name, index: Number(match[1]) }] : [];
    })
    .sort((a, b) => b.index - a.index);
}

/** Does this file carry the comprehension docType? A file deleted since the listing counts as no. */
async function hasComprehensionDocType(path: string): Promise<boolean> {
  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch (error) {
    if (isEnoent(error)) return false;
    throw new AdoptionError(`Cannot read ${path}: ${describeFailure(error)}`, { cause: error });
  }
  const docType = parseFrontmatterText(path, content).data.docType;
  return docType?.trim().toLowerCase() === COMPREHENSION_DOC_TYPE;
}

/** Path of the newest comprehension document relative to project-documents/, or undefined. */
export async function findComprehensionAnalysis(checkoutPath: string): Promise<string | undefined> {
  const analysisDir = join(checkoutPath, PROJECT_DOCUMENTS_DIR, ...ANALYSIS_DIR_SEGMENTS);
  for (const { name } of await listCandidates(analysisDir)) {
    if (await hasComprehensionDocType(join(analysisDir, name))) {
      return posix.join(...ANALYSIS_DIR_SEGMENTS, name);
    }
  }
  return undefined;
}
