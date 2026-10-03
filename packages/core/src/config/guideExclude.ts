/**
 * guide.exclude pattern rules — one parser and one matcher, shared by config
 * validation and the tarball install strategy.
 *
 * A pattern is a guide-relative path to a file or directory. A trailing `/`
 * or `/**` means the same as the bare path. A pattern matches a path that
 * equals it or starts with it plus `/`. No other wildcards are supported;
 * they are rejected rather than read as literal text, so the form can grow
 * later without changing what an existing pattern means.
 *
 * Pure module: no imports from guides/ (guides/ depends on config/, not the
 * reverse).
 */

/** Guide paths cf needs to run. No exclude may equal, contain, or sit inside one. */
export const PROTECTED_GUIDE_PATHS = ['project-guides', 'scripts'] as const;

const CONFIG_KEY = 'guide.exclude';
const UNSUPPORTED_WILDCARD = /[*?[\]]/;

export class GuideExcludeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuideExcludeError';
  }
}

function fail(entry: string, problem: string): never {
  throw new GuideExcludeError(`${CONFIG_KEY} entry "${entry}" ${problem}`);
}

function normalizeEntry(entry: string): string {
  let pattern = entry;
  if (pattern.startsWith('./')) pattern = pattern.slice(2);
  if (pattern.endsWith('/**')) pattern = pattern.slice(0, -3);
  if (pattern.endsWith('/')) pattern = pattern.slice(0, -1);
  return pattern;
}

function protectedConflict(pattern: string): string | null {
  for (const protectedPath of PROTECTED_GUIDE_PATHS) {
    if (
      pattern === protectedPath ||
      pattern.startsWith(protectedPath + '/') ||
      protectedPath.startsWith(pattern + '/')
    ) {
      return protectedPath;
    }
  }
  return null;
}

function validatePattern(entry: string, pattern: string): void {
  if (entry.startsWith('/') || entry.startsWith('\\') || /^[A-Za-z]:/.test(entry)) {
    fail(entry, 'must be a guide-relative path, not an absolute path.');
  }
  if (pattern.split(/[/\\]/).includes('..')) {
    fail(entry, 'must not contain ".." segments.');
  }
  if (UNSUPPORTED_WILDCARD.test(pattern)) {
    fail(entry, 'uses a wildcard that is not supported — only a trailing "/" or "/**" is allowed.');
  }
  if (pattern === '') {
    fail(entry, 'is empty after normalizing and would remove the whole guide.');
  }
  const conflict = protectedConflict(pattern);
  if (conflict) {
    fail(entry, `would remove ${conflict}, which cf requires.`);
  }
}

/**
 * Parse a guide.exclude value into normalized, deduplicated, sorted patterns.
 * Lenient on layout (whitespace, doubled or trailing commas, leading `./`),
 * strict on meaning. Throws GuideExcludeError naming the key and the entry.
 */
export function parseGuideExclude(raw: string): string[] {
  const patterns = new Set<string>();
  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (entry === '') continue;
    const pattern = normalizeEntry(entry);
    validatePattern(entry, pattern);
    patterns.add(pattern);
  }
  return [...patterns].sort();
}

/**
 * Return the first pattern that matches a guide-relative path (trailing `/`
 * already removed), or null when none does.
 */
export function isExcludedGuidePath(relativePath: string, patterns: readonly string[]): string | null {
  for (const pattern of patterns) {
    if (relativePath === pattern || relativePath.startsWith(pattern + '/')) {
      return pattern;
    }
  }
  return null;
}
