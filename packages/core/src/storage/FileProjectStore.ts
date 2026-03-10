import { copyFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type {
  ProjectData,
  CreateProjectData,
  UpdateProjectData,
} from '../types/project.js';
import type { WorktreeContext } from '../types/worktree.js';
import type { IProjectStore } from './interfaces.js';
import { FileStorageService } from './FileStorageService.js';
import { getStoragePath, getLegacyElectronPath } from './storagePaths.js';

const PROJECTS_FILE = 'projects.json';

function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/** Apply field-migration defaults for projects missing newer fields. */
function migrateProjectFields(project: Record<string, unknown>): ProjectData {
  const base = project as unknown as ProjectData;
  const migrated = {
    ...base,
    // Renamed fields: prefer new name, fall back to old name
    fileSlice: (project.fileSlice ?? project.slice ?? '') as string,
    fileTasks: (project.fileTasks ?? project.taskFile ?? '') as string,
    dateProject: (project.dateProject ?? project.projectDate) as string | undefined,
    // New artifact fields: undefined when absent
    fileHLD: project.fileHLD as string | undefined,
    fileArch: project.fileArch as string | undefined,
    fileSlicePlan: project.fileSlicePlan as string | undefined,
    fileSpec: project.fileSpec as string | undefined,
    instruction:
      typeof project.instruction === 'string'
        ? base.instruction
        : 'implementation',
    customData:
      project.customData && typeof project.customData === 'object'
        ? base.customData
        : {},
    // Worktree contexts: preserve if present
    worktrees: project.worktrees as WorktreeContext[] | undefined,
  };

  // Strip legacy monorepo fields
  const result = migrated as Record<string, unknown>;
  delete result.isMonorepo;
  delete result.isMonorepoEnabled;
  if (migrated.customData) {
    delete (migrated.customData as Record<string, unknown>).monorepoNote;
  }

  return migrated;
}

/**
 * Filesystem-backed project CRUD store using FileStorageService.
 * Lazy-initializes on first access, migrating from legacy Electron location if needed.
 */
export class FileProjectStore implements IProjectStore {
  private readonly storage: FileStorageService;
  private readonly storagePath: string;
  private initialized = false;

  constructor() {
    this.storagePath = getStoragePath();
    this.storage = new FileStorageService(this.storagePath);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const hasData = await this.storage.exists(PROJECTS_FILE);
    if (!hasData) {
      await this.migrateFromLegacyLocation();
    }
  }

  async getAll(): Promise<ProjectData[]> {
    await this.ensureInitialized();

    try {
      const result = await this.storage.read(PROJECTS_FILE);
      const parsed: unknown = JSON.parse(result.data);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((p: Record<string, unknown>) =>
        migrateProjectFields(p)
      );
    } catch (err) {
      // File not found — empty store
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw err;
    }
  }

  async getById(id: string): Promise<ProjectData | undefined> {
    const all = await this.getAll();
    return all.find((p) => p.id === id);
  }

  async create(data: CreateProjectData): Promise<ProjectData> {
    await this.ensureInitialized();

    const now = new Date().toISOString();
    const project: ProjectData = {
      id: generateProjectId(),
      name: data.name,
      template: data.template,
      fileSlice: data.fileSlice,
      fileTasks: data.fileTasks ?? '',
      instruction: data.instruction ?? 'implementation',
      developmentPhase: data.developmentPhase,
      workType: data.workType,
      dateProject: data.dateProject,
      projectPath: data.projectPath,
      fileHLD: data.fileHLD,
      fileArch: data.fileArch,
      fileSlicePlan: data.fileSlicePlan,
      fileSpec: data.fileSpec,
      customData: data.customData ?? {},
      createdAt: now,
      updatedAt: now,
    };

    const existing = await this.getAll();
    existing.push(project);
    await this.storage.write(PROJECTS_FILE, JSON.stringify(existing, null, 2));

    return project;
  }

  async update(id: string, updates: UpdateProjectData): Promise<void> {
    const all = await this.getAll();
    const index = all.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Project not found: ${id}`);
    }

    all[index] = {
      ...all[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.storage.write(PROJECTS_FILE, JSON.stringify(all, null, 2));
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const index = all.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Project not found: ${id}`);
    }

    const filtered = all.filter((p) => p.id !== id);
    await this.storage.write(
      PROJECTS_FILE,
      JSON.stringify(filtered, null, 2)
    );
  }

  /**
   * Copy projects.json (and backup) from legacy Electron location to new location.
   * Only runs if new location has no data and legacy location has data.
   */
  private async migrateFromLegacyLocation(): Promise<boolean> {
    const legacyPath = getLegacyElectronPath();
    if (!legacyPath) return false;

    const newFile = join(this.storagePath, PROJECTS_FILE);
    const legacyFile = join(legacyPath, PROJECTS_FILE);

    if (existsSync(newFile) || !existsSync(legacyFile)) {
      return false;
    }

    await mkdir(this.storagePath, { recursive: true });
    await copyFile(legacyFile, newFile);

    // Also copy single backup if it exists
    const legacyBackup = join(legacyPath, `${PROJECTS_FILE}.backup`);
    if (existsSync(legacyBackup)) {
      await copyFile(
        legacyBackup,
        join(this.storagePath, `${PROJECTS_FILE}.backup`)
      );
    }

    console.log(`Migrated projects.json from legacy location: ${legacyPath}`);
    return true;
  }
}
