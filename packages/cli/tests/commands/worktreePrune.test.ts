import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ProjectData } from '@context-forge/core';
import { cksum, manifestPath, manifestTempPath, type ManifestEntry } from '../../src/commands/installManifest.js';
import { propagateToWorktrees, pruneStaleFiles, sweepGeneratedPrompts } from '../../src/commands/worktreePropagation.js';
import { GENERATED_MARKER } from '../../src/commands/ideTargets.js';

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

// ─── end-to-end propagation ─────────────────────────────────────────────────

const PRE_MANIFEST_NOTE = 'Note: guide predates the install manifest';
const OLD_AGENT = '.claude/agents/old.md';

function projectWith(root: string, worktreePaths: string[]): ProjectData {
  return {
    id: 'proj_e2e',
    name: 'e2e',
    template: '',
    projectPath: root,
    worktrees: worktreePaths.map((p, i) => ({ id: `wt_${i}`, name: `wt${i}`, indexRange: [100, 199], worktreePath: p })),
    createdAt: '',
    updatedAt: '',
  };
}

function writeManifest(root: string, target: string, entries: ManifestEntry[]): void {
  const filePath = manifestPath(root, target);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, entries.map((e) => `${e.crc} ${e.size} ${e.path}\n`).join(''));
}

function logLines(): string[] {
  return vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
}

/** Design criterion 4: the worktree manifest is a byte copy of the root's, with no temp file left. */
function expectManifestCarried(root: string, wt: string, target: string): void {
  expect(fs.readFileSync(manifestPath(wt, target))).toEqual(fs.readFileSync(manifestPath(root, target)));
  expect(fs.existsSync(manifestTempPath(wt, target))).toBe(false);
}

describe('propagateToWorktrees — end to end', () => {
  let root: string;
  let wt: string;
  const ruleEntry = entry('.claude/rules/a.md', 'rule a');

  beforeEach(() => {
    root = mkdir('root');
    wt = mkdir('wt');
    writeFile(root, '.claude/rules/a.md', 'rule a');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('D4: no root manifest → copied, nothing deleted, no manifest written, notice printed once', () => {
    const wt2 = mkdir('wt2');
    writeFile(wt, OLD_AGENT, 'guide v1');
    writeFile(wt2, OLD_AGENT, 'guide v1');

    propagateToWorktrees(projectWith(root, [wt, wt2]), 'claude', [entry(OLD_AGENT, 'guide v1')]);

    for (const w of [wt, wt2]) {
      expect(exists(w, '.claude/rules/a.md')).toBe(true);
      expect(exists(w, OLD_AGENT)).toBe(true);
      expect(fs.existsSync(manifestPath(w, 'claude'))).toBe(false);
    }
    expect(logLines().filter((l) => l.includes(PRE_MANIFEST_NOTE))).toHaveLength(1);
  });

  it('worktree manifest lists a dropped path → removed and reported', () => {
    writeFile(wt, OLD_AGENT, 'guide v1');
    writeManifest(wt, 'claude', [entry(OLD_AGENT, 'guide v1'), ruleEntry]);
    writeManifest(root, 'claude', [ruleEntry]);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(exists(wt, OLD_AGENT)).toBe(false);
    expect(logLines()).toContain(`    Removed ${OLD_AGENT} (no longer installed by the guide)`);
    expectManifestCarried(root, wt, 'claude');
  });

  it('dropped path edited in the worktree → kept, and the Kept line names it', () => {
    writeFile(wt, OLD_AGENT, 'guide v1 plus my edit');
    writeManifest(wt, 'claude', [entry(OLD_AGENT, 'guide v1')]);
    writeManifest(root, 'claude', [ruleEntry]);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(exists(wt, OLD_AGENT)).toBe(true);
    expect(logLines()).toContain(
      `    Kept ${OLD_AGENT}: no longer installed by the guide, but edited since — remove it by hand if unneeded`,
    );
    expectManifestCarried(root, wt, 'claude');
  });

  it('a baseline entry with a .. path → nothing outside touched, a warning names it', () => {
    const outsidePath = path.join(sandbox, 'outside.md');
    fs.writeFileSync(outsidePath, 'sentinel');
    writeManifest(wt, 'claude', [entry('../outside.md', 'sentinel')]);
    writeManifest(root, 'claude', [ruleEntry]);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('sentinel');
    expect(logLines().some((l) => l.includes('Warning') && l.includes('../outside.md'))).toBe(true);
    expectManifestCarried(root, wt, 'claude');
  });

  it('D2: no worktree manifest, root snapshot lists the dropped path → removed, manifest seeded', () => {
    writeFile(wt, OLD_AGENT, 'guide v1');
    writeManifest(root, 'claude', [ruleEntry]);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', [entry(OLD_AGENT, 'guide v1'), ruleEntry]);

    expect(exists(wt, OLD_AGENT)).toBe(false);
    expectManifestCarried(root, wt, 'claude');
  });

  it('neither baseline → nothing deleted, manifest seeded', () => {
    writeFile(wt, OLD_AGENT, 'guide v1');
    writeManifest(root, 'claude', [ruleEntry]);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(exists(wt, OLD_AGENT)).toBe(true);
    expectManifestCarried(root, wt, 'claude');
  });

  it('empty root manifest is not the D4 case: no notice, empty manifest copied', () => {
    writeManifest(root, 'claude', []);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(logLines().some((l) => l.includes(PRE_MANIFEST_NOTE))).toBe(false);
    expect(fs.readFileSync(manifestPath(wt, 'claude'), 'utf-8')).toBe('');
    expectManifestCarried(root, wt, 'claude');
  });
});

// ─── generated prompt sweep ─────────────────────────────────────────────────

const PROMPTS = '.github/prompts';
const MARKED = `${GENERATED_MARKER}\n# generated prompt\n`;

describe('sweepGeneratedPrompts', () => {
  let wt: string;

  beforeEach(() => {
    wt = mkdir('wt');
  });

  it('removes marked files and keeps unmarked ones', () => {
    writeFile(wt, `${PROMPTS}/x.prompt.md`, MARKED);
    writeFile(wt, `${PROMPTS}/y.prompt.md`, '# my own prompt\n');

    expect(sweepGeneratedPrompts(wt, [PROMPTS])).toEqual([`${PROMPTS}/x.prompt.md`]);
    expect(exists(wt, `${PROMPTS}/x.prompt.md`)).toBe(false);
    expect(exists(wt, `${PROMPTS}/y.prompt.md`)).toBe(true);
  });

  it('removes the directory when only marked files were present', () => {
    writeFile(wt, `${PROMPTS}/x.prompt.md`, MARKED);

    sweepGeneratedPrompts(wt, [PROMPTS]);

    expect(exists(wt, PROMPTS)).toBe(false);
    expect(exists(wt, '.github')).toBe(true);
  });

  it('missing directory → []', () => {
    expect(sweepGeneratedPrompts(wt, [PROMPTS])).toEqual([]);
  });
});

describe('propagateToWorktrees — generated prompt sweep', () => {
  let root: string;
  let wt: string;
  const removedLine = `    Removed superseded prompt file: ${PROMPTS}/x.prompt.md`;

  beforeEach(() => {
    root = mkdir('root');
    wt = mkdir('wt');
    writeFile(wt, `${PROMPTS}/x.prompt.md`, MARKED);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('copilot run with a root manifest removes the marked file and reports it', () => {
    writeManifest(root, 'copilot', [entry('.github/instructions/a.instructions.md', 'a')]);

    propagateToWorktrees(projectWith(root, [wt]), 'copilot', null);

    expect(exists(wt, `${PROMPTS}/x.prompt.md`)).toBe(false);
    expect(logLines()).toContain(removedLine);
  });

  it('copilot run with no root manifest (D4) still sweeps, and the notice prints once', () => {
    propagateToWorktrees(projectWith(root, [wt]), 'copilot', null);

    expect(exists(wt, `${PROMPTS}/x.prompt.md`)).toBe(false);
    expect(logLines()).toContain(removedLine);
    expect(logLines().filter((l) => l.includes(PRE_MANIFEST_NOTE))).toHaveLength(1);
  });

  it('copilot run with an empty root manifest still sweeps', () => {
    writeManifest(root, 'copilot', []);

    propagateToWorktrees(projectWith(root, [wt]), 'copilot', null);

    expect(exists(wt, `${PROMPTS}/x.prompt.md`)).toBe(false);
  });

  it('a claude run never touches .github/prompts', () => {
    writeManifest(root, 'claude', []);

    propagateToWorktrees(projectWith(root, [wt]), 'claude', null);

    expect(exists(wt, `${PROMPTS}/x.prompt.md`)).toBe(true);
    expect(logLines()).not.toContain(removedLine);
  });
});
