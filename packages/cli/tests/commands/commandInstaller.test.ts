import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getSourceCommandsDir,
  installCommands,
  uninstallCommands,
} from '../../src/commands/commandInstaller.js';

describe('commandInstaller', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-cmd-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('getSourceCommandsDir', () => {
    it('resolves to existing directory containing cf/ subdirectory', () => {
      const dir = getSourceCommandsDir();
      expect(dir).toContain('commands');
      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(path.join(dir, 'cf'))).toBe(true);
    });
  });

  describe('installCommands', () => {
    it('copies all four command files on fresh install', () => {
      const installed = installCommands(tempDir);

      expect(installed).toContain('status.md');
      expect(installed).toContain('build.md');
      expect(installed).toContain('next.md');
      expect(installed).toContain('prompt.md');

      for (const file of installed) {
        expect(fs.existsSync(path.join(tempDir, 'cf', file))).toBe(true);
      }
    });

    it('file contents match source files', () => {
      installCommands(tempDir);

      const sourceDir = path.join(getSourceCommandsDir(), 'cf');
      const files = ['status.md', 'build.md', 'next.md', 'prompt.md'];

      for (const file of files) {
        const sourceContent = fs.readFileSync(path.join(sourceDir, file), 'utf8');
        const installedContent = fs.readFileSync(path.join(tempDir, 'cf', file), 'utf8');
        expect(installedContent).toBe(sourceContent);
      }
    });

    it('is idempotent (overwrite on re-install)', () => {
      installCommands(tempDir);
      installCommands(tempDir);

      const files = fs.readdirSync(path.join(tempDir, 'cf'));
      expect(files).toHaveLength(4);
    });
  });

  describe('uninstallCommands', () => {
    it('removes command files and empty cf/ directory', () => {
      installCommands(tempDir);
      const removed = uninstallCommands(tempDir);

      expect(removed).toContain('status.md');
      expect(removed).toContain('build.md');
      expect(removed).toContain('next.md');
      expect(removed).toContain('prompt.md');

      expect(fs.existsSync(path.join(tempDir, 'cf'))).toBe(false);
    });

    it('preserves user-added files and keeps cf/ directory', () => {
      installCommands(tempDir);

      // Add a user file
      fs.writeFileSync(path.join(tempDir, 'cf', 'custom.md'), '# My command');

      const removed = uninstallCommands(tempDir);

      expect(removed).toHaveLength(4);
      // cf/ directory still exists because custom.md remains
      expect(fs.existsSync(path.join(tempDir, 'cf'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'cf', 'custom.md'))).toBe(true);
    });

    it('is idempotent (no error when not installed)', () => {
      const removed = uninstallCommands(tempDir);
      expect(removed).toHaveLength(0);
    });
  });

  describe('custom target directory', () => {
    it('installs to and uninstalls from custom location', () => {
      const customDir = path.join(tempDir, 'custom', 'location');

      const installed = installCommands(customDir);
      expect(installed).toHaveLength(4);
      expect(fs.existsSync(path.join(customDir, 'cf', 'status.md'))).toBe(true);

      const removed = uninstallCommands(customDir);
      expect(removed).toHaveLength(4);
      expect(fs.existsSync(path.join(customDir, 'cf'))).toBe(false);
    });
  });

  describe('command file format', () => {
    it('all command files have valid YAML frontmatter with required fields', () => {
      installCommands(tempDir);

      const files = ['status.md', 'build.md', 'next.md', 'prompt.md'];

      for (const file of files) {
        const content = fs.readFileSync(path.join(tempDir, 'cf', file), 'utf8');
        expect(content.startsWith('---\n')).toBe(true);
        expect(content).toContain('description:');
        expect(content).toContain('allowed-tools:');
      }
    });
  });
});
