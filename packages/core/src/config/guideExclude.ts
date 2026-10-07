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

/** Guide paths cf needs to run. No exclude may equal or contain one, or sit inside one except as carved out below. */
export const PROTECTED_GUIDE_PATHS = ['project-guides', 'scripts'] as const;

/**
 * Protected subtrees whose children, but not the subtree itself, may be
 * excluded. Lint config is read per language, and only for languages the
 * project uses; the directory itself must exist.
 */
export const EXCLUDABLE_GUIDE_SUBTREES = ['project-guides/lint'] as const;

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

/** True when a guide-relative path equals `base` or sits inside it. */
function isWithin(path: string, base: string): boolean {
  return path === base || path.startsWith(base + '/');
}

/** Why a pattern may not be excluded, or null when it is allowed. */
function protectedProblem(pattern: string): string | null {
  for (const protectedPath of PROTECTED_GUIDE_PATHS) {
    if (isWithin(protectedPath, pattern)) {
      return `would remove ${protectedPath}, which cf requires.`;
    }
    if (!isWithin(pattern, protectedPath)) continue;

    const carveOut = EXCLUDABLE_GUIDE_SUBTREES.find((subtree) => isWithin(pattern, subtree));
    if (carveOut === undefined) {
      return (
        `is inside ${protectedPath}, which cf requires. ` +
        `Only subpaths of ${EXCLUDABLE_GUIDE_SUBTREES.join(', ')} can be excluded.`
      );
    }
    if (pattern === carveOut) {
      const directory = carveOut.split('/').at(-1);
      return (
        `would remove the whole ${directory} directory. ` +
        `Exclude individual languages instead, e.g. "${carveOut}/<language>".`
      );
    }
    return null;
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
  const problem = protectedProblem(pattern);
  if (problem) {
    fail(entry, problem);
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
 * Every pattern that matches a guide-relative path (trailing `/` already
 * removed). All of them, not the first, so overlapping patterns such as
 * `tool-guides` and `tool-guides/x` each count as having matched.
 */
export function matchingGuidePatterns(relativePath: string, patterns: readonly string[]): string[] {
  return patterns.filter((pattern) => isWithin(relativePath, pattern));
}

/** True when two parsed (sorted, deduplicated) exclude lists are identical. */
export function sameExcludeList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((pattern, i) => pattern === b[i]);
}
