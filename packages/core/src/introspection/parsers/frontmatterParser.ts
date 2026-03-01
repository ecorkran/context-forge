import { readFile } from 'node:fs/promises';
import type { FrontmatterResult } from '../types.js';

/**
 * Extract YAML frontmatter as flat key:value dict.
 * Ported from parse.py parse_frontmatter().
 * Never throws — returns { found: false, data: {} } on any error.
 */
export async function parseFrontmatter(filePath: string): Promise<FrontmatterResult> {
  const empty: FrontmatterResult = { filePath, found: false, data: {} };

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length === 0 || lines[0].trim() !== '---') {
      return empty;
    }

    const data: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (stripped === '---') {
        return { filePath, found: true, data };
      }
      if (stripped.includes(':')) {
        const colonIdx = stripped.indexOf(':');
        const key = stripped.slice(0, colonIdx).trim();
        let val = stripped.slice(colonIdx + 1).trim();
        // Strip surrounding quotes (single and double)
        if (
          val.length >= 2 &&
          ((val.startsWith("'") && val.endsWith("'")) ||
            (val.startsWith('"') && val.endsWith('"')))
        ) {
          val = val.slice(1, -1);
        }
        if (key) {
          data[key] = val;
        }
      }
    }

    // Reached end of file without closing ---
    return empty;
  } catch {
    return empty;
  }
}
