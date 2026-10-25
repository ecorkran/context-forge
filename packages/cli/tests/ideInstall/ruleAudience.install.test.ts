/**
 * The `agents:` rule marker through a real install (slice 935): which composite
 * blocks and scoped files a marked rule reaches, and pruning when a rule
 * becomes marked.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeProject, makeTmpDir, run, writeFiles } from './harness.js';

const CLAUDE_ALWAYS =
  '---\ndescription: Claude-only always-on.\nalwaysApply: true\nagents: [claude]\n---\n\n# Claude Peers\n\nUse SendMessage.\n';
const CLAUDE_SCOPED =
  '---\ndescription: Claude-only scoped.\nagents: [claude]\npaths:\n  - "**/*.peer"\n---\n\n# Peer Files\n\nPeer body.\n';
const SCOPED_UNMARKED =
  '---\ndescription: Peer scoped, unmarked.\npaths:\n  - "**/*.peer"\n---\n\n# Peer Files\n\nPeer body.\n';

let tmp: string;
let project: string;
let guide: string;
let rulesDir: string;

beforeEach(() => {
  tmp = makeTmpDir();
  ({ project, guide } = makeProject(tmp));
  rulesDir = path.join(guide, 'project-guides', 'rules');
  writeFiles(rulesDir, { 'claude-always.md': CLAUDE_ALWAYS, 'claude-scoped.md': CLAUDE_SCOPED });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const read = (rel: string): string => fs.readFileSync(path.join(project, rel), 'utf-8');
const exists = (rel: string): boolean => fs.existsSync(path.join(project, rel));

describe('agents rule marker', () => {
  it('claude: the marked rules reach CLAUDE.md and .claude/rules/', () => {
    const result = run(guide, project, ['claude']);
    expect(result.code).toBe(0);
    expect(read('CLAUDE.md')).toContain('## Claude Peers');
    expect(exists('.claude/rules/claude-scoped.md')).toBe(true);
    expect(result.stdout).not.toContain('Skipped claude-scoped.md');
  });

  it('agents: neither marked rule reaches AGENTS.md or its scoped index', () => {
    const result = run(guide, project, ['agents']);
    expect(result.code).toBe(0);
    const agents = read('AGENTS.md');
    expect(agents).not.toContain('Claude Peers');
    expect(agents).not.toContain('claude-scoped.md');
    // Unmarked rules are unaffected.
    expect(agents).toContain('scoped-a.md');
  });

  it('copilot: no marked rule in copilot-instructions.md, AGENTS.md or .github/instructions/', () => {
    const result = run(guide, project, ['copilot']);
    expect(result.code).toBe(0);
    expect(read('.github/copilot-instructions.md')).not.toContain('Claude Peers');
    expect(read('AGENTS.md')).not.toContain('Claude Peers');
    expect(exists('.github/instructions/claude-scoped.instructions.md')).toBe(false);
    expect(exists('.github/instructions/scoped-a.instructions.md')).toBe(true);
    expect(result.stdout).toContain('⊘ Skipped claude-scoped.md (agents: claude)');
  });

  it('cursor: no marked rule in AGENTS.md or .cursor/rules/', () => {
    const result = run(guide, project, ['cursor']);
    expect(result.code).toBe(0);
    expect(read('AGENTS.md')).not.toContain('Claude Peers');
    expect(exists('.cursor/rules/claude-scoped.mdc')).toBe(false);
    expect(exists('.cursor/rules/scoped-a.mdc')).toBe(true);
    expect(result.stdout).toContain('⊘ Skipped claude-scoped.md (agents: claude)');
  });

  it('counts only the always-on rules written', () => {
    const claude = run(guide, project, ['claude']);
    const agents = run(guide, project, ['agents']);
    const embedded = (text: string) => Number(/(?:Embedded|Compiled) (\d+) alwaysApply/.exec(text)?.[1]);
    expect(embedded(claude.stdout)).toBe(embedded(agents.stdout) + 1);
  });

  it.each([
    ['cursor', '.cursor/rules/claude-scoped.mdc'],
    ['copilot', '.github/instructions/claude-scoped.instructions.md'],
  ])('%s: prunes a scoped file once its rule is marked', (target, rel) => {
    writeFiles(rulesDir, { 'claude-scoped.md': SCOPED_UNMARKED });
    run(guide, project, [target]);
    expect(exists(rel)).toBe(true);

    writeFiles(rulesDir, { 'claude-scoped.md': CLAUDE_SCOPED });
    const second = run(guide, project, [target]);
    expect(second.code).toBe(0);
    expect(exists(rel)).toBe(false);
  });

  it('warns once per unknown value and valueless key, and still exits 0', () => {
    writeFiles(rulesDir, {
      'claude-scoped.md': CLAUDE_SCOPED.replace('agents: [claude]', 'agents: [claude, gemini]'),
      'block.md': '---\ndescription: Block list.\nalwaysApply: true\nagents:\n  - claude\n---\n\n# Block\n\nbody\n',
    });
    const result = run(guide, project, ['agents']);
    expect(result.code).toBe(0);
    expect(result.stderr.match(/unknown agents value 'gemini'/g)).toHaveLength(1);
    expect(result.stderr).toContain('claude-scoped.md');
    expect(result.stderr.match(/block\.md: agents must be written inline/g)).toHaveLength(1);
    expect(read('AGENTS.md')).not.toContain('# Block');
  });

  it('prints no marker warning for a clean guide', () => {
    const result = run(guide, project, ['claude']);
    expect(result.stderr).not.toContain('agents');
  });

  it('keeps an edited scoped file with the manifest warning', () => {
    const rel = '.cursor/rules/claude-scoped.mdc';
    writeFiles(rulesDir, { 'claude-scoped.md': SCOPED_UNMARKED });
    run(guide, project, ['cursor']);
    fs.appendFileSync(path.join(project, rel), 'local edit\n');

    writeFiles(rulesDir, { 'claude-scoped.md': CLAUDE_SCOPED });
    const second = run(guide, project, ['cursor']);
    expect(exists(rel)).toBe(true);
    expect(second.stdout + second.stderr).toContain(`Kept ${rel}`);
  });
});
