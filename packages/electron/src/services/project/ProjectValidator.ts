import { ProjectData, CreateProjectData } from '../storage/types/ProjectData';

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Valid instruction values for development phases
 */
export const VALID_INSTRUCTIONS = [
  'planning',
  'implementation', 
  'debugging',
  'testing',
  'custom'
] as const;

export type InstructionType = typeof VALID_INSTRUCTIONS[number];

/**
 * Service for validating project configuration data
 */
export class ProjectValidator {
  
  /**
   * Validates a complete project data object
   */
  validateProject(project: ProjectData): ValidationResult {
    const errors: string[] = [];

    // Validate required fields
    if (!project.id || project.id.trim() === '') {
      errors.push('Project ID is required');
    }

    if (!project.name || project.name.trim() === '') {
      errors.push('Project name is required');
    } else if (project.name.length > 50) {
      errors.push('Project name must be 50 characters or less');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(project.name)) {
      errors.push('Project name can only contain alphanumeric characters, hyphens, and underscores');
    }

    if (!project.template || project.template.trim() === '') {
      errors.push('Template is required');
    }

    if (!project.slice || project.slice.trim() === '') {
      errors.push('Slice is required');
    }

    // Validate instruction field
    if (!project.instruction || project.instruction.trim() === '') {
      errors.push('Development phase (instruction) is required');
    } else if (!VALID_INSTRUCTIONS.includes(project.instruction as InstructionType)) {
      errors.push(`Invalid instruction. Must be one of: ${VALID_INSTRUCTIONS.join(', ')}`);
    }

    // Validate custom data if present
    if (project.customData) {
      if (project.customData.recentEvents && project.customData.recentEvents.length > 500) {
        errors.push('Recent events must be 500 characters or less');
      }
      
      if (project.customData.additionalNotes && project.customData.additionalNotes.length > 300) {
        errors.push('Additional notes must be 300 characters or less');
      }
    }

    // Validate timestamps
    if (!project.createdAt || !this.isValidDate(project.createdAt)) {
      errors.push('Invalid created date');
    }

    if (!project.updatedAt || !this.isValidDate(project.updatedAt)) {
      errors.push('Invalid updated date');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates project creation data
   */
  validateCreateProject(data: CreateProjectData): ValidationResult {
    const errors: string[] = [];

    // Validate required fields
    if (!data.name || data.name.trim() === '') {
      errors.push('Project name is required');
    } else if (data.name.length > 50) {
      errors.push('Project name must be 50 characters or less');
    } else if (!/^[a-zA-Z0-9_-]+$/.test(data.name)) {
      errors.push('Project name can only contain alphanumeric characters, hyphens, and underscores');
    }

    if (!data.template || data.template.trim() === '') {
      errors.push('Template is required');
    }

    if (!data.slice || data.slice.trim() === '') {
      errors.push('Slice is required');
    }

    // Validate instruction field (default to 'implementation' if not provided)
    if (data.instruction && !VALID_INSTRUCTIONS.includes(data.instruction as InstructionType)) {
      errors.push(`Invalid instruction. Must be one of: ${VALID_INSTRUCTIONS.join(', ')}`);
    }

    // Validate custom data if present
    if (data.customData) {
      if (data.customData.recentEvents && data.customData.recentEvents.length > 500) {
        errors.push('Recent events must be 500 characters or less');
      }
      
      if (data.customData.additionalNotes && data.customData.additionalNotes.length > 300) {
        errors.push('Additional notes must be 300 characters or less');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validates if a string is a valid ISO date
   */
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
  }
}