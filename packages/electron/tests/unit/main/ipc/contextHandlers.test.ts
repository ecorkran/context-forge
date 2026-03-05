import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ProjectData } from '@context-forge/core'

// Capture IPC handlers registered by the module under test
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

// Mock integrator returned by createContextPipeline
const mockIntegrator = {
  generateContextFromProject: vi.fn<[ProjectData], Promise<string>>(),
}

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn(),
  createContextPipeline: vi.fn(() => ({ integrator: mockIntegrator })),
}))

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

  projectPath: '/projects/test',
  customData: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  ...overrides,
})

describe('contextHandlers', () => {
  const mockStore = {
    getById: vi.fn<[string], Promise<ProjectData | undefined>>(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    for (const key of Object.keys(handlers)) delete handlers[key]

    const { registerContextHandlers } = await import('@/main/ipc/contextHandlers')
    registerContextHandlers(mockStore as never)
  })

  // ── context:generate ─────────────────────────────────────────────────────────
  describe('context:generate', () => {
    it('returns context string on successful generation', async () => {
      const project = makeProject()
      mockStore.getById.mockResolvedValue(project)
      mockIntegrator.generateContextFromProject.mockResolvedValue('# Generated Context')

      const result = await invoke('context:generate', 'proj-1')

      expect(mockStore.getById).toHaveBeenCalledWith('proj-1')
      expect(result).toBe('# Generated Context')
    })

    it('applies overrides to project before passing to pipeline', async () => {
      const project = makeProject({ fileSlice: 'original-slice', instruction: 'implementation' })
      mockStore.getById.mockResolvedValue(project)
      mockIntegrator.generateContextFromProject.mockResolvedValue('context with overrides')

      await invoke('context:generate', 'proj-1', {
        fileSlice: 'override-slice',
        instruction: 'design',
      })

      // The integrator should receive the merged project, not the original
      const callArg = mockIntegrator.generateContextFromProject.mock.calls[0][0]
      expect(callArg.fileSlice).toBe('override-slice')
      expect(callArg.instruction).toBe('design')
      // Non-overridden fields should be preserved
      expect(callArg.name).toBe('Test Project')
    })

    it('does not mutate original project when applying overrides', async () => {
      const project = makeProject({ fileSlice: 'original-slice' })
      mockStore.getById.mockResolvedValue(project)
      mockIntegrator.generateContextFromProject.mockResolvedValue('ctx')

      await invoke('context:generate', 'proj-1', { fileSlice: 'override-slice' })

      expect(project.fileSlice).toBe('original-slice')
    })

    it('throws descriptive error when project is not found', async () => {
      mockStore.getById.mockResolvedValue(undefined)

      await expect(invoke('context:generate', 'missing-id')).rejects.toThrow(
        'context:generate failed: Project not found: missing-id'
      )
    })

    it('throws descriptive error when project has no projectPath', async () => {
      const project = makeProject({ projectPath: undefined })
      mockStore.getById.mockResolvedValue(project)

      await expect(invoke('context:generate', 'proj-1')).rejects.toThrow(
        'context:generate failed'
      )
      await expect(invoke('context:generate', 'proj-1')).rejects.toThrow(
        'no projectPath'
      )
    })

    it('rethrows when integrator throws', async () => {
      const project = makeProject()
      mockStore.getById.mockResolvedValue(project)
      mockIntegrator.generateContextFromProject.mockRejectedValue(
        new Error('template file missing')
      )

      await expect(invoke('context:generate', 'proj-1')).rejects.toThrow(
        'context:generate failed: template file missing'
      )
    })
  })
})
