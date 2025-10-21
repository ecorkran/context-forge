import { ProjectData } from './types/ProjectData';
import { storageClient } from './StorageClient';

/**
 * Storage service that uses Electron IPC for file operations
 * Works in the renderer process through secure IPC communication
 */
export class ElectronStorageService {
  private readonly mainFile = 'projects.json';

  /**
   * Reads project data from the main file, with fallback to backup
   */
  async readProjects(): Promise<ProjectData[]> {
    // Check if we're in Electron environment
    if (!storageClient.isAvailable()) {
      console.warn('Electron storage not available, returning empty array');
      return [];
    }

    try {
      // Try to read main file first
      const result = await storageClient.readFile(this.mainFile);
      
      // Handle recovery notification
      if (result.recovered) {
        console.log(result.message || 'Data recovered from backup');
        // Could emit an event or show user notification here
      }
      
      if (!result.data) {
        return [];
      }
      
      const projects = JSON.parse(result.data);
      
      // Validate the data structure
      if (!Array.isArray(projects)) {
        throw new Error('Invalid data structure: expected array');
      }
      
      // Validate each project has required fields
      for (const project of projects) {
        if (!project.id || !project.name) {
          throw new Error('Invalid project data: missing required fields');
        }
      }
      
      return projects;
    } catch (error) {
      console.log('No existing project data found, starting fresh');
      // Return empty array if no valid data found
      return [];
    }
  }

  /**
   * Writes project data atomically with backup
   */
  async writeProjects(projects: ProjectData[]): Promise<void> {
    // Check if we're in Electron environment
    if (!storageClient.isAvailable()) {
      console.warn('Electron storage not available, cannot save projects');
      throw new Error('Storage not available');
    }

    try {
      // Create backup of existing file if it exists
      try {
        await storageClient.createBackup(this.mainFile);
      } catch (error) {
        // Main file might not exist yet, that's okay
        console.log('No existing file to backup');
      }
      
      // Write the data
      const jsonData = JSON.stringify(projects, null, 2);
      await storageClient.writeFile(this.mainFile, jsonData);
      
      console.log(`Successfully saved ${projects.length} projects`);
    } catch (error) {
      console.error('Failed to save projects:', error);
      throw new Error('Failed to save project data');
    }
  }

  /**
   * Creates a manual backup of the current data
   */
  async createBackup(): Promise<void> {
    // Check if we're in Electron environment
    if (!storageClient.isAvailable()) {
      console.warn('Electron storage not available, cannot create backup');
      throw new Error('Storage not available');
    }

    try {
      await storageClient.createBackup(this.mainFile);
      console.log('Backup created successfully');
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error('Failed to create backup');
    }
  }
}

// Export singleton instance
export const electronStorageService = new ElectronStorageService();