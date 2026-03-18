import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProjectId } from '../src/tools/resolveProjectId.js';

describe('resolveProjectId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns explicit ID when provided', async () => {
    const result = await resolveProjectId('project_12345');
    expect(result).toBe('project_12345');
  });

  it('throws descriptive error when no explicit ID provided', async () => {
    await expect(resolveProjectId(undefined)).rejects.toThrow(
      'No project ID provided'
    );
    await expect(resolveProjectId()).rejects.toThrow('project_list');
  });
});
