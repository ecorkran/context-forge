import { ipcMain } from 'electron'
import { FileStorageService } from '@context-forge/core/node'

/** Application-level UI state persisted between sessions. */
export interface AppState {
  lastActiveProjectId: string
  windowBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  panelSizes?: number[]
  appVersion: string
  lastOpened: string
}

const APP_STATE_FILE = 'app-state.json'

const DEFAULT_APP_STATE: AppState = {
  lastActiveProjectId: '',
  appVersion: '1.0.0',
  lastOpened: new Date().toISOString(),
}

/**
 * Register IPC handlers for reading and updating application state.
 * Delegates to core's FileStorageService — no direct fs usage in this file.
 */
export function registerAppStateHandlers(storageService: FileStorageService): void {
  // Read app state; return defaults when file doesn't exist
  ipcMain.handle('app-state:get', async () => {
    try {
      const result = await storageService.read(APP_STATE_FILE)
      const parsed = JSON.parse(result.data) as Partial<AppState>
      return {
        ...DEFAULT_APP_STATE,
        ...parsed,
        lastOpened: new Date().toISOString(),
      } satisfies AppState
    } catch (error) {
      // ENOENT — first run, no state file yet
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return { ...DEFAULT_APP_STATE }
      }
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`app-state:get failed: ${msg}`)
    }
  })

  // Merge partial updates into existing state and persist
  ipcMain.handle('app-state:update', async (_, updates: Partial<AppState>) => {
    try {
      let currentState: AppState = { ...DEFAULT_APP_STATE }

      try {
        const result = await storageService.read(APP_STATE_FILE)
        const parsed = JSON.parse(result.data) as Partial<AppState>
        currentState = { ...DEFAULT_APP_STATE, ...parsed }
      } catch (readError) {
        // ENOENT is fine — we'll create the file from defaults
        if (
          !(readError instanceof Error &&
            'code' in readError &&
            (readError as NodeJS.ErrnoException).code === 'ENOENT')
        ) {
          throw readError
        }
      }

      const updatedState: AppState = {
        ...currentState,
        ...updates,
        lastOpened: new Date().toISOString(),
      }

      await storageService.write(APP_STATE_FILE, JSON.stringify(updatedState, null, 2))
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      throw new Error(`app-state:update failed: ${msg}`)
    }
  })
}
