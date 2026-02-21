import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElectronStorageService } from '@/services/storage/ElectronStorageService'
import { ProjectData } from '@/services/storage/types/ProjectData'

// Mock storageClient
vi.mock('@/services/storage/StorageClient', () => ({
  storageClient: {
    isAvailable: vi.fn().mockReturnValue(true),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createBackup: vi.fn(),
  }
}))

import { storageClient } from '@/services/storage/StorageClient'

describe('ElectronStorageService', () => {
  let service: ElectronStorageService
  let mockProjects: ProjectData[]

  beforeEach(() => {
    service = new ElectronStorageService()
    mockProjects = [
      {
        id: 'project-1',
        name: 'Test Project 1',
        template: 'react',
        slice: 'foundation',
        taskFile: '',
        instruction: 'implementation',
        isMonorepo: false,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      },
      {
        id: 'project-2',
        name: 'Test Project 2',
        template: 'nextjs',
        slice: 'feature',
        taskFile: 'tasks.feature.md',
        instruction: 'planning',
        isMonorepo: true,
        customData: {},
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z'
      }
    ]
    vi.clearAllMocks()
    
    // Reset the mock to return true by default
    const mockStorageClient = storageClient as any
    mockStorageClient.isAvailable.mockReturnValue(true)
  })

  describe('readProjects', () => {
    it('should successfully read and validate projects', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.readFile.mockResolvedValue({
        data: JSON.stringify(mockProjects)
      })

      const result = await service.readProjects()

      expect(mockStorageClient.readFile).toHaveBeenCalledWith('projects.json')
      expect(result).toEqual(mockProjects)
    })

    it('should handle recovered data from backup', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.readFile.mockResolvedValue({
        data: JSON.stringify(mockProjects),
        recovered: true,
        message: 'Data recovered from backup'
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await service.readProjects()

      expect(result).toEqual(mockProjects)
      expect(consoleSpy).toHaveBeenCalledWith('Data recovered from backup')
      
      consoleSpy.mockRestore()
    })

    it('should return empty array for empty data', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.readFile.mockResolvedValue({
        data: ''
      })

      const result = await service.readProjects()

      expect(result).toEqual([])
    })

    it('should validate project data structure', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.readFile.mockResolvedValue({
        data: 'not an array'
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await service.readProjects()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('No existing project data found, starting fresh')
      
      consoleSpy.mockRestore()
    })

    it('should validate individual project fields', async () => {
      const invalidProjects = [
        { name: 'Test Project' }, // missing id
        { id: 'project-1' } // missing name
      ]
      
      const mockStorageClient = storageClient as any
      mockStorageClient.readFile.mockResolvedValue({
        data: JSON.stringify(invalidProjects)
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      const result = await service.readProjects()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('No existing project data found, starting fresh')
      
      consoleSpy.mockRestore()
    })

    it('should return empty array when storage not available', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.isAvailable = vi.fn().mockReturnValue(false)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const result = await service.readProjects()

      expect(result).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith('Electron storage not available, returning empty array')

      consoleSpy.mockRestore()
    })

    describe('versioned backup recovery fallback', () => {
      it('should recover from versioned backup when main and .backup both fail', async () => {
        const mockStorageClient = storageClient as any
        // Main read throws (triggers catch block)
        mockStorageClient.readFile
          .mockRejectedValueOnce(new Error('Main file corrupted'))
          // Second call (reading the versioned backup file) succeeds
          .mockResolvedValueOnce({ data: JSON.stringify(mockProjects) })

        // listBackups returns one backup
        window.electronAPI.storage.listBackups = vi.fn().mockResolvedValue({
          success: true,
          backups: [{ name: 'projects.json.2026-02-14T10-00-00-000Z.backup', timestamp: '2026-02-14T10-00-00-000Z', size: 500 }],
        })

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await service.readProjects()

        expect(result).toEqual(mockProjects)
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Recovered 2 projects from versioned backup')
        )

        consoleSpy.mockRestore()
      })

      it('should try multiple versioned backups until one succeeds', async () => {
        const mockStorageClient = storageClient as any
        mockStorageClient.readFile
          .mockRejectedValueOnce(new Error('Main file corrupted'))
          // First versioned backup is also corrupt
          .mockResolvedValueOnce({ data: 'corrupt json' })
          // Second versioned backup succeeds
          .mockResolvedValueOnce({ data: JSON.stringify(mockProjects) })

        window.electronAPI.storage.listBackups = vi.fn().mockResolvedValue({
          success: true,
          backups: [
            { name: 'projects.json.2026-02-14T10-01-00-000Z.backup', timestamp: '2026-02-14T10-01-00-000Z', size: 100 },
            { name: 'projects.json.2026-02-14T10-00-00-000Z.backup', timestamp: '2026-02-14T10-00-00-000Z', size: 500 },
          ],
        })

        vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await service.readProjects()

        expect(result).toEqual(mockProjects)
      })

      it('should return empty array when no versioned backups exist', async () => {
        const mockStorageClient = storageClient as any
        mockStorageClient.readFile.mockRejectedValue(new Error('Main file corrupted'))

        window.electronAPI.storage.listBackups = vi.fn().mockResolvedValue({
          success: true,
          backups: [],
        })

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await service.readProjects()

        expect(result).toEqual([])
        expect(consoleSpy).toHaveBeenCalledWith('No existing project data found, starting fresh')

        consoleSpy.mockRestore()
      })

      it('should return empty array when listBackups itself fails', async () => {
        const mockStorageClient = storageClient as any
        mockStorageClient.readFile.mockRejectedValue(new Error('Main file corrupted'))

        window.electronAPI.storage.listBackups = vi.fn().mockRejectedValue(new Error('IPC error'))

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await service.readProjects()

        expect(result).toEqual([])

        consoleSpy.mockRestore()
      })

      it('should skip versioned backups with invalid project data', async () => {
        const mockStorageClient = storageClient as any
        mockStorageClient.readFile
          .mockRejectedValueOnce(new Error('Main file corrupted'))
          // Backup has data but missing required fields
          .mockResolvedValueOnce({ data: JSON.stringify([{ foo: 'bar' }]) })

        window.electronAPI.storage.listBackups = vi.fn().mockResolvedValue({
          success: true,
          backups: [
            { name: 'projects.json.2026-02-14T10-00-00-000Z.backup', timestamp: '2026-02-14T10-00-00-000Z', size: 100 },
          ],
        })

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = await service.readProjects()

        // Invalid data (no id/name) — should fall through to empty
        expect(result).toEqual([])

        consoleSpy.mockRestore()
      })
    })
  })

  describe('writeProjects', () => {
    it('should successfully write projects', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.createBackup.mockResolvedValue(undefined)
      mockStorageClient.writeFile.mockResolvedValue(undefined)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.writeProjects(mockProjects)

      expect(mockStorageClient.createBackup).toHaveBeenCalledWith('projects.json')
      expect(mockStorageClient.writeFile).toHaveBeenCalledWith(
        'projects.json',
        JSON.stringify(mockProjects, null, 2)
      )
      expect(consoleSpy).toHaveBeenCalledWith('Successfully saved 2 projects')
      
      consoleSpy.mockRestore()
    })

    it('should handle backup creation failure gracefully', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.createBackup.mockRejectedValue(new Error('No existing file'))
      mockStorageClient.writeFile.mockResolvedValue(undefined)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.writeProjects(mockProjects)

      expect(mockStorageClient.writeFile).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalledWith('No existing file to backup')
      
      consoleSpy.mockRestore()
    })

    it('should throw error when storage not available', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.isAvailable = vi.fn().mockReturnValue(false)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(service.writeProjects(mockProjects))
        .rejects.toThrow('Storage not available')

      expect(consoleSpy).toHaveBeenCalledWith('Electron storage not available, cannot save projects')
      
      consoleSpy.mockRestore()
    })

    it('should handle write failures', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.createBackup.mockResolvedValue(undefined)
      mockStorageClient.writeFile.mockRejectedValue(new Error('Disk full'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(service.writeProjects(mockProjects))
        .rejects.toThrow('Failed to save project data')

      expect(consoleSpy).toHaveBeenCalledWith('Failed to save projects:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })

  describe('createBackup', () => {
    it('should successfully create backup', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.createBackup.mockResolvedValue(undefined)

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      await service.createBackup()

      expect(mockStorageClient.createBackup).toHaveBeenCalledWith('projects.json')
      expect(consoleSpy).toHaveBeenCalledWith('Backup created successfully')
      
      consoleSpy.mockRestore()
    })

    it('should throw error when storage not available', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.isAvailable = vi.fn().mockReturnValue(false)

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await expect(service.createBackup())
        .rejects.toThrow('Storage not available')

      expect(consoleSpy).toHaveBeenCalledWith('Electron storage not available, cannot create backup')
      
      consoleSpy.mockRestore()
    })

    it('should handle backup failures', async () => {
      const mockStorageClient = storageClient as any
      mockStorageClient.createBackup.mockRejectedValue(new Error('Permission denied'))

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(service.createBackup())
        .rejects.toThrow('Failed to create backup')

      expect(consoleSpy).toHaveBeenCalledWith('Failed to create backup:', expect.any(Error))
      
      consoleSpy.mockRestore()
    })
  })
})