import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { SystemPromptParser } from '../../src/services/SystemPromptParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_PROMPT_PATH = join(
  __dirname,
  '..',
  'fixtures',
  'test-project',
  'project-documents',
  'ai-project-guide',
  'project-guides',
  'prompt.ai-project.system.md',
);

describe('SystemPromptParser', () => {
  describe('constructor', () => {
    it('throws when no file path provided', () => {
      expect(() => new SystemPromptParser()).toThrow('requires an explicit file path');
    });
  });

  describe('parsePromptFile — section parsing', () => {
    let parser: SystemPromptParser;

    beforeEach(() => {
      parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
    });

    it('parses all ##### sections from fixture', async () => {
      const parsed = await parser.parsePromptFile();
      // Fixture has 6 sections: Context Initialization, Context Initialization Monorepo,
      // Tool Use, implementation, design, review
      expect(parsed.prompts.length).toBe(6);
      expect(parsed.errors).toHaveLength(0);
    });

    it('generates lowercased hyphenated keys from headers', async () => {
      const parsed = await parser.parsePromptFile();
      const keys = parsed.prompts.map((p) => p.key);
      expect(keys).toContain('context-initialization');
      expect(keys).toContain('tool-usage');
      expect(keys).toContain('implementation');
      expect(keys).toContain('design');
      expect(keys).toContain('review');
    });

    it('extracts parameters from content', async () => {
      const parsed = await parser.parsePromptFile();
      const contextInit = parsed.prompts.find((p) => p.key === 'context-initialization');
      expect(contextInit).toBeDefined();
      // Content has {projectName}, {fileSlice}, {project_state} — but only \w+ matches
      expect(contextInit!.parameters).toContain('projectName');
      expect(contextInit!.parameters).toContain('fileSlice');
    });

    it('preserves section content', async () => {
      const parsed = await parser.parsePromptFile();
      const impl = parsed.prompts.find((p) => p.key === 'implementation');
      expect(impl).toBeDefined();
      expect(impl!.content).toContain('implementing the specified feature');
    });
  });

  describe('getPromptForInstruction', () => {
    let parser: SystemPromptParser;

    beforeEach(() => {
      parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
    });

    it('finds prompt by exact instruction name', async () => {
      const prompt = await parser.getPromptForInstruction('implementation');
      expect(prompt).not.toBeNull();
      expect(prompt!.key).toBe('implementation');
    });

    it('finds prompt by case-insensitive match', async () => {
      const prompt = await parser.getPromptForInstruction('Design');
      expect(prompt).not.toBeNull();
      expect(prompt!.key).toBe('design');
    });

    it('returns null for unknown instruction', async () => {
      const prompt = await parser.getPromptForInstruction('nonexistent-instruction');
      expect(prompt).toBeNull();
    });
  });

  describe('getContextInitializationPrompt', () => {
    let parser: SystemPromptParser;

    beforeEach(() => {
      parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
    });

    it('returns context init prompt', async () => {
      const prompt = await parser.getContextInitializationPrompt();
      expect(prompt).not.toBeNull();
      expect(prompt!.key).toBe('context-initialization');
    });
  });

  describe('getToolUsePrompt', () => {
    it('returns tool use prompt from fixture', async () => {
      const parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
      const prompt = await parser.getToolUsePrompt();
      expect(prompt).not.toBeNull();
      expect(prompt!.content).toContain('tools');
    });

    it('returns null when no matching section exists', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-parser-notool-'));
      const tempFile = join(tempDir, 'prompt.md');
      await writeFile(
        tempFile,
        '---\ndocType: system-prompt\n---\n\n##### Some Section\nNo tool info here.\n',
      );
      const parser = new SystemPromptParser(tempFile);
      const prompt = await parser.getToolUsePrompt();
      expect(prompt).toBeNull();
      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('getAllPrompts', () => {
    it('returns all prompts from fixture', async () => {
      const parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
      const prompts = await parser.getAllPrompts();
      expect(prompts.length).toBe(6);
      expect(prompts.every((p) => p.name && p.key && p.content)).toBe(true);
    });
  });

  describe('caching behavior', () => {
    let parser: SystemPromptParser;

    beforeEach(() => {
      parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
    });

    it('returns cached result on second call', async () => {
      const first = await parser.parsePromptFile();
      const second = await parser.parsePromptFile();
      // Same result structure (cache hit)
      expect(second.prompts.length).toBe(first.prompts.length);
    });

    it('invalidates cache after setFilePath', async () => {
      await parser.parsePromptFile();
      parser.setFilePath(FIXTURE_PROMPT_PATH);
      // Should re-parse (cache cleared)
      const result = await parser.parsePromptFile();
      expect(result.prompts.length).toBe(6);
    });

    it('invalidates cache after clearCache', async () => {
      await parser.parsePromptFile();
      parser.clearCache();
      const result = await parser.parsePromptFile();
      expect(result.prompts.length).toBe(6);
    });

    it('invalidates cache when file content changes', async () => {
      let tempDir: string;
      tempDir = await mkdtemp(join(tmpdir(), 'cf-parser-cache-'));
      const tempFile = join(tempDir, 'prompt.md');

      // Write initial content
      await writeFile(
        tempFile,
        '---\ndocType: system-prompt\n---\n\n##### Section One\nOriginal content.\n',
      );

      const tempParser = new SystemPromptParser(tempFile);
      const first = await tempParser.parsePromptFile();
      expect(first.prompts.length).toBe(1);

      // Wait a tick and modify file (fs mtime changes)
      await new Promise((resolve) => setTimeout(resolve, 50));
      await writeFile(
        tempFile,
        '---\ndocType: system-prompt\n---\n\n##### Section One\nChanged.\n\n##### Section Two\nNew section.\n',
      );

      const second = await tempParser.parsePromptFile();
      expect(second.prompts.length).toBe(2);

      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('setFilePath', () => {
    it('switches to a different file', async () => {
      const parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
      await parser.parsePromptFile();

      // Create a temp file with different content
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-parser-setpath-'));
      const tempFile = join(tempDir, 'prompt.md');
      await writeFile(
        tempFile,
        '---\ndocType: system-prompt\n---\n\n##### Only Section\nSingle section content.\n',
      );

      parser.setFilePath(tempFile);
      const result = await parser.parsePromptFile();
      expect(result.prompts.length).toBe(1);
      expect(result.prompts[0].key).toBe('only-section');

      await rm(tempDir, { recursive: true, force: true });
    });
  });

  describe('error handling', () => {
    it('throws when file does not exist', async () => {
      const parser = new SystemPromptParser('/nonexistent/path/prompt.md');
      await expect(parser.parsePromptFile()).rejects.toThrow('not found');
    });
  });

  describe('validatePromptFile', () => {
    it('validates fixture file as valid', async () => {
      const parser = new SystemPromptParser(FIXTURE_PROMPT_PATH);
      const result = await parser.validatePromptFile();
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports missing file', async () => {
      const parser = new SystemPromptParser('/nonexistent/prompt.md');
      const result = await parser.validatePromptFile();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Prompt file does not exist');
    });

    it('reports missing frontmatter', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-parser-validate-'));
      const tempFile = join(tempDir, 'prompt.md');
      await writeFile(tempFile, '##### Section\nContent.\n');

      const parser = new SystemPromptParser(tempFile);
      const result = await parser.validatePromptFile();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Missing YAML frontmatter');

      await rm(tempDir, { recursive: true, force: true });
    });

    it('reports missing sections', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'cf-parser-validate2-'));
      const tempFile = join(tempDir, 'prompt.md');
      await writeFile(tempFile, '---\ndocType: system-prompt\n---\n\nNo sections here.\n');

      const parser = new SystemPromptParser(tempFile);
      const result = await parser.validatePromptFile();
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No prompt sections found (##### headers)');

      await rm(tempDir, { recursive: true, force: true });
    });
  });
});
