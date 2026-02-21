import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  updateWindowTitle: (projectName?: string) => ipcRenderer.invoke('update-window-title', projectName),
  onFlushSave: (callback: () => void) => {
    ipcRenderer.on('app:flush-save', callback)
    return () => { ipcRenderer.removeListener('app:flush-save', callback) }
  },

  // ── New domain-level API (Phase 2: electron-client-conversion) ─────────────
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

  // ── Legacy channels (kept for coexistence during migration) ────────────────
  storage: {
    read: (filename: string) => ipcRenderer.invoke('storage:read', filename),
    write: (filename: string, data: string) => ipcRenderer.invoke('storage:write', filename, data),
    backup: (filename: string) => ipcRenderer.invoke('storage:backup', filename),
    listBackups: (filename: string) => ipcRenderer.invoke('storage:list-backups', filename),
  },
  statements: {
    load: (filename?: string) => ipcRenderer.invoke('statements:load', filename),
    save: (filename: string, statements: Record<string, unknown>) => ipcRenderer.invoke('statements:save', filename, statements),
    getStatement: (filename: string, key: string) => ipcRenderer.invoke('statements:get', filename, key),
    updateStatement: (filename: string, key: string, content: string) => ipcRenderer.invoke('statements:update', filename, key, content)
  },
  systemPrompts: {
    parse: (filename?: string) => ipcRenderer.invoke('systemPrompts:parse', filename),
    getContextInit: (filename?: string, isMonorepo?: boolean) => ipcRenderer.invoke('systemPrompts:getContextInit', filename, isMonorepo),
    getToolUse: (filename?: string) => ipcRenderer.invoke('systemPrompts:getToolUse', filename),
    getForInstruction: (filename: string, instruction: string) => ipcRenderer.invoke('systemPrompts:getForInstruction', filename, instruction)
  },
  projectPath: {
    validate: (path: string) => ipcRenderer.invoke('project-path:validate', { path }),
    healthCheck: (path: string) => ipcRenderer.invoke('project-path:health-check', { path }),
    listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) =>
      ipcRenderer.invoke('project-path:list-directory', { path, subdirectory, isMonorepo }),
    pickFolder: () => ipcRenderer.invoke('project-path:pick-folder'),
  }
})
