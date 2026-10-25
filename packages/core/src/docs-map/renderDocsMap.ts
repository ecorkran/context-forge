// Pure rendering of the docs map's managed block (slice 267, D3). No filesystem access.
import { posix } from 'path';
import type { MappedDoc } from './discoverDocs.js';

export const ADR_GROUP_HEADING = '## Architecture Decision Records';
export const DOC_GROUP_HEADING = '## Documentation';
export const EMPTY_MAP_LINE = 'No existing docs or ADRs were found.';

const GROUPS: ReadonlyArray<{ kind: MappedDoc['kind']; heading: string }> = [
  { kind: 'adr', heading: ADR_GROUP_HEADING },
  { kind: 'doc', heading: DOC_GROUP_HEADING },
];

/** Plain code-unit order, so output does not depend on the machine's locale. */
function byPath(a: MappedDoc, b: MappedDoc): number {
  if (a.path < b.path) return -1;
  return a.path > b.path ? 1 : 0;
}

function entryLine(doc: MappedDoc, mapDir: string): string {
  const link = posix.relative(mapDir, doc.path).replaceAll(' ', '%20');
  return `- [${doc.title}](${link}) — \`${doc.path}\``;
}

/**
 * The lines between the BEGIN and END markers. `mapDir` and each `doc.path` are
 * root-relative POSIX, so links come out relative to the map's own directory.
 */
export function renderManagedBlock(docs: readonly MappedDoc[], mapDir: string): string {
  const sections = GROUPS.flatMap(({ kind, heading }) => {
    const entries = docs.filter((doc) => doc.kind === kind).sort(byPath);
    if (entries.length === 0) return [];
    return [[heading, ...entries.map((doc) => entryLine(doc, mapDir))].join('\n')];
  });
  return sections.length === 0 ? EMPTY_MAP_LINE : sections.join('\n\n');
}
