import { readFile } from 'node:fs/promises';

const OVERVIEW_HEADING_RE = /^##\s+Overview/i;
const HEADING_RE = /^#{1,3}\s+/;

/**
 * Extract the first paragraph from the ## Overview section of a markdown file.
 * Returns undefined if no Overview section or no content found.
 */
export async function extractOverview(filePath: string): Promise<string | undefined> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    let inOverview = false;
    const paragraphLines: string[] = [];

    for (const line of lines) {
      const stripped = line.trim();

      if (OVERVIEW_HEADING_RE.test(stripped)) {
        inOverview = true;
        continue;
      }

      if (!inOverview) continue;

      // Another heading ends the overview section
      if (HEADING_RE.test(stripped)) break;

      // Collect non-empty lines into the first paragraph
      if (stripped === '') {
        // Empty line after content means end of first paragraph
        if (paragraphLines.length > 0) break;
        continue;
      }

      paragraphLines.push(stripped);
    }

    return paragraphLines.length > 0 ? paragraphLines.join(' ') : undefined;
  } catch {
    return undefined;
  }
}
