/**
 * Persistent Project Store
 * Provides project CRUD operations with file system persistence via Electron IPC
 */

import { ProjectData, UpdateProjectData } from './types/ProjectData';
import { AppState, DEFAULT_APP_STATE } from './types/AppState';
import { ElectronStorageService } from './ElectronStorageService';
import { StorageClient } from './StorageClient';

export class PersistentProjectStore {
  private storageService: ElectronStorageService;
  private storageClient: StorageClient;
  private appStateFile = 'app-state.json';
  
  constructor() {
    this.storageService = new ElectronStorageService();
    this.storageClient = new StorageClient();
  }

  // Project Operations
  /**
   * Load all projects from storage
   * @returns Array of projects, empty if no projects exist or on error
   */
  async loadProjects(): Promise<ProjectData[]> {
    try {
      const projects = await this.storageService.readProjects();
      console.log(`Loaded ${projects.length} projects from storage`);
      return projects;
    } catch (error) {
      console.error('Error loading projects:', error);
      // Return empty array on error - graceful degradation
      return [];
    }
  }

  /**
   * Save a new project to storage
   * @param project Project data to save
   */
  async saveProject(project: ProjectData): Promise<void> {
    try {
      // Validate project data before saving
      if (!project.id || !project.name) {
        throw new Error('Project must have id and name');
      }

      // Load existing projects
      const projects = await this.loadProjects();
      
      // Check if project already exists
      const existingIndex = projects.findIndex(p => p.id === project.id);
      if (existingIndex !== -1) {
        throw new Error(`Project with id ${project.id} already exists. Use updateProject instead.`);
      }

      // Add new project
      projects.push(project);
      
      // Save all projects back to storage
      await this.storageService.writeProjects(projects);
      
      console.log(`Successfully saved new project: ${project.name}`);
    } catch (error) {
      console.error('Error saving project:', error);
      throw new Error(`Failed to save project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing project in storage
   * @param id Project ID to update
   * @param updates Partial project data to merge
   */
  async updateProject(id: string, updates: UpdateProjectData): Promise<void> {
    try {
      // Load existing projects
      const projects = await this.loadProjects();
      
      // Find project by ID
      const projectIndex = projects.findIndex(p => p.id === id);
      if (projectIndex === -1) {
        throw new Error(`Project with id ${id} not found`);
      }

      // Merge updates with existing data and update timestamp
      projects[projectIndex] = {
        ...projects[projectIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      
      // Save all projects back to storage
      await this.storageService.writeProjects(projects);
      
      console.log(`Successfully updated project: ${projects[projectIndex].name}`);
    } catch (error) {
      console.error('Error updating project:', error);
      throw new Error(`Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a project from storage
   * @param id Project ID to delete
   */
  async deleteProject(id: string): Promise<void> {
    try {
      // Load existing projects
      const projects = await this.loadProjects();
      
      // Find project by ID
      const projectIndex = projects.findIndex(p => p.id === id);
      if (projectIndex === -1) {
        throw new Error(`Project with id ${id} not found`);
      }

      // Remember project name for logging
      const projectName = projects[projectIndex].name;
      
      // Filter out the project
      const updatedProjects = projects.filter(p => p.id !== id);
      
      // Save updated projects list
      await this.storageService.writeProjects(updatedProjects);
      
      console.log(`Successfully deleted project: ${projectName}`);
    } catch (error) {
      console.error('Error deleting project:', error);
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // App State Operations
  /**
   * Get application state from storage
   * @returns App state or default state if file doesn't exist
   */
  async getAppState(): Promise<AppState> {
    try {
      // Check if storage is available
      if (!this.storageClient.isAvailable()) {
        console.warn('Storage not available, returning default app state');
        return { ...DEFAULT_APP_STATE };
      }

      // Read app state file
      const result = await this.storageClient.readFile(this.appStateFile);
      
      // If file is empty or doesn't exist, return defaults
      if (!result.data) {
        console.log('No app state found, using defaults');
        return { ...DEFAULT_APP_STATE };
      }
      
      // Parse and validate JSON structure
      const appState = JSON.parse(result.data);
      
      // Validate required fields and merge with defaults
      const validatedState: AppState = {
        ...DEFAULT_APP_STATE,
        ...appState,
        lastOpened: new Date().toISOString(), // Always update last opened
      };
      
      return validatedState;
    } catch (error) {
      console.error('Error reading app state:', error);
      // Return defaults on any error
      return { ...DEFAULT_APP_STATE };
    }
  }

  /**
   * Update application state in storage
   * @param updates Partial app state to merge with existing state
   */
  async updateAppState(updates: Partial<AppState>): Promise<void> {
    try {
      // Check if storage is available
      if (!this.storageClient.isAvailable()) {
        console.warn('Storage not available, cannot update app state');
        throw new Error('Storage not available');
      }

      // Get current state
      const currentState = await this.getAppState();
      
      // Merge updates with current state
      const updatedState: AppState = {
        ...currentState,
        ...updates,
        lastOpened: new Date().toISOString(), // Always update timestamp
      };
      
      // Write to storage
      const jsonData = JSON.stringify(updatedState, null, 2);
      await this.storageClient.writeFile(this.appStateFile, jsonData);
      
      console.log('Successfully updated app state');
    } catch (error) {
      console.error('Error updating app state:', error);
      throw new Error(`Failed to update app state: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the last active project ID from app state
   * @returns Project ID or null if none set
   */
  async getLastActiveProject(): Promise<string | null> {
    try {
      const appState = await this.getAppState();
      return appState.lastActiveProjectId || null;
    } catch (error) {
      console.error('Error getting last active project:', error);
      return null;
    }
  }

  /**
   * Set the last active project ID in app state
   * @param projectId Project ID to set as active
   */
  async setLastActiveProject(projectId: string): Promise<void> {
    try {
      await this.updateAppState({ lastActiveProjectId: projectId });
      console.log(`Set last active project to: ${projectId}`);
    } catch (error) {
      console.error('Error setting last active project:', error);
      throw new Error(`Failed to set last active project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}