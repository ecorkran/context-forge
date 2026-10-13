import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cksum,
  InstallManifest,
  manifestPath,
  parseManifestLine,
  readManifest,
} from '../../src/ideInstall/manifest.js';
import { Printer } from '../../src/ideInstall/output.js';
import { FIXTURE_DATA } from './harness.js';
import { UserError } from '../../src/utils/errors.js';

// packages/cli/tests/commands → repo root. Resolved from this file, not cwd.
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const REPO_MANIFEST = path.join(REPO_ROOT, '.context-forge', 'claude.manifest');

describe('cksum', () => {
  it('matches cksum on the guide fixture analyze-SKILL.md', () => {
    const buffer = fs.readFileSync(path.join(FIXTURE_DATA, 'analyze-SKILL.md'));
    expect(`${cksum(buffer)} ${buffer.length}`).toBe('4163870229 9896');
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

describe('InstallManifest', () => {
  let root: string;
  let stdout: string;
  let manifest: InstallManifest;

  const rule = (name: string): string => path.join(root, '.claude', 'rules', name);
  const write = (file: string, text: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  };
  const entry = (text: string, rel: string): string => `${cksum(Buffer.from(text))} ${text.length} ${rel}`;
  const fresh = (): InstallManifest => {
    stdout = '';
    return new InstallManifest(root, 'claude', new Printer({ stdout: (t) => (stdout += t), stderr: () => {} }));
  };
  const manifestText = (): string => fs.readFileSync(manifestPath(root, 'claude'), 'utf-8');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'install-manifest-'));
    fs.mkdirSync(path.join(root, '.claude', 'rules'), { recursive: true });
    manifest = fresh();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes a new file and lists it, sorted by path', () => {
    expect(manifest.installFile(Buffer.from('b\n'), rule('b.md'))).toBe(true);
    expect(manifest.installFile(Buffer.from('a\n'), rule('a.md'))).toBe(true);
    manifest.finish();
    expect(manifestText()).toBe(
      `${entry('a\n', '.claude/rules/a.md')}\n${entry('b\n', '.claude/rules/b.md')}\n`,
    );
  });

  it('adopts a byte-equal file with no manifest', () => {
    write(rule('a.md'), 'same\n');
    expect(manifest.installFile(Buffer.from('same\n'), rule('a.md'))).toBe(true);
    expect(stdout).toBe('');
  });

  it('skips a differing file when there is no manifest', () => {
    write(rule('a.md'), 'mine\n');
    expect(manifest.installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(false);
    expect(fs.readFileSync(rule('a.md'), 'utf-8')).toBe('mine\n');
    expect(stdout).toContain('no install manifest shows the guide wrote it');
  });

  it('skips a differing file the old manifest does not list', () => {
    write(manifestPath(root, 'claude'), `${entry('x\n', '.claude/rules/other.md')}\n`);
    write(rule('a.md'), 'mine\n');
    expect(fresh().installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(false);
    expect(stdout).toContain('was not installed by the guide');
  });

  it('overwrites an unedited listed file, and keeps an edited one with its old entry', () => {
    const old = entry('v1\n', '.claude/rules/a.md');
    write(manifestPath(root, 'claude'), `${old}\n`);
    write(rule('a.md'), 'v1\n');
    let run = fresh();
    expect(run.installFile(Buffer.from('v2\n'), rule('a.md'))).toBe(true);

    write(manifestPath(root, 'claude'), `${old}\n`);
    write(rule('a.md'), 'edited\n');
    run = fresh();
    expect(run.installFile(Buffer.from('v3\n'), rule('a.md'))).toBe(false);
    run.finish();
    expect(fs.readFileSync(rule('a.md'), 'utf-8')).toBe('edited\n');
    expect(manifestText()).toBe(`${old}\n`);
    expect(stdout).toContain('Kept .claude/rules/a.md: edited since it was installed');
  });

  it('prunes a stale unedited file and keeps a stale edited one', () => {
    write(
      manifestPath(root, 'claude'),
      `${entry('gone\n', '.claude/rules/gone.md')}\n${entry('orig\n', '.claude/rules/edited.md')}\n`,
    );
    write(rule('gone.md'), 'gone\n');
    write(rule('edited.md'), 'changed\n');
    fresh().finish();
    expect(fs.existsSync(rule('gone.md'))).toBe(false);
    expect(fs.existsSync(rule('edited.md'))).toBe(true);
    expect(stdout).toContain('🧹 Removed .claude/rules/gone.md (no longer installed by the guide)');
    expect(stdout).toContain('Kept .claude/rules/edited.md: no longer installed by the guide');
    expect(manifestText()).toBe('');
  });

  it('removes emptied folders below two levels, never the install root', () => {
    const skill = path.join(root, '.claude', 'skills', 'old', 'deep', 'SKILL.md');
    write(skill, 's\n');
    write(manifestPath(root, 'claude'), `${entry('s\n', '.claude/skills/old/deep/SKILL.md')}\n`);
    fresh().finish();
    expect(fs.existsSync(path.join(root, '.claude', 'skills', 'old'))).toBe(false);
    expect(fs.existsSync(path.join(root, '.claude', 'skills'))).toBe(true);
  });

  it('removes a legacy file that matches a hard-coded entry, with no manifest', () => {
    const legacy = path.join(root, '.claude', 'skills', 'analyze', 'SKILL.md');
    write(legacy, fs.readFileSync(path.join(FIXTURE_DATA, 'analyze-SKILL.md'), 'utf-8'));
    manifest.finish();
    expect(fs.existsSync(legacy)).toBe(false);
  });
});
