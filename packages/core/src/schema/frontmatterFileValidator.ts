import { join, resolve, relative, isAbsolute } from 'node:path';
import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { validateFrontmatter, type FrontmatterFinding } from './frontmatterSchema.js';
import { parseFrontmatter } from '../introspection/parsers/frontmatterParser.js';

/** Directories under project-documents/user/ to scan for methodology documents. */
export const DOC_SCAN_DIRS = [
  'architecture',
  'slices',
  'tasks',
  'project-guides',
  'reviews',
  'analysis',
];

/**
 * What happened to a caller-supplied path. Only `Checked` contributes to
 * `filesChecked`; every other value is a skip that used to be silent (#92/#96).
 */
export const PathOutcome = {
  Checked: 'checked',
  SkippedOutOfScope: 'skipped-out-of-scope',
  SkippedNotMarkdown: 'skipped-not-markdown',
  SkippedNotFound: 'skipped-not-found',
  SkippedNoFrontmatter: 'skipped-no-frontmatter',
} as const;

export type PathOutcome = (typeof PathOutcome)[keyof typeof PathOutcome];

/** The fate of one caller-supplied path. */
export interface PathResult {
  /** The path exactly as the caller supplied it. */
  inputPath: string;
  /** Absolute resolved path. Present even for skips, so a caller can see what was tried. */
  resolvedPath: string;
  outcome: PathOutcome;
}

export interface FrontmatterFileValidationResult {
  findings: FrontmatterFinding[];
  filesChecked: number;
  /**
   * Per-path outcomes, in caller order. Present only for explicit-path calls —
   * a full walk has no caller-supplied paths to report on.
   */
  pathResults?: PathResult[];
  /** The document root actually scanned, so a caller can tell which checkout it was. */
  documentRoot: string;
}

/** Discover all .md documents across the methodology scan directories. */
export async function discoverAllDocuments(projectPath: string): Promise<string[]> {
  const userDir = join(projectPath, 'project-documents/user');
  const allPaths: string[] = [];

  for (const subdir of DOC_SCAN_DIRS) {
    const dir = join(userDir, subdir);
    try {
      const files = await readdir(dir);
      for (const f of files) {
        if (f.endsWith('.md')) {
          allPaths.push(join(dir, f));
        }
      }
    } catch {
      // Directory may not exist — skip
    }
  }

  return allPaths;
}

/**
 * Resolve an explicit path list, recording what happened to each entry.
 *
 * Paths that are out-of-root, non-.md, or nonexistent are not validated (a
 * staged-file list legitimately contains deletions), but each now carries a
 * reason rather than vanishing — a clean pass over nothing is indistinguishable
 * from a clean pass over everything otherwise (#92/#96).
 *
 * Containment is checked against the document root, not the scan-dir list, so
 * a file under e.g. user/notes/ is kept even though the default walk would not
 * visit it. Relative paths resolve against process.cwd(), which is not
 * necessarily the document root.
 */
function resolveExplicitPaths(paths: string[], documentRoot: string): PathResult[] {
  const resolvedRoot = resolve(documentRoot);

  return paths.map((inputPath) => {
    const resolvedPath = isAbsolute(inputPath)
      ? inputPath
      : resolve(process.cwd(), inputPath);

    if (!inputPath.endsWith('.md')) {
      return { inputPath, resolvedPath, outcome: PathOutcome.SkippedNotMarkdown };
    }
    const rel = relative(resolvedRoot, resolvedPath);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      return { inputPath, resolvedPath, outcome: PathOutcome.SkippedOutOfScope };
    }
    if (!existsSync(resolvedPath)) {
      return { inputPath, resolvedPath, outcome: PathOutcome.SkippedNotFound };
    }
    // Provisional: the frontmatter parse in validateFrontmatterFiles may still
    // downgrade this to SkippedNoFrontmatter.
    return { inputPath, resolvedPath, outcome: PathOutcome.Checked };
  });
}

/**
 * Validate frontmatter across a project's methodology documents.
 *
 * No paths: walks the six scan directories under project-documents/user/,
 * exactly as `cf check` Rule 12 does, and reports no per-path list.
 * Explicit paths: validated only if they resolve to an existing .md file
 * inside the document root (project-documents/user/). Everything else is
 * reported in `pathResults` with the reason it was skipped — nothing is
 * dropped silently (#92/#96).
 * Files whose frontmatter is absent or unparseable are not counted in
 * filesChecked (matching Rule 12) and are reported as
 * `skipped-no-frontmatter`.
 */
export async function validateFrontmatterFiles(
  projectPath: string,
  paths?: string[],
  options?: { projectName?: string },
): Promise<FrontmatterFileValidationResult> {
  const documentRoot = join(projectPath, 'project-documents/user');
  const findings: FrontmatterFinding[] = [];
  let filesChecked = 0;

  if (!paths) {
    // Full walk: no caller-supplied paths, so no per-path report.
    for (const docPath of await discoverAllDocuments(projectPath)) {
      const fm = await parseFrontmatter(docPath);
      if (!fm.found) continue;

      filesChecked++;
      findings.push(
        ...validateFrontmatter(docPath, fm.data, { projectName: options?.projectName }),
      );
    }
    return { findings, filesChecked, documentRoot };
  }

  const pathResults = resolveExplicitPaths(paths, documentRoot);

  for (const result of pathResults) {
    if (result.outcome !== PathOutcome.Checked) continue;

    const fm = await parseFrontmatter(result.resolvedPath);
    if (!fm.found) {
      result.outcome = PathOutcome.SkippedNoFrontmatter;
      continue;
    }

    filesChecked++;
    findings.push(
      ...validateFrontmatter(result.resolvedPath, fm.data, { projectName: options?.projectName }),
    );
  }

  return { findings, filesChecked, pathResults, documentRoot };
}
