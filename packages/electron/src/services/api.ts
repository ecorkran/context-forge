/**
 * Thin renderer-side API module for the new domain-level IPC channels.
 * All business logic, storage, and context generation run in the main process
 * via @context-forge/core. The renderer makes simple IPC calls through here.
 */

import type { ProjectData, CreateProjectData, UpdateProjectData } from '@context-forge/core'
import type { AppState } from './storage/types/AppState'
import type { ContextOverrides } from '../main/ipc/contextHandlers'

export const projectApi = {
  list: (): Promise<ProjectData[]> =>
    window.electronAPI.project.list(),

  get: (id: string): Promise<ProjectData | null> =>
    window.electronAPI.project.get(id),

  create: (data: CreateProjectData): Promise<ProjectData> =>
    window.electronAPI.project.create(data),

  update: (id: string, updates: UpdateProjectData): Promise<ProjectData> =>
    window.electronAPI.project.update(id, updates),

  delete: (id: string): Promise<void> =>
    window.electronAPI.project.delete(id),
}

export const contextApi = {
  generate: (projectId: string, overrides?: ContextOverrides): Promise<string> =>
    window.electronAPI.context.generate(projectId, overrides),
}

export const appStateApi = {
  get: (): Promise<AppState> =>
    window.electronAPI.appState.get(),

  update: (updates: Partial<AppState>): Promise<void> =>
    window.electronAPI.appState.update(updates),
}
