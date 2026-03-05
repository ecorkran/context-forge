import { describe, it, expect } from 'vitest';
import { SectionBuilder } from '../../src/services/SectionBuilder.js';
import {
  createTestEnhancedContextData,
  createMockStatementReader,
  createMockPromptReader,
} from '../helpers/testData.js';

function createBuilder(config?: { includeEmptySections?: boolean; includeTitles?: boolean }) {
  const statementReader = createMockStatementReader();
  const promptReader = createMockPromptReader();
  return new SectionBuilder(statementReader, promptReader, config);
}

describe('SectionBuilder', () => {
  describe('buildToolsSection', () => {
    it('returns no-tools statement when no tools or MCP', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        availableTools: [],
        mcpServers: [],
        customData: { availableTools: '' },
      });

      const result = await builder.buildToolsSection(data);
      expect(result).toContain('[statement: no-tools-statement]');
    });

    it('includes tools list when availableTools in customData', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        availableTools: ['electron'],
        customData: { availableTools: 'electron, mcp' },
      });

      const result = await builder.buildToolsSection(data);
      expect(result).toContain('Tools: electron, mcp');
    });

    it('includes MCP servers when present', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        mcpServers: ['context7', 'smithery'],
        availableTools: ['mcp'],
      });

      const result = await builder.buildToolsSection(data);
      expect(result).toContain('Available MCP servers: context7, smithery');
    });

    it('includes tool intro statement', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        availableTools: ['mcp'],
        mcpServers: ['ctx7'],
      });

      const result = await builder.buildToolsSection(data);
      expect(result).toContain('[statement: tool-intro-statement]');
    });
  });

  describe('buildInstructionSection', () => {
    it('includes instruction prompt for known instruction', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ instruction: 'implementation' });

      const result = await builder.buildInstructionSection(data);
      expect(result).toContain('Instructions for implementation');
    });

    it('includes intro statement', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ instruction: 'implementation' });

      const result = await builder.buildInstructionSection(data);
      expect(result).toContain('[statement: instruction-intro-statement]');
    });

    it('falls back to custom instruction statement for unknown instruction', async () => {
      const promptReader = createMockPromptReader({
        getPromptForInstruction: (await import('vitest')).vi.fn(async () => null),
      });
      const statementReader = createMockStatementReader();
      const builder = new SectionBuilder(statementReader, promptReader);
      const data = createTestEnhancedContextData({ instruction: 'custom-mode' });

      const result = await builder.buildInstructionSection(data);
      expect(result).toContain('[statement: custom-instruction-statement]');
    });
  });

  describe('buildProjectInfoSection', () => {
    it('includes project name and slice', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        projectName: 'my-project',
        fileSlice: '100-slice.auth',
      });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).toContain('project: my-project');
      expect(result).toContain('slice: 100-slice.auth');
    });

    it('includes template when non-default', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        template: 'packages/core',
      });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).toContain('template: packages/core');
    });

    it('omits template when default', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({
        template: 'default',
      });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).not.toContain('template:');
    });

    it('shows null for empty fileSlice', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ fileSlice: '' });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).toContain('slice: null');
    });

    it('includes development phase when present', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ developmentPhase: 'Phase 6: Implementation' });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).toContain('phase: Phase 6: Implementation');
    });

    it('includes project date when present', async () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ dateProject: '2026-02-22' });

      const result = await builder.buildProjectInfoSection(data);
      expect(result).toContain('currentDate: 2026-02-22');
    });
  });

  describe('buildSection — generic', () => {
    it('processes content with template variables', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ projectName: 'test-app' });
      const section = builder.createSection('test', 'Working on {{projectName}}', 1);

      const result = builder.buildSection(section, data);
      expect(result).toContain('Working on test-app');
    });

    it('returns empty string when condition is false', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ recentEvents: '' });
      const section = builder.createSection('conditional', 'Conditional content', 1, {
        conditional: true,
        condition: () => false,
      });

      const result = builder.buildSection(section, data);
      expect(result).toBe('');
    });

    it('returns content when condition is true', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ recentEvents: 'something' });
      const section = builder.createSection('conditional', 'Conditional content', 1, {
        conditional: true,
        condition: () => true,
      });

      const result = builder.buildSection(section, data);
      expect(result).toContain('Conditional content');
    });

    it('skips empty sections when includeEmptySections=false', () => {
      const builder = createBuilder({ includeEmptySections: false });
      const data = createTestEnhancedContextData();
      const section = builder.createSection('empty', '', 1);

      const result = builder.buildSection(section, data);
      expect(result).toBe('');
    });

    it('includes title when includeTitles=true', () => {
      const builder = createBuilder({ includeTitles: true });
      const data = createTestEnhancedContextData();
      const section = builder.createSection('test', 'Content here', 1, {
        title: '### My Section',
      });

      const result = builder.buildSection(section, data);
      expect(result).toContain('### My Section');
    });

    it('omits title when includeTitles=false', () => {
      const builder = createBuilder({ includeTitles: false });
      const data = createTestEnhancedContextData();
      const section = builder.createSection('test', 'Content here', 1, {
        title: '### My Section',
      });

      const result = builder.buildSection(section, data);
      expect(result).not.toContain('### My Section');
    });
  });

  describe('buildCurrentEventsSection', () => {
    it('returns empty when no recent events', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ recentEvents: '' });

      const result = builder.buildCurrentEventsSection(data);
      expect(result).toBe('');
    });

    it('includes header and content when events present', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ recentEvents: 'Completed auth feature' });

      const result = builder.buildCurrentEventsSection(data);
      expect(result).toContain('[statement: current-events-header]');
      expect(result).toContain('Completed auth feature');
    });
  });

  describe('buildAdditionalNotesSection', () => {
    it('returns empty when no additional notes', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ additionalNotes: '' });

      const result = builder.buildAdditionalNotesSection(data);
      expect(result).toBe('');
    });

    it('includes header and content when notes present', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ additionalNotes: 'Remember to check types' });

      const result = builder.buildAdditionalNotesSection(data);
      expect(result).toContain('[statement: additional-notes-header]');
      expect(result).toContain('Remember to check types');
    });
  });

  describe('validateSection', () => {
    it('validates a well-formed section', () => {
      const builder = createBuilder();
      const section = builder.createSection('test', 'content', 1);

      const result = builder.validateSection(section);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('reports missing key', () => {
      const builder = createBuilder();
      const section = builder.createSection('', 'content', 1);

      const result = builder.validateSection(section);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Section must have a key');
    });

    it('reports missing order', () => {
      const builder = createBuilder();
      const section = { key: 'test', content: 'x', order: undefined as unknown as number };

      const result = builder.validateSection(section);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Section must have a numeric order');
    });

    it('reports conditional without condition function', () => {
      const builder = createBuilder();
      const section = builder.createSection('test', 'content', 1, { conditional: true });

      const result = builder.validateSection(section);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Conditional section must have a condition function');
    });
  });

  describe('createSection', () => {
    it('creates a section with required fields', () => {
      const builder = createBuilder();
      const section = builder.createSection('my-key', 'my content', 3);

      expect(section.key).toBe('my-key');
      expect(section.content).toBe('my content');
      expect(section.order).toBe(3);
    });

    it('creates a section with optional fields', () => {
      const builder = createBuilder();
      const condition = () => true;
      const section = builder.createSection('conditional', 'content', 2, {
        title: '### Conditional',
        conditional: true,
        condition,
      });

      expect(section.title).toBe('### Conditional');
      expect(section.conditional).toBe(true);
      expect(section.condition).toBe(condition);
    });
  });

  describe('hasToolsOrMCP', () => {
    it('returns false when no tools or MCP', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ availableTools: [], mcpServers: [] });
      expect(builder.hasToolsOrMCP(data)).toBe(false);
    });

    it('returns true when tools present', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ availableTools: ['electron'] });
      expect(builder.hasToolsOrMCP(data)).toBe(true);
    });

    it('returns true when MCP servers present', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ mcpServers: ['context7'] });
      expect(builder.hasToolsOrMCP(data)).toBe(true);
    });
  });

  describe('detectAvailableTools', () => {
    it('returns empty array when no tools', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ availableTools: [] });
      expect(builder.detectAvailableTools(data)).toEqual([]);
    });

    it('returns tools from data', () => {
      const builder = createBuilder();
      const data = createTestEnhancedContextData({ availableTools: ['electron', 'mcp'] });
      expect(builder.detectAvailableTools(data)).toEqual(['electron', 'mcp']);
    });
  });
});
