import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { getUserConfigPath, getProjectConfigPath } from '../../src/config/configPaths.js';

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

    it('accepts a valid relative branch root', async () => {
      const cm = new ConfigManager();
      await cm.set('git.branch_root', 'myroot/sub', 'user');
      const result = await cm.get('git.branch_root');
      expect(result.value).toBe('myroot/sub');
    });

    it('accepts empty branch root (no prefix)', async () => {
      const cm = new ConfigManager();
      await cm.set('git.branch_root', '', 'user');
      const result = await cm.get('git.branch_root');
      expect(result.value).toBe('');
    });

    it('defaults branch root to empty when unset', async () => {
      const cm = new ConfigManager();
      const result = await cm.get('git.branch_root');
      expect(result.value).toBe('');
      expect(result.source).toBe('default');
    });

    it('rejects an absolute branch root', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.branch_root', '/abs/path', 'user')).rejects.toThrow(
        'must be relative'
      );
    });

    it('rejects a branch root with ".." segments', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.branch_root', 'foo/../bar', 'user')).rejects.toThrow(
        '".." segments'
      );
    });

    it('rejects a branch root with a trailing slash', async () => {
      const cm = new ConfigManager();
      await expect(cm.set('git.branch_root', 'myroot/', 'user')).rejects.toThrow(
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
    it('round-trips pre_advance.review_type and .threshold and renders as a nested TOML table', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('workflow.review_gates.pre_advance.review_type', 'code', 'project');
      await cm.set('workflow.review_gates.pre_advance.threshold', 'concerns', 'project');

      const reviewType = await cm.get('workflow.review_gates.pre_advance.review_type');
      const threshold = await cm.get('workflow.review_gates.pre_advance.threshold');
      expect(reviewType.value).toBe('code');
      expect(reviewType.source).toBe('project');
      expect(threshold.value).toBe('concerns');
      expect(threshold.source).toBe('project');

      const tomlContent = await readFile(getProjectConfigPath(projectDir), 'utf-8');
      expect(tomlContent).toContain('[workflow.review_gates.pre_advance]');
      expect(tomlContent).toMatch(/review_type\s*=\s*"code"/);
      expect(tomlContent).toMatch(/threshold\s*=\s*"concerns"/);
    });

    it('defaults all four override key pairs to empty string', async () => {
      const cm = new ConfigManager();
      for (const transition of ['pre_advance', 'pre_slice_plan', 'pre_tasks', 'pre_implementation']) {
        const reviewType = await cm.get(`workflow.review_gates.${transition}.review_type`);
        const threshold = await cm.get(`workflow.review_gates.${transition}.threshold`);
        expect(reviewType.value).toBe('');
        expect(threshold.value).toBe('');
      }
    });

    it('rejects an out-of-enum .threshold override value', async () => {
      const cm = new ConfigManager();
      await expect(
        cm.set('workflow.review_gates.pre_advance.threshold', 'bogus', 'user')
      ).rejects.toThrow('must be one of');
    });
  });

  // --- list() tests ---

  describe('list()', () => {
    it('returns all registered keys with defaults when no config files', async () => {
      const cm = new ConfigManager();
      const entries = await cm.list();
      expect(entries).toHaveLength(18);
      const keys = entries.map((e) => e.key);
      expect(keys).toContain('guide.auto_update');
      expect(keys).toContain('guide.source');
      expect(keys).toContain('guide.git_strategy');
      expect(keys).toContain('workflow.auto_advance');
      expect(keys).toContain('workflow.auto_fix');
      expect(keys).toContain('workflow.review_enabled');
      expect(keys).toContain('workflow.review_threshold');
      expect(keys).toContain('workflow.review_unknown_as');
      expect(keys).toContain('workflow.review_gates.pre_advance.review_type');
      expect(keys).toContain('workflow.review_gates.pre_advance.threshold');
      expect(keys).toContain('workflow.review_gates.pre_slice_plan.review_type');
      expect(keys).toContain('workflow.review_gates.pre_slice_plan.threshold');
      expect(keys).toContain('workflow.review_gates.pre_tasks.review_type');
      expect(keys).toContain('workflow.review_gates.pre_tasks.threshold');
      expect(keys).toContain('workflow.review_gates.pre_implementation.review_type');
      expect(keys).toContain('workflow.review_gates.pre_implementation.threshold');
      expect(keys).toContain('workflow.review_gate_effective_date');
      expect(keys).toContain('git.branch_root');
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
});
