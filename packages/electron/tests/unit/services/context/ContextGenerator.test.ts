import { ContextGenerator, ProjectData } from '@context-forge/core';

describe('ContextGenerator', () => {
  let generator: ContextGenerator;

  beforeEach(() => {
    generator = new ContextGenerator();
  });

  describe('generateContext', () => {
    it('should include Tasks File in output when fileTasks is provided', () => {
      const project: ProjectData = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        fileSlice: '001-slice.test',
        fileTasks: '001-tasks.test.md',
        instruction: 'implementation',

        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      };

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** 001-tasks.test.md');
    });

    it('should include empty Tasks File line when fileTasks is empty', () => {
      const project: ProjectData = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        fileSlice: '001-slice.test',
        fileTasks: '',
        instruction: 'implementation',

        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      };

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** ');
    });

    it('should handle missing fileTasks field gracefully', () => {
      const project = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        fileSlice: '001-slice.test',
        instruction: 'implementation',

        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      } as ProjectData;

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** ');
    });
  });
});
