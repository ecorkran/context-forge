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

  describe('artifact field mapping', () => {
    it('maps artifact fields from ProjectData to context', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        fileArch: '160-arch.project-workflow-system',
        fileSlicePlan: '160-slices.project-workflow-system',
        fileHLD: '050-arch.hld-context-forge',
        fileSpec: '100-spec.api-design',
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.fileArch).toBe('160-arch.project-workflow-system');
      expect(contextData.fileSlicePlan).toBe('160-slices.project-workflow-system');
      expect(contextData.fileHLD).toBe('050-arch.hld-context-forge');
      expect(contextData.fileSpec).toBe('100-spec.api-design');
    });

    it('defaults artifact fields to empty string when undefined', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        fileArch: undefined,
        fileSlicePlan: undefined,
        fileHLD: undefined,
        fileSpec: undefined,
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.fileArch).toBe('');
      expect(contextData.fileSlicePlan).toBe('');
      expect(contextData.fileHLD).toBe('');
      expect(contextData.fileSpec).toBe('');
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

  describe('worktreeId data flow', () => {
    it('populates worktree fields when matching worktreeId provided', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        worktrees: [
          { id: 'wt_001', name: 'world-server', indexRange: [300, 499] as [number, number] },
        ],
      });

      await integrator.generateContextFromProject(project, 'wt_001');
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.worktreeName).toBe('world-server');
      expect(contextData.worktreeIndexStart).toBe(300);
      expect(contextData.worktreeIndexEnd).toBe(499);
    });

    it('leaves worktree fields undefined when worktreeId not provided', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        worktrees: [
          { id: 'wt_001', name: 'world-server', indexRange: [300, 499] as [number, number] },
        ],
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.worktreeName).toBeUndefined();
      expect(contextData.worktreeIndexStart).toBeUndefined();
      expect(contextData.worktreeIndexEnd).toBeUndefined();
    });

    it('leaves worktree fields undefined when worktreeId does not match', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        worktrees: [
          { id: 'wt_001', name: 'world-server', indexRange: [300, 499] as [number, number] },
        ],
      });

      await integrator.generateContextFromProject(project, 'wt_nonexistent');
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.worktreeName).toBeUndefined();
    });

    it('leaves worktree fields undefined when project has no worktrees', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({ projectPath: '/tmp/test' });

      await integrator.generateContextFromProject(project, 'wt_001');
      const contextData = generateSpy.mock.calls[0][0];
      expect(contextData.worktreeName).toBeUndefined();
    });
  });

  describe('profile-aware filtering', () => {
    const PROFILES_CONTENT = `## Prompts
\`\`\`yaml
context_profiles:
  maintenance:
    variables: [fileTasks]
  implementation:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  _default:
    variables: [fileArch, fileSlicePlan, fileSlice, fileTasks]
\`\`\`
`;

    function createIntegratorWithProfiles(): { integrator: ContextIntegrator; generateSpy: ReturnType<typeof vi.spyOn> } {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const readFileFn = (_path: string) => PROFILES_CONTENT;
      const integrator = new ContextIntegrator(engine, true, readFileFn);
      return { integrator, generateSpy };
    }

    it('zeros non-profile artifact fields for maintenance instruction', async () => {
      const { integrator, generateSpy } = createIntegratorWithProfiles();
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        instruction: 'Maintenance Task',
        fileArch: '160-arch.system',
        fileSlicePlan: '160-slices.system',
        fileTasks: '176-tasks.current',
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];

      expect(contextData.fileTasks).toBe('176-tasks.current');
      expect(contextData.fileArch).toBe('');
      expect(contextData.fileSlicePlan).toBe('');
    });

    it('passes allowed artifact fields for implementation instruction', async () => {
      const { integrator, generateSpy } = createIntegratorWithProfiles();
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        instruction: 'Phase 6: Implementation',
        fileArch: '160-arch.system',
        fileSlicePlan: '160-slices.system',
        fileSlice: '176-slice.current',
        fileTasks: '176-tasks.current',
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];

      expect(contextData.fileSlicePlan).toBe('160-slices.system');
      expect(contextData.fileSlice).toBe('176-slice.current');
      expect(contextData.fileTasks).toBe('176-tasks.current');
      expect(contextData.fileArch).toBe('');
    });

    it('skips filtering when profiles block is absent', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const readFileFn = (_path: string) => 'No profiles here.';
      const integrator = new ContextIntegrator(engine, true, readFileFn);
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        instruction: 'maintenance',
        fileArch: '160-arch.system',
        fileTasks: '176-tasks.current',
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];

      // All artifact fields pass through unchanged when no profiles block
      expect(contextData.fileArch).toBe('160-arch.system');
      expect(contextData.fileTasks).toBe('176-tasks.current');
    });

    it('skips filtering when readFileFn is not provided', async () => {
      const engine = createMockEngine();
      const generateSpy = vi.spyOn(engine, 'generateContext');
      const integrator = new ContextIntegrator(engine, true);
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        instruction: 'maintenance',
        fileArch: '160-arch.system',
        fileTasks: '176-tasks.current',
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];

      expect(contextData.fileArch).toBe('160-arch.system');
    });

    it('does not affect non-artifact fields regardless of profile', async () => {
      const { integrator, generateSpy } = createIntegratorWithProfiles();
      const project = createTestProjectData({
        projectPath: '/tmp/test',
        instruction: 'maintenance',
        customData: { recentEvents: 'some events', additionalNotes: 'some notes' },
      });

      await integrator.generateContextFromProject(project);
      const contextData = generateSpy.mock.calls[0][0];

      expect(contextData.recentEvents).toBe('some events');
      expect(contextData.additionalNotes).toBe('some notes');
    });
  });
});
