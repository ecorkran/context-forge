import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElectronProjectStore } from '../ElectronProjectStore'
import { CreateProjectData } from '../types/ProjectData'

// Mock the entire storage chain
vi.mock('../StorageClient', () => ({
  storageClient: {
    isAvailable: vi.fn().mockReturnValue(true),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createBackup: vi.fn(),
  }
}))

import { storageClient } from '../StorageClient'

describe('Storage Integration Tests', () => {
  let store: ElectronProjectStore
  let mockStorage: Map<string, string>

  beforeEach(() => {
    store = new ElectronProjectStore()
    mockStorage = new Map()
    vi.clearAllMocks()

    // Setup mock storage behavior
    const mockStorageClient = storageClient as any
    
    // Ensure isAvailable returns true
    mockStorageClient.isAvailable.mockReturnValue(true)
    
    mockStorageClient.readFile.mockImplementation(async (filename: string) => {
      const data = mockStorage.get(filename) || ''
      return { data }
    })

    mockStorageClient.writeFile.mockImplementation(async (filename: string, data: string) => {
      mockStorage.set(filename, data)
    })

    mockStorageClient.createBackup.mockImplementation(async (filename: string) => {
      const data = mockStorage.get(filename)
      if (data) {
        mockStorage.set(`${filename}.backup`, data)
      }
    })
  })

  describe('Full CRUD Operations', () => {
    it('should handle complete project lifecycle', async () => {
      // Start with empty storage
      expect(await store.getAll()).toEqual([])

      // Create a project
      const projectData: CreateProjectData = {
        name: 'Integration Test Project',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false
      }

      const createdProject = await store.create(projectData)
      expect(createdProject.id).toBeDefined()
      expect(createdProject.name).toBe(projectData.name)
      expect(createdProject.createdAt).toBeDefined()

      // Verify it was persisted
      const allProjects = await store.getAll()
      expect(allProjects).toHaveLength(1)
      expect(allProjects[0].id).toBe(createdProject.id)

      // Update the project
      await store.update(createdProject.id, { name: 'Updated Project Name' })

      // Verify update
      const updatedProject = await store.getById(createdProject.id)
      expect(updatedProject?.name).toBe('Updated Project Name')
      expect(updatedProject?.updatedAt).not.toBe(createdProject.updatedAt)

      // Create another project
      const secondProject = await store.create({
        name: 'Second Project',
        template: 'nextjs',
        slice: 'feature',
        isMonorepo: true
      })

      expect(await store.getAll()).toHaveLength(2)

      // Delete first project
      await store.delete(createdProject.id)

      const remainingProjects = await store.getAll()
      expect(remainingProjects).toHaveLength(1)
      expect(remainingProjects[0].id).toBe(secondProject.id)

      // Verify first project is gone
      expect(await store.getById(createdProject.id)).toBeUndefined()
    })

    it('should handle concurrent operations', async () => {
      const projectData1: CreateProjectData = {
        name: 'Concurrent Project 1',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false
      }

      const projectData2: CreateProjectData = {
        name: 'Concurrent Project 2',
        template: 'vue',
        slice: 'feature',
        isMonorepo: true
      }

      // Create projects concurrently
      const [project1, project2] = await Promise.all([
        store.create(projectData1),
        store.create(projectData2)
      ])

      expect(project1.id).not.toBe(project2.id)

      // Verify both were created
      const allProjects = await store.getAll()
      expect(allProjects).toHaveLength(2)

      // Update both concurrently
      await Promise.all([
        store.update(project1.id, { name: 'Updated Concurrent 1' }),
        store.update(project2.id, { name: 'Updated Concurrent 2' })
      ])

      // Verify both updates
      const [updated1, updated2] = await Promise.all([
        store.getById(project1.id),
        store.getById(project2.id)
      ])

      expect(updated1?.name).toBe('Updated Concurrent 1')
      expect(updated2?.name).toBe('Updated Concurrent 2')
    })

    it('should handle error scenarios gracefully', async () => {
      const mockStorageClient = storageClient as any

      // Test write failure
      mockStorageClient.writeFile.mockRejectedValueOnce(new Error('Disk full'))

      const projectData: CreateProjectData = {
        name: 'Error Test Project',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false
      }

      await expect(store.create(projectData)).rejects.toThrow('Failed to create project')

      // Test read corruption recovery
      mockStorageClient.readFile.mockResolvedValueOnce({
        data: '{"invalid": json',
        recovered: false
      })

      // Should return empty array for corrupted data
      expect(await store.getAll()).toEqual([])

      // Test successful recovery
      const validData = JSON.stringify([{
        id: 'recovered-1',
        name: 'Recovered Project',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      }])

      mockStorageClient.readFile.mockResolvedValueOnce({
        data: validData,
        recovered: true,
        message: 'Data recovered from backup'
      })

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const projects = await store.getAll()

      expect(projects).toHaveLength(1)
      expect(projects[0].name).toBe('Recovered Project')
      expect(consoleSpy).toHaveBeenCalledWith('Data recovered from backup')

      consoleSpy.mockRestore()
    })

    it('should maintain data integrity during failures', async () => {
      const mockStorageClient = storageClient as any

      // Create initial project
      const project = await store.create({
        name: 'Integrity Test',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false
      })

      // Simulate write failure during update
      mockStorageClient.writeFile.mockRejectedValueOnce(new Error('Write failed'))

      // Update should fail but not corrupt existing data
      await expect(store.update(project.id, { name: 'Should Fail' }))
        .rejects.toThrow('Failed to save project data')

      // Verify original data is still intact
      const retrievedProject = await store.getById(project.id)
      expect(retrievedProject?.name).toBe('Integrity Test')
    })
  })

  describe('Backup Operations', () => {
    it('should create backups successfully', async () => {
      const project = await store.create({
        name: 'Backup Test',
        template: 'react',
        slice: 'foundation',
        isMonorepo: false
      })

      await store.createBackup()

      // Verify backup was called
      const mockStorageClient = storageClient as any
      expect(mockStorageClient.createBackup).toHaveBeenCalledWith('projects.json')

      // Verify backup contains the data
      expect(mockStorage.has('projects.json.backup')).toBe(true)
      const backupData = mockStorage.get('projects.json.backup')
      const parsedBackup = JSON.parse(backupData!)
      expect(parsedBackup[0].id).toBe(project.id)
    })
  })
})