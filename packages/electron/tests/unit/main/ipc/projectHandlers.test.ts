import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectData, CreateProjectData, UpdateProjectData } from '@context-forge/core'

// Mock electron's ipcMain before importing the module under test
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

// Mock @context-forge/core/node — we only need FileProjectStore
vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn(),
}))

// Helper to invoke a captured handler as IPC would (first arg is event, rest are payload args)
async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers[channel]
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return handler({} /* IPC event */, ...args)
}

const makeProject = (overrides: Partial<ProjectData> = {}): ProjectData => ({
  id: 'proj-1',
  name: 'Test Project',
  template: 'default',
  fileSlice: 'my-slice',
  fileTasks: 'tasks.md',
  instruction: 'implementation',
  workType: 'continue',

  customData: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
})

describe('projectHandlers', () => {
  // Typed mock store with vi.fn() for each method
  const mockStore = {
    getAll: vi.fn<[], Promise<ProjectData[]>>(),
    getById: vi.fn<[string], Promise<ProjectData | undefined>>(),
    create: vi.fn<[CreateProjectData], Promise<ProjectData>>(),
    update: vi.fn<[string, UpdateProjectData], Promise<void>>(),
    delete: vi.fn<[string], Promise<void>>(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset handler registry
    for (const key of Object.keys(handlers)) delete handlers[key]

    // Import and register handlers with the mock store
    const { registerProjectHandlers } = await import('@/main/ipc/projectHandlers')
    registerProjectHandlers(mockStore as never)
  })

  // ── project:list ─────────────────────────────────────────────────────────────
  describe('project:list', () => {
    it('calls getAll() and returns projects sorted by updatedAt descending', async () => {
      const older = makeProject({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })
      const newer = makeProject({ id: 'b', updatedAt: '2026-01-03T00:00:00.000Z' })
      mockStore.getAll.mockResolvedValue([older, newer])

      const result = await invoke('project:list')

      expect(mockStore.getAll).toHaveBeenCalledOnce()
      expect(result).toEqual([newer, older])
    })

    it('rethrows when getAll() throws', async () => {
      mockStore.getAll.mockRejectedValue(new Error('disk error'))

      await expect(invoke('project:list')).rejects.toThrow('project:list failed: disk error')
    })
  })

  // ── project:get ──────────────────────────────────────────────────────────────
  describe('project:get', () => {
    it('returns project when found', async () => {
      const project = makeProject()
      mockStore.getById.mockResolvedValue(project)

      const result = await invoke('project:get', 'proj-1')

      expect(mockStore.getById).toHaveBeenCalledWith('proj-1')
      expect(result).toEqual(project)
    })

    it('returns null when project is not found', async () => {
      mockStore.getById.mockResolvedValue(undefined)

      const result = await invoke('project:get', 'missing')

      expect(result).toBeNull()
    })

    it('rethrows when getById() throws', async () => {
      mockStore.getById.mockRejectedValue(new Error('store error'))

      await expect(invoke('project:get', 'proj-1')).rejects.toThrow('project:get failed: store error')
    })
  })

  // ── project:create ───────────────────────────────────────────────────────────
  describe('project:create', () => {
    it('passes CreateProjectData to create() and returns the result', async () => {
      const createData: CreateProjectData = {
        name: 'New Project',
        template: 'default',
        fileSlice: 'init-slice',
        fileTasks: '',
      
      }
      const created = makeProject({ id: 'new-1', name: 'New Project' })
      mockStore.create.mockResolvedValue(created)

      const result = await invoke('project:create', createData)

      expect(mockStore.create).toHaveBeenCalledWith(createData)
      expect(result).toEqual(created)
    })

    it('rethrows when create() throws', async () => {
      mockStore.create.mockRejectedValue(new Error('validation failed'))

      await expect(invoke('project:create', {})).rejects.toThrow('project:create failed: validation failed')
    })
  })

  // ── project:update ───────────────────────────────────────────────────────────
  describe('project:update', () => {
    it('calls update() then getById() and returns the updated project', async () => {
      const updatedProject = makeProject({ name: 'Updated Name' })
      mockStore.update.mockResolvedValue(undefined)
      mockStore.getById.mockResolvedValue(updatedProject)

      const result = await invoke('project:update', 'proj-1', { name: 'Updated Name' })

      expect(mockStore.update).toHaveBeenCalledWith('proj-1', { name: 'Updated Name' })
      expect(mockStore.getById).toHaveBeenCalledWith('proj-1')
      expect(result).toEqual(updatedProject)
    })

    it('throws if project not found after update', async () => {
      mockStore.update.mockResolvedValue(undefined)
      mockStore.getById.mockResolvedValue(undefined)

      await expect(invoke('project:update', 'proj-1', {})).rejects.toThrow('project:update failed')
    })

    it('rethrows when update() throws', async () => {
      mockStore.update.mockRejectedValue(new Error('not found'))

      await expect(invoke('project:update', 'proj-1', {})).rejects.toThrow('project:update failed: not found')
    })
  })

  // ── project:delete ───────────────────────────────────────────────────────────
  describe('project:delete', () => {
    it('calls delete() with the correct id', async () => {
      mockStore.delete.mockResolvedValue(undefined)

      await invoke('project:delete', 'proj-1')

      expect(mockStore.delete).toHaveBeenCalledWith('proj-1')
    })

    it('rethrows when delete() throws', async () => {
      mockStore.delete.mockRejectedValue(new Error('not found'))

      await expect(invoke('project:delete', 'proj-1')).rejects.toThrow('project:delete failed: not found')
    })
  })
})
