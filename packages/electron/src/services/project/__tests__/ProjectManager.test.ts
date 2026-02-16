import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProjectManager } from '../ProjectManager'
import { PersistentProjectStore } from '../../storage/PersistentProjectStore'
import { ProjectData } from '../../storage/types/ProjectData'

// Mock PersistentProjectStore
vi.mock('../../storage/PersistentProjectStore')

describe('ProjectManager', () => {
  let projectManager: ProjectManager
  let mockPersistentStore: ReturnType<typeof vi.mocked<PersistentProjectStore>>
  let mockProjects: ProjectData[]

  beforeEach(() => {
    // Create mock projects with different update times
    mockProjects = [
      {
        id: 'project-1',
        name: 'Test Project 1',
        template: 'react',
        slice: 'foundation',
        taskFile: '',
        instruction: 'implementation',
        workType: 'continue',
        isMonorepo: false,
        customData: {},
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z' // older
      },
      {
        id: 'project-2',
        name: 'Test Project 2',
        template: 'nextjs',
        slice: 'feature',
        taskFile: 'tasks.feature.md',
        instruction: 'implementation',
        workType: 'continue',
        isMonorepo: true,
        customData: {},
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T10:00:00Z' // newer
      }
    ]

    // Create mock store instance
    mockPersistentStore = vi.mocked(new PersistentProjectStore())
    
    // Mock store methods
    mockPersistentStore.loadProjects = vi.fn().mockResolvedValue(mockProjects)
    mockPersistentStore.getLastActiveProject = vi.fn().mockResolvedValue('project-2')
    mockPersistentStore.setLastActiveProject = vi.fn().mockResolvedValue(undefined)
    mockPersistentStore.saveProject = vi.fn().mockResolvedValue(undefined)
    mockPersistentStore.deleteProject = vi.fn().mockResolvedValue(undefined)
    
    // Create ProjectManager with mocked store
    projectManager = new ProjectManager(mockPersistentStore)
  })

  describe('loadAllProjects', () => {
    it('should load and sort projects by updated date (newest first)', async () => {
      const result = await projectManager.loadAllProjects()
      
      expect(mockPersistentStore.loadProjects).toHaveBeenCalled()
      expect(result).toHaveLength(2)
      // Should be sorted by updatedAt, newest first
      expect(result[0].id).toBe('project-2') // newer project first
      expect(result[1].id).toBe('project-1') // older project second
    })

    it('should return empty array on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.loadAllProjects()
      
      expect(result).toEqual([])
    })
  })

  describe('getCurrentProject', () => {
    it('should return current project when found', async () => {
      const result = await projectManager.getCurrentProject()
      
      expect(mockPersistentStore.getLastActiveProject).toHaveBeenCalled()
      expect(mockPersistentStore.loadProjects).toHaveBeenCalled()
      expect(result).not.toBeNull()
      expect(result?.id).toBe('project-2')
      expect(result?.name).toBe('Test Project 2')
    })

    it('should return null when no active project ID', async () => {
      mockPersistentStore.getLastActiveProject = vi.fn().mockResolvedValue(null)
      
      const result = await projectManager.getCurrentProject()
      
      expect(result).toBeNull()
    })

    it('should return null when active project not found in projects list', async () => {
      mockPersistentStore.getLastActiveProject = vi.fn().mockResolvedValue('non-existent-project')
      
      const result = await projectManager.getCurrentProject()
      
      expect(result).toBeNull()
    })

    it('should return null on error', async () => {
      mockPersistentStore.getLastActiveProject = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.getCurrentProject()
      
      expect(result).toBeNull()
    })
  })

  describe('getProjectCount', () => {
    it('should return correct project count', async () => {
      const result = await projectManager.getProjectCount()
      
      expect(result).toBe(2)
    })

    it('should return 0 on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.getProjectCount()
      
      expect(result).toBe(0)
    })
  })

  describe('hasMultipleProjects', () => {
    it('should return true when multiple projects exist', async () => {
      const result = await projectManager.hasMultipleProjects()
      
      expect(result).toBe(true)
    })

    it('should return false when only one project exists', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockResolvedValue([mockProjects[0]])
      
      const result = await projectManager.hasMultipleProjects()
      
      expect(result).toBe(false)
    })

    it('should return false when no projects exist', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockResolvedValue([])
      
      const result = await projectManager.hasMultipleProjects()
      
      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.hasMultipleProjects()
      
      expect(result).toBe(false)
    })
  })

  describe('getProjectNames', () => {
    it('should return array of project names', async () => {
      const result = await projectManager.getProjectNames()
      
      expect(result).toEqual(['Test Project 2', 'Test Project 1']) // sorted by update date
    })

    it('should return empty array on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.getProjectNames()
      
      expect(result).toEqual([])
    })
  })

  describe('switchToProject', () => {
    it('should switch to existing project', async () => {
      const result = await projectManager.switchToProject('project-1')
      
      expect(mockPersistentStore.setLastActiveProject).toHaveBeenCalledWith('project-1')
      expect(result).not.toBeNull()
      expect(result?.id).toBe('project-1')
      expect(result?.name).toBe('Test Project 1')
    })

    it('should handle switching to already-current project', async () => {
      // project-2 is already the current project per mock
      const result = await projectManager.switchToProject('project-2')
      
      expect(result?.id).toBe('project-2')
      // Should still return the project data, even though it's a no-op
      expect(result?.name).toBe('Test Project 2')
    })

    it('should throw error for non-existent project', async () => {
      await expect(projectManager.switchToProject('non-existent')).rejects.toThrow('Project with id non-existent not found')
      expect(mockPersistentStore.setLastActiveProject).not.toHaveBeenCalled()
    })

    it('should throw error on storage failure', async () => {
      mockPersistentStore.setLastActiveProject = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      await expect(projectManager.switchToProject('project-1')).rejects.toThrow('Failed to switch to project')
    })
  })

  describe('validateProjectSwitch', () => {
    it('should return true for existing project', async () => {
      const result = await projectManager.validateProjectSwitch('project-1')
      expect(result).toBe(true)
    })

    it('should return false for non-existent project', async () => {
      const result = await projectManager.validateProjectSwitch('non-existent')
      expect(result).toBe(false)
    })

    it('should return false for empty project ID', async () => {
      const result = await projectManager.validateProjectSwitch('')
      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.validateProjectSwitch('project-1')
      expect(result).toBe(false)
    })
  })

  describe('createNewProject', () => {
    it('should create new project with unique name', async () => {
      const result = await projectManager.createNewProject()
      
      expect(mockPersistentStore.saveProject).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Project', // No conflicting names in test data, so uses base name
          instruction: 'implementation',
          workType: 'continue',
          isMonorepo: false,
          template: '',
          slice: '',
          customData: {}
        })
      )
      expect(mockPersistentStore.setLastActiveProject).toHaveBeenCalledWith(result.id)
      expect(result.id).toMatch(/^project_\d+_[a-z0-9]+$/)
    })

    it('should create "New Project" when no conflicting names exist', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockResolvedValue([])
      
      const result = await projectManager.createNewProject()
      
      expect(result.name).toBe('New Project')
    })

    it('should throw error on save failure', async () => {
      mockPersistentStore.saveProject = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      await expect(projectManager.createNewProject()).rejects.toThrow('Failed to create project')
    })
  })

  describe('deleteProject', () => {
    it('should delete non-current project', async () => {
      const result = await projectManager.deleteProject('project-1')
      
      expect(mockPersistentStore.deleteProject).toHaveBeenCalledWith('project-1')
      expect(result).toBe(true)
    })

    it('should switch away from current project before deleting', async () => {
      // project-2 is current per mock
      const result = await projectManager.deleteProject('project-2')
      
      expect(mockPersistentStore.setLastActiveProject).toHaveBeenCalledWith('project-1') // switch to other project first
      expect(mockPersistentStore.deleteProject).toHaveBeenCalledWith('project-2')
      expect(result).toBe(true)
    })

    it('should throw error for non-existent project', async () => {
      await expect(projectManager.deleteProject('non-existent')).rejects.toThrow('Project with id non-existent not found')
      expect(mockPersistentStore.deleteProject).not.toHaveBeenCalled()
    })

    it('should throw error when trying to delete last project', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockResolvedValue([mockProjects[0]]) // only one project
      
      await expect(projectManager.deleteProject('project-1')).rejects.toThrow('Cannot delete the last remaining project')
      expect(mockPersistentStore.deleteProject).not.toHaveBeenCalled()
    })

    it('should throw error on deletion failure', async () => {
      mockPersistentStore.deleteProject = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      await expect(projectManager.deleteProject('project-1')).rejects.toThrow('Failed to delete project')
    })
  })

  describe('canDeleteProject', () => {
    it('should return true when multiple projects exist', async () => {
      const result = await projectManager.canDeleteProject('project-1')
      expect(result).toBe(true)
    })

    it('should return false when only one project exists', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockResolvedValue([mockProjects[0]])
      
      const result = await projectManager.canDeleteProject('project-1')
      expect(result).toBe(false)
    })

    it('should return false for non-existent project', async () => {
      const result = await projectManager.canDeleteProject('non-existent')
      expect(result).toBe(false)
    })

    it('should return false for empty project ID', async () => {
      const result = await projectManager.canDeleteProject('')
      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      mockPersistentStore.loadProjects = vi.fn().mockRejectedValue(new Error('Storage error'))
      
      const result = await projectManager.canDeleteProject('project-1')
      expect(result).toBe(false)
    })
  })
})