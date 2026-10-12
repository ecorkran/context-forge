/**
 * Slice-design structure check — file layer (node-only).
 *
 * Reads the guide's slice-design template and each document, checks the
 * document's `docType`, and matches headings with the pure validator.
 * Usage and template problems throw `SliceDesignValidationError`; every file
 * argument is checked before any result is produced, so a caller never sees
 * partial results alongside an error.
 */
import { readFile, stat, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseFrontmatter } from '../introspection/parsers/frontmatterParser.js';
import {
  requiredHeadings,
  documentHeadingKeys,
  missingHeadings,
  type RequiredHeading,
} from './sliceDesignValidator.js';

/** The docType a slice design must declare in its frontmatter. */
export const SLICE_DESIGN_DOC_TYPE = 'slice-design';

/** Message for a file that fails the docType check, matching the guide script. */
export const DOC_TYPE_FAILURE_MESSAGE =
  `frontmatter must declare 'docType: ${SLICE_DESIGN_DOC_TYPE}' (see file-naming-conventions.md)`;

/** Why a file failed other than missing headings. */
export const DesignFailureReason = {
  DocType: 'doctype',
} as const;

export type DesignFailureReason = (typeof DesignFailureReason)[keyof typeof DesignFailureReason];

/** Usage or template problem: no file results are produced when this is thrown. */
export class SliceDesignValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SliceDesignValidationError';
  }
}

export interface DesignValidationResult {
  /** The path exactly as the caller supplied it. */
  path: string;
  pass: boolean;
  /** Missing required headings, written as in the template. */
  missing: string[];
  reason?: DesignFailureReason;
}

/** Read the template and return its required headings. */
async function loadRequiredHeadings(templatePath: string): Promise<RequiredHeading[]> {
  let templateText: string;
  try {
    templateText = await readFile(templatePath, 'utf-8');
  } catch (err) {
    throw new SliceDesignValidationError(
      `slice-design template not readable at ${templatePath}. Run 'cf guides update' to restore the guide.`,
      { cause: err },
    );
  }

  const required = requiredHeadings(templateText);
  if (required.length === 0) {
    throw new SliceDesignValidationError(
      `template declares no required headings: ${templatePath}`,
    );
  }
  return required;
}

/** Throw for the first file argument that is missing, not a regular file, or unreadable. */
async function preflight(files: readonly string[]): Promise<void> {
  for (const file of files) {
    try {
      const info = await stat(file);
      if (!info.isFile()) {
        throw new SliceDesignValidationError(`not a regular file: ${file}`);
      }
      await access(file, constants.R_OK);
    } catch (err) {
      if (err instanceof SliceDesignValidationError) throw err;
      const notFound = err instanceof Error && 'code' in err && err.code === 'ENOENT';
      const problem = notFound ? 'no such file' : 'cannot read file';
      throw new SliceDesignValidationError(`${problem}: ${file}`, { cause: err });
    }
  }
}

/** Validate one file that passed preflight. */
async function validateFile(
  file: string,
  required: RequiredHeading[],
): Promise<DesignValidationResult> {
  const frontmatter = await parseFrontmatter(file);
  if (frontmatter.data.docType !== SLICE_DESIGN_DOC_TYPE) {
    return { path: file, pass: false, missing: [], reason: DesignFailureReason.DocType };
  }

  let docText: string;
  try {
    docText = await readFile(file, 'utf-8');
  } catch (err) {
    throw new SliceDesignValidationError(`cannot read file: ${file}`, { cause: err });
  }

  const missing = missingHeadings(required, documentHeadingKeys(docText)).map((r) => r.heading);
  return { path: file, pass: missing.length === 0, missing };
}

/**
 * Check each slice design against the template's required headings.
 * Results are returned in argument order; a failing file does not stop later ones.
 */
export async function validateSliceDesignFiles(
  templatePath: string,
  files: readonly string[],
): Promise<DesignValidationResult[]> {
  const required = await loadRequiredHeadings(templatePath);
  await preflight(files);

  const results: DesignValidationResult[] = [];
  for (const file of files) {
    results.push(await validateFile(file, required));
  }
  return results;
}
