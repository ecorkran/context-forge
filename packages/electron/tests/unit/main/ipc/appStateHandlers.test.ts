import { describe, it, expect, beforeEach, vi } from 'vitest'

// Capture IPC handlers registered by the module under test
const handlers: Record<string, (...args: unknown[]) => unknown> = {}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers[channel] = handler
    }),
  },
}))

vi.mock('@context-forge/core/node', () => ({
  FileStorageService: vi.fn(),
}))

async function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = handlers[channel]
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  return handler({} /* IPC event */, ...args)
}

/** Make a NodeJS ENOENT-style error */
function makeEnoent(): Error {
  const err = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

describe('appStateHandlers', () => {
  const mockStorageService = {
    read: vi.fn(),
    write: vi.fn(),
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    for (const key of Object.keys(handlers)) delete handlers[key]

    const { registerAppStateHandlers } = await import('@/main/ipc/appStateHandlers')
    registerAppStateHandlers(mockStorageService as never)
  })

  // ── app-state:get ─────────────────────────────────────────────────────────────
  describe('app-state:get', () => {
    it('returns parsed state from file', async () => {
      const stored = {
        lastActiveProjectId: 'proj-abc',
        appVersion: '2.0.0',
        lastOpened: '2026-01-01T00:00:00.000Z',
        panelSizes: [40, 60],
      }
      mockStorageService.read.mockResolvedValue({ data: JSON.stringify(stored) })

      const result = await invoke('app-state:get') as Record<string, unknown>

      expect(mockStorageService.read).toHaveBeenCalledWith('app-state.json')
      expect(result.lastActiveProjectId).toBe('proj-abc')
      expect(result.panelSizes).toEqual([40, 60])
    })

    it('returns default state when file does not exist (ENOENT)', async () => {
      mockStorageService.read.mockRejectedValue(makeEnoent())

      const result = await invoke('app-state:get') as Record<string, unknown>

      expect(result.lastActiveProjectId).toBe('')
      expect(result.appVersion).toBe('1.0.0')
    })

    it('merges stored state with defaults to fill missing fields', async () => {
      const partial = { lastActiveProjectId: 'proj-xyz' }
      mockStorageService.read.mockResolvedValue({ data: JSON.stringify(partial) })

      const result = await invoke('app-state:get') as Record<string, unknown>

      expect(result.lastActiveProjectId).toBe('proj-xyz')
      expect(result.appVersion).toBe('1.0.0') // from defaults
    })

    it('rethrows on non-ENOENT read errors', async () => {
      mockStorageService.read.mockRejectedValue(new Error('disk read error'))

      await expect(invoke('app-state:get')).rejects.toThrow('app-state:get failed: disk read error')
    })
  })

  // ── app-state:update ──────────────────────────────────────────────────────────
  describe('app-state:update', () => {
    it('merges partial updates with existing state and writes back', async () => {
      const existing = {
        lastActiveProjectId: 'proj-1',
        appVersion: '1.0.0',
        lastOpened: '2026-01-01T00:00:00.000Z',
        panelSizes: [50, 50],
      }
      mockStorageService.read.mockResolvedValue({ data: JSON.stringify(existing) })
      mockStorageService.write.mockResolvedValue(undefined)

      await invoke('app-state:update', { lastActiveProjectId: 'proj-2', panelSizes: [30, 70] })

      expect(mockStorageService.write).toHaveBeenCalledOnce()
      const [, writtenJson] = mockStorageService.write.mock.calls[0] as [string, string]
      const written = JSON.parse(writtenJson) as Record<string, unknown>

      expect(written.lastActiveProjectId).toBe('proj-2')
      expect(written.panelSizes).toEqual([30, 70])
      expect(written.appVersion).toBe('1.0.0') // preserved from existing
    })

    it('creates state from defaults when file does not exist', async () => {
      mockStorageService.read.mockRejectedValue(makeEnoent())
      mockStorageService.write.mockResolvedValue(undefined)

      await invoke('app-state:update', { lastActiveProjectId: 'proj-new' })

      const [, writtenJson] = mockStorageService.write.mock.calls[0] as [string, string]
      const written = JSON.parse(writtenJson) as Record<string, unknown>

      expect(written.lastActiveProjectId).toBe('proj-new')
      expect(written.appVersion).toBe('1.0.0')
    })

    it('rethrows when write fails', async () => {
      mockStorageService.read.mockRejectedValue(makeEnoent())
      mockStorageService.write.mockRejectedValue(new Error('disk full'))

      await expect(invoke('app-state:update', {})).rejects.toThrow('app-state:update failed: disk full')
    })
  })
})
