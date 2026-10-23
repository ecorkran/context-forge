import { describe, it, expect } from 'vitest';
import { renderEntryStatus } from '../../src/output/entryStatusDisplay.js';

// Styling (ANSI) wraps the label, so these assert containment, not equality.
describe('renderEntryStatus retroactive display (slice 263 D8)', () => {
  it('a checked retroactive entry reads retroactive and not complete', () => {
    const label = renderEntryStatus('complete', true, true);
    expect(label).toContain('retroactive');
    expect(label).not.toContain('complete');
  });

  it('an unchecked retroactive entry is unchanged from the non-retroactive label', () => {
    expect(renderEntryStatus('not_started', false, true)).toBe(renderEntryStatus('not_started', false, false));
    expect(renderEntryStatus('complete', false, true)).toBe(renderEntryStatus('complete', false, false));
  });

  it('non-retroactive paths are unchanged', () => {
    expect(renderEntryStatus('complete', true)).toContain('complete');
    expect(renderEntryStatus('complete', true)).not.toContain('retroactive');
    expect(renderEntryStatus('complete', true, false)).toBe(renderEntryStatus('complete', true));
    expect(renderEntryStatus('in_progress', false)).toContain('in progress');
  });
});
