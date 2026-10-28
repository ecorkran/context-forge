// Wording and rendering of the `### Codebase Reference` build section (slice 274, D5-D7).
// Facts come from `readCodebaseReference`; this file turns them into text and nothing else.
import {
  COMPREHENSION_FACT,
  DOCS_MAP_FACT,
  type CodebaseReferenceFacts,
  type ComprehensionFact,
  type DocsMapFact,
} from './codebaseReference.js';

export const CODEBASE_REFERENCE_HEADING = '### Codebase Reference';

export const CODEBASE_REFERENCE_LABELS = {
  comprehension: 'Codebase comprehension',
  docsMap: 'Docs map',
} as const;

/** The docs map is cf's own artifact, so its remedies name cf's own command. */
export const DOCS_MAP_COMMAND = 'cf docs map';

export const COMPREHENSION_NONE = 'none registered.';
export const DOCS_MAP_NONE = `none. Run \`${DOCS_MAP_COMMAND}\` to create it.`;
export const DOCS_MAP_CURRENT = 'current';
export const DOCS_MAP_OUT_OF_DATE = `out of date: run \`${DOCS_MAP_COMMAND}\` to refresh`;
export const DOCS_MAP_FIX_MARKERS = `fix the markers, then run \`${DOCS_MAP_COMMAND}\``;

/**
 * D7: names the action without naming a squadron command. Appended only to the missing and
 * not-readable lines, never to the "none registered" line.
 */
export const COMPREHENSION_REFRESH_SENTENCE =
  'Refresh it through squadron, which registers the new path with `cf set comprehension`.';

function comprehensionLine(fact: ComprehensionFact): string {
  switch (fact.kind) {
    case COMPREHENSION_FACT.None:
      return COMPREHENSION_NONE;
    case COMPREHENSION_FACT.Present:
      return fact.path;
    case COMPREHENSION_FACT.Missing:
      return `${fact.path} (missing: ${fact.reason}). ${COMPREHENSION_REFRESH_SENTENCE}`;
    case COMPREHENSION_FACT.NotReadable:
      return `${fact.path} (not readable: ${fact.reason}). ${COMPREHENSION_REFRESH_SENTENCE}`;
  }
}

function docsMapLine(fact: DocsMapFact): string {
  switch (fact.kind) {
    case DOCS_MAP_FACT.None:
      return DOCS_MAP_NONE;
    case DOCS_MAP_FACT.Current:
      return `${fact.path} (${DOCS_MAP_CURRENT})`;
    case DOCS_MAP_FACT.OutOfDate:
      return `${fact.path} (${DOCS_MAP_OUT_OF_DATE})`;
    case DOCS_MAP_FACT.CannotCheck: {
      const detail = fact.markers ? `${fact.reason}; ${DOCS_MAP_FIX_MARKERS}` : fact.reason;
      return fact.path === null ? `cannot check: ${detail}` : `${fact.path} (cannot check: ${detail})`;
    }
  }
}

/**
 * The section text: the heading, then one line per fact, comprehension first. Returns `''` when
 * there are no facts, so an unlisted pair of variables adds nothing to the build.
 */
export function renderCodebaseReference(facts: CodebaseReferenceFacts): string {
  const lines: string[] = [];
  if (facts.comprehension) {
    lines.push(`${CODEBASE_REFERENCE_LABELS.comprehension}: ${comprehensionLine(facts.comprehension)}`);
  }
  if (facts.docsMap) {
    lines.push(`${CODEBASE_REFERENCE_LABELS.docsMap}: ${docsMapLine(facts.docsMap)}`);
  }
  return lines.length === 0 ? '' : [CODEBASE_REFERENCE_HEADING, ...lines].join('\n');
}
