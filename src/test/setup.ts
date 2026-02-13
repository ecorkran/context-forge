import { vi } from 'vitest'

// Mock Electron APIs for testing
global.window = global.window || {};

const mockElectronAPI = {
  ping: vi.fn().mockResolvedValue('pong'),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  storage: {
    read: vi.fn(),
    write: vi.fn(),
    backup: vi.fn(),
  },
  projectPath: {
    validate: vi.fn(),
    healthCheck: vi.fn(),
    listDirectory: vi.fn(),
    pickFolder: vi.fn(),
  }
}

// @ts-ignore
global.window.electronAPI = mockElectronAPI

// Export for use in tests
export { mockElectronAPI }