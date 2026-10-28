import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  COMPREHENSION_FACT,
  DOCS_MAP_FACT,
  PATH_CHECK_MESSAGES,
  PATH_CHECK_REASONS,
  PathCheckError,
  normalizePathFieldValue,
  readCodebaseReference,
  resolveComprehensionPath,
} from '../../src/adoption/index.js';
import { writeDocsMap } from '../../src/docs-map/index.js';
import { DOCS_MAP_BEGIN } from '../../src/docs-map/docsMapFile.js';

const DOC = 'project-documents/user/analysis/700-analysis.comprehension.md';
const runningAsRoot = process.getuid?.() === 0;
const INSIDE_ONLY = { requireInsideRoot: true };
const ANYWHERE = { requireInsideRoot: false };

let base: string;
let root: string;
let outsideFile: string;

function touch(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '# doc\n');
}

/** Runs `fn` and returns the PathCheckError it throws; fails the test if it does not throw one. */
function pathCheckError(fn: () => unknown): PathCheckError {
  try {
    fn();
  } catch (error) {
    if (error instanceof PathCheckError) return error;
    throw error;
  }
  throw new Error('expected a PathCheckError');
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'cf-codebase-ref-'));
  root = join(base, 'root');
  outsideFile = join(base, 'outside.md');
  touch(join(root, DOC));
  touch(outsideFile);
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('resolveComprehensionPath', () => {
  it('a missing path raises the missing reason and names the resolved path', () => {
    const error = pathCheckError(() => resolveComprehensionPath(root, 'no/such/file.md', ANYWHERE));
    expect(error.reason).toBe(PATH_CHECK_REASONS.missing);
    expect(error.message).toBe(PATH_CHECK_MESSAGES.missing(join(root, 'no/such/file.md')));
  });

  it('a directory raises the directory reason', () => {
    const error = pathCheckError(() =>
      resolveComprehensionPath(root, 'project-documents/user/analysis', ANYWHERE),
    );
    expect(error.reason).toBe(PATH_CHECK_REASONS.directory);
  });

  it('a relative path inside the root resolves to the absolute path', () => {
    expect(resolveComprehensionPath(root, DOC, INSIDE_ONLY)).toBe(join(root, DOC));
  });

  it('an absolute path inside the root is accepted', () => {
    expect(resolveComprehensionPath(root, join(root, DOC), INSIDE_ONLY)).toBe(join(root, DOC));
  });

  it('a path outside the root is rejected when containment is on', () => {
    const error = pathCheckError(() => resolveComprehensionPath(root, outsideFile, INSIDE_ONLY));
    expect(error.reason).toBe(PATH_CHECK_REASONS.outsideRoot);
  });

  it('a path outside the root is accepted when containment is off', () => {
    expect(resolveComprehensionPath(root, outsideFile, ANYWHERE)).toBe(outsideFile);
  });

  it('a missing path reports missing even when it is outside the root', () => {
    const error = pathCheckError(() => resolveComprehensionPath(root, join(base, 'nope.md'), INSIDE_ONLY));
    expect(error.reason).toBe(PATH_CHECK_REASONS.missing);
  });

  it('a symlinked spelling of the root still counts as inside', () => {
    const alias = join(base, 'alias');
    symlinkSync(root, alias);
    expect(resolveComprehensionPath(root, join(alias, DOC), INSIDE_ONLY)).toBe(join(alias, DOC));
  });

  it('a symlink inside the root that points outside is rejected', () => {
    symlinkSync(outsideFile, join(root, 'link.md'));
    const error = pathCheckError(() => resolveComprehensionPath(root, 'link.md', INSIDE_ONLY));
    expect(error.reason).toBe(PATH_CHECK_REASONS.outsideRoot);
  });

  it('a sibling directory sharing the root name prefix is outside the root', () => {
    const sibling = join(base, 'root-extra', 'doc.md');
    touch(sibling);
    const error = pathCheckError(() => resolveComprehensionPath(root, sibling, INSIDE_ONLY));
    expect(error.reason).toBe(PATH_CHECK_REASONS.outsideRoot);
  });
});

describe('normalizePathFieldValue', () => {
  it('stores an absolute input root-relative with / separators', () => {
    expect(normalizePathFieldValue(root, join(root, DOC))).toBe(DOC);
  });

  it('keeps a relative input root-relative', () => {
    expect(normalizePathFieldValue(root, DOC)).toBe(DOC);
  });

  it('normalizes a ./ prefix and inner .. segments', () => {
    expect(normalizePathFieldValue(root, `./project-documents/user/../user/analysis/700-analysis.comprehension.md`)).toBe(DOC);
  });

  it('stores a path given through a symlinked spelling of the root root-relative', () => {
    const alias = join(base, 'alias');
    symlinkSync(root, alias);
    expect(normalizePathFieldValue(root, join(alias, DOC))).toBe(DOC);
  });

  it('rejects a ..-relative path that lands outside the root', () => {
    const error = pathCheckError(() => normalizePathFieldValue(root, '../outside.md'));
    expect(error.reason).toBe(PATH_CHECK_REASONS.outsideRoot);
  });

  it('the empty string clears the field', () => {
    expect(normalizePathFieldValue(root, '')).toBe('');
  });

  it('never produces a backslash', () => {
    expect(normalizePathFieldValue(root, join(root, DOC))).not.toContain('\\');
  });
});

describe('readCodebaseReference (D5)', () => {
  const NAME = 'acme';
  const BOTH = { comprehension: true, docsMap: true };
  const MAP = 'project-documents/user/architecture/050-docs-map.acme.md';

  /** Every file under root with its size and mtime, to prove a call changed nothing. */
  function snapshot(dir: string): Record<string, string> {
    const entries: Record<string, string> = {};
    for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = join(entry.parentPath, entry.name);
      const stats = statSync(file);
      entries[file] = `${stats.size}:${stats.mtimeMs}`;
    }
    return entries;
  }

  describe('comprehension', () => {
    it('is none when no path is registered', async () => {
      const facts = await readCodebaseReference(root, NAME, '', BOTH);
      expect(facts.comprehension).toEqual({ kind: COMPREHENSION_FACT.None });
    });

    it('is present for a readable file, with a root-relative path', async () => {
      const facts = await readCodebaseReference(root, NAME, DOC, BOTH);
      expect(facts.comprehension).toEqual({ kind: COMPREHENSION_FACT.Present, path: DOC });
    });

    it('is missing for a registered path that is gone, with the fs reason', async () => {
      const facts = await readCodebaseReference(root, NAME, 'gone/file.md', BOTH);
      expect(facts.comprehension).toEqual({ kind: COMPREHENSION_FACT.Missing, path: 'gone/file.md', reason: 'ENOENT' });
    });

    it('is not readable for a directory', async () => {
      const facts = await readCodebaseReference(root, NAME, 'project-documents/user/analysis', BOTH);
      expect(facts.comprehension?.kind).toBe(COMPREHENSION_FACT.NotReadable);
    });

    it.skipIf(runningAsRoot)('is not readable for a file without read permission, with its code', async () => {
      const locked = join(root, 'locked.md');
      touch(locked);
      chmodSync(locked, 0o000);
      try {
        const facts = await readCodebaseReference(root, NAME, 'locked.md', BOTH);
        expect(facts.comprehension).toEqual({ kind: COMPREHENSION_FACT.NotReadable, path: 'locked.md', reason: 'EACCES' });
      } finally {
        chmodSync(locked, 0o644);
      }
    });
  });

  describe('docs map', () => {
    it('is none when there is no map file', async () => {
      const facts = await readCodebaseReference(root, NAME, '', BOTH);
      expect(facts.docsMap).toEqual({ kind: DOCS_MAP_FACT.None });
    });

    it('is current for a map that was just written, with a root-relative path', async () => {
      await writeDocsMap(root, NAME);
      const facts = await readCodebaseReference(root, NAME, '', BOTH);
      expect(facts.docsMap).toEqual({ kind: DOCS_MAP_FACT.Current, path: MAP });
    });

    it('is out of date once a doc is added', async () => {
      await writeDocsMap(root, NAME);
      touch(join(root, 'docs/guide.md'));
      const facts = await readCodebaseReference(root, NAME, '', BOTH);
      expect(facts.docsMap).toEqual({ kind: DOCS_MAP_FACT.OutOfDate, path: MAP });
    });

    it('cannot be checked when the markers are broken, and says the markers are the problem', async () => {
      touch(join(root, MAP));
      writeFileSync(join(root, MAP), `# M\n${DOCS_MAP_BEGIN}\nx\n`);
      const facts = await readCodebaseReference(root, NAME, '', BOTH);
      expect(facts.docsMap).toMatchObject({ kind: DOCS_MAP_FACT.CannotCheck, path: MAP, markers: true });
    });

    it.skipIf(runningAsRoot)('cannot be checked when the docs tree is unreadable, and markers are not blamed', async () => {
      const locked = join(root, 'docs/locked.md');
      touch(locked);
      chmodSync(locked, 0o000);
      try {
        const facts = await readCodebaseReference(root, NAME, '', BOTH);
        expect(facts.docsMap).toMatchObject({ kind: DOCS_MAP_FACT.CannotCheck, path: MAP, markers: false });
      } finally {
        chmodSync(locked, 0o644);
      }
    });

    it('cannot be checked when the project name cannot form a map path', async () => {
      const facts = await readCodebaseReference(root, 'a/b', '', BOTH);
      expect(facts.docsMap).toMatchObject({ kind: DOCS_MAP_FACT.CannotCheck, path: null, markers: false });
    });
  });

  it('produces no fact for a variable the profile does not list', async () => {
    const facts = await readCodebaseReference(root, NAME, DOC, { comprehension: false, docsMap: false });
    expect(facts.comprehension).toBeUndefined();
    expect(facts.docsMap).toBeUndefined();
    const onlyMap = await readCodebaseReference(root, NAME, DOC, { comprehension: false, docsMap: true });
    expect(onlyMap.comprehension).toBeUndefined();
    expect(onlyMap.docsMap).toBeDefined();
  });

  it('changes no file under the root', async () => {
    await writeDocsMap(root, NAME);
    touch(join(root, 'docs/guide.md'));
    const before = snapshot(root);
    await readCodebaseReference(root, NAME, DOC, BOTH);
    await readCodebaseReference(root, NAME, 'gone.md', BOTH);
    expect(snapshot(root)).toEqual(before);
  });
});
