import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StorageClient } from '../StorageClient'
import { mockElectronAPI } from '../../../test/setup'

describe('StorageClient', () => {
  let storageClient: StorageClient
  
  beforeEach(() => {
    storageClient = new StorageClient()
    vi.clearAllMocks()
  })

  describe('isAvailable', () => {
    it('should return true when electronAPI is available', () => {
      expect(storageClient.isAvailable()).toBe(true)
    })

    it('should return false when electronAPI is not available', () => {
      const originalElectronAPI = global.window.electronAPI
      // @ts-ignore
      global.window.electronAPI = undefined
      
      const client = new StorageClient()
      expect(client.isAvailable()).toBe(false)
      
      // Restore
      global.window.electronAPI = originalElectronAPI
    })
  })

  describe('readFile', () => {
    it('should successfully read file and return data', async () => {
      const mockData = '{"test": "data"}'
      mockElectronAPI.storage.read.mockResolvedValue({
        success: true,
        data: mockData
      })

      const result = await storageClient.readFile('test.json')

      expect(mockElectronAPI.storage.read).toHaveBeenCalledWith('test.json')
      expect(result.data).toBe(mockData)
      expect(result.recovered).toBeUndefined()
    })

    it('should handle recovered data from backup', async () => {
      const mockData = '{"test": "data"}'
      mockElectronAPI.storage.read.mockResolvedValue({
        success: true,
        data: mockData,
        recovered: true,
        message: 'Data recovered from backup'
      })

      const result = await storageClient.readFile('test.json')

      expect(result.data).toBe(mockData)
      expect(result.recovered).toBe(true)
      expect(result.message).toBe('Data recovered from backup')
    })

    it('should return empty data for non-existent files', async () => {
      mockElectronAPI.storage.read.mockResolvedValue({
        success: false,
        notFound: true,
        error: 'File not found'
      })

      const result = await storageClient.readFile('nonexistent.json')

      expect(result.data).toBe('')
      expect(result.recovered).toBeUndefined()
    })

    it('should throw error for read failures', async () => {
      mockElectronAPI.storage.read.mockResolvedValue({
        success: false,
        error: 'Access denied'
      })

      await expect(storageClient.readFile('test.json'))
        .rejects.toThrow('Failed to read file: Access denied')
    })

    it('should throw error when not in Electron environment', async () => {
      const originalElectronAPI = global.window.electronAPI
      // @ts-ignore
      global.window.electronAPI = undefined
      
      const client = new StorageClient()
      await expect(client.readFile('test.json'))
        .rejects.toThrow('Storage client is only available in Electron environment')
      
      // Restore
      global.window.electronAPI = originalElectronAPI
    })
  })

  describe('writeFile', () => {
    it('should successfully write file', async () => {
      mockElectronAPI.storage.write.mockResolvedValue({
        success: true
      })

      await storageClient.writeFile('test.json', '{"test": "data"}')

      expect(mockElectronAPI.storage.write).toHaveBeenCalledWith('test.json', '{"test": "data"}')
    })

    it('should throw error for write failures', async () => {
      mockElectronAPI.storage.write.mockResolvedValue({
        success: false,
        error: 'Disk full'
      })

      await expect(storageClient.writeFile('test.json', '{"test": "data"}'))
        .rejects.toThrow('Failed to write file: Disk full')
    })

    it('should throw error when not in Electron environment', async () => {
      const originalElectronAPI = global.window.electronAPI
      // @ts-ignore
      global.window.electronAPI = undefined
      
      const client = new StorageClient()
      await expect(client.writeFile('test.json', '{"test": "data"}'))
        .rejects.toThrow('Storage client is only available in Electron environment')
      
      // Restore
      global.window.electronAPI = originalElectronAPI
    })
  })

  describe('createBackup', () => {
    it('should successfully create backup', async () => {
      mockElectronAPI.storage.backup.mockResolvedValue({
        success: true
      })

      await storageClient.createBackup('test.json')

      expect(mockElectronAPI.storage.backup).toHaveBeenCalledWith('test.json')
    })

    it('should throw error for backup failures', async () => {
      mockElectronAPI.storage.backup.mockResolvedValue({
        success: false,
        error: 'Source file not found'
      })

      await expect(storageClient.createBackup('test.json'))
        .rejects.toThrow('Failed to create backup: Source file not found')
    })

    it('should throw error when not in Electron environment', async () => {
      const originalElectronAPI = global.window.electronAPI
      // @ts-ignore
      global.window.electronAPI = undefined
      
      const client = new StorageClient()
      await expect(client.createBackup('test.json'))
        .rejects.toThrow('Storage client is only available in Electron environment')
      
      // Restore
      global.window.electronAPI = originalElectronAPI
    })
  })
})