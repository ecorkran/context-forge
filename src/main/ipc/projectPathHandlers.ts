import { ipcMain, dialog, BrowserWindow } from 'electron';
import { ProjectPathService } from '../services/project/ProjectPathService';

const projectPathService = new ProjectPathService();

const CHANNELS = [
  'project-path:validate',
  'project-path:health-check',
  'project-path:list-directory',
  'project-path:pick-folder',
] as const;

/**
 * Register IPC handlers for project path operations.
 */
export function setupProjectPathHandlers() {
  ipcMain.handle('project-path:validate', async (_event, args: { path: string }) => {
    try {
      if (!args?.path) {
        return { valid: false, projectPath: '', errors: ['No path provided'], structure: { hasProjectDocuments: false, hasUserDir: false, subdirectories: [] } };
      }
      return await projectPathService.validate(args.path);
    } catch (error) {
      console.error('Error validating project path:', error);
      return { valid: false, projectPath: args?.path ?? '', errors: [String(error)], structure: { hasProjectDocuments: false, hasUserDir: false, subdirectories: [] } };
    }
  });

  ipcMain.handle('project-path:health-check', async (_event, args: { path: string }) => {
    try {
      if (!args?.path) {
        return { valid: false, projectPath: '', errors: ['No path provided'], structure: { hasProjectDocuments: false, hasUserDir: false, subdirectories: [] } };
      }
      return await projectPathService.healthCheck(args.path);
    } catch (error) {
      console.error('Error in project path health check:', error);
      return { valid: false, projectPath: args?.path ?? '', errors: [String(error)], structure: { hasProjectDocuments: false, hasUserDir: false, subdirectories: [] } };
    }
  });

  ipcMain.handle('project-path:list-directory', async (_event, args: { path: string; subdirectory: string; isMonorepo?: boolean }) => {
    try {
      if (!args?.path || !args?.subdirectory) {
        return { files: [], error: 'Missing required fields: path and subdirectory' };
      }
      return await projectPathService.listDirectory(args.path, args.subdirectory, args.isMonorepo);
    } catch (error) {
      console.error('Error listing project directory:', error);
      return { files: [], error: String(error) };
    }
  });

  ipcMain.handle('project-path:pick-folder', async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      const options = { properties: ['openDirectory' as const] };
      const result = focusedWindow
        ? await dialog.showOpenDialog(focusedWindow, options)
        : await dialog.showOpenDialog(options);

      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }

      return { path: result.filePaths[0] };
    } catch (error) {
      console.error('Error opening folder picker:', error);
      return null;
    }
  });

  console.log('Project path IPC handlers registered');
}

/**
 * Remove all project path IPC handlers.
 */
export function removeProjectPathHandlers() {
  CHANNELS.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });

  console.log('Project path IPC handlers removed');
}
