import { describe, it, expect } from 'vitest';
import {
  GUIDE_METHODS,
  GUIDE_METHOD_DEPRECATED_ALIASES,
  guideExcludeNotices,
  isDeprecatedGuideMethodAlias,
  normalizeGuideMethod,
} from '../../src/guides/types.js';

describe('normalizeGuideMethod', () => {
  it('passes through each canonical value unchanged', () => {
    for (const method of GUIDE_METHODS) {
      expect(normalizeGuideMethod(method)).toBe(method);
    }
  });

  it('maps the deprecated alias manual to tarball', () => {
    expect(normalizeGuideMethod('manual')).toBe('tarball');
  });

  it('tolerates surrounding whitespace on a canonical value', () => {
    expect(normalizeGuideMethod('  submodule  ')).toBe('submodule');
  });

  it('tolerates surrounding whitespace on a deprecated alias', () => {
    expect(normalizeGuideMethod(' manual ')).toBe('tarball');
  });

  it('throws on an empty string', () => {
    expect(() => normalizeGuideMethod('')).toThrow(/Invalid guide strategy/);
  });

  it('throws on whitespace only', () => {
    expect(() => normalizeGuideMethod('   ')).toThrow(/Invalid guide strategy/);
  });

  it('throws on an unknown word', () => {
    expect(() => normalizeGuideMethod('symlink')).toThrow(/Invalid guide strategy/);
  });

  it('names every canonical value in the error message', () => {
    let message = '';
    try {
      normalizeGuideMethod('symlink');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    for (const method of GUIDE_METHODS) {
      expect(message).toContain(method);
    }
  });

  it('echoes the offending input in the error message', () => {
    expect(() => normalizeGuideMethod('symlink')).toThrow(/'symlink'/);
  });
});

describe('isDeprecatedGuideMethodAlias', () => {
  it('is true for a deprecated alias', () => {
    expect(isDeprecatedGuideMethodAlias('manual')).toBe(true);
  });

  it('is true for a deprecated alias with whitespace', () => {
    expect(isDeprecatedGuideMethodAlias(' manual ')).toBe(true);
  });

  it('is false for every canonical value', () => {
    for (const method of GUIDE_METHODS) {
      expect(isDeprecatedGuideMethodAlias(method)).toBe(false);
    }
  });

  it('is false for an unknown word', () => {
    expect(isDeprecatedGuideMethodAlias('symlink')).toBe(false);
  });
});

describe('GUIDE_METHOD_DEPRECATED_ALIASES', () => {
  it('resolves every alias to a canonical method', () => {
    for (const target of Object.values(GUIDE_METHOD_DEPRECATED_ALIASES)) {
      expect(GUIDE_METHODS).toContain(target);
    }
  });

  it('does not list any canonical value as an alias', () => {
    for (const method of GUIDE_METHODS) {
      expect(GUIDE_METHOD_DEPRECATED_ALIASES).not.toHaveProperty(method);
    }
  });
});

describe('guideExcludeNotices', () => {
  it('names each unmatched pattern and the version', () => {
    expect(
      guideExcludeNotices({ method: 'tarball', unmatchedExclude: ['tool-guide', 'x'], newVersion: 'v0.19.3' })
    ).toEqual([
      'guide.exclude entry "tool-guide" matched nothing in v0.19.3',
      'guide.exclude entry "x" matched nothing in v0.19.3',
    ]);
  });

  it('uses the install version when there is no newVersion', () => {
    expect(guideExcludeNotices({ method: 'tarball', unmatchedExclude: ['x'], version: 'v0.19.3' })).toEqual([
      'guide.exclude entry "x" matched nothing in v0.19.3',
    ]);
  });

  it('says the key was ignored for a non-tarball install', () => {
    expect(guideExcludeNotices({ method: 'submodule', excludeIgnored: true })).toEqual([
      'guide.exclude is set but ignored for submodule installs',
    ]);
  });

  it('passes on the notice that the config file was left out of the commit', () => {
    expect(guideExcludeNotices({ method: 'tarball', newVersion: 'v0.19.3', configNotice: 'config left out' })).toEqual([
      'config left out',
    ]);
  });

  it('returns nothing when there is nothing to report', () => {
    expect(guideExcludeNotices({ method: 'tarball', version: 'v0.19.3' })).toEqual([]);
  });
});
