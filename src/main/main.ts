import { app, BrowserWindow, ipcMain, shell, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import { URL } from 'node:url'
import { join } from 'node:path'
import { readFile, writeFile, mkdir, copyFile, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { setupContextServiceHandlers } from './ipc/contextServices'

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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    title: 'Context Forge',
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

  // Basic IPC example
  ipcMain.handle('ping', () => {
    return 'pong'
  })

  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })

  // Window title management
  ipcMain.handle('update-window-title', (_, projectName?: string) => {
    if (!mainWindow) return
    
    const title = projectName 
      ? `Context Forge - ${projectName}`
      : 'Context Forge'
    
    mainWindow.setTitle(title)
  })

  // Storage IPC handlers
  const getStoragePath = () => {
    const userDataPath = app.getPath('userData')
    return join(userDataPath, 'context-forge')
  }

  ipcMain.handle('storage:read', async (_, filename: string) => {
    try {
      // Validate filename to prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename')
      }
      
      const storagePath = getStoragePath()
      const filePath = join(storagePath, filename)
      const backupPath = join(storagePath, `${filename}.backup`)
      
      // Ensure file is within allowed directory
      if (!filePath.startsWith(storagePath)) {
        throw new Error('Access denied')
      }
      
      try {
        // Try to read main file first
        const data = await readFile(filePath, 'utf-8')
        
        // Validate JSON structure
        try {
          JSON.parse(data)
          return { success: true, data }
        } catch (parseError) {
          // Main file is corrupted, try backup
          console.warn(`Main file corrupted: ${filename}, attempting backup recovery`)
          throw new Error('Main file corrupted')
        }
      } catch (mainFileError) {
        // Main file doesn't exist or is corrupted, try backup
        try {
          const backupData = await readFile(backupPath, 'utf-8')
          
          // Validate backup JSON structure
          JSON.parse(backupData)
          
          console.log(`Recovered data from backup: ${filename}`)
          
          // Try to restore main file from backup
          try {
            await copyFile(backupPath, filePath)
            console.log(`Restored main file from backup: ${filename}`)
          } catch (restoreError) {
            console.warn(`Could not restore main file, but backup is available: ${restoreError}`)
          }
          
          return { 
            success: true, 
            data: backupData,
            recovered: true,
            message: 'Data recovered from backup file'
          }
        } catch (backupError) {
          // Neither main nor backup file is available/valid
          if (mainFileError instanceof Error && mainFileError.message.includes('ENOENT')) {
            return { 
              success: false, 
              error: 'File not found',
              notFound: true 
            }
          }
          
          return { 
            success: false, 
            error: 'File corrupted and no valid backup available' 
          }
        }
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  })

  ipcMain.handle('storage:write', async (_, filename: string, data: string) => {
    try {
      // Validate filename to prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename')
      }
      
      const storagePath = getStoragePath()
      
      // Create directory if it doesn't exist
      if (!existsSync(storagePath)) {
        await mkdir(storagePath, { recursive: true })
      }
      
      const filePath = join(storagePath, filename)
      const tempPath = join(storagePath, `${filename}.tmp`)
      const backupPath = join(storagePath, `${filename}.backup`)
      
      // Ensure paths are within allowed directory
      if (!filePath.startsWith(storagePath) || !tempPath.startsWith(storagePath)) {
        throw new Error('Access denied')
      }
      
      // Atomic write process:
      // 1. Create backup of existing file
      if (existsSync(filePath)) {
        await copyFile(filePath, backupPath)
      }
      
      // 2. Write to temporary file first
      await writeFile(tempPath, data, 'utf-8')
      
      // 3. Validate JSON structure
      try {
        JSON.parse(data)
      } catch (parseError) {
        // Clean up temp file and restore backup
        if (existsSync(tempPath)) {
          await unlink(tempPath)
        }
        throw new Error('Invalid JSON data')
      }
      
      // 4. Atomically rename temp file to main file
      await rename(tempPath, filePath)
      
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
      // Validate filename to prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        throw new Error('Invalid filename')
      }
      
      const storagePath = getStoragePath()
      const filePath = join(storagePath, filename)
      const backupPath = join(storagePath, `${filename}.backup`)
      
      // Ensure paths are within allowed directory
      if (!filePath.startsWith(storagePath) || !backupPath.startsWith(storagePath)) {
        throw new Error('Access denied')
      }
      
      if (existsSync(filePath)) {
        await copyFile(filePath, backupPath)
      }
      
      return { success: true }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  })

  // Setup context service IPC handlers
  setupContextServiceHandlers()

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
  }
}

app.whenReady().then(() => {
  process.env.ELECTRON_ENABLE_SECURITY_WARNINGS = 'true'
  
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})