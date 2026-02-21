import { ipcMain } from 'electron'
import { FileProjectStore } from '@context-forge/core/node'
import type { CreateProjectData, UpdateProjectData } from '@context-forge/core'

/**
 * Register IPC handlers for domain-level project CRUD operations.
 * All handlers delegate to core's FileProjectStore.
 */
export function registerProjectHandlers(store: FileProjectStore): void {
  // List all projects, sorted by updatedAt descending (most recent first)
  ipcMain.handle('project:list', async () => {
    try {
      const projects = await store.getAll()
      return projects.sort((a, b) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`project:list failed: ${msg}`)
    }
  })

  // Get a single project by ID; returns null if not found
  ipcMain.handle('project:get', async (_, id: string) => {
    try {
      const project = await store.getById(id)
      return project ?? null
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`project:get failed: ${msg}`)
    }
  })

  // Create a new project and return the created ProjectData
  ipcMain.handle('project:create', async (_, data: CreateProjectData) => {
    try {
      return await store.create(data)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`project:create failed: ${msg}`)
    }
  })

  // Update a project and return the updated ProjectData via read-back
  ipcMain.handle('project:update', async (_, id: string, updates: UpdateProjectData) => {
    try {
      await store.update(id, updates)
      const updated = await store.getById(id)
      if (!updated) {
        throw new Error(`Project ${id} not found after update`)
      }
      return updated
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`project:update failed: ${msg}`)
    }
  })

  // Delete a project by ID
  ipcMain.handle('project:delete', async (_, id: string) => {
    try {
      await store.delete(id)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`project:delete failed: ${msg}`)
    }
  })
}
