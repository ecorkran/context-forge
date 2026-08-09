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

export interface FrontmatterFileValidationResult {
  findings: FrontmatterFinding[];
  filesChecked: number;
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
 * Resolve an explicit path list to the in-root, existing .md files it
 * contains. Everything else — out-of-root, non-.md, nonexistent — is
 * silently skipped (a staged-file list legitimately contains deletions).
 * Containment is checked against the document root, not the scan-dir list,
 * so a file under e.g. user/notes/ is kept even though the default walk
 * would not visit it.
 */
function resolveExplicitPaths(paths: string[], documentRoot: string): string[] {
  const resolvedRoot = resolve(documentRoot);
  const kept: string[] = [];

  for (const p of paths) {
    if (!p.endsWith('.md')) continue;
    const absolute = isAbsolute(p) ? p : resolve(process.cwd(), p);
    const rel = relative(resolvedRoot, absolute);
    if (rel.startsWith('..') || isAbsolute(rel)) continue;
    if (!existsSync(absolute)) continue;
    kept.push(absolute);
  }

  return kept;
}

/**
 * Validate frontmatter across a project's methodology documents.
 *
 * No paths: walks the six scan directories under project-documents/user/,
 * exactly as `cf check` Rule 12 does.
 * Explicit paths: kept only if they resolve to an existing .md file inside
 * the document root (project-documents/user/); everything else is silently
 * skipped.
 * Files whose frontmatter is absent or unparseable are skipped (matching
 * Rule 12) and are not counted in filesChecked.
 */
export async function validateFrontmatterFiles(
  projectPath: string,
  paths?: string[],
  options?: { projectName?: string },
): Promise<FrontmatterFileValidationResult> {
  const documentRoot = join(projectPath, 'project-documents/user');
  const documents = paths
    ? resolveExplicitPaths(paths, documentRoot)
    : await discoverAllDocuments(projectPath);

  const findings: FrontmatterFinding[] = [];
  let filesChecked = 0;

  for (const docPath of documents) {
    const fm = await parseFrontmatter(docPath);
    if (!fm.found) continue;

    filesChecked++;
    findings.push(...validateFrontmatter(docPath, fm.data, { projectName: options?.projectName }));
  }

  return { findings, filesChecked };
}
