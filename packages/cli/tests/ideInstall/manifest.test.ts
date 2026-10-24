import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  cksum,
  InstallManifest,
  manifestPath,
  readInstalledPaths,
} from '../../src/ideInstall/manifest.js';
import { Printer } from '../../src/ideInstall/output.js';
import { FIXTURE_DATA, FIXTURE_GUIDE, makeProject, makeTmpDir, run } from './harness.js';


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
  const fresh = (force = false): InstallManifest => {
    stdout = '';
    return new InstallManifest(root, 'claude', new Printer({ stdout: (t) => (stdout += t), stderr: () => {} }), force);
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

  describe('force', () => {
    const backup = (): string => rule('a.md') + '.pre-context-forge';

    it('replaces a differing file with no manifest, backs it up, and lists it', () => {
      write(rule('a.md'), 'mine\n');
      const run = fresh(true);
      expect(run.installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(true);
      run.finish();
      expect(fs.readFileSync(rule('a.md'), 'utf-8')).toBe('guide\n');
      expect(fs.readFileSync(backup(), 'utf-8')).toBe('mine\n');
      expect(manifestText()).toBe(`${entry('guide\n', '.claude/rules/a.md')}\n`);
      expect(stdout).toContain('Backed up .claude/rules/a.md');
    });

    it('replaces an unlisted file and a file edited since install', () => {
      write(manifestPath(root, 'claude'), `${entry('v1\n', '.claude/rules/b.md')}\n`);
      write(rule('a.md'), 'unlisted\n');
      write(rule('b.md'), 'edited\n');
      const run = fresh(true);
      expect(run.installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(true);
      expect(run.installFile(Buffer.from('v2\n'), rule('b.md'))).toBe(true);
      expect(fs.readFileSync(rule('b.md'), 'utf-8')).toBe('v2\n');
      expect(fs.readFileSync(rule('b.md') + '.pre-context-forge', 'utf-8')).toBe('edited\n');
    });

    it('keeps one backup, the latest replaced content', () => {
      write(rule('a.md'), 'first\n');
      fresh(true).installFile(Buffer.from('guide\n'), rule('a.md'));
      write(rule('a.md'), 'second\n');
      fresh(true).installFile(Buffer.from('guide\n'), rule('a.md'));
      expect(fs.readFileSync(backup(), 'utf-8')).toBe('second\n');
    });

    it('writes no backup when the file is new or already identical', () => {
      expect(fresh(true).installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(true);
      expect(fresh(true).installFile(Buffer.from('guide\n'), rule('a.md'))).toBe(true);
      expect(fs.existsSync(backup())).toBe(false);
    });
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

  it('never deletes outside the project, whatever the manifest says', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'install-manifest-outside-'));
    try {
      write(path.join(outside, 'victim.txt'), 'v\n');
      write(path.join(outside, 'linked', 'victim.txt'), 'v\n');
      fs.symlinkSync(path.join(outside, 'linked'), path.join(root, '.claude', 'escape'));
      // An absolute path is re-rooted by path.join, so only `..` and symlinks can escape.
      const escapes = [
        path.relative(root, path.join(outside, 'victim.txt')),
        '.claude/escape/victim.txt',
      ];
      write(manifestPath(root, 'claude'), escapes.map((rel) => entry('v\n', rel)).join('\n') + '\n');
      fresh().finish();
      expect(fs.existsSync(path.join(outside, 'victim.txt'))).toBe(true);
      expect(fs.existsSync(path.join(outside, 'linked', 'victim.txt'))).toBe(true);
      expect(stdout.match(/path resolves outside the project/g)).toHaveLength(escapes.length);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
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

describe('readInstalledPaths', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-paths-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const writeManifest = (name: string, text: string): void => {
    fs.mkdirSync(path.join(root, '.context-forge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.context-forge', name), text);
  };

  it('returns [] when .context-forge/ is missing', () => {
    expect(readInstalledPaths(root)).toEqual([]);
  });

  it('parses a manifest written by a real setup-ide claude run', () => {
    const tmp = makeTmpDir();
    try {
      const { project, guide } = makeProject(tmp, FIXTURE_GUIDE);
      expect(run(guide, project, ['claude']).code).toBe(0);
      const installed = readInstalledPaths(project);
      expect(installed.length).toBeGreaterThan(0);
      expect(installed).toContain('.claude/rules/scoped-a.md');
      expect(installed).not.toContain('CLAUDE.md');
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('merges several manifests and ignores other files', () => {
    writeManifest('claude.manifest', '1 2 .claude/rules/a.md\n');
    writeManifest('cursor.manifest', '3 4 .cursor/rules/b.mdc\n');
    writeManifest('notes.txt', 'not a manifest');
    expect(readInstalledPaths(root)).toEqual(['.claude/rules/a.md', '.cursor/rules/b.mdc']);
  });

  it('keeps a path containing spaces whole', () => {
    writeManifest('claude.manifest', '1 2 .claude/rules/my rule.md\n');
    expect(readInstalledPaths(root)).toEqual(['.claude/rules/my rule.md']);
  });

  it('throws naming the manifest for a line with fewer than three fields', () => {
    writeManifest('claude.manifest', '1 2 ok.md\n12345 short\n');
    expect(() => readInstalledPaths(root)).toThrow(/claude\.manifest.*malformed/);
  });
});
