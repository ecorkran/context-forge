import * as fs from 'fs';
import * as path from 'path';
import type { PathValidationResult, DirectoryListResult } from '../types/paths.js';

const EXPECTED_SUBDIRS = ['slices', 'tasks', 'features', 'architecture'] as const;

/**
 * Stateless service for validating project paths and listing directory contents.
 * Runs in the main process; all data passed per-call (no constructor state).
 */
export class ProjectPathService {
  /** Validate a project path against the expected directory structure. */
  async validate(projectPath: string): Promise<PathValidationResult> {
    const result: PathValidationResult = {
      valid: false,
      projectPath,
      errors: [],
      structure: {
        hasProjectDocuments: false,
        hasUserDir: false,
        subdirectories: [],
      },
    };

    if (!projectPath || typeof projectPath !== 'string') {
      result.errors.push('Path must be a non-empty string');
      return result;
    }

    if (projectPath.includes('\0') || projectPath.includes('..')) {
      result.errors.push('Path contains invalid characters');
      return result;
    }

    try {
      const stat = await fs.promises.stat(projectPath);
      if (!stat.isDirectory()) {
        result.errors.push('Path is not a directory');
        return result;
      }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        result.errors.push('Path does not exist');
      } else if (code === 'EACCES') {
        result.errors.push('Permission denied');
      } else {
        result.errors.push(`Cannot access path: ${code ?? 'unknown error'}`);
      }
      return result;
    }

    // Check for project-documents/
    const projectDocsPath = path.join(projectPath, 'project-documents');
    try {
      const stat = await fs.promises.stat(projectDocsPath);
      if (stat.isDirectory()) {
        result.structure.hasProjectDocuments = true;
      } else {
        result.errors.push('project-documents exists but is not a directory');
        return result;
      }
    } catch {
      result.errors.push('project-documents/ directory not found');
      return result;
    }

    // Check for project-documents/user/
    const userDirPath = path.join(projectDocsPath, 'user');
    try {
      const stat = await fs.promises.stat(userDirPath);
      if (stat.isDirectory()) {
        result.structure.hasUserDir = true;
      }
    } catch {
      // user/ not found is not fatal — path is still valid if project-documents exists
    }

    // Check which expected subdirectories exist under user/
    if (result.structure.hasUserDir) {
      for (const subdir of EXPECTED_SUBDIRS) {
        const subdirPath = path.join(userDirPath, subdir);
        try {
          const stat = await fs.promises.stat(subdirPath);
          if (stat.isDirectory()) {
            result.structure.subdirectories.push(subdir);
          }
        } catch {
          // Subdirectory doesn't exist — that's fine
        }
      }
    }

    result.valid = true;
    return result;
  }

  /** On-demand revalidation — same logic as validate, separate for semantic clarity. */
  async healthCheck(projectPath: string): Promise<PathValidationResult> {
    return this.validate(projectPath);
  }

  /** List files in a project subdirectory (filenames only). */
  async listDirectory(
    projectPath: string,
    subdirectory: string,
    isMonorepo?: boolean,
  ): Promise<DirectoryListResult> {
    if (!projectPath || typeof projectPath !== 'string') {
      return { files: [], error: 'Path must be a non-empty string' };
    }

    if (projectPath.includes('\0') || projectPath.includes('..')) {
      return { files: [], error: 'Path contains invalid characters' };
    }

    if (!subdirectory || subdirectory.includes('..') || subdirectory.includes('\0')) {
      return { files: [], error: 'Subdirectory contains invalid characters' };
    }

    const basePath = isMonorepo
      ? path.join(projectPath, 'project-artifacts')
      : path.join(projectPath, 'project-documents', 'user');

    const fullPath = path.join(basePath, subdirectory);

    try {
      const entries = await fs.promises.readdir(fullPath, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);

      return { files };
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return { files: [], error: `Directory not found: ${subdirectory}` };
      } else if (code === 'EACCES') {
        return { files: [], error: 'Permission denied' };
      }
      return { files: [], error: `Cannot read directory: ${code ?? 'unknown error'}` };
    }
  }
}
