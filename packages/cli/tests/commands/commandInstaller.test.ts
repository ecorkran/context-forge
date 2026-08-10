import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getSourceCommandsDir,
  installCommands,
  uninstallCommands,
  installCommandsAction,
  resolveCommandTarget,
  resolveInstallDir,
  COMMAND_TARGETS,
} from '../../src/commands/commandInstaller.js';

/** Read the source cf/ directory to determine expected Claude command files. */
function getExpectedFiles(): string[] {
  const sourceDir = path.join(getSourceCommandsDir(), 'cf');
  return fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md')).sort();
}

/** Read the source codex/ directory to determine expected skill directories. */
function getExpectedSkills(): string[] {
  const sourceDir = path.join(getSourceCommandsDir(), 'codex');
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

describe('commandInstaller', () => {
  let tempDir: string;
  let expectedFiles: string[];
  let expectedSkills: string[];

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cmd-test-'));
    expectedFiles = getExpectedFiles();
    expectedSkills = getExpectedSkills();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSourceCommandsDir', () => {
    it('resolves to existing directory containing cf/ and codex/ subdirectories', () => {
      const dir = getSourceCommandsDir();
      expect(dir).toContain('commands');
      expect(fs.existsSync(path.join(dir, 'cf'))).toBe(true);
      expect(fs.existsSync(path.join(dir, 'codex'))).toBe(true);
    });
  });

  describe('resolveCommandTarget', () => {
    it('resolves claude and the codex/openai aliases', () => {
      expect(resolveCommandTarget('claude')).toBe('claude');
      expect(resolveCommandTarget('agents')).toBe('agents');
      expect(resolveCommandTarget('codex')).toBe('agents');
      expect(resolveCommandTarget('openai')).toBe('agents');
      expect(resolveCommandTarget('  Codex ')).toBe('agents');
    });

    it('rejects valid IDE targets without command delivery', () => {
      expect(() => resolveCommandTarget('copilot')).toThrow(/No command delivery/);
      expect(() => resolveCommandTarget('cursor')).toThrow(/No command delivery/);
    });

    it('rejects unknown targets with the standard message', () => {
      expect(() => resolveCommandTarget('bogus')).toThrow(/Invalid target/);
    });
  });

  describe('resolveInstallDir', () => {
    it('defaults to project-local per target', () => {
      expect(resolveInstallDir('claude')).toBe(path.resolve(process.cwd(), '.claude/commands'));
      expect(resolveInstallDir('agents')).toBe(path.resolve(process.cwd(), '.agents/skills'));
    });

    it('resolves --global to the machine-level directory per target', () => {
      expect(resolveInstallDir('claude', { global: true })).toBe(
        path.join(os.homedir(), '.claude', 'commands'),
      );
      expect(resolveInstallDir('agents', { global: true })).toBe(
        path.join(os.homedir(), '.codex', 'skills'),
      );
    });

    it('explicit targetDir overrides both scopes', () => {
      expect(resolveInstallDir('claude', { global: true, targetDir: '/tmp/x' })).toBe(
        path.resolve('/tmp/x'),
      );
      expect(resolveInstallDir('agents', { targetDir: '/tmp/y' })).toBe(path.resolve('/tmp/y'));
    });
  });

  describe('installCommands — claude (flat-md)', () => {
    it('copies all command files on fresh install', () => {
      const { installed } = installCommands('claude', tempDir);

      for (const file of expectedFiles) {
        expect(installed).toContain(file);
        expect(fs.existsSync(path.join(tempDir, 'cf', file))).toBe(true);
      }
    });

    it('file contents match source files', () => {
      installCommands('claude', tempDir);

      const sourceDir = path.join(getSourceCommandsDir(), 'cf');
      for (const file of expectedFiles) {
        const sourceContent = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        const installedContent = fs.readFileSync(path.join(tempDir, 'cf', file), 'utf8');
        expect(installedContent).toBe(sourceContent);
      }
    });

    it('is idempotent and prunes stale managed files', () => {
      installCommands('claude', tempDir);
      fs.writeFileSync(path.join(tempDir, 'cf', 'stale.md'), '# gone');
      const { removed } = installCommands('claude', tempDir);

      expect(removed).toContain('stale.md');
      expect(fs.readdirSync(path.join(tempDir, 'cf'))).toHaveLength(expectedFiles.length);
    });
  });

  describe('installCommands — agents (skill-dirs)', () => {
    it('copies all skill directories on fresh install', () => {
      const { installed } = installCommands('agents', tempDir);

      expect(installed.sort()).toEqual(expectedSkills);
      for (const skill of expectedSkills) {
        expect(fs.existsSync(path.join(tempDir, skill, 'SKILL.md'))).toBe(true);
      }
    });

    it('is idempotent (overwrite on re-install)', () => {
      installCommands('agents', tempDir);
      installCommands('agents', tempDir);

      const dirs = fs.readdirSync(tempDir);
      expect(dirs).toHaveLength(expectedSkills.length);
    });

    it('prunes stale managed skill directories', () => {
      installCommands('agents', tempDir);
      fs.mkdirSync(path.join(tempDir, 'cf-removed'));
      fs.writeFileSync(path.join(tempDir, 'cf-removed', 'SKILL.md'), '# old skill');

      const { removed } = installCommands('agents', tempDir);

      expect(removed).toContain('cf-removed');
      expect(fs.existsSync(path.join(tempDir, 'cf-removed'))).toBe(false);
    });

    it('never touches user skills or non-skill cf- directories', () => {
      installCommands('agents', tempDir);
      // A user's own skill (no cf- prefix) and a cf--prefixed dir with no SKILL.md
      fs.mkdirSync(path.join(tempDir, 'my-skill'));
      fs.writeFileSync(path.join(tempDir, 'my-skill', 'SKILL.md'), '# mine');
      fs.mkdirSync(path.join(tempDir, 'cf-data'));
      fs.writeFileSync(path.join(tempDir, 'cf-data', 'notes.txt'), 'not a skill');

      const { removed } = installCommands('agents', tempDir);

      expect(removed).toHaveLength(0);
      expect(fs.existsSync(path.join(tempDir, 'my-skill', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'cf-data', 'notes.txt'))).toBe(true);
    });
  });

  describe('uninstallCommands — claude', () => {
    it('removes command files and empty cf/ directory', () => {
      installCommands('claude', tempDir);
      const removed = uninstallCommands('claude', tempDir);

      for (const file of expectedFiles) {
        expect(removed).toContain(file);
      }
      expect(fs.existsSync(path.join(tempDir, 'cf'))).toBe(false);
    });

    it('preserves user-added files and keeps cf/ directory', () => {
      installCommands('claude', tempDir);
      fs.writeFileSync(path.join(tempDir, 'cf', 'custom.md'), '# My command');

      const removed = uninstallCommands('claude', tempDir);

      expect(removed).toHaveLength(expectedFiles.length);
      expect(fs.existsSync(path.join(tempDir, 'cf', 'custom.md'))).toBe(true);
    });

    it('is idempotent (no error when not installed)', () => {
      expect(uninstallCommands('claude', tempDir)).toHaveLength(0);
    });
  });

  describe('uninstallCommands — agents', () => {
    it('removes managed skill directories, preserves others, keeps parent', () => {
      installCommands('agents', tempDir);
      // Simulates a guide workflow skill sharing .agents/skills/
      fs.mkdirSync(path.join(tempDir, 'analyze'));
      fs.writeFileSync(path.join(tempDir, 'analyze', 'SKILL.md'), '# guide skill');

      const removed = uninstallCommands('agents', tempDir);

      expect(removed.sort()).toEqual(expectedSkills);
      expect(fs.existsSync(path.join(tempDir, 'analyze', 'SKILL.md'))).toBe(true);
      expect(fs.existsSync(tempDir)).toBe(true);
    });

    it('is idempotent (no error when not installed)', () => {
      expect(uninstallCommands('agents', tempDir)).toHaveLength(0);
    });
  });

  describe('command file format', () => {
    it('all Claude command files have frontmatter with required fields', () => {
      const sourceDir = path.join(getSourceCommandsDir(), 'cf');
      for (const file of expectedFiles) {
        const content = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        expect(content.startsWith('---\n')).toBe(true);
        expect(content).toContain('description:');
        expect(content).toContain('allowed-tools:');
      }
    });

    it('all Codex skills have SKILL.md with name matching the directory', () => {
      const sourceDir = path.join(getSourceCommandsDir(), 'codex');
      for (const skill of expectedSkills) {
        const content = fs.readFileSync(path.join(sourceDir, skill, 'SKILL.md'), 'utf8');
        expect(content.startsWith('---\n')).toBe(true);
        expect(content).toContain(`name: ${skill}`);
        expect(content).toContain('description:');
      }
    });

    it('ships one skill per Claude command, named cf-<command>', () => {
      const commandNames = expectedFiles.map((f) => `cf-${f.replace(/\.md$/, '')}`).sort();
      expect(expectedSkills).toEqual(commandNames);
    });
  });
});

describe('installCommandsAction', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-action-test-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function logOutput(): string {
    return vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
  }

  it('installs Claude commands to an explicit directory and reports /cf: invocations', () => {
    installCommandsAction('claude', { targetDir: tempDir });

    expect(fs.existsSync(path.join(tempDir, 'cf', 'status.md'))).toBe(true);
    expect(logOutput()).toContain(tempDir);
    expect(logOutput()).toContain('/cf:status');
  });

  it('installs Codex skills to an explicit directory and reports $ invocations', () => {
    installCommandsAction('codex', { targetDir: tempDir });

    expect(fs.existsSync(path.join(tempDir, 'cf-status', 'SKILL.md'))).toBe(true);
    expect(logOutput()).toContain('skills');
    expect(logOutput()).toContain('$cf-status');
  });

  it('throws on targets without command delivery', () => {
    expect(() => installCommandsAction('copilot', { targetDir: tempDir })).toThrow(
      /No command delivery/,
    );
  });
});

describe('COMMAND_TARGETS descriptor', () => {
  it('claude and agents descriptors define distinct layouts and directories', () => {
    expect(COMMAND_TARGETS.claude.layout).toBe('flat-md');
    expect(COMMAND_TARGETS.agents.layout).toBe('skill-dirs');
    expect(COMMAND_TARGETS.claude.localDir).toBe('.claude/commands');
    expect(COMMAND_TARGETS.agents.localDir).toBe('.agents/skills');
  });
});
