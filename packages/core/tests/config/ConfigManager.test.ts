import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import {
  getUserConfigPath,
  getProjectConfigPath,
  getProjectPersonalConfigPath,
} from '../../src/config/configPaths.js';

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, 'utf-8');
    return true;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

describe('ConfigManager', () => {
  let tempDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'cf-config-test-'));
    projectDir = await mkdtemp(join(tmpdir(), 'cf-config-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = tempDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(tempDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  // --- get() tests ---

  describe('get()', () => {
    it('throws for unknown key', async () => {
      const cm = new ConfigManager();
      await expect(cm.get('no_such_key')).rejects.toThrow('Unknown config key: "no_such_key"');
    });

    it('returns built-in default when no config files exist', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('guide.source');
      expect(result.value).toBe('');
      expect(result.source).toBe('default');
      expect(result.key).toBe('guide.source');
    });

    it('returns boolean default for guide.auto_update', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('guide.auto_update');
      expect(result.value).toBe(false);
      expect(result.source).toBe('default');
    });

    it('returns enum default for guide.git_strategy', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('guide.git_strategy');
      expect(result.value).toBe('submodule');
      expect(result.source).toBe('default');
    });

    it('reads user config value, reports source: user', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'https://example.com', 'user');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('https://example.com');
      expect(result.source).toBe('user');
    });

    it('reads project config value, reports source: project', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('guide.source', 'proj-value', 'project');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('proj-value');
      expect(result.source).toBe('project');
    });

    it('project config overrides user config (precedence)', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('guide.source', 'user-value', 'user');
      await cm.set('guide.source', 'project-value', 'project');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('project-value');
      expect(result.source).toBe('project');
    });

    it('user config overrides default', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'https://example.com', 'user');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('https://example.com');
      expect(result.source).toBe('user');
    });

    it('handles missing config files gracefully (no error)', async () => {
      const cm = new ConfigManager('/nonexistent/path');
      const result = await cm.get('guide.source');
      expect(result.source).toBe('default');
    });

    it('resolves dotted keys (guide.source) from TOML sections', async () => {
      const userConfigPath = getUserConfigPath();
      await mkdir(join(tempDir), { recursive: true });
      await writeFile(
        userConfigPath,
        '[guide]\nsource = "https://via-toml.com"\n',
        'utf-8'
      );
      const cm = new ConfigManager();
      const result = await cm.get('guide.source');
      expect(result.value).toBe('https://via-toml.com');
      expect(result.source).toBe('user');
    });
  });

  // --- set() tests ---

  describe('set()', () => {
    it('writes to user-level TOML file', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'test-source', 'user');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('test-source');
      expect(result.source).toBe('user');
    });

    it('writes to project-level TOML file', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('guide.source', 'proj-val', 'project');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('proj-val');
      expect(result.source).toBe('project');
    });

    it('creates parent directories if config file does not exist yet', async () => {
      const deepDir = join(tempDir, 'a', 'b', 'c');
      const cm = new ConfigManager(deepDir);
      await expect(cm.set('guide.source', 'x', 'project')).resolves.not.toThrow();
      const result = await cm.get('guide.source');
      expect(result.value).toBe('x');
    });

    it('rejects unknown key', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('unknown_key', 'val', 'user')).rejects.toThrow(
        'Unknown config key: "unknown_key"'
      );
    });

    it('rejects type mismatch (string for boolean key)', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('guide.auto_update', 'yes' as unknown as boolean, 'user')).rejects.toThrow(
        'expects type "boolean"'
      );
    });

    it('rejects invalid enum value', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('guide.git_strategy', 'invalid', 'user')).rejects.toThrow(
        'must be one of'
      );
    });

    it('rejects project scope when no projectPath provided', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('guide.source', 'val', 'project')).rejects.toThrow(
        'no projectPath provided'
      );
    });

    it('accepts a valid relative integration branch', async () => {
      const cm = new ConfigManager();
      await cm.set('git.integration_branch', 'myroot/sub', 'user');
      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('myroot/sub');
    });

    it('accepts empty integration branch (no integration branch)', async () => {
      const cm = new ConfigManager();
      await cm.set('git.integration_branch', '', 'user');
      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('');
    });

    it('defaults integration branch to empty when unset', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('');
      expect(result.source).toBe('default');
    });

    it('rejects an absolute integration branch', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.integration_branch', '/abs/path', 'user')).rejects.toThrow(
        'must be relative'
      );
    });

    it('rejects an integration branch with ".." segments', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.integration_branch', 'foo/../bar', 'user')).rejects.toThrow(
        '".." segments'
      );
    });

    it('rejects an integration branch with a trailing slash', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.integration_branch', 'myroot/', 'user')).rejects.toThrow(
        'trailing slash'
      );
    });

    it('accepts a valid YYYYMMDD review_gate_effective_date', async () => {
      const cm = new ConfigManager();
      await cm.set('workflow.review_gate_effective_date', '20260701', 'user');
      const result = await cm.get('workflow.review_gate_effective_date');
      expect(result.value).toBe('20260701');
    });

    it('defaults review_gate_effective_date to empty (no cutoff) when unset', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('workflow.review_gate_effective_date');
      expect(result.value).toBe('');
      expect(result.source).toBe('default');
    });

    it('rejects a non-YYYYMMDD review_gate_effective_date', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('workflow.review_gate_effective_date', '2026-07-01', 'user')).rejects.toThrow(
        'YYYYMMDD'
      );
    });

    it('round-trip string value', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'https://example.com', 'user');
      const result = await cm.get('guide.source');
      expect(result.value).toBe('https://example.com');
    });

    it('round-trip boolean value', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.auto_update', true, 'user');
      const result = await cm.get('guide.auto_update');
      expect(result.value).toBe(true);
    });

    it('preserves existing keys in TOML file when adding new key', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'first', 'user');
      await cm.set('guide.git_strategy', 'clone', 'user');
      const r1 = await cm.get('guide.source');
      const r2 = await cm.get('guide.git_strategy');
      expect(r1.value).toBe('first');
      expect(r2.value).toBe('clone');
    });
  });

  // --- delete() tests ---

  describe('delete()', () => {
    it('rejects unknown key', async () => {
      const cm = new ConfigManager();
      await expect(cm.delete('no_such_key', 'user')).rejects.toThrow(
        'Unknown config key: "no_such_key"'
      );
    });

    it('deletes an existing key at user scope', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'https://example.com', 'user');
      await cm.delete('guide.source', 'user');
      const result = await cm.get('guide.source');
      expect(result.source).toBe('default');
    });

    it('deletes an existing key at project scope', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('guide.source', 'proj-value', 'project');
      await cm.delete('guide.source', 'project');
      const result = await cm.get('guide.source');
      expect(result.source).toBe('default');
    });

    it('is a no-op when the key is not present at the target scope (exit clean, no error)', async () => {
      const cm = new ConfigManager();
      await expect(cm.delete('guide.source', 'user')).resolves.not.toThrow();
      const result = await cm.get('guide.source');
      expect(result.source).toBe('default');
    });

    it('rejects project scope when no projectPath provided', async () => {
      const cm = new ConfigManager();
      await expect(cm.delete('guide.source', 'project')).rejects.toThrow(
        'no projectPath provided'
      );
    });

    it('prunes a now-empty parent table left behind after removing the last key in a nested section', async () => {
      const cm = new ConfigManager();
      await cm.set('git.integration_branch', 'dev/erik', 'user');
      await cm.delete('git.integration_branch', 'user');

      const userConfigPath = getUserConfigPath();
      const tomlContent = await readFile(userConfigPath, 'utf-8');
      expect(tomlContent).not.toContain('[git]');

      const result = await cm.get('git.integration_branch');
      expect(result.source).toBe('default');
    });

    it('does not disturb sibling keys in the same table when pruning', async () => {
      const cm = new ConfigManager();
      await cm.set('guide.source', 'keep-me', 'user');
      await cm.set('guide.git_strategy', 'clone', 'user');
      await cm.delete('guide.source', 'user');

      const sourceResult = await cm.get('guide.source');
      const strategyResult = await cm.get('guide.git_strategy');
      expect(sourceResult.source).toBe('default');
      expect(strategyResult.value).toBe('clone');
      expect(strategyResult.source).toBe('user');
    });
  });

  // --- review config keys (slice 240) ---

  describe('review config keys', () => {
    it('defaults workflow.review_enabled to false', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('workflow.review_enabled');
      expect(result.value).toBe(false);
      expect(result.source).toBe('default');
    });

    it('rejects a non-boolean workflow.review_enabled', async () => {
      const cm = new ConfigManager();
      await expect(
        cm.set('workflow.review_enabled', 'yes' as unknown as boolean, 'user')
      ).rejects.toThrow('expects type "boolean"');
    });

    it('defaults workflow.review_threshold to concerns', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('workflow.review_threshold');
      expect(result.value).toBe('concerns');
      expect(result.source).toBe('default');
    });

    it('accepts a valid workflow.review_threshold', async () => {
      const cm = new ConfigManager();
      await cm.set('workflow.review_threshold', 'pass', 'user');
      const result = await cm.get('workflow.review_threshold');
      expect(result.value).toBe('pass');
    });

    it('rejects an invalid workflow.review_threshold, naming allowed values', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('workflow.review_threshold', 'bogus', 'user')).rejects.toThrow(
        'must be one of ["pass", "concerns"]'
      );
    });

    it('defaults workflow.review_unknown_as to fail', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('workflow.review_unknown_as');
      expect(result.value).toBe('fail');
      expect(result.source).toBe('default');
    });

    it('accepts a valid workflow.review_unknown_as', async () => {
      const cm = new ConfigManager();
      await cm.set('workflow.review_unknown_as', 'concerns', 'user');
      const result = await cm.get('workflow.review_unknown_as');
      expect(result.value).toBe('concerns');
    });

    it('rejects an invalid workflow.review_unknown_as, naming allowed values', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('workflow.review_unknown_as', 'bogus', 'user')).rejects.toThrow(
        'must be one of ["fail", "concerns", "pass"]'
      );
    });
  });

  // --- per-gate override keys (slice 240, TD-1) ---

  describe('review_gates override keys', () => {
    it('round-trips code.threshold and renders as a nested TOML table', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('workflow.review_gates.code.threshold', 'concerns', 'project');

      const threshold = await cm.get('workflow.review_gates.code.threshold');
      expect(threshold.value).toBe('concerns');
      expect(threshold.source).toBe('project');

      const tomlContent = await readFile(getProjectConfigPath(projectDir), 'utf-8');
      expect(tomlContent).toContain('[workflow.review_gates.code]');
      expect(tomlContent).toMatch(/threshold\s*=\s*"concerns"/);
    });

    it('defaults all four override keys to empty string', async () => {
      const cm = new ConfigManager();
      for (const reviewType of ['code', 'arch', 'slice', 'tasks']) {
        const threshold = await cm.get(`workflow.review_gates.${reviewType}.threshold`);
        expect(threshold.value).toBe('');
      }
    });

    it('rejects an out-of-enum .threshold override value', async () => {
      const cm = new ConfigManager();
      await expect(
        cm.set('workflow.review_gates.code.threshold', 'bogus', 'user')
      ).rejects.toThrow('must be one of');
    });
  });

  // --- list() tests ---

  describe('list()', () => {
    it('returns all registered keys with defaults when no config files', async () => {
      const cm = new ConfigManager();
      const entries = await cm.list();
      expect(entries).toHaveLength(14);
      const keys = entries.map((e) => e.key);
      expect(keys).toContain('guide.auto_update');
      expect(keys).toContain('guide.source');
      expect(keys).toContain('guide.git_strategy');
      expect(keys).toContain('workflow.auto_advance');
      expect(keys).toContain('workflow.auto_fix');
      expect(keys).toContain('workflow.review_enabled');
      expect(keys).toContain('workflow.review_threshold');
      expect(keys).toContain('workflow.review_unknown_as');
      expect(keys).toContain('workflow.review_gates.code.threshold');
      expect(keys).toContain('workflow.review_gates.arch.threshold');
      expect(keys).toContain('workflow.review_gates.slice.threshold');
      expect(keys).toContain('workflow.review_gates.tasks.threshold');
      expect(keys).toContain('workflow.review_gate_effective_date');
      expect(keys).toContain('git.integration_branch');
      for (const entry of entries) {
        expect(entry.source).toBe('default');
        expect(entry.type).toBeDefined();
        expect(entry.defaultValue).toBeDefined();
      }
    });

    it('shows correct source for overridden values', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('guide.source', 'user-source', 'user');
      await cm.set('guide.git_strategy', 'clone', 'project');
      const entries = await cm.list();
      const guideSource = entries.find((e) => e.key === 'guide.source')!;
      const gitStrategy = entries.find((e) => e.key === 'guide.git_strategy')!;
      expect(guideSource.source).toBe('user');
      expect(gitStrategy.source).toBe('project');
    });
  });

  // --- personal-scope key routing (slice 915) ---

  describe('personal-scope key routing', () => {
    it('set() writes a personal-scope key to the personal file, not the shared file', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('git.integration_branch', 'dev/erik', 'project');

      const personalContent = await readFile(getProjectPersonalConfigPath(projectDir), 'utf-8');
      expect(personalContent).toMatch(/integration_branch\s*=\s*"dev\/erik"/);
      expect(await fileExists(getProjectConfigPath(projectDir))).toBe(false);
    });

    it('set() writes a shared-scope key to the shared file, not the personal file (unchanged behavior)', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('workflow.review_enabled', true, 'project');

      const sharedContent = await readFile(getProjectConfigPath(projectDir), 'utf-8');
      expect(sharedContent).toMatch(/review_enabled\s*=\s*true/);
      expect(await fileExists(getProjectPersonalConfigPath(projectDir))).toBe(false);
    });

    it('get() resolves a personal key found only in the personal file, source: project-personal', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('git.integration_branch', 'dev/erik', 'project');
      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('dev/erik');
      expect(result.source).toBe('project-personal');
    });

    it('get() falls back to the shared file for a personal key found only there (pre-migration case)', async () => {
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        getProjectConfigPath(projectDir),
        '[git]\nintegration_branch = "legacy/value"\n',
        'utf-8'
      );
      const cm = new ConfigManager(projectDir);
      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('legacy/value');
      expect(result.source).toBe('project');
    });

    it('get() prefers the personal file when the key exists in both (personal wins)', async () => {
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        getProjectConfigPath(projectDir),
        '[git]\nintegration_branch = "legacy/value"\n',
        'utf-8'
      );
      const cm = new ConfigManager(projectDir);
      await cm.set('git.integration_branch', 'dev/erik', 'project');

      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('dev/erik');
      expect(result.source).toBe('project-personal');
    });

    it('delete() removes a personal key from the personal file, leaves the shared file untouched', async () => {
      await mkdir(projectDir, { recursive: true });
      await writeFile(
        getProjectConfigPath(projectDir),
        '[git]\nintegration_branch = "legacy/value"\n',
        'utf-8'
      );
      const cm = new ConfigManager(projectDir);
      await cm.set('git.integration_branch', 'dev/erik', 'project');
      await cm.delete('git.integration_branch', 'project');

      const result = await cm.get('git.integration_branch');
      expect(result.value).toBe('legacy/value');
      expect(result.source).toBe('project');
    });

    it('list() reports the correct source for a personal-scope key', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('git.integration_branch', 'dev/erik', 'project');
      const entries = await cm.list();
      const entry = entries.find((e) => e.key === 'git.integration_branch')!;
      expect(entry.value).toBe('dev/erik');
      expect(entry.source).toBe('project-personal');
    });
  });
});
