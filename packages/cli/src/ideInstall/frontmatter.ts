/**
 * Rule-file frontmatter reads and rewrites, ported from the bash awk helpers
 * with their edge cases intact (port findings, "Frontmatter helpers"). Each
 * awk program tracks frontmatter differently; the differences are deliberate
 * and pinned by snapshots, so the helpers do not share a parser.
 */
import { fromRecords, stripTrailingNewlines, toRecords, anyLineMatches, anyLineContains } from './lines.js';

/** A frontmatter fence: exactly `---` (so `---\r` is not one). */
export const FENCE = '---';

/** Value get_apply_to falls back to when a rule has no `paths:`. */
export const DEFAULT_APPLY_TO = '**';

const ALWAYS_APPLY_TRUE = /^alwaysApply:[ ]*true/;
const PATHS_KEY = /^paths:[ ]*$/;
const LIST_ITEM = /^[ ]+-[ ]+/;
const LIST_ITEM_START = /^[ ]+-/;

/**
 * `has_always_apply`. The first fence opens frontmatter and the second returns
 * false. A file with no closing fence, or no frontmatter at all, counts as
 * always-on (awk exits 0 at end of file).
 */
export function hasAlwaysApply(text: string): boolean {
  let inFrontmatter = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (inFrontmatter) return false;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && ALWAYS_APPLY_TRUE.test(line)) return true;
  }
  return true;
}

/**
 * `validate_frontmatter`: unanchored greps over the whole file. Returns the
 * warning to print, or null when the file passes.
 */
export function frontmatterWarning(text: string, filename: string): string | null {
  if (!anyLineMatches(text, /^---/)) return `⚠️  WARNING: ${filename} missing frontmatter`;
  if (!anyLineContains(text, 'description:')) {
    return `⚠️  WARNING: ${filename} missing 'description' in frontmatter`;
  }
  const scoped = ['paths:', 'globs:', 'alwaysApply:'].some((key) => anyLineContains(text, key));
  if (!scoped) {
    return `⚠️  WARNING: ${filename} missing 'paths', 'globs', or 'alwaysApply' in frontmatter`;
  }
  return null;
}

function stripOneQuotePair(value: string): string {
  return value.replace(/^"/, '').replace(/"$/, '');
}

/**
 * `get_apply_to`: the `paths:` list joined with commas, quotes stripped.
 * With no paths, the closing fence prints `**` and exits, and awk still runs
 * END, which prints `**` again: the value is `**\n**` (#40, ported as is).
 * With unclosed frontmatter and paths collected, it is empty.
 */
export function getApplyTo(text: string): string {
  const printed: string[] = [];
  const paths: string[] = [];
  let inFrontmatter = false;
  let inPaths = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      }
      printed.push(paths.length > 0 ? paths.join(',') : DEFAULT_APPLY_TO);
      break;
    }
    if (!inFrontmatter) continue;
    if (PATHS_KEY.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && LIST_ITEM.test(line)) {
      paths.push(stripOneQuotePair(line.replace(LIST_ITEM, '')));
      continue;
    }
    if (inPaths && !LIST_ITEM_START.test(line)) inPaths = false;
  }
  // awk's END block.
  if (paths.length === 0) printed.push(DEFAULT_APPLY_TO);
  return stripTrailingNewlines(fromRecords(printed));
}

/**
 * `get_frontmatter_field`: the first `<field>:` line inside the frontmatter,
 * with one leading and one trailing `"` stripped. Empty when absent.
 */
export function getFrontmatterField(text: string, field: string): string {
  const prefix = new RegExp(`^${field}:[ ]*`);
  let inFrontmatter = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && prefix.test(line)) return stripOneQuotePair(line.replace(prefix, ''));
  }
  return '';
}

/**
 * `convert_paths_to_globs` (cursor): `paths:` becomes `globs: [...]` (quotes
 * kept) and `name:` is dropped. Every fence toggles frontmatter mode and nothing
 * records that it ended, so a later `---` in the body reopens it.
 */
export function convertPathsToGlobs(text: string): string {
  const out: string[] = [];
  // Never reset, as in awk: a reopened block re-emits every path collected so far.
  const paths: string[] = [];
  let inFrontmatter = false;
  let inPaths = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (inFrontmatter && paths.length > 0) out.push(`globs: [${paths.join(', ')}]`);
      inFrontmatter = !inFrontmatter;
      inPaths = false;
      out.push(line);
      continue;
    }
    if (!inFrontmatter) {
      out.push(line);
      continue;
    }
    if (line.startsWith('name:')) continue;
    if (PATHS_KEY.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && LIST_ITEM.test(line)) {
      paths.push(line.replace(LIST_ITEM, ''));
      continue;
    }
    if (inPaths && !LIST_ITEM_START.test(line)) inPaths = false;
    out.push(line);
  }
  return fromRecords(out);
}

/** `strip_name_field` (claude): drops `name:` lines from the first frontmatter block only. */
export function stripNameField(text: string): string {
  const out: string[] = [];
  let inFrontmatter = false;
  let pastFrontmatter = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (!pastFrontmatter) {
        inFrontmatter = !inFrontmatter;
        if (!inFrontmatter) pastFrontmatter = true;
      }
      out.push(line);
      continue;
    }
    if (inFrontmatter && line.startsWith('name:')) continue;
    out.push(line);
  }
  return fromRecords(out);
}
