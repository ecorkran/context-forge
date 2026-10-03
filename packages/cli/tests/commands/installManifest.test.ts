import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cksum,
  manifestPath,
  parseManifestLine,
  readManifest,
} from '../../src/commands/installManifest.js';
import { UserError } from '../../src/utils/errors.js';

// packages/cli/tests/commands → repo root. Resolved from this file, not cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REPO_MANIFEST = path.join(REPO_ROOT, '.context-forge', 'claude.manifest');

describe('cksum', () => {
  it('reproduces every CRC and size in the repo\'s committed claude.manifest', () => {
    const lines = fs.readFileSync(REPO_MANIFEST, 'utf-8').split('\n').filter((l) => l.trim() !== '');
    expect(lines.length).toBeGreaterThan(0);

    // A listed file can be missing on disk (e.g. .claude/rules/electron.md was
    // deleted by hand after the guide wrote the manifest). That says nothing about
    // the CRC, so skip it, but require that real files were actually checked.
    let checked = 0;
    for (const line of lines) {
      const entry = parseManifestLine(line)!;
      const filePath = path.join(REPO_ROOT, ...entry.path.split('/'));
      if (!fs.existsSync(filePath)) continue;
      const bytes = fs.readFileSync(filePath);
      expect({ path: entry.path, crc: cksum(bytes), size: bytes.length }).toEqual(entry);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('empty buffer → 4294967295 (printf \'\' | cksum)', () => {
    expect(cksum(Buffer.alloc(0))).toBe(4294967295);
  });

  it('buffer longer than 255 bytes (two length bytes)', () => {
    // node -e "process.stdout.write('0123456789'.repeat(30))" | cksum → 4263250750 300
    const buffer = Buffer.from('0123456789'.repeat(30));
    expect(buffer.length).toBe(300);
    expect(cksum(buffer)).toBe(4263250750);
  });
});

describe('parseManifestLine', () => {
  it('parses a real line from the repo manifest', () => {
    expect(parseManifestLine('623352159 3464 .claude/agents/task-checker.md')).toEqual({
      crc: 623352159,
      size: 3464,
      path: '.claude/agents/task-checker.md',
    });
  });

  it('keeps spaces inside the path', () => {
    expect(parseManifestLine('1 2 .claude/rules/my rule file.md')?.path).toBe('.claude/rules/my rule file.md');
  });

  it('ignores trailing whitespace and \\r', () => {
    expect(parseManifestLine('1 2 .claude/rules/a.md  \r')).toEqual({ crc: 1, size: 2, path: '.claude/rules/a.md' });
  });

  it('returns null for a blank line', () => {
    expect(parseManifestLine('')).toBeNull();
    expect(parseManifestLine('   \r')).toBeNull();
  });

  it('throws on a non-numeric CRC', () => {
    expect(() => parseManifestLine('abc 2 .claude/rules/a.md')).toThrow();
  });

  it('throws on a missing size', () => {
    expect(() => parseManifestLine('123 .claude/rules/a.md')).toThrow();
  });
});

describe('readManifest', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-manifest-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeManifest(content: string): void {
    fs.mkdirSync(path.join(root, '.context-forge'), { recursive: true });
    fs.writeFileSync(manifestPath(root, 'claude'), content);
  }

  it('missing file → null', () => {
    expect(readManifest(root, 'claude')).toBeNull();
  });

  it('empty file → []', () => {
    writeManifest('');
    expect(readManifest(root, 'claude')).toEqual([]);
  });

  it('two valid lines → two entries', () => {
    writeManifest('1 10 .claude/rules/a.md\n2 20 .claude/rules/b.md\n');
    expect(readManifest(root, 'claude')).toEqual([
      { crc: 1, size: 10, path: '.claude/rules/a.md' },
      { crc: 2, size: 20, path: '.claude/rules/b.md' },
    ]);
  });

  it('malformed second line → UserError naming the path and line 2', () => {
    writeManifest('1 10 .claude/rules/a.md\nnot a valid line\n');
    let caught: unknown;
    try {
      readManifest(root, 'claude');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(UserError);
    expect((caught as Error).message).toContain(manifestPath(root, 'claude'));
    expect((caught as Error).message).toContain('line 2');
  });

  it('a stray .claude.manifest.tmp next to a missing manifest is not read', () => {
    fs.mkdirSync(path.join(root, '.context-forge'));
    fs.writeFileSync(path.join(root, '.context-forge', '.claude.manifest.tmp'), '1 10 .claude/rules/a.md\n');
    expect(readManifest(root, 'claude')).toBeNull();
  });

  it('reads the repo\'s real claude manifest', () => {
    const entries = readManifest(REPO_ROOT, 'claude');
    expect(entries).not.toBeNull();
    expect(entries!.length).toBeGreaterThan(0);
  });
});
