import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { StatementManager } from '../../src/services/StatementManager.js';
import { DEFAULT_STATEMENTS } from '../../src/services/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_STATEMENTS_PATH = join(
  __dirname,
  '..',
  'fixtures',
  'test-project',
  'default-statements.md',
);

describe('StatementManager', () => {
  describe('constructor', () => {
    it('throws when no file path provided', () => {
      expect(() => new StatementManager()).toThrow('requires an explicit file path');
    });

    it('accepts a valid file path', () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      expect(manager).toBeDefined();
    });
  });

  describe('loadStatements — from fixture', () => {
    it('loads all statements from fixture file', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      // All 8 default keys should be present (fixture has all 8)
      const all = manager.getAllStatements();
      const keys = Object.keys(all);
      expect(keys).toContain('start-project-statement');
      expect(keys).toContain('continue-project-statement');
      expect(keys).toContain('tool-intro-statement');
      expect(keys).toContain('instruction-intro-statement');
      expect(keys).toContain('current-events-header');
      expect(keys).toContain('additional-notes-header');
      expect(keys).toContain('no-tools-statement');
      expect(keys).toContain('custom-instruction-statement');
    });

    it('parses HTML comment metadata correctly', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      const all = manager.getAllStatements();
      const stmt = all['start-project-statement'];
      expect(stmt).toBeDefined();
      expect(stmt.key).toBe('start-project-statement');
      expect(stmt.editable).toBe(true);
      expect(stmt.content).toContain('Starting work on');
    });
  });

  describe('loadStatements — fallback to defaults', () => {
    it('falls back to DEFAULT_STATEMENTS when file missing', async () => {
      const manager = new StatementManager('/nonexistent/path/statements.md');
      await manager.loadStatements();

      const all = manager.getAllStatements();
      const defaultKeys = Object.keys(DEFAULT_STATEMENTS);
      for (const key of defaultKeys) {
        expect(all[key]).toBeDefined();
        expect(all[key].content).toBe(DEFAULT_STATEMENTS[key].content);
      }
    });

    it('falls back to defaults on corrupted file', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-stmt-corrupt-'));
      const tempFile = join(tempDir, 'statements.md');
      await writeFile(tempFile, '{{{{{{corrupted content that has no sections');

      const manager = new StatementManager(tempFile);
      await manager.loadStatements();

      const all = manager.getAllStatements();
      // Should have all default keys via backfill
      const defaultKeys = Object.keys(DEFAULT_STATEMENTS);
      for (const key of defaultKeys) {
        expect(all[key]).toBeDefined();
      }

      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('loadStatements — default backfill', () => {
    it('fills missing keys from defaults', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-stmt-partial-'));
      const tempFile = join(tempDir, 'statements.md');

      // Write a file with only one statement
      const content = `---
version: "1.0.0"
---

## Start Statement
<!-- key: start-project-statement, editable: true -->

Custom start content.
`;
      await writeFile(tempFile, content);

      const manager = new StatementManager(tempFile);
      await manager.loadStatements();

      const all = manager.getAllStatements();
      // Custom content preserved
      expect(all['start-project-statement'].content).toBe('Custom start content.');
      // Missing keys filled from defaults
      expect(all['continue-project-statement']).toBeDefined();
      expect(all['continue-project-statement'].content).toBe(
        DEFAULT_STATEMENTS['continue-project-statement'].content,
      );

      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('getStatement', () => {
    it('returns correct content after loading', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      const content = manager.getStatement('start-project-statement');
      expect(content).toContain('Starting work on');
    });

    it('throws when not loaded', () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      expect(() => manager.getStatement('start-project-statement')).toThrow(
        'Statements not loaded',
      );
    });

    it('returns default for unknown key that exists in defaults', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-stmt-unknown-'));
      const tempFile = join(tempDir, 'statements.md');
      await writeFile(tempFile, '---\n---\n');

      const manager = new StatementManager(tempFile);
      await manager.loadStatements();

      // All default keys should be available via backfill
      const content = manager.getStatement('start-project-statement');
      expect(content).toBe(DEFAULT_STATEMENTS['start-project-statement'].content);

      await rm(tempDir, { recursive: true, force: true });
    });

    it('returns empty string for completely unknown key', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      const content = manager.getStatement('totally-nonexistent-key');
      expect(content).toBe('');
    });
  });

  describe('updateStatement', () => {
    let tempDir: string;
    let tempFile: string;
    let manager: StatementManager;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cf-stmt-update-'));
      tempFile = join(tempDir, 'statements.md');

      const content = `---
version: "1.0.0"
---

## Editable Statement
<!-- key: start-project-statement, editable: true -->

Original content.

## Read Only Statement
<!-- key: no-tools-statement, editable: false -->

Cannot edit this.
`;
      await writeFile(tempFile, content);
      manager = new StatementManager(tempFile);
      await manager.loadStatements();
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('updates editable statement content', () => {
      manager.updateStatement('start-project-statement', 'Updated content');
      expect(manager.getStatement('start-project-statement')).toBe('Updated content');
    });

    it('throws when updating non-editable statement', () => {
      expect(() => manager.updateStatement('no-tools-statement', 'new')).toThrow('not editable');
    });

    it('throws when updating non-existent statement', () => {
      expect(() => manager.updateStatement('fake-key', 'new')).toThrow('not found');
    });

    it('throws on empty content', () => {
      expect(() => manager.updateStatement('start-project-statement', '')).toThrow(
        'cannot be empty',
      );
    });

    it('throws on whitespace-only content', () => {
      expect(() => manager.updateStatement('start-project-statement', '   ')).toThrow(
        'cannot be empty',
      );
    });

    it('throws when not loaded', () => {
      const fresh = new StatementManager(tempFile);
      expect(() => fresh.updateStatement('start-project-statement', 'x')).toThrow(
        'Statements not loaded',
      );
    });
  });

  describe('saveStatements', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), 'cf-stmt-save-'));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    it('writes statements to file atomically', async () => {
      const tempFile = join(tempDir, 'statements.md');
      const manager = new StatementManager(tempFile);
      manager.resetToDefaults();

      await manager.saveStatements();

      expect(existsSync(tempFile)).toBe(true);
      const content = await readFile(tempFile, 'utf-8');
      expect(content).toContain('## ');
      expect(content).toContain('<!-- key:');
      // No leftover .tmp file
      expect(existsSync(`${tempFile}.tmp`)).toBe(false);
    });

    it('creates directory if missing', async () => {
      const nestedFile = join(tempDir, 'nested', 'dir', 'statements.md');
      const manager = new StatementManager(nestedFile);
      manager.resetToDefaults();

      await manager.saveStatements();

      expect(existsSync(nestedFile)).toBe(true);
    });

    it('round-trips: save then load preserves content', async () => {
      const tempFile = join(tempDir, 'statements.md');
      const manager = new StatementManager(tempFile);
      manager.resetToDefaults();
      manager.updateStatement('start-project-statement', 'Custom start text.');

      await manager.saveStatements();

      // Load in a fresh instance
      const manager2 = new StatementManager(tempFile);
      await manager2.loadStatements();
      expect(manager2.getStatement('start-project-statement')).toBe('Custom start text.');
    });
  });

  describe('setFilePath', () => {
    it('resets loaded state', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      manager.setFilePath('/some/other/path.md');
      expect(() => manager.getStatement('start-project-statement')).toThrow(
        'Statements not loaded',
      );
    });
  });

  describe('resetToDefaults', () => {
    it('restores all default statements', () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      manager.resetToDefaults();

      const all = manager.getAllStatements();
      const defaultKeys = Object.keys(DEFAULT_STATEMENTS);
      expect(Object.keys(all).length).toBe(defaultKeys.length);
      for (const key of defaultKeys) {
        expect(all[key].content).toBe(DEFAULT_STATEMENTS[key].content);
      }
    });

    it('allows getStatement after reset without loadStatements', () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      manager.resetToDefaults();
      // Should not throw — isLoaded set to true by resetToDefaults
      const content = manager.getStatement('start-project-statement');
      expect(content).toBe(DEFAULT_STATEMENTS['start-project-statement'].content);
    });
  });

  describe('getAllStatements', () => {
    it('throws when not loaded', () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      expect(() => manager.getAllStatements()).toThrow('Statements not loaded');
    });

    it('returns a copy (not a reference)', async () => {
      const manager = new StatementManager(FIXTURE_STATEMENTS_PATH);
      await manager.loadStatements();

      const copy = manager.getAllStatements();
      delete copy['start-project-statement'];
      // Original should still have it
      expect(manager.getStatement('start-project-statement')).toBeTruthy();
    });
  });
});
