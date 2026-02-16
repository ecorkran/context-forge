import { StorageService } from './StorageService';
import { ProjectData, CreateProjectData, UpdateProjectData } from './types/ProjectData';

/**
 * Store for managing project data with CRUD operations.
 * Uses StorageService for persistence.
 */
export class ProjectStore {
  private storageService: StorageService;
  private projects: ProjectData[] = [];

  constructor() {
    this.storageService = new StorageService();
  }

  /**
   * Generates a unique ID for new projects
   */
  private generateId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Loads all projects from storage
   */
  async load(): Promise<ProjectData[]> {
    try {
      this.projects = await this.storageService.readProjects();
      return this.projects;
    } catch (error) {
      console.error('Failed to load projects:', error);
      this.projects = [];
      return [];
    }
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
      customData: projectData.customData || {},
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
}