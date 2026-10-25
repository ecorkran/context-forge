import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  audienceProblemMessage,
  reachesAudience,
  RULE_AUDIENCE,
  ruleAudiences,
  unknownAudienceValues,
} from '../../src/ideInstall/ruleAudience.js';
import { makeTmpDir } from './harness.js';

const rule = (frontmatter: string, body = '# Title\n\nbody\n') => `---\n${frontmatter}\n---\n${body}`;

describe('ruleAudiences', () => {
  it('is null when the key is absent', () => {
    expect(ruleAudiences(rule('description: x\nalwaysApply: true'))).toBeNull();
  });

  it('reads the inline list the guide writes', () => {
    expect(ruleAudiences(rule('agents: [claude]'))).toEqual({ known: ['claude'], unknown: [], notInline: false });
  });

  it('tolerates spacing and quotes per item', () => {
    expect(ruleAudiences(rule(`agents: [ "claude", 'cursor' ]`))?.known).toEqual(['claude', 'cursor']);
  });

  it('reads a bare scalar as a one-item list, case-folded', () => {
    expect(ruleAudiences(rule('agents: Claude'))?.known).toEqual(['claude']);
  });

  it('gives no audiences for an empty list', () => {
    expect(ruleAudiences(rule('agents: []'))).toEqual({ known: [], unknown: [], notInline: false });
  });

  it('flags a valueless key (block list) and yields no audiences', () => {
    expect(ruleAudiences(rule('agents:\n  - claude'))).toEqual({ known: [], unknown: [], notInline: true });
  });

  it('separates unknown values from known ones', () => {
    expect(ruleAudiences(rule('agents: [claude, gemini]'))).toEqual({
      known: ['claude'],
      unknown: ['gemini'],
      notInline: false,
    });
  });

  it('ignores the key outside the frontmatter', () => {
    expect(ruleAudiences(rule('description: x', 'agents: [claude]\n'))).toBeNull();
  });

  it('reads an unclosed frontmatter to end of file', () => {
    expect(ruleAudiences('---\nagents: [claude]\nbody\n')?.known).toEqual(['claude']);
  });

  it('is null with no frontmatter', () => {
    expect(ruleAudiences('# Title\nagents: [claude]\n')).toBeNull();
  });
});

describe('reachesAudience', () => {
  const marked = rule('agents: [claude]');
  const unmarked = rule('description: x');

  it.each(Object.values(RULE_AUDIENCE))('an unmarked rule reaches %s', (audience) => {
    expect(reachesAudience(unmarked, audience)).toBe(true);
  });

  it('a [claude] rule reaches only claude', () => {
    expect(reachesAudience(marked, RULE_AUDIENCE.Claude)).toBe(true);
    expect(reachesAudience(marked, RULE_AUDIENCE.Agents)).toBe(false);
    expect(reachesAudience(marked, RULE_AUDIENCE.Copilot)).toBe(false);
    expect(reachesAudience(marked, RULE_AUDIENCE.Cursor)).toBe(false);
  });
});

describe('unknownAudienceValues', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports each unknown value and valueless key with its rule', () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), rule('agents: [claude, gemini, zed]'));
    fs.writeFileSync(path.join(tmp, 'b.md'), rule('agents:\n  - claude'));
    fs.writeFileSync(path.join(tmp, 'c.md'), rule('agents: [claude]'));
    expect(unknownAudienceValues(tmp)).toEqual([
      { rule: 'a.md', value: 'gemini' },
      { rule: 'a.md', value: 'zed' },
      { rule: 'b.md', value: null },
    ]);
  });

  it('reports nothing for a clean directory', () => {
    fs.writeFileSync(path.join(tmp, 'a.md'), rule('description: x'));
    fs.writeFileSync(path.join(tmp, 'b.md'), rule('agents: [claude, cursor]'));
    expect(unknownAudienceValues(tmp)).toEqual([]);
  });
});

describe('audienceProblemMessage', () => {
  it('names the rule, the value and every known audience', () => {
    expect(audienceProblemMessage({ rule: 'a.md', value: 'gemini' })).toBe(
      "⚠️  a.md: unknown agents value 'gemini' (known: claude, agents, copilot, cursor) — ignored",
    );
  });

  it('tells the author to write a valueless key inline', () => {
    expect(audienceProblemMessage({ rule: 'b.md', value: null })).toContain('agents must be written inline');
  });
});
