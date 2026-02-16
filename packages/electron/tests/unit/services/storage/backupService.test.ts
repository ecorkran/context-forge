import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createVersionedBackup,
  pruneOldBackups,
  checkWriteGuard,
  MAX_VERSIONED_BACKUPS,
  BackupFsDeps,
} from '../../../../src/main/services/storage/backupService'

/** Create a mock fs deps object with all methods as vi.fn() */
function mockFsDeps(overrides: Partial<BackupFsDeps> = {}): BackupFsDeps {
  return {
    existsSync: vi.fn().mockReturnValue(true),
    copyFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    ...overrides,
  }
}

describe('backupService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('createVersionedBackup', () => {
    it('should skip if source file does not exist', async () => {
      const fs = mockFsDeps({ existsSync: vi.fn().mockReturnValue(false) })

      await createVersionedBackup('/storage', 'projects.json', fs)

      expect(fs.copyFile).not.toHaveBeenCalled()
    })

    it('should create a timestamped backup file', async () => {
      const fs = mockFsDeps()
      vi.setSystemTime(new Date('2026-02-14T10:30:00.000Z'))

      await createVersionedBackup('/storage', 'projects.json', fs)

      expect(fs.copyFile).toHaveBeenCalledWith(
        '/storage/projects.json',
        '/storage/projects.json.2026-02-14T10-30-00-000Z.backup'
      )

      vi.useRealTimers()
    })

    it('should create backups with unique timestamps on multiple calls', async () => {
      const fs = mockFsDeps()

      vi.setSystemTime(new Date('2026-02-14T10:00:00.000Z'))
      await createVersionedBackup('/storage', 'projects.json', fs)

      vi.setSystemTime(new Date('2026-02-14T10:01:00.000Z'))
      await createVersionedBackup('/storage', 'projects.json', fs)

      expect(fs.copyFile).toHaveBeenCalledTimes(2)
      const firstDest = (fs.copyFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      const secondDest = (fs.copyFile as ReturnType<typeof vi.fn>).mock.calls[1][1]
      expect(firstDest).not.toBe(secondDest)
      expect(firstDest).toContain('10-00-00')
      expect(secondDest).toContain('10-01-00')

      vi.useRealTimers()
    })

    it('should match expected filename pattern', async () => {
      const fs = mockFsDeps()
      vi.setSystemTime(new Date('2026-02-14T10:30:00.000Z'))

      await createVersionedBackup('/storage', 'projects.json', fs)

      const destPath = (fs.copyFile as ReturnType<typeof vi.fn>).mock.calls[0][1] as string
      expect(destPath).toMatch(/projects\.json\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.backup$/)

      vi.useRealTimers()
    })
  })

  describe('pruneOldBackups', () => {
    it('should not delete anything when under the limit', async () => {
      const backups = Array.from({ length: 5 }, (_, i) =>
        `projects.json.2026-02-14T10-0${i}-00-000Z.backup`
      )
      const fs = mockFsDeps({ readdir: vi.fn().mockResolvedValue(backups) })

      await pruneOldBackups('/storage', 'projects.json', fs)

      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should not delete anything when exactly at the limit', async () => {
      const backups = Array.from({ length: MAX_VERSIONED_BACKUPS }, (_, i) =>
        `projects.json.2026-02-14T10-${String(i).padStart(2, '0')}-00-000Z.backup`
      )
      const fs = mockFsDeps({ readdir: vi.fn().mockResolvedValue(backups) })

      await pruneOldBackups('/storage', 'projects.json', fs)

      expect(fs.unlink).not.toHaveBeenCalled()
    })

    it('should delete oldest backups when over the limit', async () => {
      const backups = Array.from({ length: 12 }, (_, i) =>
        `projects.json.2026-02-14T10-${String(i).padStart(2, '0')}-00-000Z.backup`
      )
      const fs = mockFsDeps({ readdir: vi.fn().mockResolvedValue(backups) })

      await pruneOldBackups('/storage', 'projects.json', fs)

      // Sorted desc, the 2 oldest are index 00 and 01
      expect(fs.unlink).toHaveBeenCalledTimes(2)
      expect(fs.unlink).toHaveBeenCalledWith('/storage/projects.json.2026-02-14T10-00-00-000Z.backup')
      expect(fs.unlink).toHaveBeenCalledWith('/storage/projects.json.2026-02-14T10-01-00-000Z.backup')
    })

    it('should not delete the plain .backup file', async () => {
      const entries = [
        'projects.json.backup', // plain backup — must not be touched
        ...Array.from({ length: 11 }, (_, i) =>
          `projects.json.2026-02-14T10-${String(i).padStart(2, '0')}-00-000Z.backup`
        ),
      ]
      const fs = mockFsDeps({ readdir: vi.fn().mockResolvedValue(entries) })

      await pruneOldBackups('/storage', 'projects.json', fs)

      // 11 versioned - 10 = 1 to delete
      expect(fs.unlink).toHaveBeenCalledTimes(1)
      const deletedPaths = (fs.unlink as ReturnType<typeof vi.fn>).mock.calls.map((c: string[]) => c[0])
      expect(deletedPaths).not.toContain('/storage/projects.json.backup')
    })

    it('should not block on rotation failure', async () => {
      const fs = mockFsDeps({
        readdir: vi.fn().mockRejectedValue(new Error('Permission denied')),
      })

      await expect(pruneOldBackups('/storage', 'projects.json', fs)).resolves.toBeUndefined()
    })

    it('should handle unlink failure gracefully', async () => {
      const backups = Array.from({ length: 12 }, (_, i) =>
        `projects.json.2026-02-14T10-${String(i).padStart(2, '0')}-00-000Z.backup`
      )
      const fs = mockFsDeps({
        readdir: vi.fn().mockResolvedValue(backups),
        unlink: vi.fn().mockRejectedValue(new Error('File locked')),
      })

      // unlink error caught by outer try/catch — should not throw
      await expect(pruneOldBackups('/storage', 'projects.json', fs)).resolves.toBeUndefined()
    })
  })

  describe('checkWriteGuard', () => {
    it('should allow writes to non-projects.json files regardless', async () => {
      const fs = mockFsDeps()

      const result = await checkWriteGuard('/storage', 'app-state.json', '[]', fs)

      expect(result).toBeNull()
      expect(fs.existsSync).not.toHaveBeenCalled()
    })

    it('should allow writes when existing file does not exist', async () => {
      const fs = mockFsDeps({ existsSync: vi.fn().mockReturnValue(false) })

      const result = await checkWriteGuard('/storage', 'projects.json', '[]', fs)

      expect(result).toBeNull()
    })

    it('should reject writing 1 project over 3+ projects', async () => {
      const existing = JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }])
      const incoming = JSON.stringify([{ id: '1' }])
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue(existing) })

      const result = await checkWriteGuard('/storage', 'projects.json', incoming, fs)

      expect(result).not.toBeNull()
      expect(result).toContain('significant data reduction')
      expect(result).toContain('3')
      expect(result).toContain('1')
    })

    it('should reject writing 0 projects over 3+ projects', async () => {
      const existing = JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }])
      const incoming = JSON.stringify([])
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue(existing) })

      const result = await checkWriteGuard('/storage', 'projects.json', incoming, fs)

      expect(result).not.toBeNull()
      expect(result).toContain('4')
      expect(result).toContain('0')
    })

    it('should allow normal single-delete (N-1 over N)', async () => {
      const existing = JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }, { id: '6' }])
      const incoming = JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }])
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue(existing) })

      const result = await checkWriteGuard('/storage', 'projects.json', incoming, fs)

      expect(result).toBeNull()
    })

    it('should allow writes when existing has 2 or fewer projects', async () => {
      const existing = JSON.stringify([{ id: '1' }, { id: '2' }])
      const incoming = JSON.stringify([{ id: '1' }])
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue(existing) })

      const result = await checkWriteGuard('/storage', 'projects.json', incoming, fs)

      expect(result).toBeNull()
    })

    it('should allow write through when existing file is corrupt', async () => {
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue('not valid json{{{') })

      const result = await checkWriteGuard('/storage', 'projects.json', JSON.stringify([]), fs)

      expect(result).toBeNull()
    })

    it('should allow write through when incoming data is not valid JSON', async () => {
      const existing = JSON.stringify([{ id: '1' }, { id: '2' }, { id: '3' }])
      const fs = mockFsDeps({ readFile: vi.fn().mockResolvedValue(existing) })

      const result = await checkWriteGuard('/storage', 'projects.json', 'broken json', fs)

      expect(result).toBeNull()
    })

    it('should allow write through when readFile throws', async () => {
      const fs = mockFsDeps({
        readFile: vi.fn().mockRejectedValue(new Error('Disk error')),
      })

      const result = await checkWriteGuard('/storage', 'projects.json', JSON.stringify([]), fs)

      expect(result).toBeNull()
    })
  })
})
