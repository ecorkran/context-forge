import { TemplateProcessor } from '../TemplateProcessor';
import { ContextData } from '../types/ContextData';

describe('TemplateProcessor', () => {
  let processor: TemplateProcessor;
  
  const createMockData = (overrides?: Partial<ContextData>): ContextData => ({
    projectName: 'Test Project',
    template: 'react-nextjs',
    slice: 'foundation',
    taskFile: 'foundation-tasks.md',
    instruction: 'implementation',
    isMonorepo: false,
    recentEvents: 'Added user authentication',
    additionalNotes: 'Focus on security',
    ...overrides
  });
  
  beforeEach(() => {
    processor = new TemplateProcessor();
  });

  describe('processTemplate', () => {
    const mockContextData = createMockData();

    it('should replace simple variables correctly', () => {
      const template = 'Project: {{projectName}}, Template: {{template}}';
      const result = processor.processTemplate(template, mockContextData);
      expect(result).toBe('Project: Test Project, Template: react-nextjs');
    });

    it('should handle boolean conditionals correctly - false case', () => {
      const template = '{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}';
      const result = processor.processTemplate(template, mockContextData);
      expect(result).toBe('Monorepo: No');
    });

    it('should handle boolean conditionals correctly - true case', () => {
      const template = '{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}';
      const monorepoData = { ...mockContextData, isMonorepo: true };
      const result = processor.processTemplate(template, monorepoData);
      expect(result).toBe('Monorepo: Yes');
    });

    it('should handle missing variables gracefully', () => {
      const template = '{{projectName}} - {{nonExistentField}} - {{template}}';
      const result = processor.processTemplate(template, mockContextData);
      expect(result).toBe('Test Project -  - react-nextjs');
    });

    it('should handle complex template with multiple variables and conditionals', () => {
      const template = `# {{projectName}}
Template: {{template}}
Slice: {{slice}}
{{#if isMonorepo}}This is a monorepo{{else}}This is not a monorepo{{/if}}
Recent: {{recentEvents}}`;

      const result = processor.processTemplate(template, mockContextData);
      
      expect(result).toContain('# Test Project');
      expect(result).toContain('Template: react-nextjs');
      expect(result).toContain('Slice: foundation');
      expect(result).toContain('This is not a monorepo');
      expect(result).toContain('Recent: Added user authentication');
    });

    it('should handle empty values', () => {
      const emptyData = createMockData({
        projectName: '',
        template: '',
        slice: '',
        recentEvents: '',
        additionalNotes: ''
      });

      const template = 'Name: {{projectName}}, Events: {{recentEvents}}';
      const result = processor.processTemplate(template, emptyData);
      expect(result).toBe('Name: , Events: ');
    });

    describe('Enhanced template processing', () => {
      it('should parse slice into sliceindex and slicename', () => {
        const data = createMockData({ slice: '025-slice.combo-box' });
        
        const template = 'Tasks: {sliceindex}-tasks.{slicename}.md';
        
        const result = processor.processTemplate(template, data);
        
        expect(result).toBe('Tasks: 025-tasks.combo-box.md');
      });

      it('should handle template variable substitution', () => {
        const data = createMockData({ template: 'templates/react' });
        
        const template = 'Use project-artifacts/{template}/ for files';
        
        const result = processor.processTemplate(template, data);
        
        expect(result).toBe('Use project-artifacts/templates/react/ for files');
      });

      it('should work with complex slice names', () => {
        const data = createMockData({ slice: '100-slice.multi-word-component' });
        
        const template = 'File: {sliceindex}-tasks.{slicename}.md';
        
        const result = processor.processTemplate(template, data);
        
        expect(result).toBe('File: 100-tasks.multi-word-component.md');
      });

      it('should handle slice that does not match pattern', () => {
        const data = createMockData({ slice: 'invalid-slice-format' });
        
        const template = 'Tasks: {sliceindex}-{slicename}';
        
        const result = processor.processTemplate(template, data);
        
        expect(result).toBe('Tasks: sliceindex-slicename'); // Should leave as-is
      });

      it('should handle real-world context initialization template', () => {
        const data = createMockData({ 
          projectName: 'manta-templates',
          slice: '025-slice.combo-box',
          template: 'templates/react'
        });
        
        const template = `Current work context:
- Project: {project}
- Current slice: {slice}
- Current tasks: user/tasks/{sliceindex}-tasks.{slicename}.md
- Monorepo Template Development: Use \`project-artifacts/{template}/\` for project-specific files`;

        const result = processor.processTemplate(template, data);

        expect(result).toContain('Project: manta-templates');
        expect(result).toContain('Current slice: 025-slice.combo-box');
        expect(result).toContain('user/tasks/025-tasks.combo-box.md');
        expect(result).toContain('project-artifacts/templates/react/');
      });
    });

    it('should handle invalid template syntax gracefully', () => {
      const invalidTemplate = 'Project: {{projectName';
      const result = processor.processTemplate(invalidTemplate, mockContextData);
      // Invalid syntax should be left unchanged (not processed)
      expect(result).toBe('Project: {{projectName');
    });
  });

  describe('validateTemplate', () => {
    it('should validate correct template syntax', () => {
      const validTemplate = '{{projectName}} - {{#if isMonorepo}}Yes{{else}}No{{/if}}';
      expect(processor.validateTemplate(validTemplate)).toBe(true);
    });

    it('should invalidate unmatched brackets', () => {
      const invalidTemplate = '{{projectName}} - {{template';
      expect(processor.validateTemplate(invalidTemplate)).toBe(false);
    });

    it('should invalidate unmatched conditional statements', () => {
      const invalidTemplate = '{{#if isMonorepo}}Yes{{else}}No';
      expect(processor.validateTemplate(invalidTemplate)).toBe(false);
    });

    it('should validate template with no variables', () => {
      const plainTemplate = 'This is just plain text';
      expect(processor.validateTemplate(plainTemplate)).toBe(true);
    });
  });
});