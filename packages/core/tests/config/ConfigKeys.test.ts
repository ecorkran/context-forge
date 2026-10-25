import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ADOPTION_OPT_OUT,
  ADOPTION_STATES,
  CONFIG_KEYS,
  LEGACY_ADOPTION_STATES,
  PERMISSIVENESS_LEVELS,
  STANDARD_PERMISSIVENESS,
  parseRulesExclude,
} from '../../src/config/ConfigKeys.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';

// Slice 269 D1, verbatim.
const ADOPTION_STATE_DESCRIPTION =
  'Set to "declined" to treat this project as new even when it holds existing code. ' +
  "Empty (default): cf decides from the project's files. The old values in_progress and complete are ignored.";

describe('CONFIG_KEYS', () => {
  it('every entry has a valid scope', () => {
    for (const [key, def] of Object.entries(CONFIG_KEYS)) {
      expect(['shared', 'personal'], `${key} has an invalid scope`).toContain(def.scope);
    }
  });

  it('classifies git.integration_branch as personal', () => {
    expect(CONFIG_KEYS['git.integration_branch'].scope).toBe('personal');
  });

  it('classifies guide.source and workflow.review_enabled as shared', () => {
    expect(CONFIG_KEYS['guide.source'].scope).toBe('shared');
    expect(CONFIG_KEYS['workflow.review_enabled'].scope).toBe('shared');
  });
});

describe('workflow.decision_gate_enabled', () => {
  it('is a shared boolean defaulting to true', () => {
    const def = CONFIG_KEYS['workflow.decision_gate_enabled'];
    expect(def.type).toBe('boolean');
    expect(def.scope).toBe('shared');
    expect(def.default).toBe(true);
  });
});

describe('workflow.setup_ci_offer', () => {
  it('is a shared boolean defaulting to true', () => {
    const def = CONFIG_KEYS['workflow.setup_ci_offer'];
    expect(def.type).toBe('boolean');
    expect(def.scope).toBe('shared');
    expect(def.default).toBe(true);
  });
});

describe('workflow.permissiveness', () => {
  const def = CONFIG_KEYS['workflow.permissiveness'];
  let dataDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-perm-data-'));
    projectDir = await mkdtemp(join(tmpdir(), 'cf-perm-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(dataDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('is a shared string defaulting to standard, enum = PERMISSIVENESS_LEVELS', () => {
    expect(def.type).toBe('string');
    expect(def.scope).toBe('shared');
    expect(def.default).toBe('standard');
    expect(def.default).toBe(STANDARD_PERMISSIVENESS);
    expect(def.enum).toEqual([...PERMISSIVENESS_LEVELS]);
  });

  it.each(PERMISSIVENESS_LEVELS)('accepts %s', async (level) => {
    const cm = new ConfigManager(projectDir);
    await cm.set('workflow.permissiveness', level, 'project');
    expect((await cm.get('workflow.permissiveness')).value).toBe(level);
  });

  it('rejects an unknown level and names every valid level', async () => {
    const cm = new ConfigManager(projectDir);
    const attempt = cm.set('workflow.permissiveness', 'bogus', 'project');
    await expect(attempt).rejects.toThrow(/must be one of/);
    for (const level of PERMISSIVENESS_LEVELS) {
      await expect(attempt).rejects.toThrow(level);
    }
  });
});

describe('adoption.state', () => {
  const def = CONFIG_KEYS['adoption.state'];
  let dataDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-adopt-data-'));
    projectDir = await mkdtemp(join(tmpdir(), 'cf-adopt-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(dataDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('is a shared string defaulting to empty, enum = ["", "declined"]', () => {
    expect(def).toBeDefined();
    expect(def.type).toBe('string');
    expect(def.scope).toBe('shared');
    expect(def.default).toBe('');
    expect(def.enum).toEqual(['', ADOPTION_OPT_OUT]);
    expect(def.enum).toEqual([...ADOPTION_STATES]);
  });

  it('describes only the opt-out (D1)', () => {
    expect(def.description).toBe(ADOPTION_STATE_DESCRIPTION);
  });

  it.each(ADOPTION_STATES)('accepts %j and stores it in the shared project file', async (state) => {
    const cm = new ConfigManager(projectDir);
    await cm.set('adoption.state', state, 'project');
    expect((await cm.get('adoption.state')).value).toBe(state);
    const shared = await readFile(join(projectDir, '.context-forge.toml'), 'utf-8');
    expect(shared).toContain('[adoption]');
    expect(shared).toContain(`state = "${state}"`);
    await expect(
      readFile(join(projectDir, '.context-forge.personal.toml'), 'utf-8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['maybe', ...LEGACY_ADOPTION_STATES])('rejects %j and names both allowed values', async (value) => {
    const cm = new ConfigManager(projectDir);
    const attempt = cm.set('adoption.state', value, 'project');
    await expect(attempt).rejects.toThrow(/must be one of/);
    await expect(attempt).rejects.toThrow('""');
    await expect(attempt).rejects.toThrow(`"${ADOPTION_OPT_OUT}"`);
  });

  it.each(LEGACY_ADOPTION_STATES)('reads a stored legacy %j without validating it', async (value) => {
    await writeFile(join(projectDir, '.context-forge.toml'), `[adoption]\nstate = "${value}"\n`);
    expect((await new ConfigManager(projectDir).get('adoption.state')).value).toBe(value);
  });
});

describe('parseRulesExclude', () => {
  it('splits on commas and gives [] for an empty value', () => {
    expect(parseRulesExclude('')).toEqual([]);
    expect(parseRulesExclude('dart.md')).toEqual(['dart.md']);
    expect(parseRulesExclude('dart.md,swift*.md')).toEqual(['dart.md', 'swift*.md']);
  });
});

describe('rules.exclude', () => {
  const def = CONFIG_KEYS['rules.exclude'];

  it('is a shared string key defaulting to empty', () => {
    expect(def).toBeDefined();
    expect(def.type).toBe('string');
    expect(def.default).toBe('');
    // "This project has no Dart code" is a property of the project, not of
    // the developer, so every contributor gets the same exclusions.
    expect(def.scope).toBe('shared');
  });

  it('names its consumer in the description', () => {
    // Someone reading `cf config get rules.exclude` should not have to guess
    // who acts on it: cf setup-ide.
    expect(def.description).toContain('setup-ide');
  });

  it('accepts empty as the identity default', () => {
    expect(def.validate?.('')).toBeNull();
  });

  it('accepts a well-formed multi-glob list', () => {
    expect(def.validate?.('dart.md')).toBeNull();
    expect(def.validate?.('dart.md,swift*.md')).toBeNull();
    expect(def.validate?.('dart.md,swift*.md,kotlin.md')).toBeNull();
  });

  it('rejects surrounding whitespace on an entry', () => {
    // The installer matches patterns literally, so " swift*.md" would
    // silently never match.
    const result = def.validate?.('dart.md, swift*.md');
    expect(result).toBeTruthy();
    expect(result).toContain('whitespace');
  });

  it('rejects leading and trailing whitespace anywhere in the list', () => {
    expect(def.validate?.(' dart.md')).toBeTruthy();
    expect(def.validate?.('dart.md ')).toBeTruthy();
    expect(def.validate?.('dart.md ,swift.md')).toBeTruthy();
  });

  it('rejects an empty entry from a doubled or trailing comma', () => {
    const doubled = def.validate?.('dart.md,,swift.md');
    expect(doubled).toBeTruthy();
    expect(doubled).toContain('comma');

    expect(def.validate?.('dart.md,')).toBeTruthy();
    expect(def.validate?.(',dart.md')).toBeTruthy();
  });

  it('names the offending entry so the message is actionable', () => {
    expect(def.validate?.('dart.md, swift*.md')).toContain('swift*.md');
  });
});

describe('guide.exclude', () => {
  const def = CONFIG_KEYS['guide.exclude'];

  it('is a shared string key defaulting to empty', () => {
    expect(def).toBeDefined();
    expect(def.type).toBe('string');
    expect(def.default).toBe('');
    // The guide is committed, so its exclude list has to be shared too.
    expect(def.scope).toBe('shared');
  });

  it('accepts empty and a lenient multi-entry list', () => {
    expect(def.validate?.('')).toBeNull();
    expect(def.validate?.('tool-guides/**,framework-guides')).toBeNull();
  });

  it('refuses a protected path, naming it', () => {
    expect(def.validate?.('project-guides')).toContain('project-guides');
  });

  it('refuses an unsupported wildcard', () => {
    expect(def.validate?.('tool-*')).toBeTruthy();
  });

  it('rejects a non-string value', () => {
    expect(def.validate?.(true)).toBe('must be a string');
  });
});
