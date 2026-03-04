import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProjectId } from '../../src/utils/project.js';
import { UserError } from '../../src/utils/errors.js';

// Mock ConfigManager
vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn(),
  })),
}));

import { ConfigManager } from '@context-forge/core/node';

describe('resolveProjectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit ID when provided', async () => {
    const result = await resolveProjectId('my-project');
    expect(result).toBe('my-project');
  });

  it('falls back to default_project config', async () => {
    const mockGet = vi.fn().mockResolvedValue({ value: 'config-project' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    const result = await resolveProjectId();
    expect(result).toBe('config-project');
    expect(mockGet).toHaveBeenCalledWith('default_project');
  });

  it('throws UserError when no ID available', async () => {
    const mockGet = vi.fn().mockResolvedValue({ value: '' });
    vi.mocked(ConfigManager).mockImplementation(
      () => ({ get: mockGet }) as unknown as InstanceType<typeof ConfigManager>,
    );

    await expect(resolveProjectId()).rejects.toThrow(UserError);
    await expect(resolveProjectId()).rejects.toThrow('--project');
  });
});
