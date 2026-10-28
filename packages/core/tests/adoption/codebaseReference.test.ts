import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  PATH_CHECK_MESSAGES,
  PATH_CHECK_REASONS,
  PathCheckError,
  normalizePathFieldValue,
  resolveComprehensionPath,
} from '../../src/adoption/index.js';

const DOC = 'project-documents/user/analysis/700-analysis.comprehension.md';
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
