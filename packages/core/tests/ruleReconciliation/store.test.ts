import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  RULE_RESOLUTIONS_DIR,
  RULE_RESOLUTIONS_FILE,
  RuleResolutionsError,
  addRuleResolution,
  readRuleResolutions,
} from '../../src/ruleReconciliation/index.js';

const resolution = { guideRule: 'git.md', projectSource: 'CLAUDE.md', statement: 'Never merge locally.' };

describe('rule resolution store', () => {
  let root: string;
  let file: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-resolutions-'));
    file = join(root, RULE_RESOLUTIONS_DIR, RULE_RESOLUTIONS_FILE);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads an absent file as empty', () => {
    expect(readRuleResolutions(root)).toEqual([]);
  });

  it('creates .context-forge/ and the file on first add', async () => {
    addRuleResolution(root, resolution);
    expect(readRuleResolutions(root)).toEqual([resolution]);
    const text = await readFile(file, 'utf-8');
    expect(text).toBe(JSON.stringify({ version: 1, resolutions: [resolution] }, null, 2) + '\n');
  });

  it('appends in order and keeps duplicates of a pair as separate records', () => {
    const second = { ...resolution, statement: 'Second point.' };
    const third = { guideRule: 'python.md', projectSource: 'AGENTS.md', statement: 'Use ruff.' };
    addRuleResolution(root, resolution);
    addRuleResolution(root, second);
    addRuleResolution(root, third);
    expect(readRuleResolutions(root)).toEqual([resolution, second, third]);
  });

  it('leaves no temp file after a successful write', async () => {
    addRuleResolution(root, resolution);
    expect(await readdir(join(root, RULE_RESOLUTIONS_DIR))).toEqual([RULE_RESOLUTIONS_FILE]);
  });

  it('rejects adding to a malformed file and leaves it byte-identical', async () => {
    await mkdir(join(root, RULE_RESOLUTIONS_DIR));
    const bad = '{"version": 1, "resolutions": [{"guideRule": "git.md"}]}';
    await writeFile(file, bad);
    expect(() => addRuleResolution(root, resolution)).toThrow(RuleResolutionsError);
    expect(await readFile(file, 'utf-8')).toBe(bad);
  });

  it('rejects an invalid record without touching the file', async () => {
    addRuleResolution(root, resolution);
    const before = await readFile(file, 'utf-8');
    expect(() => addRuleResolution(root, { ...resolution, statement: 'a\nb' })).toThrow(RuleResolutionsError);
    expect(await readFile(file, 'utf-8')).toBe(before);
  });

  it('rejects an invalid record without creating the directory', async () => {
    expect(() => addRuleResolution(root, { ...resolution, statement: '' })).toThrow(RuleResolutionsError);
    expect(await readdir(root)).toEqual([]);
  });

  it('throws RuleResolutionsError naming the file for unparseable JSON', async () => {
    await mkdir(join(root, RULE_RESOLUTIONS_DIR));
    await writeFile(file, '{not json');
    expect(() => readRuleResolutions(root)).toThrow(RuleResolutionsError);
    expect(() => readRuleResolutions(root)).toThrow(file);
  });

  it('propagates a non-ENOENT read error', async () => {
    // A directory where the file should be: readFile fails with EISDIR, not ENOENT.
    await mkdir(file, { recursive: true });
    expect(() => readRuleResolutions(root)).toThrow(/EISDIR/);
  });
});
