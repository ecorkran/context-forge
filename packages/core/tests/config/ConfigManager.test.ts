import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'fs/promises';
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
      const result = await cm.get('default_project');
      expect(result.value).toBe('');
      expect(result.source).toBe('default');
      expect(result.key).toBe('default_project');
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
      await cm.set('default_project', 'my-project-id', 'user');
      const result = await cm.get('default_project');
      expect(result.value).toBe('my-project-id');
      expect(result.source).toBe('user');
    });

    it('reads project config value, reports source: project', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('default_project', 'proj-value', 'project');
      const result = await cm.get('default_project');
      expect(result.value).toBe('proj-value');
      expect(result.source).toBe('project');
    });

    it('project config overrides user config (precedence)', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('default_project', 'user-value', 'user');
      await cm.set('default_project', 'project-value', 'project');
      const result = await cm.get('default_project');
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
      const result = await cm.get('default_project');
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
      await cm.set('default_project', 'test-proj', 'user');
      const result = await cm.get('default_project');
      expect(result.value).toBe('test-proj');
      expect(result.source).toBe('user');
    });

    it('writes to project-level TOML file', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('default_project', 'proj-val', 'project');
      const result = await cm.get('default_project');
      expect(result.value).toBe('proj-val');
      expect(result.source).toBe('project');
    });

    it('creates parent directories if config file does not exist yet', async () => {
      const deepDir = join(tempDir, 'a', 'b', 'c');
      const cm = new ConfigManager(deepDir);
      await expect(cm.set('default_project', 'x', 'project')).resolves.not.toThrow();
      const result = await cm.get('default_project');
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
      await expect(cm.set('default_project', 'val', 'project')).rejects.toThrow(
        'no projectPath provided'
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
      await cm.set('default_project', 'first', 'user');
      await cm.set('guide.source', 'https://example.com', 'user');
      const r1 = await cm.get('default_project');
      const r2 = await cm.get('guide.source');
      expect(r1.value).toBe('first');
      expect(r2.value).toBe('https://example.com');
    });
  });

  // --- list() tests ---

  describe('list()', () => {
    it('returns all registered keys with defaults when no config files', async () => {
      const cm = new ConfigManager();
      const entries = await cm.list();
      expect(entries).toHaveLength(5);
      const keys = entries.map((e) => e.key);
      expect(keys).toContain('default_project');
      expect(keys).toContain('guide.auto_update');
      expect(keys).toContain('guide.source');
      expect(keys).toContain('guide.git_strategy');
      expect(keys).toContain('workflow.auto_advance');
      for (const entry of entries) {
        expect(entry.source).toBe('default');
        expect(entry.type).toBeDefined();
        expect(entry.defaultValue).toBeDefined();
      }
    });

    it('shows correct source for overridden values', async () => {
      const cm = new ConfigManager(projectDir);
      await cm.set('default_project', 'user-proj', 'user');
      await cm.set('guide.source', 'proj-source', 'project');
      const entries = await cm.list();
      const defaultProj = entries.find((e) => e.key === 'default_project')!;
      const guideSource = entries.find((e) => e.key === 'guide.source')!;
      expect(defaultProj.source).toBe('user');
      expect(guideSource.source).toBe('project');
    });
  });
});
