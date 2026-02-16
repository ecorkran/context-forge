import { ProjectData } from '../storage/types/ProjectData';
import { ContextData, EnhancedContextData } from './types/ContextData';
import { TemplateProcessor } from './TemplateProcessor';
import { ContextTemplateEngine } from './ContextTemplateEngine';
import { createSystemPromptParser, createStatementManager } from './ServiceFactory';

/**
 * Default template for context generation
 * Uses markdown format with template variable substitution
 */
const DEFAULT_TEMPLATE = `# Project: {{projectName}}
Template: {{template}}
Slice: {{slice}}
Instruction: {{instruction}}
{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}

## Recent Events
{{recentEvents}}

## Additional Context
{{additionalNotes}}

## Current Status
Ready for {{instruction}} work on {{slice}} slice.`;

/**
 * Service for integrating project data with context generation
 * Transforms ProjectData into formatted context strings
 */
export class ContextIntegrator {
  private templateProcessor: TemplateProcessor;
  private templateEngine: ContextTemplateEngine;
  private enableNewEngine: boolean;

  constructor(enableNewEngine: boolean = true) {
    this.templateProcessor = new TemplateProcessor();
    // Create template engine with IPC-aware services
    const promptParser = createSystemPromptParser();
    const statementManager = createStatementManager();
    this.templateEngine = new ContextTemplateEngine(promptParser, statementManager);
    this.enableNewEngine = enableNewEngine;
  }

  /**
   * Generates a complete context string from project data
   * Main integration point - takes project data and returns formatted context
   * @param project Project data from storage
   * @returns Formatted context string ready for display/copying
   */
  async generateContextFromProject(project: ProjectData): Promise<string> {
    try {
      if (this.enableNewEngine) {
        return await this.generateWithTemplateEngine(project);
      } else {
        return this.generateWithLegacySystem(project);
      }
    } catch (error) {
      console.error('Error generating context from project:', error);
      return this.getErrorContext(project, error);
    }
  }

  /**
   * Generate context using the new template engine
   */
  private async generateWithTemplateEngine(project: ProjectData): Promise<string> {
    // Map project data to enhanced context data
    const enhancedData = await this.mapProjectToEnhancedContext(project);
    
    // Generate using template engine
    return await this.templateEngine.generateContext(enhancedData);
  }

  /**
   * Generate context using the legacy system
   */
  private generateWithLegacySystem(project: ProjectData): string {
    // Map project data to context data structure
    const contextData = this.mapProjectToContext(project);
    
    // Process template with context data
    const processedContext = this.templateProcessor.processTemplate(DEFAULT_TEMPLATE, contextData);
    
    // Apply final formatting
    return this.formatOutput(processedContext);
  }

  /**
   * Maps ProjectData structure to EnhancedContextData structure
   * Includes tool detection and additional template features
   * @param project Project data from storage
   * @returns Enhanced context data ready for template engine
   */
  private async mapProjectToEnhancedContext(project: ProjectData): Promise<EnhancedContextData> {
    // Detect available tools and MCP servers
    const availableTools = await this.detectAvailableTools();
    const mcpServers = await this.detectMCPServers();

    return {
      projectName: project.name || 'Unknown Project',
      template: project.template || '',
      slice: project.slice || 'Unknown Slice',
      taskFile: project.taskFile || '',
      instruction: project.instruction || 'implementation',
      developmentPhase: project.developmentPhase || 'WARNING: MISSING DEVELOPMENT PHASE',
      workType: project.workType || 'continue',
      projectDate: project.projectDate || new Date().toISOString().split('T')[0],
      isMonorepo: project.isMonorepo || false,
      recentEvents: project.customData?.recentEvents || '',
      additionalNotes: project.customData?.additionalNotes || '',
      availableTools,
      mcpServers,
      templateVersion: '1.0.0',
      customData: project.customData
    };
  }

  /**
   * Maps ProjectData structure to ContextData structure (legacy)
   * Handles null/undefined values with appropriate defaults
   * @param project Project data from storage
   * @returns Context data ready for template processing
   */
  private mapProjectToContext(project: ProjectData): ContextData {
    return {
      projectName: project.name || 'Unknown Project',
      template: project.template || 'Unknown Template',
      slice: project.slice || 'Unknown Slice',
      taskFile: project.taskFile || '',
      instruction: project.instruction || 'implementation',
      developmentPhase: project.developmentPhase || 'WARNING: MISSING DEVELOPMENT PHASE',
      workType: project.workType || 'continue',
      projectDate: project.projectDate || new Date().toISOString().split('T')[0],
      isMonorepo: project.isMonorepo || false,
      recentEvents: project.customData?.recentEvents || '',
      additionalNotes: project.customData?.additionalNotes || ''
    };
  }

  /**
   * Applies final formatting to processed context
   * Currently just cleans up whitespace, but can be extended
   * @param content Processed template content
   * @returns Formatted context string
   */
  private formatOutput(content: string): string {
    // Clean up multiple blank lines
    let formatted = content.replace(/\n\s*\n\s*\n/g, '\n\n');
    
    // Trim leading/trailing whitespace
    formatted = formatted.trim();
    
    // Ensure consistent line endings
    formatted = formatted.replace(/\r\n/g, '\n');
    
    return formatted;
  }

  /**
   * Generates error context when main generation fails
   * @param project Original project data
   * @param error Error that occurred
   * @returns Fallback context string
   */
  private getErrorContext(project: ProjectData, error: any): string {
    return `# Project: ${project.name || 'Unknown'}

⚠️ Error generating context: ${error?.message || 'Unknown error'}

## Project Details
- Template: ${project.template || 'Unknown'}
- Slice: ${project.slice || 'Unknown'}
- Instruction: ${project.instruction || 'Unknown'}
- Monorepo: ${project.isMonorepo ? 'Yes' : 'No'}

Please check the console for detailed error information.`;
  }

  /**
   * Validates project data before processing
   * @param project Project data to validate
   * @returns True if project has minimum required fields
   */
  validateProject(project: ProjectData | null | undefined): boolean {
    if (!project) {
      return false;
    }

    return Boolean(
      project.name && 
      project.template && 
      project.slice
    );
  }

  /**
   * Detect available tools for the project
   * Currently returns placeholder data - can be enhanced for actual detection
   */
  private async detectAvailableTools(): Promise<string[]> {
    // Placeholder implementation - can be enhanced to actually detect tools
    // For example, check package.json, detect CLI tools, etc.
    return ['npm', 'git', 'vscode'];
  }

  /**
   * Detect available MCP servers for the project
   * Currently returns placeholder data - can be enhanced for actual detection
   */
  private async detectMCPServers(): Promise<string[]> {
    // Placeholder implementation - can be enhanced to detect actual MCP servers
    return ['context7'];
  }

  /**
   * Check if new template engine is enabled
   */
  isNewEngineEnabled(): boolean {
    return this.enableNewEngine;
  }

  /**
   * Toggle between new and legacy template systems
   */
  setNewEngineEnabled(enabled: boolean): void {
    this.enableNewEngine = enabled;
  }

  /**
   * Gets the default template string (legacy)
   * Useful for testing and template customization
   * @returns Default template string
   */
  getDefaultTemplate(): string {
    return DEFAULT_TEMPLATE;
  }
}