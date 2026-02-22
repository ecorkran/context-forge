import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'

// Pin the app name so userData path stays consistent regardless of package.json name changes.
// Without this, Electron derives the name from package.json, and the monorepo rename to
// "@context-forge/electron" would move userData to a different directory.
app.name = 'context-forge'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { join } from 'node:path'
import { readdir, stat } from 'node:fs/promises'
import { setupProjectPathHandlers } from './ipc/projectPathHandlers'
import { registerProjectHandlers } from './ipc/projectHandlers'
import { registerContextHandlers } from './ipc/contextHandlers'
import { registerAppStateHandlers } from './ipc/appStateHandlers'
import { FileStorageService, FileProjectStore, getStoragePath, createVersionedBackup } from '@context-forge/core/node'

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
let projectStore: FileProjectStore | null = null;

/**
 * Register all IPC handlers. Called once at app startup — never per-window.
 */
function setupIpcHandlers(): void {
  ipcMain.handle('ping', () => 'pong')

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('update-window-title', (_, projectName?: string) => {
    if (!mainWindow) return
    mainWindow.setTitle(
      projectName ? `Context Forge Pro - ${projectName}` : 'Context Forge Pro',
    )
  })

  // Project path handlers (kept — used by SettingsDialog for folder picker and path validation)
  setupProjectPathHandlers()

  // Domain-level IPC handlers — delegate to @context-forge/core
  registerProjectHandlers(projectStore!)
  registerContextHandlers(projectStore!)
  registerAppStateHandlers(storageService!)

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
  projectStore = new FileProjectStore()

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

// Create versioned exit backup before quit — FileProjectStore writes are atomic
// and immediately persisted, so no renderer flush signal is needed.
app.on('before-quit', (event) => {
  if (!(app as { __backupRequested?: boolean }).__backupRequested) {
    (app as { __backupRequested?: boolean }).__backupRequested = true
    event.preventDefault()
    ;(async () => {
      const sp = getStoragePath()
      for (const file of VERSIONED_BACKUP_FILES) {
        try {
          await createVersionedBackup(sp, file)
        } catch (err) {
          console.error(`Exit backup failed for ${file}:`, err)
        }
      }
      app.quit()
    })()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
