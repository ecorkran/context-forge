import { ContextGenerator } from '../ContextGenerator';
import { ProjectData } from '../../storage/types/ProjectData';

describe('ContextGenerator', () => {
  let generator: ContextGenerator;

  beforeEach(() => {
    generator = new ContextGenerator();
  });

  describe('generateContext', () => {
    it('should include Tasks File in output when taskFile is provided', () => {
      const project: ProjectData = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        slice: '001-slice.test',
        taskFile: '001-tasks.test.md',
        instruction: 'implementation',
        isMonorepo: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      };

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** 001-tasks.test.md');
    });

    it('should include empty Tasks File line when taskFile is empty', () => {
      const project: ProjectData = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        slice: '001-slice.test',
        taskFile: '',
        instruction: 'implementation',
        isMonorepo: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      };

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** ');
    });

    it('should handle missing taskFile field gracefully', () => {
      const project = {
        id: 'test-id',
        name: 'Test Project',
        template: 'react',
        slice: '001-slice.test',
        instruction: 'implementation',
        isMonorepo: false,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01'
      } as ProjectData;

      const result = generator.generateContext(project);

      expect(result).toContain('- **Current Slice:** 001-slice.test');
      expect(result).toContain('- **Tasks File:** ');
    });
  });
});