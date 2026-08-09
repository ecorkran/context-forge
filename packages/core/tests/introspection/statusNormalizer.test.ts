import { describe, it, expect } from 'vitest';
import { normalizeStatus, suggestStatus } from '../../src/introspection/parsers/statusNormalizer.js';

describe('normalizeStatus', () => {
  describe('complete variants', () => {
    it.each(['complete', 'completed', 'done'])('maps "%s" to "complete"', (input) => {
      expect(normalizeStatus(input)).toBe('complete');
    });
  });

  describe('in_progress variants', () => {
    it.each(['in_progress', 'in-progress', 'in progress', 'active'])(
      'maps "%s" to "in_progress"',
      (input) => {
        expect(normalizeStatus(input)).toBe('in_progress');
      },
    );
  });

  describe('not_started variants', () => {
    it.each(['not_started', 'not-started', 'not started', 'ready', 'pending', 'planned'])(
      'maps "%s" to "not_started"',
      (input) => {
        expect(normalizeStatus(input)).toBe('not_started');
      },
    );
  });

  describe('deprecated', () => {
    it('maps "deprecated" to "deprecated"', () => {
      expect(normalizeStatus('deprecated')).toBe('deprecated');
    });
  });

  describe('deferred', () => {
    it('maps "deferred" to "deferred"', () => {
      expect(normalizeStatus('deferred')).toBe('deferred');
    });
  });

  describe('case insensitivity', () => {
    it.each([
      ['COMPLETE', 'complete'],
      ['In-Progress', 'in_progress'],
      ['NOT_STARTED', 'not_started'],
      ['Deprecated', 'deprecated'],
      ['Deferred', 'deferred'],
      ['DONE', 'complete'],
      ['Active', 'in_progress'],
    ])('maps "%s" to "%s"', (input, expected) => {
      expect(normalizeStatus(input)).toBe(expected);
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeStatus('  complete  ')).toBe('complete');
    });

    it('trims tabs and mixed whitespace', () => {
      expect(normalizeStatus('\tin-progress\t')).toBe('in_progress');
    });
  });

  describe('unrecognized and empty values return undefined', () => {
    it('returns undefined for an unmapped string', () => {
      expect(normalizeStatus('garbage')).toBeUndefined();
    });

    it('returns undefined for empty string', () => {
      expect(normalizeStatus('')).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(normalizeStatus(undefined)).toBeUndefined();
    });

    it('returns undefined for null', () => {
      expect(normalizeStatus(null)).toBeUndefined();
    });
  });
});

describe('suggestStatus', () => {
  it.each([
    ['in-progress', 'in_progress'],
    ['done', 'complete'],
    ['ready', 'not_started'],
  ])('passes exact alias "%s" through to "%s"', (input, expected) => {
    expect(suggestStatus(input)).toBe(expected);
  });

  it.each([
    ['in-progres', 'in_progress'], // missing letter
    ['compelte', 'complete'], // transposition
    ['not-strated', 'not_started'], // transposition with hyphen alias
  ])('rescues close typo "%s" to "%s"', (input, expected) => {
    expect(suggestStatus(input)).toBe(expected);
  });

  it('refuses to fuzzy-match short strings', () => {
    // 'dane' is edit distance 1 from 'done', but 4-letter inputs are too
    // ambiguous to rescue — must stay undefined.
    expect(suggestStatus('dane')).toBeUndefined();
  });

  it('returns undefined for values with no close alias', () => {
    expect(suggestStatus('backlog')).toBeUndefined();
    expect(suggestStatus('resolved')).toBeUndefined();
  });

  it('returns undefined for empty and nullish input', () => {
    expect(suggestStatus('')).toBeUndefined();
    expect(suggestStatus(undefined)).toBeUndefined();
    expect(suggestStatus(null)).toBeUndefined();
  });
});
