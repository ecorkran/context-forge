import { ContextIntegrator } from '../ContextIntegrator';
import { ProjectData } from '../../storage/types/ProjectData';

describe('ContextIntegrator', () => {
  let contextIntegrator: ContextIntegrator;
  
  beforeEach(() => {
    contextIntegrator = new ContextIntegrator(false); // Use legacy system for legacy tests
  });

  describe('generateContextFromProject', () => {
    it('should generate context with all project fields', async () => {
      const mockProject: ProjectData = {
        id: 'test-project-1',
        name: 'Test Project',
        template: 'react-nextjs',
        slice: 'foundation',
        taskFile: 'foundation-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {
          recentEvents: 'Added authentication system',
          additionalNotes: 'Focus on error handling'
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const result = await contextIntegrator.generateContextFromProject(mockProject);

      // Check that all fields are included in the output
      expect(result).toContain('Project: Test Project');
      expect(result).toContain('Template: react-nextjs');
      expect(result).toContain('Slice: foundation');
      expect(result).toContain('Instruction: implementation');
      expect(result).toContain('Monorepo: No');
      expect(result).toContain('Added authentication system');
      expect(result).toContain('Focus on error handling');
      expect(result).toContain('Ready for implementation work on foundation slice');
    });

    it('should handle monorepo project correctly', async () => {
      const mockProject: ProjectData = {
        id: 'test-project-2',
        name: 'Monorepo Project',
        template: 'nextjs',
        slice: 'ui-components',
        taskFile: 'ui-tasks.md',
        instruction: 'planning',
        isMonorepo: true,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const result = await contextIntegrator.generateContextFromProject(mockProject);

      expect(result).toContain('Monorepo: Yes');
      expect(result).toContain('Ready for planning work on ui-components slice');
    });

    it('should handle empty optional fields gracefully', async () => {
      const mockProject: ProjectData = {
        id: 'test-project-3',
        name: 'Minimal Project',
        template: 'vue',
        slice: 'auth',
        taskFile: '',
        instruction: 'debugging',
        isMonorepo: false,
        customData: {
          recentEvents: '',
          additionalNotes: ''
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const result = await contextIntegrator.generateContextFromProject(mockProject);

      expect(result).toContain('Project: Minimal Project');
      expect(result).toContain('Template: vue');
      expect(result).toContain('Slice: auth');
      expect(result).toContain('Instruction: debugging');
      expect(result).toContain('## Recent Events\n\n## Additional Context');
      expect(result).toContain('Ready for debugging work on auth slice');
    });

    it('should handle missing customData', async () => {
      const mockProject: ProjectData = {
        id: 'test-project-4',
        name: 'No Custom Data',
        template: 'python-django',
        slice: 'api',
        taskFile: 'api-tasks.md',
        instruction: 'testing',
        isMonorepo: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const result = await contextIntegrator.generateContextFromProject(mockProject);

      expect(result).toContain('Project: No Custom Data');
      expect(result).toContain('Monorepo: Yes');
      expect(result).toContain('Ready for testing work on api slice');
      expect(result).toContain('## Recent Events\n\n## Additional Context');
    });
  });

  describe('validateProject', () => {
    it('should validate complete project as valid', () => {
      const validProject: ProjectData = {
        id: 'valid-1',
        name: 'Valid Project',
        template: 'react',
        slice: 'foundation',
        taskFile: 'foundation-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      expect(contextIntegrator.validateProject(validProject)).toBe(true);
    });

    it('should invalidate project with missing required fields', () => {
      const invalidProject = {
        id: 'invalid-1',
        name: '',
        template: 'react',
        slice: '',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      } as ProjectData;

      expect(contextIntegrator.validateProject(invalidProject)).toBe(false);
    });

    it('should invalidate null or undefined project', () => {
      expect(contextIntegrator.validateProject(null)).toBe(false);
      expect(contextIntegrator.validateProject(undefined)).toBe(false);
    });
  });

  describe('template functionality', () => {
    it('should return the default template', () => {
      const template = contextIntegrator.getDefaultTemplate();
      expect(template).toContain('# Project: {{projectName}}');
      expect(template).toContain('Template: {{template}}');
      expect(template).toContain('{{#if isMonorepo}}');
      expect(template).toContain('## Recent Events');
      expect(template).toContain('{{recentEvents}}');
      expect(template).toContain('{{additionalNotes}}');
    });
  });

  describe('template engine integration', () => {
    it('should use new template engine when enabled', async () => {
      const mockProject: ProjectData = {
        id: 'test-new-engine',
        name: 'New Engine Test',
        template: 'react-vite',
        slice: 'test-slice',
        taskFile: 'test-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {
          recentEvents: 'Testing new engine',
          additionalNotes: 'Should use structured format'
        },
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const newEngineIntegrator = new ContextIntegrator(true);
      const result = await newEngineIntegrator.generateContextFromProject(mockProject);

      // New template engine should produce structured output
      expect(result).toContain('We are continuing work on our project');
      expect(newEngineIntegrator.isNewEngineEnabled()).toBe(true);
    });

    it('should use legacy system when disabled', async () => {
      const mockProject: ProjectData = {
        id: 'test-legacy',
        name: 'Legacy Test',
        template: 'react-vite',
        slice: 'test-slice',
        taskFile: 'legacy-tasks.md',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      const legacyIntegrator = new ContextIntegrator(false);
      const result = await legacyIntegrator.generateContextFromProject(mockProject);

      // Legacy system should produce old template format
      expect(result).toContain('# Project: Legacy Test');
      expect(result).toContain('Template: react-vite');
      expect(legacyIntegrator.isNewEngineEnabled()).toBe(false);
    });

    it('should allow toggling template engine', async () => {
      const integrator = new ContextIntegrator(true);
      
      expect(integrator.isNewEngineEnabled()).toBe(true);
      
      integrator.setNewEngineEnabled(false);
      expect(integrator.isNewEngineEnabled()).toBe(false);
      
      integrator.setNewEngineEnabled(true);
      expect(integrator.isNewEngineEnabled()).toBe(true);
    });
  });
});