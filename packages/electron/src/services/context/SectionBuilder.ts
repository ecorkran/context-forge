import { ContextSection, EnhancedContextData, SectionBuilderConfig } from './types/ContextSection';
import { StatementManagerIPC } from './StatementManagerIPC';
import { SystemPromptParserIPC } from './SystemPromptParserIPC';
import { TemplateProcessor } from './TemplateProcessor';

/**
 * Service for building individual context sections
 * Handles conditional logic, template processing, and section assembly
 */
export class SectionBuilder {
  private statementManager: StatementManagerIPC;
  private promptParser: SystemPromptParserIPC;
  private templateProcessor: TemplateProcessor;
  private config: SectionBuilderConfig;

  constructor(
    statementManager: StatementManagerIPC,
    promptParser: SystemPromptParserIPC,
    config?: SectionBuilderConfig
  ) {
    this.statementManager = statementManager;
    this.promptParser = promptParser;
    this.templateProcessor = new TemplateProcessor();
    this.config = {
      includeEmptySections: false,
      includeTitles: true,
      sectionSeparator: '\n\n',
      ...config
    };
  }

  /**
   * Build the tools and MCP section
   */
  async buildToolsSection(data: EnhancedContextData): Promise<string> {
    try {
      const toolIntro = this.statementManager.getStatement('tool-intro-statement');
      const toolPrompt = await this.promptParser.getToolUsePrompt();
      const mcpInfo = this.detectMCPAvailability(data);
      
      const sections: string[] = [];
      
      // Add intro statement
      if (toolIntro) {
        sections.push(toolIntro);
      }
      
      // Add available tools and MCP servers at the top
      const toolsList: string[] = [];
      
      // Add user-specified tools
      if (data.customData?.availableTools && data.customData.availableTools.trim()) {
        toolsList.push(`Tools: ${data.customData.availableTools}`);
      }
      
      // Add MCP servers (mcpInfo already includes "Available MCP servers:" prefix)
      if (mcpInfo) {
        toolsList.push(mcpInfo);
      }
      
      if (toolsList.length > 0) {
        sections.push(toolsList.join('\n'));
      }
      
      // Add tool prompt if available
      if (toolPrompt) {
        const processedPrompt = this.templateProcessor.processTemplate(
          toolPrompt.content,
          data
        );
        sections.push(processedPrompt);
      }
      
      // If no tools available, use fallback statement
      if (sections.length === 0 || (!data.availableTools?.length && !data.mcpServers?.length)) {
        const noToolsStatement = this.statementManager.getStatement('no-tools-statement');
        return noToolsStatement || 'No additional tools or MCP servers detected.';
      }
      
      return sections.join('\n\n');
    } catch (error) {
      console.error('Error building tools section:', error);
      return '';
    }
  }

  /**
   * Build the monorepo-specific section
   */
  buildMonorepoSection(data: EnhancedContextData): string {
    try {
      const monorepoStatement = this.statementManager.getStatement('monorepo-statement');
      
      let baseStatement: string;
      if (!monorepoStatement) {
        baseStatement = `Project is configured as a monorepo. Working in package: ${data.template}, Slice: ${data.slice}`;
      } else {
        baseStatement = this.templateProcessor.processTemplate(monorepoStatement, data);
      }
      
      // Append custom monorepo note if provided
      const customNote = data.customData?.monorepoNote;
      if (customNote && customNote.trim()) {
        return `${baseStatement}\n\n${customNote.trim()}`;
      }
      
      return baseStatement;
    } catch (error) {
      console.error('Error building monorepo section:', error);
      return '';
    }
  }

  /**
   * Build the instruction section with appropriate system prompt
   */
  async buildInstructionSection(data: EnhancedContextData): Promise<string> {
    try {
      const intro = this.statementManager.getStatement('instruction-intro-statement');
      const prompt = await this.promptParser.getPromptForInstruction(data.instruction);
      
      const sections: string[] = [];
      
      // Add intro if available
      if (intro) {
        sections.push(intro);
      }
      
      // Add instruction prompt
      if (prompt) {
        const processedPrompt = this.templateProcessor.processTemplate(
          prompt.content,
          data
        );
        sections.push(processedPrompt);
      } else {
        // Fallback for custom or unknown instructions
        const customStatement = this.statementManager.getStatement('custom-instruction-statement');
        if (customStatement) {
          const processed = this.templateProcessor.processTemplate(customStatement, data);
          sections.push(processed);
        } else {
          sections.push(`Custom instruction: ${data.instruction}`);
        }
      }
      
      return sections.join('\n\n');
    } catch (error) {
      console.error('Error building instruction section:', error);
      return `Instruction: ${data.instruction}`;
    }
  }

  /**
   * Build the project information object section
   */
  async buildProjectInfoSection(data: EnhancedContextData): Promise<string> {
    try {
      const infoLines: string[] = [];

      // Always include project name
      infoLines.push(`  project: ${data.projectName}`);

      // Include template only for monorepo projects
      if (data.isMonorepo && data.template && data.template !== 'default') {
        infoLines.push(`  template: ${data.template}`);
      }

      // Include current date if present (helps AI understand today's date)
      if (data.projectDate) {
        infoLines.push(`  currentDate: ${data.projectDate}`);
      }

      // Include slice if present, or null if empty
      if (data.slice && data.slice.trim()) {
        infoLines.push(`  slice: ${data.slice}`);
      } else {
        infoLines.push(`  slice: null`);
      }

      // Include task file if present
      if (data.taskFile && data.taskFile.trim()) {
        infoLines.push(`  taskFile: ${data.taskFile}`);
      } else {
        infoLines.push(`  taskFile: null`);
      }

      // Include development phase if present
      if (data.developmentPhase) {
        infoLines.push(`  phase: ${data.developmentPhase}`);
      }

      // Always include monorepo status
      infoLines.push(`  monorepo: ${data.isMonorepo}`);

      return `### Current Work Context\n[\n${infoLines.join(',\n')}\n]`;
    } catch (error) {
      console.error('Error building project info section:', error);
      return `### Current Work Context\n[\n  project: ${data.projectName || 'unknown'}\n]`;
    }
  }

  /**
   * Build a generic section with content
   */
  buildSection(section: ContextSection, data: EnhancedContextData): string {
    try {
      // Check conditional
      if (section.conditional && section.condition) {
        if (!section.condition(data)) {
          return '';
        }
      }
      
      // Process content with template variables
      const processedContent = this.templateProcessor.processTemplate(
        section.content,
        data
      );
      
      // Skip empty sections if configured
      if (!this.config.includeEmptySections && !processedContent.trim()) {
        return '';
      }
      
      // Add title if configured and available
      const parts: string[] = [];
      if (this.config.includeTitles && section.title) {
        parts.push(section.title);
      }
      
      if (processedContent) {
        parts.push(processedContent);
      }
      
      return parts.join('\n\n');
    } catch (error) {
      console.error(`Error building section ${section.key}:`, error);
      return '';
    }
  }

  /**
   * Build current events section
   */
  buildCurrentEventsSection(data: EnhancedContextData): string {
    try {
      const header = this.statementManager.getStatement('current-events-header');
      const content = data.recentEvents;
      
      if (!content || !content.trim()) {
        return '';
      }
      
      const parts: string[] = [];
      
      if (header) {
        parts.push(header);
      }
      
      parts.push(content);
      
      return parts.join('\n\n');
    } catch (error) {
      console.error('Error building current events section:', error);
      return '';
    }
  }

  /**
   * Build additional notes section
   */
  buildAdditionalNotesSection(data: EnhancedContextData): string {
    try {
      const header = this.statementManager.getStatement('additional-notes-header');
      const content = data.additionalNotes;
      
      if (!content || !content.trim()) {
        return '';
      }
      
      const parts: string[] = [];
      
      if (header) {
        parts.push(header);
      }
      
      parts.push(content);
      
      return parts.join('\n\n');
    } catch (error) {
      console.error('Error building additional notes section:', error);
      return '';
    }
  }

  /**
   * Detect available MCP servers and return info
   */
  private detectMCPAvailability(data: EnhancedContextData): string {
    // Placeholder implementation - will be enhanced later
    if (!data.mcpServers || data.mcpServers.length === 0) {
      return '';
    }
    
    return `Available MCP servers: ${data.mcpServers.join(', ')}`;
  }

  /**
   * Detect available tools and return info
   */
  detectAvailableTools(data: EnhancedContextData): string[] {
    // Placeholder implementation - will be enhanced later
    // In future, this could scan environment or configuration
    const defaultTools: string[] = [];

    if (data.availableTools && data.availableTools.length > 0) {
      return data.availableTools;
    }

    return defaultTools;
  }

  /**
   * Check if tools or MCP are available
   */
  hasToolsOrMCP(data: EnhancedContextData): boolean {
    return !!(
      (data.availableTools && data.availableTools.length > 0) ||
      (data.mcpServers && data.mcpServers.length > 0)
    );
  }

  /**
   * Validate section structure
   */
  validateSection(section: ContextSection): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!section.key) {
      errors.push('Section must have a key');
    }
    
    if (typeof section.order !== 'number') {
      errors.push('Section must have a numeric order');
    }
    
    if (section.conditional && !section.condition) {
      errors.push('Conditional section must have a condition function');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Create a section object
   */
  createSection(
    key: string,
    content: string,
    order: number,
    options?: {
      title?: string;
      conditional?: boolean;
      condition?: (data: EnhancedContextData) => boolean;
    }
  ): ContextSection {
    return {
      key,
      content,
      order,
      ...options
    };
  }

}