import { describe, it, expect, vi } from 'vitest';
import { ContextIntegrator } from '../../src/services/ContextIntegrator.js';
import { ContextTemplateEngine } from '../../src/services/ContextTemplateEngine.js';
import type { IPromptService, IStatementService } from '../../src/services/interfaces.js';
import { createTestProjectData } from '../helpers/testData.js';

function createMockEngine(): ContextTemplateEngine {
  const promptService: IPromptService = {
    getToolUsePrompt: vi.fn(async () => null),
    getPromptForInstruction: vi.fn(async () => null),
    getContextInitializationPrompt: vi.fn(async () => null),
    setFilePath: vi.fn(),
  };
  const statementService: IStatementService = {
    getStatement: vi.fn(() => ''),
    loadStatements: vi.fn(async () => {}),
    setFilePath: vi.fn(),
  };
  return new ContextTemplateEngine(promptService, statementService);
}

describe('ContextIntegrator', () => {
  describe('generateContextFromProject — new engine', () => {
    it('delegates to template engine when enabled', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({ projectPath: '/tmp/test' });

      await integrator.generateContextFromProject(project);
      expect(generateSpy).toHaveBeenCalled();
    });

    it('passes project path to updateServicePaths', async () => {
      const engine = createMockEngine();
      const updateSpy = vi.spyOn(engine, 'updateServicePaths');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({ projectPath: '/projects/my-app' });

      await integrator.generateContextFromProject(project);
      expect(updateSpy).toHaveBeenCalledWith(
        expect.stringContaining('/projects/my-app/'),
        expect.stringContaining('/projects/my-app/'),
      );
    });

    it('generates non-empty context', async () => {
      const engine = createMockEngine();
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData();

      const result = await integrator.generateContextFromProject(project);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('generateContextFromProject — legacy fallback', () => {
    it('uses legacy system when engine disabled', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, false);
      const project = createTestProjectData();

      const result = await integrator.generateContextFromProject(project);
      // Should NOT call engine.generateContext when disabled
      expect(generateSpy).not.toHaveBeenCalled();
      // Should produce legacy template output
      expect(result).toContain('Project:');
    });

    it('legacy output contains project name', async () => {
      const engine = createMockEngine();
      const integrator = new ContextIntegrator(engine, false);
      const project = createTestProjectData({ name: 'legacy-test' });

      const result = await integrator.generateContextFromProject(project);
      expect(result).toContain('legacy-test');
    });

  });

  describe('validateProject', () => {
    it('returns false for null', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      expect(integrator.validateProject(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      expect(integrator.validateProject(undefined)).toBe(false);
    });

    it('returns false when name missing', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      const project = createTestProjectData({ name: '' });
      expect(integrator.validateProject(project)).toBe(false);
    });

    it('returns false when template missing', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      const project = createTestProjectData({ template: '' });
      expect(integrator.validateProject(project)).toBe(false);
    });

    it('returns false when fileSlice missing', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      const project = createTestProjectData({ fileSlice: '' });
      expect(integrator.validateProject(project)).toBe(false);
    });

    it('returns true for valid project', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      const project = createTestProjectData();
      expect(integrator.validateProject(project)).toBe(true);
    });
  });

  describe('setNewEngineEnabled / isNewEngineEnabled', () => {
    it('defaults to enabled', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      expect(integrator.isNewEngineEnabled()).toBe(true);
    });

    it('can toggle between new and legacy', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      integrator.setNewEngineEnabled(false);
      expect(integrator.isNewEngineEnabled()).toBe(false);
      integrator.setNewEngineEnabled(true);
      expect(integrator.isNewEngineEnabled()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns error context when engine throws', async () => {
      const engine = createMockEngine();
      vi.spyOn(engine, 'generateContext').mockRejectedValue(new Error('Engine exploded'));

      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({ name: 'broken-project' });

      const result = await integrator.generateContextFromProject(project);
      expect(result).toContain('Error generating context');
      expect(result).toContain('broken-project');
    });
  });

  describe('getDefaultTemplate', () => {
    it('returns non-empty template string', () => {
      const integrator = new ContextIntegrator(createMockEngine());
      const template = integrator.getDefaultTemplate();
      expect(template).toBeTruthy();
      expect(template).toContain('{{projectName}}');
    });
  });
});
