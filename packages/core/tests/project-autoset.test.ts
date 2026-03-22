import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeAutoSetFields } from '../src/project-autoset.js';

vi.mock('../src/schema/resolveFileByIndex.js', () => ({
  resolveFileByIndex: vi.fn(),
}));

import { resolveFileByIndex } from '../src/schema/resolveFileByIndex.js';
const mockResolve = vi.mocked(resolveFileByIndex);

describe('computeAutoSetFields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Rule 1: developmentPhase → instruction
  describe('developmentPhase rule', () => {
    it('auto-sets instruction from developmentPhase', () => {
      const result = computeAutoSetFields('developmentPhase', 'Phase 6: Implementation', '/project');
      expect(result.derivedUpdates.instruction).toBe('Phase 6: Implementation');
      expect(result.descriptions).toHaveLength(1);
      expect(result.descriptions[0]).toContain('instruction');
    });

    it('works without projectPath', () => {
      const result = computeAutoSetFields('developmentPhase', 'Phase 3: Architecture', undefined);
      expect(result.derivedUpdates.instruction).toBe('Phase 3: Architecture');
    });
  });

  // Rule 2: fileArch → fileSlicePlan
  describe('fileArch rule', () => {
    it('auto-sets fileSlicePlan via resolveFileByIndex', () => {
      mockResolve.mockReturnValue('200-slices.developer-onboarding');
      const result = computeAutoSetFields('fileArch', '200-arch.developer-onboarding', '/project');

      expect(mockResolve).toHaveBeenCalledWith('/project', 'fileSlicePlan', '200');
      expect(result.derivedUpdates.fileSlicePlan).toBe('200-slices.developer-onboarding');
      expect(result.descriptions).toHaveLength(1);
    });

    it('falls back to regex when resolveFileByIndex throws', () => {
      mockResolve.mockImplementation(() => { throw new Error('not found'); });
      const result = computeAutoSetFields('fileArch', '200-arch.developer-onboarding', '/project');

      expect(result.derivedUpdates.fileSlicePlan).toBe('200-slices.developer-onboarding');
    });

    it('does not fire without projectPath', () => {
      const result = computeAutoSetFields('fileArch', '200-arch.developer-onboarding', undefined);
      expect(result.derivedUpdates).not.toHaveProperty('fileSlicePlan');
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it('does not fire when value has no numeric prefix', () => {
      const result = computeAutoSetFields('fileArch', 'arch.developer-onboarding', '/project');
      expect(result.derivedUpdates).not.toHaveProperty('fileSlicePlan');
    });

    it('regex fallback does not set when pattern does not match', () => {
      mockResolve.mockImplementation(() => { throw new Error('not found'); });
      const result = computeAutoSetFields('fileArch', '200-something.developer-onboarding', '/project');
      // Pattern requires "-arch." prefix for regex fallback
      expect(result.derivedUpdates).not.toHaveProperty('fileSlicePlan');
    });
  });

  // Rule 3: fileSlice → fileTasks
  describe('fileSlice rule', () => {
    it('auto-sets fileTasks via resolveFileByIndex', () => {
      mockResolve.mockReturnValue('206-tasks.cli-mcp-shared-logic-consolidation');
      const result = computeAutoSetFields('fileSlice', '206-slice.cli-mcp-shared-logic-consolidation', '/project');

      expect(mockResolve).toHaveBeenCalledWith('/project', 'fileTasks', '206');
      expect(result.derivedUpdates.fileTasks).toBe('206-tasks.cli-mcp-shared-logic-consolidation');
    });

    it('falls back to regex when resolveFileByIndex throws', () => {
      mockResolve.mockImplementation(() => { throw new Error('not found'); });
      const result = computeAutoSetFields('fileSlice', '206-slice.cli-mcp-shared-logic-consolidation', '/project');

      expect(result.derivedUpdates.fileTasks).toBe('206-tasks.cli-mcp-shared-logic-consolidation');
    });

    it('does not fire without projectPath', () => {
      const result = computeAutoSetFields('fileSlice', '206-slice.cli-mcp-shared-logic-consolidation', undefined);
      expect(result.derivedUpdates).not.toHaveProperty('fileTasks');
    });
  });

  // Non-matching field
  it('returns empty derivedUpdates for non-matching field', () => {
    const result = computeAutoSetFields('name', 'my-project', '/project');
    expect(Object.keys(result.derivedUpdates)).toHaveLength(0);
    expect(result.descriptions).toHaveLength(0);
  });
});
