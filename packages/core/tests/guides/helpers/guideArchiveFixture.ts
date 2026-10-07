// Builds real guide .tgz archives in temp directories for tarball tests.
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, statSync, openSync, readSync, closeSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { create } from 'tar';

/** The single top-level directory the fixture archive is rooted in. */
export const FIXTURE_ROOT = 'ai-project-guide';

/** Default file set: two lint languages, a rule file and a script. */
export const DEFAULT_GUIDE_FILES: Readonly<Record<string, string>> = {
  'project-guides/lint/csharp/a.txt': 'csharp lint\n',
  'project-guides/lint/python/b.txt': 'python lint\n',
  'project-guides/rules/r.md': '# rule\n',
  'scripts/s.sh': '#!/bin/sh\n',
};

export interface GuideArchiveOptions {
  /** Relative path (under the archive root) to file content. Defaults to DEFAULT_GUIDE_FILES. */
  files?: Readonly<Record<string, string>>;
  /** Adds a second top-level directory holding one file, for the multi-root case. */
  secondRoot?: string;
  /** Existing directory to build in. Defaults to a fresh temp directory. */
  dir?: string;
  /** Archive file name. Defaults to guide.tgz. */
  fileName?: string;
}

/** Create a temp directory under the OS temp dir. Callers remove it themselves. */
export function makeTempDir(prefix = 'cf-guide-fixture-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeTree(base: string, root: string, files: Readonly<Record<string, string>>): void {
  for (const [relative, content] of Object.entries(files)) {
    const full = join(base, root, relative);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
}

/** Build a real .tgz and return its absolute path. */
export async function buildGuideArchive(options: GuideArchiveOptions = {}): Promise<string> {
  const dir = options.dir ?? makeTempDir();
  const files = options.files ?? DEFAULT_GUIDE_FILES;
  const stage = mkdtempSync(join(dir, 'stage-'));
  const roots = [FIXTURE_ROOT];

  writeTree(stage, FIXTURE_ROOT, files);
  if (options.secondRoot) {
    writeTree(stage, options.secondRoot, { 'extra.txt': 'extra\n' });
    roots.push(options.secondRoot);
  }

  const archivePath = join(dir, options.fileName ?? 'guide.tgz');
  await create({ gzip: true, file: archivePath, cwd: stage }, roots);
  return archivePath;
}

/** Write a deliberately truncated copy of an archive (the corrupt case) and return its path. */
export function truncateArchive(archivePath: string, truncatedPath = `${archivePath}.truncated.tgz`): string {
  const size = statSync(archivePath).size;
  const keep = Math.max(1, Math.floor(size / 2));
  const buffer = Buffer.alloc(keep);
  const fd = openSync(archivePath, 'r');
  try {
    readSync(fd, buffer, 0, keep, 0);
  } finally {
    closeSync(fd);
  }
  writeFileSync(truncatedPath, buffer);
  return truncatedPath;
}

/** Read a file's UTF-8 content; small convenience for assertions. */
export function readText(path: string): string {
  return readFileSync(path, 'utf-8');
}
