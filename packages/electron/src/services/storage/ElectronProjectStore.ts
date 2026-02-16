import { ElectronStorageService } from './ElectronStorageService';
import { ProjectData, CreateProjectData, UpdateProjectData } from './types/ProjectData';

/**
 * Store for managing project data with CRUD operations in Electron.
 * Uses ElectronStorageService for persistence through IPC.
 */
export class ElectronProjectStore {
  private storageService: ElectronStorageService;
  private projects: ProjectData[] = [];

  constructor() {
    this.storageService = new ElectronStorageService();
  }

  /**
   * Generates a unique ID for new projects
   */
  private generateId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Loads all projects from storage and migrates them if necessary
   */
  async load(): Promise<ProjectData[]> {
    try {
      const rawProjects = await this.storageService.readProjects();
      this.projects = this.migrateProjects(rawProjects);
      
      // Save migrated projects if any were updated
      const hasMigrations = rawProjects.some((project, index) => 
        JSON.stringify(project) !== JSON.stringify(this.projects[index])
      );
      
      if (hasMigrations) {
        console.log('Migrating project data to include new fields');
        await this.storageService.writeProjects(this.projects);
      }
      
      return this.projects;
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.projects = [];
      return [];
    }
  }

  /**
   * Migrates project data to include new required fields
   */
  private migrateProjects(projects: any[]): ProjectData[] {
    return projects.map(project => {
      // Ensure all required fields exist with defaults
      const migrated: ProjectData = {
        id: project.id,
        name: project.name,
        template: project.template,
        slice: project.slice,
        taskFile: project.taskFile || '', // Default to empty string
        instruction: project.instruction || 'implementation', // Default to implementation
        isMonorepo: project.isMonorepo || false,
        customData: project.customData || {}, // Default to empty object
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      };

      return migrated;
    });
  }

  /**
   * Saves all projects to storage
   */
  async save(projects: ProjectData[]): Promise<void> {
    try {
      await this.storageService.writeProjects(projects);
      this.projects = projects;
    } catch (error) {
      console.error('Failed to save projects:', error);
      throw error;
    }
  }

  /**
   * Creates a new project
   */
  async create(projectData: CreateProjectData): Promise<ProjectData> {
    const now = new Date().toISOString();
    const newProject: ProjectData = {
      ...projectData,
      id: this.generateId(),
      taskFile: projectData.taskFile || '',
      instruction: projectData.instruction || '',
      customData: projectData.customData || {}, // Default to empty object
      createdAt: now,
      updatedAt: now,
    };

    try {
      // Load current projects to ensure we have latest data
      await this.load();
      
      // Add new project
      this.projects.push(newProject);
      
      // Save to storage
      await this.save(this.projects);
      
      return newProject;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw new Error('Failed to create project');
    }
  }

  /**
   * Updates an existing project
   */
  async update(id: string, updates: UpdateProjectData): Promise<void> {
    try {
      // Load current projects to ensure we have latest data
      await this.load();
      
      // Find project to update
      const projectIndex = this.projects.findIndex(p => p.id === id);
      if (projectIndex === -1) {
        throw new Error(`Project with id ${id} not found`);
      }
      
      // Update project
      this.projects[projectIndex] = {
        ...this.projects[projectIndex],
        ...updates,
        updatedAt: new Date().toISOString(),
      };
      
      // Save to storage
      await this.save(this.projects);
    } catch (error) {
      console.error('Failed to update project:', error);
      throw error;
    }
  }

  /**
   * Deletes a project by ID
   */
  async delete(id: string): Promise<void> {
    try {
      // Load current projects to ensure we have latest data
      await this.load();
      
      // Filter out the project to delete
      const filteredProjects = this.projects.filter(p => p.id !== id);
      
      if (filteredProjects.length === this.projects.length) {
        throw new Error(`Project with id ${id} not found`);
      }
      
      // Save updated list
      await this.save(filteredProjects);
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  }

  /**
   * Gets a single project by ID
   */
  async getById(id: string): Promise<ProjectData | undefined> {
    await this.load();
    return this.projects.find(p => p.id === id);
  }

  /**
   * Gets all projects
   */
  async getAll(): Promise<ProjectData[]> {
    await this.load();
    return this.projects;
  }

  /**
   * Creates a manual backup
   */
  async createBackup(): Promise<void> {
    try {
      await this.storageService.createBackup();
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const electronProjectStore = new ElectronProjectStore();