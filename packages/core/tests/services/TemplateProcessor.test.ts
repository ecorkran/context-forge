import { describe, it, expect } from 'vitest';
import { TemplateProcessor } from '../../src/services/TemplateProcessor.js';
import { createTestContextData } from '../helpers/testData.js';

describe('TemplateProcessor', () => {
  const processor = new TemplateProcessor();

  describe('processTemplate — double-brace substitution', () => {
    it('replaces {{variable}} with matching data field', () => {
      const data = createTestContextData({ projectName: 'my-app' });
      const result = processor.processTemplate('Working on {{projectName}}.', data);
      expect(result).toBe('Working on my-app.');
    });

    it('replaces multiple variables in one template', () => {
      const data = createTestContextData({ projectName: 'my-app', fileSlice: '42-slice.auth' });
      const result = processor.processTemplate('{{projectName}} — slice {{fileSlice}}', data);
      expect(result).toBe('my-app — slice 42-slice.auth');
    });

    it('replaces missing variable with empty string', () => {
      const data = createTestContextData();
      const result = processor.processTemplate('Hello {{nonExistentVar}}!', data);
      expect(result).toBe('Hello !');
    });
  });

  describe('processTemplate — single-brace substitution', () => {
    it('replaces {variableName} with matching data field', () => {
      const data = createTestContextData({ instruction: 'implementation' });
      const result = processor.processTemplate('Mode: {instruction}', data);
      expect(result).toBe('Mode: implementation');
    });

    it('resolves {project} alias to projectName', () => {
      const data = createTestContextData({ projectName: 'context-forge' });
      const result = processor.processTemplate('Project: {project}', data);
      expect(result).toBe('Project: context-forge');
    });

    it('handles pipe expressions using first part as variable', () => {
      const data = createTestContextData({ fileSlice: '100-slice.auth' });
      const result = processor.processTemplate('{fileSlice | feature}', data);
      expect(result).toBe('100-slice.auth');
    });

    it('returns expression as-is when pipe variable not found', () => {
      const data = createTestContextData();
      const result = processor.processTemplate('{unknownVar | fallback}', data);
      expect(result).toBe('unknownVar | fallback');
    });

    it('returns expression as-is for unrecognized single-brace vars', () => {
      const data = createTestContextData();
      const result = processor.processTemplate('{param}', data);
      expect(result).toBe('param');
    });
  });

  describe('processTemplate — boolean conditionals', () => {
    it('renders true branch when condition is truthy', () => {
      const data = createTestContextData({ isMonorepo: true });
      const template = '{{#if isMonorepo}}mono{{else}}standard{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('mono');
    });

    it('renders false branch when condition is falsy', () => {
      const data = createTestContextData({ isMonorepo: false });
      const template = '{{#if isMonorepo}}mono{{else}}standard{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('standard');
    });

    it('handles non-empty string as truthy', () => {
      const data = createTestContextData({ recentEvents: 'something happened' });
      const template = '{{#if recentEvents}}has events{{else}}no events{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('has events');
    });

    it('handles empty string as falsy', () => {
      const data = createTestContextData({ recentEvents: '' });
      const template = '{{#if recentEvents}}has events{{else}}no events{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('no events');
    });

    it('handles multiline content in conditional branches', () => {
      const data = createTestContextData({ isMonorepo: true });
      const template = '{{#if isMonorepo}}line1\nline2{{else}}other{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('line1\nline2');
    });
  });

  describe('processTemplate — slice parsing', () => {
    it('parses fileSlice into sliceindex and slicename', () => {
      const data = createTestContextData({ fileSlice: '149-slice.integration-core-test' });
      const result = processor.processTemplate('Index: {{sliceindex}}, Name: {{slicename}}', data);
      expect(result).toBe('Index: 149, Name: integration-core-test');
    });

    it('does not parse non-matching fileSlice format', () => {
      const data = createTestContextData({ fileSlice: 'plain-slice-name' });
      const result = processor.processTemplate('Index: {{sliceindex}}', data);
      // sliceindex not set, so replaced with empty string
      expect(result).toBe('Index: ');
    });
  });

  describe('processTemplate — alias resolution', () => {
    it('resolves {development-phase} alias', () => {
      const data = createTestContextData({ developmentPhase: 'Phase 6: Implementation' });
      const result = processor.processTemplate('{development-phase}', data);
      expect(result).toBe('Phase 6: Implementation');
    });

    it('resolves {task-file} alias from fileTasks', () => {
      const data = createTestContextData({ fileTasks: '149-tasks.core-test' });
      const result = processor.processTemplate('{task-file}', data);
      expect(result).toBe('149-tasks.core-test');
    });

    it('resolves {project-date} alias from dateProject', () => {
      const data = createTestContextData({ dateProject: '2026-02-22' });
      const result = processor.processTemplate('{project-date}', data);
      expect(result).toBe('2026-02-22');
    });
  });

  describe('processTemplate — edge cases', () => {
    it('returns empty string for empty template', () => {
      const data = createTestContextData();
      expect(processor.processTemplate('', data)).toBe('');
    });

    it('returns template unchanged when no variables present', () => {
      const data = createTestContextData();
      const plain = 'Just plain text with no placeholders.';
      expect(processor.processTemplate(plain, data)).toBe(plain);
    });

    it('handles template with only conditionals and variables', () => {
      const data = createTestContextData({ projectName: 'app', isMonorepo: false });
      const template = '{{#if isMonorepo}}Mono: {{projectName}}{{else}}Standard: {{projectName}}{{/if}}';
      expect(processor.processTemplate(template, data)).toBe('Standard: app');
    });
  });

  describe('validateTemplate', () => {
    it('returns true for valid simple template', () => {
      expect(processor.validateTemplate('Hello {{name}}!')).toBe(true);
    });

    it('returns true for valid conditional template', () => {
      const template = '{{#if flag}}yes{{else}}no{{/if}}';
      expect(processor.validateTemplate(template)).toBe(true);
    });

    it('returns true for empty template', () => {
      expect(processor.validateTemplate('')).toBe(true);
    });

    it('returns true for template with no variables', () => {
      expect(processor.validateTemplate('plain text')).toBe(true);
    });

    it('returns false for unmatched double braces', () => {
      expect(processor.validateTemplate('Hello {{name')).toBe(false);
    });

    it('returns false for unmatched #if without /if', () => {
      expect(processor.validateTemplate('{{#if flag}}content')).toBe(false);
    });

    it('returns true for multiple balanced conditionals', () => {
      const template = '{{#if a}}x{{else}}y{{/if}} and {{#if b}}p{{else}}q{{/if}}';
      expect(processor.validateTemplate(template)).toBe(true);
    });
  });
});
