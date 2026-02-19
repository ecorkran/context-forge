import type { ProjectData, CreateProjectData, UpdateProjectData } from '../types/project.js';

/** Result of a storage read operation, with optional recovery metadata. */
export interface StorageReadResult {
  data: string;
  recovered?: boolean;
  message?: string;
}

/** Low-level storage service for reading/writing arbitrary JSON files with backup support. */
export interface IStorageService {
  read(filename: string): Promise<StorageReadResult>;
  write(filename: string, data: string): Promise<void>;
  createBackup(filename: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
}

/** High-level project CRUD store. */
export interface IProjectStore {
  getAll(): Promise<ProjectData[]>;
  getById(id: string): Promise<ProjectData | undefined>;
  create(data: CreateProjectData): Promise<ProjectData>;
  update(id: string, updates: UpdateProjectData): Promise<void>;
  delete(id: string): Promise<void>;
}
