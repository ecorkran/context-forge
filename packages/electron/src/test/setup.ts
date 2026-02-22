import { vi } from 'vitest'

// Mock Electron APIs for testing
global.window = global.window || {};

const mockElectronAPI = {
  ping: vi.fn().mockResolvedValue('pong'),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  updateWindowTitle: vi.fn().mockResolvedValue(undefined),
  project: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  context: {
    generate: vi.fn(),
  },
  appState: {
    get: vi.fn(),
    update: vi.fn(),
  },
  projectPath: {
    validate: vi.fn(),
    healthCheck: vi.fn(),
    listDirectory: vi.fn(),
    pickFolder: vi.fn(),
  },
}

// @ts-ignore
global.window.electronAPI = mockElectronAPI

// Export for use in tests
export { mockElectronAPI }
