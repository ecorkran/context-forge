import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  updateWindowTitle: (projectName?: string) => ipcRenderer.invoke('update-window-title', projectName),

  // ── Domain-level API ────────────────────────────────────────────────────────
  project: {
    list: () => ipcRenderer.invoke('project:list'),
    get: (id: string) => ipcRenderer.invoke('project:get', id),
    create: (data: unknown) => ipcRenderer.invoke('project:create', data),
    update: (id: string, updates: unknown) => ipcRenderer.invoke('project:update', id, updates),
    delete: (id: string) => ipcRenderer.invoke('project:delete', id),
  },
  context: {
    generate: (projectId: string, overrides?: unknown) =>
      ipcRenderer.invoke('context:generate', projectId, overrides),
  },
  appState: {
    get: () => ipcRenderer.invoke('app-state:get'),
    update: (updates: unknown) => ipcRenderer.invoke('app-state:update', updates),
  },

  // ── Project path (kept — folder picker and path validation) ─────────────────
  projectPath: {
    validate: (path: string) => ipcRenderer.invoke('project-path:validate', { path }),
    healthCheck: (path: string) => ipcRenderer.invoke('project-path:health-check', { path }),
    listDirectory: (path: string, subdirectory: string) =>
      ipcRenderer.invoke('project-path:list-directory', { path, subdirectory }),
    pickFolder: () => ipcRenderer.invoke('project-path:pick-folder'),
  },
})
