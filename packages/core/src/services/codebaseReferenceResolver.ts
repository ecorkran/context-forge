import { readCodebaseReference } from '../adoption/codebaseReference.js';
import { renderCodebaseReference } from '../adoption/codebaseReferenceText.js';
import type { CodebaseReferenceResolver } from './ContextIntegrator.js';

/** Reads the comprehension and docs map facts for one checkout and renders the build section. Read-only. */
export const resolveCodebaseReferenceForPrompt: CodebaseReferenceResolver = async (
  checkoutPath,
  projectName,
  fileComprehension,
  listed,
) => renderCodebaseReference(await readCodebaseReference(checkoutPath, projectName, fileComprehension, listed));
