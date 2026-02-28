import { ipcMain } from 'electron'
import { FileProjectStore, createContextPipeline } from '@context-forge/core/node'

/** Override fields that the renderer can pass to context:generate */
export interface ContextOverrides {
  fileSlice?: string
  fileTasks?: string
  instruction?: string
  developmentPhase?: string
  workType?: 'start' | 'continue'
  additionalInstructions?: string
}

/**
 * Register IPC handler for domain-level context generation.
 * Delegates to core's createContextPipeline — the renderer does no local orchestration.
 */
export function registerContextHandlers(store: FileProjectStore): void {
  ipcMain.handle(
    'context:generate',
    async (_, projectId: string, overrides?: ContextOverrides) => {
      try {
        const project = await store.getById(projectId)
        if (!project) {
          throw new Error(`Project not found: ${projectId}`)
        }

        if (!project.projectPath) {
          throw new Error(
            `Project "${project.name}" (${projectId}) has no projectPath configured`
          )
        }

        // Apply overrides to a shallow copy — same pattern as MCP server's context_build
        const effectiveProject = overrides
          ? { ...project, ...overrides }
          : project

        const { integrator } = createContextPipeline(project.projectPath)
        return await integrator.generateContextFromProject(effectiveProject)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(`context:generate failed: ${msg}`)
      }
    }
  )
}
