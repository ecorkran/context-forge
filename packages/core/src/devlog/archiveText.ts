/** Pure construction of quarterly archive text (slice 936, D6, D11 idempotence). */
import { parseDevlog } from './devlogSections.js';

export interface ArchiveTextInput {
  /** Current archive text, or null when the archive does not exist yet. */
  existing: string | null;
  /** Sections to add, each ending in a blank line, newest first. */
  moved: string[];
  quarterLabel: string;
  projectName: string;
  today: string;
}

/** Archive text after the add, or null when every moved section is already in it. */
export function buildArchiveText(input: ArchiveTextInput): string | null {
  const { existing, quarterLabel, projectName, today } = input;
  // D11: a section whose exact text is already archived is not written again. Compare whole
  // parsed sections (ignoring trailing whitespace), never substrings of the file.
  const archived = new Set(existing === null ? [] : parseDevlog(existing).sections.map((s) => s.text.trimEnd()));
  const moved = input.moved.filter((section) => !archived.has(section.trimEnd()));
  if (moved.length === 0) return null;
  const added = moved.join('');

  if (existing === null) {
    return [
      '---',
      'docType: devlog',
      `project: ${projectName}`,
      `dateCreated: ${today}`,
      `dateUpdated: ${today}`,
      '---',
      '',
      `# Development Log Archive: ${quarterLabel}`,
      '',
      'Archived from DEVLOG.md. Newest entries first.',
      '',
      added,
    ].join('\n');
  }

  const parsed = parseDevlog(existing);
  if (parsed.sections.length === 0) {
    // No dated heading to insert above: append.
    const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    return existing + separator + added;
  }
  return parsed.preamble + added + parsed.sections.map((s) => s.text).join('');
}
