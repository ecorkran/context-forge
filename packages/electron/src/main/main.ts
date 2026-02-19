import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'

// Pin the app name so userData path stays consistent regardless of package.json name changes.
// Without this, Electron derives the name from package.json, and the monorepo rename to
// "@context-forge/electron" would move userData to a different directory.
app.name = 'context-forge'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { setupContextServiceHandlers } from './ipc/contextServices'
import { setupProjectPathHandlers } from './ipc/projectPathHandlers'
import { FileStorageService, getStoragePath, createVersionedBackup } from '@context-forge/core/node'

/** Files to create versioned backups for on startup and exit. */
const VERSIONED_BACKUP_FILES = ['projects.json'] as const

function isAllowedUrl(target: string): boolean {
  try {
    const u = new URL(target)
    return u.protocol === 'https:' && (
      u.hostname === 'github.com' || 
      u.hostname === 'docs.anthropic.com' ||
      u.hostname.endsWith('.github.io')
    )
  } catch {
    return false
  }
}

let mainWindow: BrowserWindow | null = null;
let storageService: FileStorageService | null = null;

/**
 * Register all IPC handlers. Called once at app startup — never per-window.
 */
function setupIpcHandlers(): void {
  ipcMain.handle('ping', () => {
    return 'pong'
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('update-window-title', (_, projectName?: string) => {
    if (!mainWindow) return

    const title = projectName
      ? `Context Forge Pro - ${projectName}`
      : 'Context Forge Pro'

    mainWindow.setTitle(title)
  })

  // Storage IPC handlers — delegate to core's FileStorageService

  ipcMain.handle('storage:read', async (_, filename: string) => {
    try {
      const result = await storageService!.read(filename)
      return {
        success: true,
        data: result.data,
        recovered: result.recovered,
        message: result.message,
      }
    } catch (error) {
      if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: false, error: 'File not found', notFound: true }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('storage:write', async (_, filename: string, data: string) => {
    try {
      await storageService!.write(filename, data)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('storage:backup', async (_, filename: string) => {
    try {
      await storageService!.createBackup(filename)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('storage:list-backups', async (_, filename: string) => {
    try {
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename')
      }

      const sp = getStoragePath()
      const entries = await readdir(sp)

      // Match versioned backups: {filename}.{timestamp}.backup
      const versionedPattern = `${filename}.`
      const backups: Array<{ name: string; timestamp: string; size: number }> = []

      for (const entry of entries) {
        if (entry.startsWith(versionedPattern) && entry.endsWith('.backup') && entry !== `${filename}.backup`) {
          // Extract timestamp from: {filename}.{timestamp}.backup
          const tsStart = versionedPattern.length
          const tsEnd = entry.length - '.backup'.length
          const timestamp = entry.substring(tsStart, tsEnd)

          try {
            const info = await stat(join(sp, entry))
            backups.push({ name: entry, timestamp, size: info.size })
          } catch {
            backups.push({ name: entry, timestamp, size: 0 })
          }
        }
      }

      // Newest first
      backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

      return { success: true, backups }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  // Setup service-specific IPC handlers
  setupContextServiceHandlers()
  setupProjectPathHandlers()

  console.log('All IPC handlers registered')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Context Forge Pro',
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/preload.cjs', import.meta.url)),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !process.env.ELECTRON_RENDERER_URL
    }
  })

  mainWindow = win;

  win.on('ready-to-show', () => win.show())

  // Secure navigation policy
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedUrl(url)) {
      setImmediate(() => shell.openExternal(url))
    }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedUrl(url)) e.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
  }
}

app.whenReady().then(() => {
  process.env.ELECTRON_ENABLE_SECURITY_WARNINGS = 'true'
  storageService = new FileStorageService(getStoragePath())
  
  // Create simplified application menu for macOS compatibility
  const template = [
    // This special role makes a proper "App" menu on macOS (About, Services, Hide, Quit, etc.)
    ...(process.platform === 'darwin' ? [{
      role: 'appMenu' as const // auto-uses your app name when bundled
    }] : []),

    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'delete' as const },
        { type: 'separator' as const },
        { role: 'selectAll' as const }
      ]
    },
    {
      label: 'Developer',
      submenu: [
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Cmd+Option+I' : 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools()
            }
          }
        },
        {
          label: 'Reload',
          accelerator: process.platform === 'darwin' ? 'Cmd+R' : 'Ctrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reload()
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Context Forge',
          click: () => { shell.openExternal('https://github.com/anthropics/claude-code') }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
  setupIpcHandlers()
  createWindow()

  // Basic CSP in production
  if (!process.env.ELECTRON_RENDERER_URL) {
    const { session } = require('electron') as typeof import('electron')
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const csp = "default-src 'self' 'unsafe-inline'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self';"
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    })
  }
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Flush pending saves before quit — renderer has a 500ms debounce that could
// lose data if the app exits within that window. Send a signal and wait briefly
// for the renderer to acknowledge it has persisted.
app.on('before-quit', (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    // Only block once — prevent infinite loop if renderer never responds
    if (!(app as any).__flushRequested) {
      (app as any).__flushRequested = true
      event.preventDefault()
      mainWindow.webContents.send('app:flush-save')
      // Give renderer up to 1 second to flush, then create exit backup and quit
      setTimeout(async () => {
        const sp = getStoragePath()
        for (const file of VERSIONED_BACKUP_FILES) {
          try {
            await createVersionedBackup(sp, file)
          } catch (err) {
            console.error(`Exit backup failed for ${file}:`, err)
          }
        }
        app.quit()
      }, 1000)
    }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})