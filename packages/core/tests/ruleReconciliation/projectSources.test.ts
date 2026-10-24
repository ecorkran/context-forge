import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  GENERATED_MARKER,
  MANAGED_BEGIN_MARKER as BEGIN,
  MANAGED_END_MARKER as END,
  PREMANAGED_BACKUP_SUFFIX,
  projectRuleSources,
} from '../../src/ruleReconciliation/index.js';

/** The layout cli's writeManagedSection produces for an unmanaged file: project text, blank line, then the block. */
function withManagedBlock(projectText: string, blockBody: string, after = ''): string {
  return `${projectText}\n${BEGIN}\n${blockBody}${END}\n${after}`;
}

describe('projectRuleSources', () => {
  let root: string;

  async function put(rel: string, text = 'rules\n'): Promise<void> {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), text);
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-sources-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns [] when no rule files exist', () => {
    expect(projectRuleSources(root, [])).toEqual([]);
  });

  it('reports the 1-based range of a composite with a valid block', async () => {
    // Lines: 1 "# Team rules", 2 "Never commit to main.", 3 "" (separator), 4 BEGIN, 5-6 body, 7 END
    await put('CLAUDE.md', withManagedBlock('# Team rules\nNever commit to main.\n', '# Project Guidelines\nbody\n'));
    expect(projectRuleSources(root, [])).toEqual([
      { path: 'CLAUDE.md', kind: 'composite', managedBlock: { beginLine: 4, endLine: 7 } },
    ]);
  });

  it('handles project text after the block', async () => {
    await put('AGENTS.md', withManagedBlock('# Mine\n', 'body\n', 'Trailing project note.\n'));
    expect(projectRuleSources(root, [])).toEqual([
      { path: 'AGENTS.md', kind: 'composite', managedBlock: { beginLine: 3, endLine: 5 } },
    ]);
  });

  it('reports none for a composite without a block', async () => {
    await put('CLAUDE.md', '# Hand written\n');
    expect(projectRuleSources(root, [])).toEqual([{ path: 'CLAUDE.md', kind: 'composite', managedBlock: 'none' }]);
  });

  it('reports broken for unusable markers without guessing a range', async () => {
    await put('CLAUDE.md', `${BEGIN}\nbody\n`);
    expect(projectRuleSources(root, [])).toEqual([{ path: 'CLAUDE.md', kind: 'composite', managedBlock: 'broken' }]);
  });

  it('treats the copilot file as a composite and other root files as standalone', async () => {
    await put('.github/copilot-instructions.md');
    await put('GEMINI.md');
    await put('.cursorrules');
    expect(projectRuleSources(root, [])).toEqual([
      { path: 'GEMINI.md', kind: 'standalone' },
      { path: '.cursorrules', kind: 'standalone' },
      { path: '.github/copilot-instructions.md', kind: 'composite', managedBlock: 'none' },
    ]);
  });

  it('excludes installed paths', async () => {
    await put('.claude/rules/git.md');
    await put('.claude/rules/team.md');
    expect(projectRuleSources(root, ['.claude/rules/git.md'])).toEqual([
      { path: '.claude/rules/team.md', kind: 'standalone' },
    ]);
  });

  it('excludes a file carrying the generated marker', async () => {
    await put('.github/instructions/python.instructions.md', `${GENERATED_MARKER}\nbody\n`);
    await put('.github/instructions/team.instructions.md');
    expect(projectRuleSources(root, [])).toEqual([
      { path: '.github/instructions/team.instructions.md', kind: 'standalone' },
    ]);
  });

  it('excludes pre-context-forge backups', async () => {
    await put('CLAUDE.md', '# Mine\n');
    await put(`.cursor/rules/old.mdc${PREMANAGED_BACKUP_SUFFIX}`);
    expect(projectRuleSources(root, []).map((s) => s.path)).toEqual(['CLAUDE.md']);
  });

  it('includes a hand-written cursor rule', async () => {
    await put('.cursor/rules/team-style.mdc');
    expect(projectRuleSources(root, [])).toEqual([{ path: '.cursor/rules/team-style.mdc', kind: 'standalone' }]);
  });

  it('expands directories recursively in sorted order', async () => {
    await put('.cursor/rules/b.mdc');
    await put('.cursor/rules/a.mdc');
    await put('.cursor/rules/nested/c.mdc');
    expect(projectRuleSources(root, []).map((s) => s.path)).toEqual([
      '.cursor/rules/a.mdc',
      '.cursor/rules/b.mdc',
      '.cursor/rules/nested/c.mdc',
    ]);
  });

  it('ignores a nested CLAUDE.md', async () => {
    await put('sub/CLAUDE.md');
    expect(projectRuleSources(root, [])).toEqual([]);
  });

  it('throws naming the file when a candidate cannot be read', async () => {
    await put('GEMINI.md');
    await chmod(join(root, 'GEMINI.md'), 0o000);
    try {
      expect(() => projectRuleSources(root, [])).toThrow(/GEMINI\.md/);
    } finally {
      await chmod(join(root, 'GEMINI.md'), 0o644);
    }
  });
});
