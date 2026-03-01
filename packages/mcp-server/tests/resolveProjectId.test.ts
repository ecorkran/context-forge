import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProjectId } from '../src/tools/resolveProjectId.js';

// --- Mocks ---

const mockGet = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockGet,
  })),
}));

// --- Tests ---

describe('resolveProjectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit ID when provided', async () => {
    const result = await resolveProjectId('project_12345');
    expect(result).toBe('project_12345');
    // Should not call ConfigManager when explicit ID is given
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns configured default_project when explicit ID omitted', async () => {
    mockGet.mockResolvedValue({
      key: 'default_project',
      value: 'project_default_id',
      source: 'user',
      description: 'Default project ID',
    });

    const result = await resolveProjectId(undefined);
    expect(result).toBe('project_default_id');
    expect(mockGet).toHaveBeenCalledWith('default_project');
  });

  it('throws descriptive error when neither explicit ID nor default_project configured', async () => {
    mockGet.mockResolvedValue({
      key: 'default_project',
      value: '',
      source: 'default',
      description: 'Default project ID',
    });

    await expect(resolveProjectId(undefined)).rejects.toThrow(
      'No project ID provided and no default_project configured'
    );
    await expect(resolveProjectId(undefined)).rejects.toThrow('config_set');
  });

  it('passes configProjectPath to ConfigManager constructor', async () => {
    const { ConfigManager } = await import('@context-forge/core/node');
    mockGet.mockResolvedValue({
      key: 'default_project',
      value: 'found-id',
      source: 'project',
      description: 'Default project ID',
    });

    await resolveProjectId(undefined, '/some/project/path');
    expect(ConfigManager).toHaveBeenCalledWith('/some/project/path');
  });
});
