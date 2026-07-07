import { describe, it, expect } from 'vitest';
import { normalizeStatus } from '../../src/introspection/parsers/statusNormalizer.js';

describe('normalizeStatus', () => {
  describe('complete variants', () => {
    it.each(['complete', 'completed', 'done'])('maps "%s" to "complete"', (input) => {
      expect(normalizeStatus(input)).toBe('complete');
    });
  });

  describe('in-progress variants', () => {
    it.each(['in_progress', 'in-progress', 'in progress', 'active'])(
      'maps "%s" to "in-progress"',
      (input) => {
        expect(normalizeStatus(input)).toBe('in-progress');
      },
    );
  });

  describe('not-started variants', () => {
    it.each(['not_started', 'not-started', 'not started', 'ready', 'pending', 'planned'])(
      'maps "%s" to "not-started"',
      (input) => {
        expect(normalizeStatus(input)).toBe('not-started');
      },
    );
  });

  describe('deprecated', () => {
    it('maps "deprecated" to "deprecated"', () => {
      expect(normalizeStatus('deprecated')).toBe('deprecated');
    });
  });

  describe('case insensitivity', () => {
    it.each([
      ['COMPLETE', 'complete'],
      ['In-Progress', 'in-progress'],
      ['NOT_STARTED', 'not-started'],
      ['Deprecated', 'deprecated'],
      ['DONE', 'complete'],
      ['Active', 'in-progress'],
    ])('maps "%s" to "%s"', (input, expected) => {
      expect(normalizeStatus(input)).toBe(expected);
    });
  });

  describe('whitespace trimming', () => {
    it('trims leading and trailing whitespace', () => {
      expect(normalizeStatus('  complete  ')).toBe('complete');
    });

    it('trims tabs and mixed whitespace', () => {
      expect(normalizeStatus('\tin-progress\t')).toBe('in-progress');
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

    it('returns undefined for "deferred" (no NormalizedStatus equivalent)', () => {
      expect(normalizeStatus('deferred')).toBeUndefined();
    });
  });
});
