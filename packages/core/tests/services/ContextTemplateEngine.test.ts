import { describe, it, expect, vi } from 'vitest';
import { ContextTemplateEngine } from '../../src/services/ContextTemplateEngine.js';
import type { IPromptService, IStatementService } from '../../src/services/interfaces.js';
import type { SystemPrompt } from '../../src/types/prompts.js';
import { createTestEnhancedContextData } from '../helpers/testData.js';

function createMockPromptService(
  overrides?: Partial<Record<keyof IPromptService, ReturnType<typeof vi.fn>>>,
): IPromptService {
  const defaultPrompt: SystemPrompt = {
    name: 'Context Initialization',
    key: 'context-initialization',
    content: 'You are working on {{projectName}}.',
    parameters: ['projectName'],
  };
  return {
    getToolUsePrompt: vi.fn(async () => ({
      name: 'Tool Use',
      key: 'tool-usage',
      content: 'Use tools as appropriate.',
      parameters: [],
    })),
    getPromptForInstruction: vi.fn(async (instruction: string) => ({
      name: instruction,
      key: instruction.toLowerCase(),
      content: `Instruction: ${instruction}`,
      parameters: [],
    })),
    getContextInitializationPrompt: vi.fn(async () => defaultPrompt),
    setFilePath: vi.fn(),
    ...overrides,
  };
}

function createMockStatementService(
  overrides?: Partial<Record<keyof IStatementService, ReturnType<typeof vi.fn>>>,
): IStatementService {
  const statements: Record<string, string> = {
    'project-statement': 'Working on {{projectName}}.',
    'start-project-statement': 'Working on {{projectName}}.',
    'continue-project-statement': 'Working on {{projectName}}.',
    'tool-intro-statement': 'Tools available:',
    'instruction-intro-statement': 'Instructions:',
    'current-events-header': '### Current State',
    'additional-notes-header': '### Notes',
    'no-tools-statement': 'No tools detected.',
    'custom-instruction-statement': 'Custom: {{instruction}}',
  };
  return {
    getStatement: vi.fn((key: string) => statements[key] ?? ''),
    loadStatements: vi.fn(async () => {}),
    setFilePath: vi.fn(),
    ...overrides,
  };
}

describe('ContextTemplateEngine', () => {
  function createEngine(
    promptService?: IPromptService,
    statementService?: IStatementService,
  ): ContextTemplateEngine {
    return new ContextTemplateEngine(
      promptService ?? createMockPromptService(),
      statementService ?? createMockStatementService(),
    );
  }

  describe('generateContext — full pipeline', () => {
    it('generates context with all required fields', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData({
        projectName: 'my-project',
        instruction: 'implementation',
        fileSlice: '100-slice.auth',
        template: 'default',
      });

      const result = await engine.generateContext(data);
      expect(result).toBeTruthy();
      expect(result).toContain('my-project');
    });

    it('calls loadStatements on the statement service', async () => {
      const statementService = createMockStatementService();
      const engine = createEngine(undefined, statementService);
      const data = createTestEnhancedContextData();

      await engine.generateContext(data);
      expect(statementService.loadStatements).toHaveBeenCalled();
    });

    it('uses unified project-statement regardless of workType', async () => {
      const engine = createEngine();

      const startData = createTestEnhancedContextData({ workType: 'start', projectName: 'test-app' });
      const startResult = await engine.generateContext(startData);
      expect(startResult).toContain('Working on test-app');
      expect(startResult).not.toContain('Starting work on');

      const continueData = createTestEnhancedContextData({ workType: 'continue', projectName: 'test-app' });
      const continueResult = await engine.generateContext(continueData);
      expect(continueResult).toContain('Working on test-app');
      expect(continueResult).not.toContain('Continuing work on');
    });
  });

  describe('buildTemplate — section ordering', () => {
    it('produces sections in ascending order', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData();

      const template = await engine.buildTemplate(data);
      const orders = template.sections.map((s) => s.order);
      const sorted = [...orders].sort((a, b) => a - b);
      expect(orders).toEqual(sorted);
    });

    it('does not include monorepo section', async () => {
      const engine = createEngine();

      const data = createTestEnhancedContextData();
      const template = await engine.buildTemplate(data);
      expect(template.sections.every((s) => s.key !== 'monorepo-section')).toBe(true);
    });

    it('includes current-events only when recentEvents non-empty', async () => {
      const engine = createEngine();

      const withEvents = createTestEnhancedContextData({ recentEvents: 'Something happened' });
      const t1 = await engine.buildTemplate(withEvents);
      expect(t1.sections.some((s) => s.key === 'current-events')).toBe(true);

      const withoutEvents = createTestEnhancedContextData({ recentEvents: '' });
      const t2 = await engine.buildTemplate(withoutEvents);
      expect(t2.sections.some((s) => s.key === 'current-events')).toBe(false);
    });

    it('includes additional-notes only when additionalNotes non-empty', async () => {
      const engine = createEngine();

      const withNotes = createTestEnhancedContextData({ additionalNotes: 'Check types' });
      const t1 = await engine.buildTemplate(withNotes);
      expect(t1.sections.some((s) => s.key === 'additional-notes')).toBe(true);

      const withoutNotes = createTestEnhancedContextData({ additionalNotes: '' });
      const t2 = await engine.buildTemplate(withoutNotes);
      expect(t2.sections.some((s) => s.key === 'additional-notes')).toBe(false);
    });
  });

  describe('validateInputData', () => {
    it('returns error context when projectName missing', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData({ projectName: '' });

      const result = await engine.generateContext(data);
      expect(result).toContain('ERROR');
      expect(result).toContain('MISSING_PROJECT_NAME');
    });

    it('returns error context when template missing', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData({ template: '' });

      const result = await engine.generateContext(data);
      expect(result).toContain('ERROR');
    });

    it('succeeds when fileSlice is empty (early-phase projects have no active slice)', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData({ fileSlice: '' });

      const result = await engine.generateContext(data);
      expect(result).not.toContain('ERROR');
    });

    it('returns error context when instruction missing', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData({ instruction: '' });

      const result = await engine.generateContext(data);
      expect(result).toContain('ERROR');
    });
  });

  describe('formatOutput', () => {
    it('collapses multiple newlines in generated output', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData();

      const result = await engine.generateContext(data);
      // Should not have 3+ consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('trims output', async () => {
      const engine = createEngine();
      const data = createTestEnhancedContextData();

      const result = await engine.generateContext(data);
      expect(result).toBe(result.trim());
    });
  });

  describe('error fallback', () => {
    it('returns error context when generation throws', async () => {
      const statementService = createMockStatementService({
        loadStatements: vi.fn(async () => {
          throw new Error('DB connection failed');
        }),
        getStatement: vi.fn(() => {
          throw new Error('Not loaded');
        }),
        setFilePath: vi.fn(),
      });

      const engine = createEngine(undefined, statementService);
      const data = createTestEnhancedContextData({ projectName: 'broken-project' });

      const result = await engine.generateContext(data);
      expect(result).toContain('ERROR');
      expect(result).toContain('broken-project');
    });
  });

  describe('updateServicePaths', () => {
    it('delegates to parser and manager setFilePath', () => {
      const promptService = createMockPromptService();
      const statementService = createMockStatementService();
      const engine = new ContextTemplateEngine(promptService, statementService);

      engine.updateServicePaths('/new/prompt.md', '/new/statements.md');

      expect(promptService.setFilePath).toHaveBeenCalledWith('/new/prompt.md');
      expect(statementService.setFilePath).toHaveBeenCalledWith('/new/statements.md');
    });
  });

  describe('setEnabled / isEnabled', () => {
    it('defaults to enabled', () => {
      const engine = createEngine();
      expect(engine.isEnabled()).toBe(true);
    });

    it('can be toggled off and on', () => {
      const engine = createEngine();
      engine.setEnabled(false);
      expect(engine.isEnabled()).toBe(false);
      engine.setEnabled(true);
      expect(engine.isEnabled()).toBe(true);
    });
  });
});
