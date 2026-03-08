import type { ProjectData } from '../types/project.js';
import type { ContextData, EnhancedContextData } from '../types/context.js';
import { TemplateProcessor } from './TemplateProcessor.js';
import { ContextTemplateEngine } from './ContextTemplateEngine.js';
import { ContextProfileParser } from './ContextProfileParser.js';
import type { ProfileMap } from './ContextProfileParser.js';
import { PROMPT_FILE_RELATIVE_PATH, STATEMENTS_FILE_RELATIVE_PATH } from './constants.js';

/** Artifact fields subject to profile-aware filtering */
const ARTIFACT_FIELDS = ['fileArch', 'fileSlicePlan', 'fileHLD', 'fileSpec', 'fileSlice', 'fileTasks', 'fileConcept'] as const;

/**
 * Default template for context generation
 * Uses markdown format with template variable substitution
 */
const DEFAULT_TEMPLATE = `# Project: {{projectName}}
Template: {{template}}
Slice: {{fileSlice}}
Instruction: {{instruction}}

## Recent Events
{{recentEvents}}

## Additional Context
{{additionalNotes}}

## Current Status
Ready for {{instruction}} work on {{fileSlice}} slice.`;

/**
 * Service for integrating project data with context generation
 * Transforms ProjectData into formatted context strings
 */
export class ContextIntegrator {
  private templateProcessor: TemplateProcessor;
  private templateEngine: ContextTemplateEngine;
  private enableNewEngine: boolean;
  private profileParser: ContextProfileParser;
  private cachedProfiles: ProfileMap | null = null;
  private cachedPromptPath: string | null = null;
  private readFileFn: ((path: string) => string) | null;

  /**
   * @param engine Template engine for context generation
   * @param enableNewEngine Toggle between new and legacy template systems
   * @param readFileFn Optional file reader for profile loading (Node.js only)
   */
  constructor(
    engine: ContextTemplateEngine,
    enableNewEngine: boolean = true,
    readFileFn: ((path: string) => string) | null = null,
  ) {
    this.templateProcessor = new TemplateProcessor();
    this.templateEngine = engine;
    this.enableNewEngine = enableNewEngine;
    this.profileParser = new ContextProfileParser();
    this.readFileFn = readFileFn;
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
    } catch (error: unknown) {
      console.error('Error generating context from project:', error);
      return this.getErrorContext(project, error);
    }
  }

  /**
   * Generate context using the new template engine
   */
  private async generateWithTemplateEngine(project: ProjectData): Promise<string> {
    // Resolve absolute file paths from project root before service calls
    if (project.projectPath) {
      const base = project.projectPath.replace(/\/+$/, '');
      const promptPath = `${base}/${PROMPT_FILE_RELATIVE_PATH}`;
      this.cachedPromptPath = promptPath;
      this.templateEngine.updateServicePaths(promptPath, `${base}/${STATEMENTS_FILE_RELATIVE_PATH}`);
    }

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

    const enhanced: EnhancedContextData = {
      projectName: project.name || 'Unknown Project',
      template: project.template || '',
      fileSlice: project.fileSlice || 'Unknown Slice',
      fileTasks: project.fileTasks || '',
      instruction: project.instruction || 'implementation',
      developmentPhase: project.developmentPhase || 'WARNING: MISSING DEVELOPMENT PHASE',
      workType: project.workType || 'continue',
      dateProject: project.dateProject || new Date().toISOString().split('T')[0],
      fileArch: project.fileArch || '',
      fileSlicePlan: project.fileSlicePlan || '',
      fileHLD: project.fileHLD || '',
      fileSpec: project.fileSpec || '',
      fileConcept: project.fileConcept || '',
      recentEvents: project.customData?.recentEvents || '',
      additionalNotes: project.customData?.additionalNotes || '',
      availableTools,
      mcpServers,
      templateVersion: '1.0.0',
      customData: project.customData
    };

    // Apply profile-aware filtering if profiles are available
    this.applyProfileFiltering(enhanced, project.instruction || 'implementation');

    return enhanced;
  }

  /**
   * Zeros out artifact fields not in the active instruction's profile.
   * Skips filtering if readFileFn is not set or profiles block is absent.
   */
  private applyProfileFiltering(data: EnhancedContextData, instruction: string): void {
    if (!this.readFileFn || !this.cachedPromptPath) return;

    // Lazy-load and cache profiles
    if (this.cachedProfiles === null) {
      try {
        const content = this.readFileFn(this.cachedPromptPath);
        this.cachedProfiles = this.profileParser.parseProfiles(content);
      } catch {
        this.cachedProfiles = {};
      }
    }

    const profiles = this.cachedProfiles;
    if (Object.keys(profiles).length === 0) return;

    const allowedVars = this.profileParser.getProfileForInstruction(instruction, profiles);
    for (const field of ARTIFACT_FIELDS) {
      if (!allowedVars.includes(field)) {
        (data as unknown as Record<string, unknown>)[field] = '';
      }
    }
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
      fileSlice: project.fileSlice || 'Unknown Slice',
      fileTasks: project.fileTasks || '',
      instruction: project.instruction || 'implementation',
      developmentPhase: project.developmentPhase || 'WARNING: MISSING DEVELOPMENT PHASE',
      workType: project.workType || 'continue',
      dateProject: project.dateProject || new Date().toISOString().split('T')[0],
      fileArch: project.fileArch || '',
      fileSlicePlan: project.fileSlicePlan || '',
      fileHLD: project.fileHLD || '',
      fileSpec: project.fileSpec || '',
      fileConcept: project.fileConcept || '',
      recentEvents: project.customData?.recentEvents || '',
      additionalNotes: project.customData?.additionalNotes || ''
    };
  }

  /**
   * Applies final formatting to processed context
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
  private getErrorContext(project: ProjectData, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `# Project: ${project.name || 'Unknown'}

⚠️ Error generating context: ${message}

## Project Details
- Template: ${project.template || 'Unknown'}
- Slice: ${project.fileSlice || 'Unknown'}
- Instruction: ${project.instruction || 'Unknown'}

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
      project.fileSlice
    );
  }

  /**
   * Detect available tools for the project
   * Currently returns placeholder data - can be enhanced for actual detection
   */
  private async detectAvailableTools(): Promise<string[]> {
    // Placeholder implementation - can be enhanced to actually detect tools
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
   * @returns Default template string
   */
  getDefaultTemplate(): string {
    return DEFAULT_TEMPLATE;
  }
}
