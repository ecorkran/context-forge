import { ProjectData } from '../storage/types/ProjectData';

/**
 * Basic context generation service for Claude Code prompts
 */
export class ContextGenerator {
  
  /**
   * Generates a basic context prompt for Claude Code based on project data
   */
  generateContext(project: ProjectData, additionalNotes?: string): string {
    const template = this.getBaseTemplate();
    
    // Simple variable substitution
    let context = template
      .replace('{{PROJECT_NAME}}', project.name)
      .replace('{{TEMPLATE}}', project.template)
      .replace('{{SLICE}}', project.slice)
      .replace('{{TASK_FILE}}', project.taskFile || '')
      .replace('{{MONOREPO_STATUS}}', project.isMonorepo ? 'Monorepo project' : 'Single project')
      .replace('{{TIMESTAMP}}', new Date().toLocaleString());
    
    // Add additional notes if provided
    if (additionalNotes && additionalNotes.trim()) {
      context += '\n\n## Additional Context\n\n' + additionalNotes.trim();
    }
    
    return context;
  }

  /**
   * Gets the base template for context generation
   */
  private getBaseTemplate(): string {
    return `# Context for Claude Code

## Project Information
- **Project Name:** {{PROJECT_NAME}}
- **Template:** {{TEMPLATE}}
- **Current Slice:** {{SLICE}}
- **Tasks File:** {{TASK_FILE}}
- **Type:** {{MONOREPO_STATUS}}
- **Generated:** {{TIMESTAMP}}

## Working Context
I'm working on the **{{SLICE}}** slice for project **{{PROJECT_NAME}}**. This project uses the **{{TEMPLATE}}** template structure.

## Current Objectives
- Implement the {{SLICE}} functionality according to the slice design
- Follow existing code patterns and conventions
- Ensure all tests pass and the build succeeds

## Next Steps
Please help me continue development on this slice, following the project guidelines and maintaining code quality standards.`;
  }

  /**
   * Validates project data for context generation
   */
  validateProject(project: ProjectData): string[] {
    const errors: string[] = [];
    
    if (!project.name || project.name.trim().length === 0) {
      errors.push('Project name is required');
    }
    
    if (!project.template || project.template.trim().length === 0) {
      errors.push('Template is required');
    }
    
    if (!project.slice || project.slice.trim().length === 0) {
      errors.push('Slice is required');
    }
    
    return errors;
  }
}