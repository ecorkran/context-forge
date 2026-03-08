import type { ContextData } from '../types/context.js';

/** Template data with known + computed alias keys for variable substitution */
type TemplateVariableMap = Record<string, string | number | boolean | undefined>;

/**
 * Utility for processing template strings with variable substitution
 * Handles simple {{variable}} replacement and boolean conditionals
 */
export class TemplateProcessor {

  /**
   * Processes a template string by replacing variables with data values
   * @param template Template string with {{variable}} placeholders
   * @param data Context data to substitute into template
   * @returns Processed template string
   */
  processTemplate(template: string, data: ContextData): string {
    try {
      // Start with the template
      let processed = template;

      // First handle boolean conditionals: {{#if recentEvents}}has events{{else}}no events{{/if}}
      processed = this.processBooleanConditionals(processed, data);

      // Create enhanced data with computed variables
      const enhancedData = this.createEnhancedData(data);

      // Then replace simple variables: {{variableName}} and {variableName}
      // First handle double brace format: {{variableName}}
      processed = processed.replace(/\{\{(\w+)\}\}/g, (_match, variableName: string) => {
        const value = enhancedData[variableName];
        if (value !== undefined && value !== null) {
          return String(value);
        }

        // Log warning for missing variables but don't fail
        console.warn(`Template variable '${variableName}' not found in data, replacing with empty string`);
        return '';
      });

      // Then handle single brace format with more flexible patterns: {variableName}, {slice | feature}, etc.
      processed = processed.replace(/\{([^}]+)\}/g, (_match, expression) => {
        // Handle pipe expressions like {slice | feature}
        if (expression.includes(' | ')) {
          const parts = expression.split(' | ').map((part: string) => part.trim());
          // Use the first part as the primary variable name
          const primaryVar = parts[0];
          const value = enhancedData[primaryVar];
          if (value !== undefined && value !== null) {
            return String(value);
          }
          // If primary variable not found, return the expression as-is for now
          return expression;
        }

        // Handle simple variable names with common aliases
        let variableName = expression;

        // Map common template variables to data field names
        if (expression === 'project') {
          variableName = 'projectName';
        }

        const value = enhancedData[variableName];
        if (value !== undefined && value !== null) {
          return String(value);
        }

        // For parameters that might not be in our data, don't log warnings
        // These might be template placeholders that should remain as-is
        return expression;
      });

      return processed;
    } catch (error: unknown) {
      console.error('Error processing template:', error);
      const message = error instanceof Error ? error.message : String(error);
      return `${template}\n\n[Error processing template: ${message}]`;
    }
  }

  /**
   * Creates enhanced data with computed variables from the original data
   * @param data Original context data
   * @returns Enhanced data with slice parsing and template computations
   */
  private createEnhancedData(data: ContextData): TemplateVariableMap {
    const enhanced: TemplateVariableMap = { ...data };

    // Parse fileSlice into slice alias, sliceindex, and slicename
    if (data.fileSlice) {
      enhanced['slice'] = data.fileSlice;
      const sliceMatch = data.fileSlice.match(/^(\d+)-slice\.(.+)$/);
      if (sliceMatch) {
        enhanced.sliceindex = sliceMatch[1];
        enhanced.slicename = sliceMatch[2];
      }
    }

    // Artifact aliases and index extraction
    if (data.fileArch) {
      enhanced['arch'] = data.fileArch;
      const archMatch = data.fileArch.match(/^(\d+)-/);
      if (archMatch) {
        enhanced['archIndex'] = archMatch[1];
      }
    }
    if (data.fileSlicePlan) {
      enhanced['plan'] = data.fileSlicePlan;
      const planMatch = data.fileSlicePlan.match(/^(\d+)-/);
      if (planMatch) {
        enhanced['planIndex'] = planMatch[1];
      }
    }
    if (data.fileHLD) {
      enhanced['hld'] = data.fileHLD;
      const hldMatch = data.fileHLD.match(/^(\d+)-/);
      if (hldMatch) {
        enhanced['hldIndex'] = hldMatch[1];
      }
    }
    if (data.fileSpec) {
      enhanced['spec'] = data.fileSpec;
    }
    if (data.fileConcept) {
      enhanced['concept'] = data.fileConcept;
    }

    // Add kebab-case alias for developmentPhase
    if (data.developmentPhase) {
      enhanced['development-phase'] = data.developmentPhase;
    }

    // Add kebab-case alias for fileTasks
    if (data.fileTasks) {
      enhanced['task-file'] = data.fileTasks;
    }

    // Add date aliases for template variable substitution
    if (data.dateProject) {
      enhanced['project-date'] = data.dateProject;
      enhanced['projectDate'] = data.dateProject;
      enhanced['projectdate'] = data.dateProject;
    }

    return enhanced;
  }

  /**
   * Processes boolean conditional statements in template.
   * Supports both forms:
   *   {{#if variableName}}content{{else}}fallback{{/if}}
   *   {{#if variableName}}content{{/if}}
   */
  private processBooleanConditionals(template: string, data: ContextData): string {
    const enhancedData = this.createEnhancedData(data);

    // First: if/else/endif (must match before the simpler pattern)
    const withElse = /\{\{#if\s+(\w+)\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/gs;
    let processed = template.replace(withElse, (_m, varName: string, ifTrue: string, ifFalse: string) => {
      return this.evalConditional(varName, ifTrue, ifFalse, enhancedData);
    });

    // Then: if/endif (no else clause)
    const withoutElse = /\{\{#if\s+(\w+)\}\}(.*?)\{\{\/if\}\}/gs;
    processed = processed.replace(withoutElse, (_m, varName: string, ifTrue: string) => {
      return this.evalConditional(varName, ifTrue, '', enhancedData);
    });

    return processed;
  }

  private evalConditional(varName: string, ifTrue: string, ifFalse: string, data: TemplateVariableMap): string {
    try {
      const value = data[varName];
      return Boolean(value) ? ifTrue : ifFalse;
    } catch (error: unknown) {
      console.warn(`Error evaluating conditional for '${varName}':`, error);
      return ifFalse;
    }
  }

  /**
   * Validates that a template string is properly formatted
   * @param template Template string to validate
   * @returns True if template has valid syntax
   */
  validateTemplate(template: string): boolean {
    try {
      // Check for unmatched brackets
      const openBrackets = (template.match(/\{\{/g) || []).length;
      const closeBrackets = (template.match(/\}\}/g) || []).length;

      if (openBrackets !== closeBrackets) {
        return false;
      }

      // Check for proper conditional syntax
      // If there are #if statements, they should all be properly closed
      const ifStatements = (template.match(/\{\{#if\s+\w+\}\}/g) || []).length;
      const endIfStatements = (template.match(/\{\{\/if\}\}/g) || []).length;

      return ifStatements === endIfStatements;
    } catch (error: unknown) {
      console.error('Template validation error:', error);
      return false;
    }
  }
}
