import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cksum, type ManifestEntry } from '../../src/commands/installManifest.js';
import { pruneStaleFiles } from '../../src/commands/worktreePropagation.js';

// Real temp dirs throughout: this file must not share node:fs mocks with
// worktreePropagation.test.ts (vi.mock is file-scoped).

let sandbox: string;

beforeEach(() => {
  sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-prune-'));
});

afterEach(() => {
  fs.rmSync(sandbox, { recursive: true, force: true });
});

function mkdir(...segments: string[]): string {
  const dir = path.join(sandbox, ...segments);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Writes `<root>/<rel>`, creating parent dirs. */
function writeFile(root: string, rel: string, content: string): void {
  const abs = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

/** An exact manifest entry for `content` at `rel`. */
function entry(rel: string, content: string): ManifestEntry {
  const bytes = Buffer.from(content);
  return { crc: cksum(bytes), size: bytes.length, path: rel };
}

function exists(root: string, rel: string): boolean {
  return fs.existsSync(path.join(root, ...rel.split('/')));
}

describe('pruneStaleFiles', () => {
  let wt: string;

  beforeEach(() => {
    wt = mkdir('wt');
  });

  it('removes a dropped, unedited file', () => {
    writeFile(wt, '.claude/agents/old.md', 'guide v1');

    const result = pruneStaleFiles(wt, [entry('.claude/agents/old.md', 'guide v1')], []);

    expect(result).toEqual({ removed: ['.claude/agents/old.md'], kept: [] });
    expect(exists(wt, '.claude/agents/old.md')).toBe(false);
  });

  it('keeps a dropped file that was edited, with reason "edited"', () => {
    writeFile(wt, '.claude/agents/old.md', 'guide v1 plus my edit');

    const result = pruneStaleFiles(wt, [entry('.claude/agents/old.md', 'guide v1')], []);

    expect(result).toEqual({ removed: [], kept: [{ path: '.claude/agents/old.md', reason: 'edited' }] });
    expect(exists(wt, '.claude/agents/old.md')).toBe(true);
  });

  it('leaves a file that is in no baseline', () => {
    writeFile(wt, '.claude/rules/mine.md', 'user rule');

    const result = pruneStaleFiles(wt, [], []);

    expect(result).toEqual({ removed: [], kept: [] });
    expect(exists(wt, '.claude/rules/mine.md')).toBe(true);
  });

  it('leaves a file still listed in the new root manifest', () => {
    writeFile(wt, '.claude/rules/kept.md', 'v1');

    const result = pruneStaleFiles(wt, [entry('.claude/rules/kept.md', 'v1')], [entry('.claude/rules/kept.md', 'v2')]);

    expect(result).toEqual({ removed: [], kept: [] });
    expect(exists(wt, '.claude/rules/kept.md')).toBe(true);
  });

  it('removes a file matching the second of two baseline entries for one path', () => {
    writeFile(wt, '.claude/agents/old.md', 'root snapshot version');
    const baseline = [entry('.claude/agents/old.md', 'worktree version'), entry('.claude/agents/old.md', 'root snapshot version')];

    const result = pruneStaleFiles(wt, baseline, []);

    expect(result.removed).toEqual(['.claude/agents/old.md']);
    expect(exists(wt, '.claude/agents/old.md')).toBe(false);
  });

  it('keeps ../ and absolute paths with reason "containment"; nothing outside is touched', () => {
    const outsidePath = path.join(sandbox, 'outside.md');
    fs.writeFileSync(outsidePath, 'sentinel');

    const result = pruneStaleFiles(wt, [entry('../outside.md', 'sentinel'), entry(outsidePath, 'sentinel')], []);

    expect(result).toEqual({
      removed: [],
      kept: [
        { path: '../outside.md', reason: 'containment' },
        { path: outsidePath, reason: 'containment' },
      ],
    });
    expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('sentinel');
  });

  it('keeps a file reached through a symlinked directory that points outside the worktree', () => {
    const outsideDir = mkdir('outside-agents');
    fs.writeFileSync(path.join(outsideDir, 'old.md'), 'guide v1');
    fs.mkdirSync(path.join(wt, '.claude'));
    fs.symlinkSync(outsideDir, path.join(wt, '.claude', 'agents'));

    const result = pruneStaleFiles(wt, [entry('.claude/agents/old.md', 'guide v1')], []);

    expect(result).toEqual({ removed: [], kept: [{ path: '.claude/agents/old.md', reason: 'containment' }] });
    expect(fs.existsSync(path.join(outsideDir, 'old.md'))).toBe(true);
  });

  it('keeps a symlink and a directory at stale paths, with reason "non-regular"', () => {
    writeFile(wt, '.claude/agents/real.md', 'guide v1');
    fs.symlinkSync(path.join(wt, '.claude/agents/real.md'), path.join(wt, '.claude/agents/link.md'));
    fs.mkdirSync(path.join(wt, '.claude/agents/dir.md'));

    const result = pruneStaleFiles(wt, [entry('.claude/agents/link.md', 'guide v1'), entry('.claude/agents/dir.md', '')], []);

    expect(result).toEqual({
      removed: [],
      kept: [
        { path: '.claude/agents/link.md', reason: 'non-regular' },
        { path: '.claude/agents/dir.md', reason: 'non-regular' },
      ],
    });
    expect(fs.lstatSync(path.join(wt, '.claude/agents/link.md')).isSymbolicLink()).toBe(true);
    expect(exists(wt, '.claude/agents/real.md')).toBe(true);
  });

  it('removes an emptied skill directory but never the install root', () => {
    writeFile(wt, '.claude/skills/old/SKILL.md', 'skill v1');

    pruneStaleFiles(wt, [entry('.claude/skills/old/SKILL.md', 'skill v1')], []);

    expect(exists(wt, '.claude/skills/old')).toBe(false);
    expect(exists(wt, '.claude/skills')).toBe(true);
  });
});
