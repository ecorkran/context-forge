import { ProjectData, CreateProjectData, UpdateProjectData } from './types/ProjectData';

/**
 * Simple in-memory project store for rapid prototyping.
 * Data is lost on application restart - perfect for initial UI testing.
 */
export class SimpleProjectStore {
  private projects: ProjectData[] = [];
  private currentProjectId: string | null = null;

  /**
   * Generates a unique ID for new projects
   */
  private generateId(): string {
    return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

    this.projects.push(newProject);
    
    // Set as current project if it's the first one
    if (!this.currentProjectId) {
      this.currentProjectId = newProject.id;
    }
    
    return newProject;
  }

  /**
   * Updates an existing project
   */
  async update(id: string, updates: UpdateProjectData): Promise<void> {
    const projectIndex = this.projects.findIndex(p => p.id === id);
    if (projectIndex === -1) {
      throw new Error(`Project with id ${id} not found`);
    }

    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Gets a single project by ID
   */
  async getById(id: string): Promise<ProjectData | undefined> {
    return this.projects.find(p => p.id === id);
  }

  /**
   * Gets all projects
   */
  async getAll(): Promise<ProjectData[]> {
    return this.projects;
  }

  /**
   * Gets the current project
   */
  async getCurrentProject(): Promise<ProjectData | undefined> {
    if (!this.currentProjectId) return undefined;
    return this.getById(this.currentProjectId);
  }

  /**
   * Sets the current project
   */
  async setCurrentProject(id: string): Promise<void> {
    const project = await this.getById(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    this.currentProjectId = id;
  }

  /**
   * Deletes a project by ID
   */
  async delete(id: string): Promise<void> {
    const filteredProjects = this.projects.filter(p => p.id !== id);
    
    if (filteredProjects.length === this.projects.length) {
      throw new Error(`Project with id ${id} not found`);
    }
    
    this.projects = filteredProjects;
    
    // Clear current project if it was deleted
    if (this.currentProjectId === id) {
      this.currentProjectId = this.projects.length > 0 ? this.projects[0].id : null;
    }
  }
}