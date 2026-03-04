import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPhaseShorthands, clearPhaseShorthandCache, resolvePhaseInput } from '../../src/utils/phaseShorthand.js';

// Mock fs to provide fake prompt file content
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(`
# System Prompt

## Some Section

##### Concept (Phase 1)
concept content

###### Architecture (Phase 2)
architecture content

##### Slice Planning (Phase 3)
planning content

##### Slice Design (Phase 4)
design content

##### Task Breakdown (Phase 5)
breakdown content

##### Implementation (Phase 6)
implementation content

##### Integration (Phase 7)
integration content
`),
}));

describe('getPhaseShorthands', () => {
  beforeEach(() => {
    clearPhaseShorthandCache();
  });

  it('parses P1–P7 from prompt file headings', async () => {
    const map = await getPhaseShorthands('/fake/project');
    expect(map.get('P1')).toBe('Concept');
    expect(map.get('P2')).toBe('Architecture');
    expect(map.get('P3')).toBe('Slice Planning');
    expect(map.get('P4')).toBe('Slice Design');
    expect(map.get('P5')).toBe('Task Breakdown');
    expect(map.get('P6')).toBe('Implementation');
    expect(map.get('P7')).toBe('Integration');
  });

  it('caches result after first parse', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockClear();
    await getPhaseShorthands('/fake/project');
    await getPhaseShorthands('/fake/project');
    expect(readFile).toHaveBeenCalledTimes(1);
  });
});

describe('resolvePhaseInput', () => {
  beforeEach(() => {
    clearPhaseShorthandCache();
  });

  it('resolves P5 to Task Breakdown', async () => {
    const result = await resolvePhaseInput('P5', '/fake/project');
    expect(result).toBe('Task Breakdown');
  });

  it('resolves lowercase p6 to Implementation', async () => {
    const result = await resolvePhaseInput('p6', '/fake/project');
    expect(result).toBe('Implementation');
  });

  it('converts hyphens to spaces for non-shorthand input', async () => {
    const result = await resolvePhaseInput('task-breakdown', '/fake/project');
    expect(result).toBe('task breakdown');
  });

  it('passes through plain text as-is', async () => {
    const result = await resolvePhaseInput('implementation', '/fake/project');
    expect(result).toBe('implementation');
  });
});
