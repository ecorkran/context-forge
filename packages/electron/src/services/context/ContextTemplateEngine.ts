import { EnhancedContextData, ContextSection, ContextTemplate } from '@context-forge/core';
import { SystemPromptParserIPC } from './SystemPromptParserIPC';
import { StatementManagerIPC } from './StatementManagerIPC';
import { SectionBuilder } from './SectionBuilder';
import { TemplateProcessor } from './TemplateProcessor';
import { createSystemPromptParser, createStatementManager } from './ServiceFactory';

/**
 * Main orchestrator for context template generation
 * Coordinates between statement manager, prompt parser, and section builder
 */
export class ContextTemplateEngine {
  private promptParser: SystemPromptParserIPC; // IPC implementation for renderer
  private statementManager: StatementManagerIPC; // IPC implementation for renderer
  private sectionBuilder: SectionBuilder;
  private templateProcessor: TemplateProcessor;
  private enableNewEngine: boolean = true;

  constructor(
    promptParser?: SystemPromptParserIPC,
    statementManager?: StatementManagerIPC,
    sectionBuilder?: SectionBuilder
  ) {
    this.promptParser = promptParser || createSystemPromptParser();
    this.statementManager = statementManager || createStatementManager();
    this.sectionBuilder = sectionBuilder || new SectionBuilder(this.statementManager, this.promptParser);
    this.templateProcessor = new TemplateProcessor();
  }

  /**
   * Ensure statement manager is initialized
   */
  private async ensureStatementManagerInitialized(): Promise<void> {
    try {
      // Try to load statements, this will set isLoaded to true
      await this.statementManager.loadStatements();
    } catch (error) {
      // If loading fails, initialize with defaults
      console.warn('Failed to load custom statements, using defaults:', error);
      // The StatementManager should handle this gracefully with its fallback system
    }
  }

  /**
   * Generate context from enhanced project data
   */
  async generateContext(data: EnhancedContextData): Promise<string> {
    try {
      // Ensure statement manager is initialized
      await this.ensureStatementManagerInitialized();

      // Validate input data
      this.validateInputData(data);

      // Build template configuration
      const template = await this.buildTemplate(data);

      // Assemble sections into final context
      const sections = await this.assembleSections(template, data);

      // Format and return final output
      return this.formatOutput(sections);
    } catch (error) {
      console.error('Error generating context with template engine:', error);
      // Fallback to basic template
      return this.getErrorContext(data);
    }
  }

  /**
   * Build template configuration based on project data
   */
  async buildTemplate(data: EnhancedContextData): Promise<ContextTemplate> {
    const sections: ContextSection[] = [];

    // 1. Project intro section (always included)
    // Select appropriate opening statement based on work type
    const statementKey = data.workType === 'start' ? 'start-project-statement' : 'continue-project-statement';
    sections.push({
      key: 'project-intro',
      title: '',
      content: await this.statementManager.getStatement(statementKey),
      conditional: false,
      order: 1
    });

    // 1.5. Project information object (always included)
    sections.push({
      key: 'project-info',
      title: '',
      content: await this.sectionBuilder.buildProjectInfoSection(data),
      conditional: false,
      order: 1.5
    });

    // 2. Context initialization prompt (select appropriate version based on monorepo mode)
    const contextInitPrompt = await this.promptParser.getContextInitializationPrompt(data.isMonorepo);
    sections.push({
      key: 'context-init',
      title: '',
      content: contextInitPrompt?.content || 'Project context and environment details follow.',
      conditional: false,
      order: 2
    });

    // 3. Tools and MCP section (always included)
    sections.push({
      key: 'tools-section',
      title: '### 3rd-Party Tools & MCP',
      content: await this.sectionBuilder.buildToolsSection(data),
      conditional: false,
      order: 3
    });

    // 4. Monorepo section (conditional on project setting only)
    if (data.isMonorepo) {
      sections.push({
        key: 'monorepo-section',
        title: '### Monorepo Note',
        content: await this.sectionBuilder.buildMonorepoSection(data),
        conditional: true,
        condition: () => data.isMonorepo,
        order: 4
      });
    }

    // 5. Current project state section (always included if present)
    if (data.recentEvents && data.recentEvents.trim()) {
      sections.push({
        key: 'current-events',
        title: '### Current Project State',
        content: data.recentEvents,
        conditional: false,
        order: 5
      });
    }

    // 6. Instruction section (always included)
    sections.push({
      key: 'instruction',
      title: '### Instruction Prompt',
      content: await this.sectionBuilder.buildInstructionSection(data),
      conditional: false,
      order: 6
    });

    // 7. Additional instructions section (conditional)
    if (data.additionalNotes && data.additionalNotes.trim()) {
      sections.push({
        key: 'additional-notes',
        title: '## Additional Instructions',
        content: data.additionalNotes,
        conditional: false,
        order: 7
      });
    }

    return {
      sections,
      statements: {},
      prompts: {}
    };
  }

  /**
   * Assemble sections into final context string
   */
  async assembleSections(template: ContextTemplate, data: EnhancedContextData): Promise<string> {
    const processedSections: string[] = [];

    // Sort sections by order
    const sortedSections = template.sections.sort((a, b) => a.order - b.order);

    for (const section of sortedSections) {
      // Check conditional sections
      if (section.conditional && section.condition && !section.condition(data)) {
        continue;
      }

      // Process section content
      const processedContent = await this.processSection(section, data);
      
      if (processedContent.trim()) {
        processedSections.push(processedContent);
      }
    }

    // Combine sections with proper spacing
    return processedSections.join('\n\n');
  }

  /**
   * Process individual section with template variables
   */
  private async processSection(section: ContextSection, data: EnhancedContextData): Promise<string> {
    let content = section.content;

    // Replace template variables
    content = this.replaceTemplateVariables(content, data);

    // Add section title if present
    if (section.title) {
      content = `${section.title}\n${content}`;
    }

    return content;
  }

  /**
   * Replace template variables in content using enhanced TemplateProcessor
   */
  private replaceTemplateVariables(content: string, data: EnhancedContextData): string {
    // Use the enhanced TemplateProcessor which handles slice parsing and all template variables
    return this.templateProcessor.processTemplate(content, data);
  }

  /**
   * Format final output with cleanup
   */
  private formatOutput(content: string): string {
    // Remove excessive whitespace
    let formatted = content.replace(/\n{3,}/g, '\n\n');
    
    // Normalize line endings
    formatted = formatted.replace(/\r\n/g, '\n');
    
    // Trim leading/trailing whitespace
    formatted = formatted.trim();

    return formatted;
  }

  /**
   * Validate input data has required fields
   */
  private validateInputData(data: EnhancedContextData): void {
    const required = ['projectName', 'template', 'slice', 'instruction'];
    const missing = required.filter(field => !data[field as keyof EnhancedContextData]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Generate explicit error context (no silent fallbacks)
   */
  private getErrorContext(data: EnhancedContextData): string {
    return `ERROR: Context generation failed

Project: ${data.projectName || 'MISSING_PROJECT_NAME'}
Template: ${data.template || 'MISSING_TEMPLATE'}
Slice: ${data.slice || 'MISSING_SLICE'}
Instruction: ${data.instruction || 'MISSING_INSTRUCTION'}
Monorepo: ${data.isMonorepo ? 'Yes' : 'No'}

This is an explicit error - context template engine failed to generate proper output.
Check the console for detailed error information.`;
  }

  /**
   * Check if new template engine is enabled
   */
  isEnabled(): boolean {
    return this.enableNewEngine;
  }

  /**
   * Toggle template engine on/off for testing
   */
  setEnabled(enabled: boolean): void {
    this.enableNewEngine = enabled;
  }

  /**
   * Update file paths on internal services (resolves absolute paths from projectPath)
   */
  updateServicePaths(promptFilePath: string, statementFilePath: string): void {
    this.promptParser.setFilePath(promptFilePath);
    this.statementManager.setFilePath(statementFilePath);
  }

}