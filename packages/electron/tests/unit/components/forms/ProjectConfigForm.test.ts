import { describe, it, expect } from 'vitest';

/**
 * Helper function to generate task file name from slice
 * Extracted for testing - this matches the implementation in ProjectConfigForm.tsx
 */
const generateTaskFileName = (slice: string): string => {
  if (!slice) return '';

  // Extract slice number and name from format like "031-slice.hero-section"
  const sliceMatch = slice.match(/^(\d+)-slice\.(.+)$/);
  if (sliceMatch) {
    const [, sliceNumber, sliceName] = sliceMatch;
    return `${sliceNumber}-tasks.${sliceName}`;
  }

  // Fallback for other slice formats
  return slice.replace('slice', 'tasks');
};

describe('generateTaskFileName', () => {
  it('should convert standard slice format to task format', () => {
    expect(generateTaskFileName('031-slice.hero-section')).toBe('031-tasks.hero-section');
    expect(generateTaskFileName('900-slice.maintenance')).toBe('900-tasks.maintenance');
    expect(generateTaskFileName('001-slice.auth')).toBe('001-tasks.auth');
  });

  it('should handle fallback for non-standard formats', () => {
    expect(generateTaskFileName('my-slice-name')).toBe('my-tasks-name');
    expect(generateTaskFileName('slice-something')).toBe('tasks-something');
  });

  it('should return empty string for empty input', () => {
    expect(generateTaskFileName('')).toBe('');
  });

  it('should handle edge cases', () => {
    expect(generateTaskFileName('slice')).toBe('tasks');
    expect(generateTaskFileName('123-slice')).toBe('123-tasks');
    expect(generateTaskFileName('no-match-here')).toBe('no-match-here');
  });
});