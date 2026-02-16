import { promises as fs } from 'fs';
import path from 'path';
import { app } from 'electron';
import { ProjectData } from './types/ProjectData';

/**
 * Service for handling file system operations for project data storage.
 * Implements atomic writes and backup/recovery mechanisms.
 */
export class StorageService {
  private readonly baseDir: string;
  private readonly mainFile: string;
  private readonly backupFile: string;
  
  constructor() {
    // Use Electron's userData directory for storage
    this.baseDir = path.join(app.getPath('userData'), 'context-forge');
    this.mainFile = path.join(this.baseDir, 'projects.json');
    this.backupFile = path.join(this.baseDir, 'projects.backup.json');
  }

  /**
   * Ensures the storage directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create storage directory:', error);
      throw new Error('Unable to initialize storage directory');
    }
  }

  /**
   * Reads project data from the main file, with fallback to backup
   */
  async readProjects(): Promise<ProjectData[]> {
    await this.ensureDirectory();
    
    try {
      // Try to read main file first
      const data = await fs.readFile(this.mainFile, 'utf-8');
      const projects = JSON.parse(data);
      
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
      // If main file doesn't exist or is corrupted, try backup
      try {
        const backupData = await fs.readFile(this.backupFile, 'utf-8');
        const projects = JSON.parse(backupData);
        
        if (Array.isArray(projects)) {
          console.log('Recovered data from backup file');
          // Restore the main file from backup
          await this.writeProjects(projects);
          return projects;
        }
      } catch (backupError) {
        // No valid backup either
        console.log('No existing project data found, starting fresh');
      }
      
      // Return empty array if no valid data found
      return [];
    }
  }

  /**
   * Writes project data atomically with backup
   */
  async writeProjects(projects: ProjectData[]): Promise<void> {
    await this.ensureDirectory();
    
    try {
      // Create backup of existing file if it exists
      try {
        await fs.copyFile(this.mainFile, this.backupFile);
      } catch (error) {
        // Main file might not exist yet, that's okay
      }
      
      // Write to temporary file first
      const tempFile = `${this.mainFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(projects, null, 2), 'utf-8');
      
      // Atomically rename temp file to main file
      await fs.rename(tempFile, this.mainFile);
      
      console.log(`Successfully saved ${projects.length} projects`);
    } catch (error) {
      console.error('Failed to save projects:', error);
      
      // Try to restore from backup
      try {
        await fs.copyFile(this.backupFile, this.mainFile);
        console.log('Restored from backup after write failure');
      } catch (restoreError) {
        // Backup restore also failed
      }
      
      throw new Error('Failed to save project data');
    }
  }

  /**
   * Creates a manual backup of the current data
   */
  async createBackup(): Promise<void> {
    try {
      await fs.copyFile(this.mainFile, this.backupFile);
      console.log('Backup created successfully');
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw new Error('Failed to create backup');
    }
  }
}