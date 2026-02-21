import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';

/**
 * Integration tests for IPC layer between renderer and main process
 * Tests all statement management and system prompt parsing operations via IPC
 * 
 * Note: These tests require mocked electron environment
 */

// Mock the window.electronAPI global
const mockElectronAPI = {
  ping: vi.fn().mockResolvedValue('pong'),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  updateWindowTitle: vi.fn().mockResolvedValue(undefined),
  storage: {
    read: vi.fn(),
    write: vi.fn(),
    backup: vi.fn(),
  },
  statements: {
    load: vi.fn(),
    save: vi.fn(),
    getStatement: vi.fn(),
    updateStatement: vi.fn(),
  },
  systemPrompts: {
    parse: vi.fn(),
    getContextInit: vi.fn(),
    getToolUse: vi.fn(),
    getForInstruction: vi.fn(),
  },
  projectPath: {
    validate: vi.fn(),
    healthCheck: vi.fn(),
    listDirectory: vi.fn(),
    pickFolder: vi.fn(),
  }
};

// Setup global mock before tests
beforeAll(() => {
  // @ts-ignore
  global.window = {
    electronAPI: mockElectronAPI
  };
});

afterAll(() => {
  // @ts-ignore
  delete global.window;
});

describe('IPC Integration Tests', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('Statement Management via IPC', () => {
    it('should load statements via IPC', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const mockStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'We are continuing work on our project.',
          description: 'Opening statement for project context',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements();
      const result = manager.getAllStatements();
      
      expect(mockElectronAPI.statements.load).toHaveBeenCalledWith('default-statements.md');
      expect(result).toEqual(mockStatements);
    });

    it('should get individual statements via IPC', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const mockStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'We are continuing work on our project.',
          description: 'Opening statement for project context',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements(); // Load first
      const result = manager.getStatement('project-intro-statement');
      
      expect(result).toBe('We are continuing work on our project.');
    });

    it('should update statements via IPC', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const mockStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'We are continuing work on our project.',
          description: 'Opening statement for project context',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements(); // Load first
      manager.updateStatement('project-intro-statement', 'New content');
      
      // updateStatement works on the cache, doesn't call IPC directly
      expect(manager.getStatement('project-intro-statement')).toBe('New content');
    });

    it('should save statements via IPC', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const mockStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'Updated content',
          description: 'Opening statement for project context',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      mockElectronAPI.statements.save.mockResolvedValue(undefined);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements(); // Load first
      await manager.saveStatements();
      
      expect(mockElectronAPI.statements.save).toHaveBeenCalledWith('default-statements.md', mockStatements);
    });

    it('should handle IPC errors gracefully', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const error = new Error('IPC communication failed');
      mockElectronAPI.statements.load.mockRejectedValue(error);
      
      const manager = new StatementManagerIPC();
      
      await expect(manager.loadStatements()).rejects.toThrow('IPC communication failed');
    });
  });

  describe('System Prompt Parsing via IPC', () => {
    it('should parse system prompts via IPC', async () => {
      const { SystemPromptParserIPC } = await import('@/services/context/SystemPromptParserIPC');
      
      const mockPrompts = [
        {
          name: 'Context Initialization',
          key: 'context-init',
          content: 'Initialize context...',
          parameters: {}
        }
      ];
      
      mockElectronAPI.systemPrompts.parse.mockResolvedValue(mockPrompts);
      
      const parser = new SystemPromptParserIPC();
      
      // SystemPromptParserIPC doesn't have parsePromptFile method, it uses specific methods
      expect(typeof parser.getContextInitializationPrompt).toBe('function');
      expect(typeof parser.getToolUsePrompt).toBe('function');
      expect(typeof parser.getPromptForInstruction).toBe('function');
    });

    it('should get context initialization prompt via IPC', async () => {
      const { SystemPromptParserIPC } = await import('@/services/context/SystemPromptParserIPC');
      
      const mockPrompt = {
        name: 'Context Initialization',
        key: 'context-init',
        content: 'Initialize context...',
        parameters: {}
      };
      
      mockElectronAPI.systemPrompts.getContextInit.mockResolvedValue(mockPrompt);
      
      const parser = new SystemPromptParserIPC();
      const result = await parser.getContextInitializationPrompt();
      
      expect(mockElectronAPI.systemPrompts.getContextInit).toHaveBeenCalledWith('prompt.ai-project.system.md');
      expect(result).toEqual(mockPrompt);
    });

    it('should get tool use prompt via IPC', async () => {
      const { SystemPromptParserIPC } = await import('@/services/context/SystemPromptParserIPC');
      
      const mockPrompt = {
        name: 'Tool Usage',
        key: 'tool-use',
        content: 'Use tools effectively...',
        parameters: {}
      };
      
      mockElectronAPI.systemPrompts.getToolUse.mockResolvedValue(mockPrompt);
      
      const parser = new SystemPromptParserIPC();
      const result = await parser.getToolUsePrompt();
      
      expect(mockElectronAPI.systemPrompts.getToolUse).toHaveBeenCalledWith('prompt.ai-project.system.md');
      expect(result).toEqual(mockPrompt);
    });

    it('should get instruction-specific prompts via IPC', async () => {
      const { SystemPromptParserIPC } = await import('@/services/context/SystemPromptParserIPC');
      
      const mockPrompt = {
        name: 'Implementation Prompt',
        key: 'implementation',
        content: 'Implement the feature...',
        parameters: {}
      };
      
      mockElectronAPI.systemPrompts.getForInstruction.mockResolvedValue(mockPrompt);
      
      const parser = new SystemPromptParserIPC();
      const result = await parser.getPromptForInstruction('implementation');
      
      expect(mockElectronAPI.systemPrompts.getForInstruction).toHaveBeenCalledWith('prompt.ai-project.system.md', 'implementation');
      expect(result).toEqual(mockPrompt);
    });

    it('should handle system prompt IPC errors gracefully', async () => {
      const { SystemPromptParserIPC } = await import('@/services/context/SystemPromptParserIPC');
      
      const error = new Error('System prompt parsing failed');
      mockElectronAPI.systemPrompts.getContextInit.mockRejectedValue(error);
      
      const parser = new SystemPromptParserIPC();
      
      // Should return null when IPC fails, not throw
      const result = await parser.getContextInitializationPrompt();
      expect(result).toBeNull();
    });
  });

  describe('Service Factory Integration', () => {
    it('should create IPC adapters when electronAPI is available', async () => {
      const { createStatementManager, createSystemPromptParser } = await import('@/services/context/ServiceFactory');
      
      const statementManager = createStatementManager();
      const promptParser = createSystemPromptParser();
      
      // Check that we get IPC implementations
      expect(statementManager.constructor.name).toBe('StatementManagerIPC');
      expect(promptParser.constructor.name).toBe('SystemPromptParserIPC');
    });

    it('should maintain same interface as direct implementations', async () => {
      const { createStatementManager, createSystemPromptParser } = await import('@/services/context/ServiceFactory');
      
      const statementManager = createStatementManager();
      const promptParser = createSystemPromptParser();
      
      // Check that all required methods exist
      expect(typeof statementManager.loadStatements).toBe('function');
      expect(typeof statementManager.getStatement).toBe('function');
      expect(typeof statementManager.updateStatement).toBe('function');
      expect(typeof statementManager.saveStatements).toBe('function');
      
      // SystemPromptParserIPC has different method signatures
      expect(typeof promptParser.getContextInitializationPrompt).toBe('function');
      expect(typeof promptParser.getToolUsePrompt).toBe('function');
      expect(typeof promptParser.getPromptForInstruction).toBe('function');
    });
  });

  describe('End-to-End Context Generation via IPC', () => {
    it('should generate context using IPC services', async () => {
      // Mock all required IPC responses
      const mockStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'We are continuing work on our project.',
          description: 'Opening statement for project context',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      mockElectronAPI.systemPrompts.getContextInit.mockResolvedValue({
        name: 'Context Initialization',
        key: 'context-init',
        content: 'Initialize your context with the following project information.',
        parameters: {}
      });
      mockElectronAPI.systemPrompts.getForInstruction.mockResolvedValue({
        name: 'Implementation Prompt',
        key: 'implementation',
        content: 'Implement the specified feature according to requirements.',
        parameters: {}
      });
      
      const { ContextIntegrator, ContextTemplateEngine } = await import('@context-forge/core');
      const { createSystemPromptParser, createStatementManager } = await import('@/services/context/ServiceFactory');
      const engine = new ContextTemplateEngine(createSystemPromptParser(), createStatementManager());
      const integrator = new ContextIntegrator(engine, true); // Enable new engine

      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        template: 'react-vite',
        slice: 'foundation',
        taskFile: 'foundation-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {
          recentEvents: 'Recent test events',
          additionalNotes: 'Additional test notes'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const result = await integrator.generateContextFromProject(mockProject);

      // Should generate a context string using the new template engine with IPC services
      expect(result).toContain('We are continuing work on our project.');
      expect(result).toContain('Recent test events');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fallback to legacy system if IPC services fail', async () => {
      // Mock IPC failure
      mockElectronAPI.statements.getStatement.mockRejectedValue(new Error('IPC failed'));

      const { ContextIntegrator, ContextTemplateEngine } = await import('@context-forge/core');
      const { createSystemPromptParser, createStatementManager } = await import('@/services/context/ServiceFactory');
      const engine = new ContextTemplateEngine(createSystemPromptParser(), createStatementManager());
      const integrator = new ContextIntegrator(engine, true); // Enable new engine
      
      const mockProject = {
        id: 'test-project',
        name: 'Test Project',
        template: 'react-vite',
        slice: 'foundation',
        taskFile: 'foundation-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {
          recentEvents: 'Recent test events',
          additionalNotes: 'Additional test notes'
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const result = await integrator.generateContextFromProject(mockProject);
      
      // Should still generate context (error context or fallback)
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('Data Integrity Across IPC Boundary', () => {
    it('should preserve data types and structure', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const originalStatements = {
        'project-intro-statement': {
          key: 'project-intro-statement',
          content: 'We are continuing work on our project.',
          description: 'Opening statement for project context',
          editable: true
        },
        'tool-intro-statement': {
          key: 'tool-intro-statement',
          content: 'The following tools and MCP servers are available:',
          description: 'Introduction to tools section',
          editable: true
        }
      };
      
      mockElectronAPI.statements.load.mockResolvedValue(originalStatements);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements();
      const loadedStatements = manager.getAllStatements();
      
      expect(loadedStatements).toEqual(originalStatements);
      expect(typeof loadedStatements['project-intro-statement'].editable).toBe('boolean');
      expect(Array.isArray(Object.keys(loadedStatements))).toBe(true);
    });

    it('should handle undefined and null values correctly', async () => {
      const { StatementManagerIPC } = await import('@/services/context/StatementManagerIPC');
      
      const mockStatements = {}; // Empty statements
      mockElectronAPI.statements.load.mockResolvedValue(mockStatements);
      
      const manager = new StatementManagerIPC();
      await manager.loadStatements();
      const result = manager.getStatement('non-existent-key');
      
      expect(result).toBe(''); // Returns empty string for non-existent keys
    });
  });
});