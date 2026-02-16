/**
 * ProjectManager Service
 * High-level service for managing multiple projects and coordinating with persistence layer
 */

import { PersistentProjectStore } from '../storage/PersistentProjectStore';
import { ProjectData } from '../storage/types/ProjectData';

export class ProjectManager {
  private persistentStore: PersistentProjectStore;

  constructor(persistentStore?: PersistentProjectStore) {
    // Dependency injection pattern - allows for testing with mock store
    this.persistentStore = persistentStore || new PersistentProjectStore();
  }

  /**
   * Load all projects from storage, sorted by most recent first
   * @returns Array of projects or empty array on error
   */
  async loadAllProjects(): Promise<ProjectData[]> {
    try {
      const projects = await this.persistentStore.loadProjects();
      
      // Sort by updatedAt (most recent first)
      return projects.sort((a, b) => {
        const dateA = new Date(a.updatedAt);
        const dateB = new Date(b.updatedAt);
        return dateB.getTime() - dateA.getTime();
      });
    } catch (error) {
      console.error('ProjectManager: Error loading projects:', error);
      // Return empty array on error - graceful degradation
      return [];
    }
  }

  /**
   * Get the current active project from app state
   * @returns Current project data or null if not found
   */
  async getCurrentProject(): Promise<ProjectData | null> {
    try {
      // Get current project ID from app state
      const currentProjectId = await this.persistentStore.getLastActiveProject();
      if (!currentProjectId) {
        return null;
      }

      // Load all projects and find the current one
      const projects = await this.loadAllProjects();
      const currentProject = projects.find(p => p.id === currentProjectId);
      
      return currentProject || null;
    } catch (error) {
      console.error('ProjectManager: Error getting current project:', error);
      return null;
    }
  }

  /**
   * Get the total number of projects
   * @returns Number of projects
   */
  async getProjectCount(): Promise<number> {
    try {
      const projects = await this.loadAllProjects();
      return projects.length;
    } catch (error) {
      console.error('ProjectManager: Error getting project count:', error);
      return 0;
    }
  }

  /**
   * Check if there are multiple projects
   * @returns True if more than one project exists
   */
  async hasMultipleProjects(): Promise<boolean> {
    try {
      const count = await this.getProjectCount();
      return count > 1;
    } catch (error) {
      console.error('ProjectManager: Error checking multiple projects:', error);
      return false;
    }
  }

  /**
   * Get array of all project names
   * @returns Array of project names
   */
  async getProjectNames(): Promise<string[]> {
    try {
      const projects = await this.loadAllProjects();
      return projects.map(p => p.name);
    } catch (error) {
      console.error('ProjectManager: Error getting project names:', error);
      return [];
    }
  }

  /**
   * Switch to a different project
   * @param projectId ID of project to switch to
   * @returns Project data of switched project
   */
  async switchToProject(projectId: string): Promise<ProjectData | null> {
    try {
      // Validate target project exists
      const projects = await this.loadAllProjects();
      const targetProject = projects.find(p => p.id === projectId);
      
      if (!targetProject) {
        throw new Error(`Project with id ${projectId} not found`);
      }

      // Check if switching to already-current project (no-op)
      const currentProjectId = await this.persistentStore.getLastActiveProject();
      if (currentProjectId === projectId) {
        console.log(`ProjectManager: Already on project ${targetProject.name}, no switch needed`);
        return targetProject;
      }

      // Update app state with new active project
      await this.persistentStore.setLastActiveProject(projectId);
      
      console.log(`ProjectManager: Switched to project: ${targetProject.name}`);
      return targetProject;
    } catch (error) {
      console.error('ProjectManager: Error switching project:', error);
      throw new Error(`Failed to switch to project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if a project can be switched to
   * @param projectId ID of project to validate
   * @returns True if project exists and can be switched to
   */
  async validateProjectSwitch(projectId: string): Promise<boolean> {
    try {
      if (!projectId) {
        return false;
      }

      const projects = await this.loadAllProjects();
      return projects.some(p => p.id === projectId);
    } catch (error) {
      console.error('ProjectManager: Error validating project switch:', error);
      return false;
    }
  }

  /**
   * Create a new project with default values
   * @returns Created project data
   */
  async createNewProject(): Promise<ProjectData> {
    try {
      // Generate unique project ID
      const projectId = this.generateProjectId();
      
      // Get existing projects to generate unique name
      const existingProjects = await this.loadAllProjects();
      const projectName = this.generateProjectName(existingProjects);
      
      // Create default project data
      const now = new Date().toISOString();
      const newProject: ProjectData = {
        id: projectId,
        name: projectName,
        template: '',
        slice: '',
        taskFile: '',
        instruction: 'implementation',
        workType: 'continue',
        isMonorepo: false,
        customData: {},
        createdAt: now,
        updatedAt: now,
      };

      // Save project to storage
      await this.persistentStore.saveProject(newProject);
      
      // Automatically switch to new project
      await this.persistentStore.setLastActiveProject(projectId);
      
      console.log(`ProjectManager: Created and switched to new project: ${projectName}`);
      return newProject;
    } catch (error) {
      console.error('ProjectManager: Error creating project:', error);
      throw new Error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate unique project ID
   * @returns Unique project ID
   */
  private generateProjectId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Generate unique project name
   * @param existingProjects Array of existing projects
   * @returns Unique project name
   */
  private generateProjectName(existingProjects: ProjectData[]): string {
    const baseName = 'New Project';
    const existingNames = existingProjects.map(p => p.name);
    
    // If "New Project" doesn't exist, use it
    if (!existingNames.includes(baseName)) {
      return baseName;
    }
    
    // Find next available number
    let counter = 2;
    while (existingNames.includes(`${baseName} ${counter}`)) {
      counter++;
    }
    
    return `${baseName} ${counter}`;
  }

  /**
   * Delete a project from storage
   * @param projectId ID of project to delete
   * @returns True if deletion was successful
   */
  async deleteProject(projectId: string): Promise<boolean> {
    try {
      // Validate project exists
      const projects = await this.loadAllProjects();
      const projectToDelete = projects.find(p => p.id === projectId);
      
      if (!projectToDelete) {
        throw new Error(`Project with id ${projectId} not found`);
      }

      // Prevent deletion when only one project exists
      if (projects.length <= 1) {
        throw new Error('Cannot delete the last remaining project');
      }

      // Handle deletion of current project - switch to another first
      const currentProjectId = await this.persistentStore.getLastActiveProject();
      if (currentProjectId === projectId) {
        // Find the most recent project that isn't the one being deleted
        const otherProjects = projects.filter(p => p.id !== projectId);
        if (otherProjects.length > 0) {
          await this.persistentStore.setLastActiveProject(otherProjects[0].id);
          console.log(`ProjectManager: Switched to ${otherProjects[0].name} before deleting ${projectToDelete.name}`);
        }
      }

      // Delete the project
      await this.persistentStore.deleteProject(projectId);
      
      console.log(`ProjectManager: Successfully deleted project: ${projectToDelete.name}`);
      return true;
    } catch (error) {
      console.error('ProjectManager: Error deleting project:', error);
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if a project can be safely deleted
   * @param projectId ID of project to validate for deletion
   * @returns True if project can be deleted safely
   */
  async canDeleteProject(projectId: string): Promise<boolean> {
    try {
      if (!projectId) {
        return false;
      }

      const projects = await this.loadAllProjects();
      
      // Can't delete if project doesn't exist
      const projectExists = projects.some(p => p.id === projectId);
      if (!projectExists) {
        return false;
      }

      // Can't delete if it's the last project
      return projects.length > 1;
    } catch (error) {
      console.error('ProjectManager: Error validating project deletion:', error);
      return false;
    }
  }
}