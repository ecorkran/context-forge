import { describe, it, expect } from 'vitest';
import {
  GuideExcludeError,
  isExcludedGuidePath,
  parseGuideExclude,
} from '../../src/config/guideExclude.js';

function rejection(raw: string): GuideExcludeError {
  try {
    parseGuideExclude(raw);
  } catch (err) {
    if (err instanceof GuideExcludeError) return err;
    throw err;
  }
  throw new Error(`expected "${raw}" to be rejected`);
}

describe('parseGuideExclude()', () => {
  it.each(['tool-guides', 'tool-guides/', 'tool-guides/**', './tool-guides', ' tool-guides '])(
    'normalizes %j to tool-guides',
    (raw) => {
      expect(parseGuideExclude(raw)).toEqual(['tool-guides']);
    },
  );

  it('accepts a lenient list with a trailing comma', () => {
    expect(parseGuideExclude('tool-guides/**, framework-guides,')).toEqual([
      'framework-guides',
      'tool-guides',
    ]);
  });

  it('accepts a lenient list with a doubled comma', () => {
    expect(parseGuideExclude('tool-guides/**,, framework-guides')).toEqual([
      'framework-guides',
      'tool-guides',
    ]);
  });

  it('deduplicates and sorts', () => {
    expect(parseGuideExclude('b,a,b/')).toEqual(['a', 'b']);
  });

  it('returns [] for the empty string', () => {
    expect(parseGuideExclude('')).toEqual([]);
  });

  it.each(['/abs', '\\abs', 'C:/x', '../x', 'a/../b', 'tool-*', 'a?b', '[ab]', '**', './'])(
    'rejects %j with a message naming the key and entry',
    (raw) => {
      const err = rejection(raw);
      expect(err.message).toContain('guide.exclude');
      expect(err.message).toContain(`"${raw}"`);
    },
  );

  it.each([
    ['scripts', 'scripts'],
    ['scripts/setup-ide', 'scripts'],
    ['project-guides', 'project-guides'],
    ['project-guides/templates', 'project-guides'],
    ['project-guides/**', 'project-guides'],
  ])('refuses protected path %j', (raw, protectedPath) => {
    expect(rejection(raw).message).toContain(`would remove ${protectedPath}, which cf requires.`);
  });

  it('uses the exact protected-path message', () => {
    expect(rejection('project-guides/templates').message).toBe(
      'guide.exclude entry "project-guides/templates" would remove project-guides, which cf requires.',
    );
  });

  it('does not treat a shared name prefix as protected', () => {
    expect(parseGuideExclude('scripts-old,project-guides-archive')).toEqual([
      'project-guides-archive',
      'scripts-old',
    ]);
  });
});

describe('isExcludedGuidePath()', () => {
  const patterns = ['CHANGELOG.md', 'tool-guides'];

  it('matches an exact file', () => {
    expect(isExcludedGuidePath('CHANGELOG.md', patterns)).toBe('CHANGELOG.md');
  });

  it('matches a path under a directory pattern', () => {
    expect(isExcludedGuidePath('tool-guides/x/y.md', patterns)).toBe('tool-guides');
  });

  it('matches the directory itself', () => {
    expect(isExcludedGuidePath('tool-guides', patterns)).toBe('tool-guides');
  });

  it('does not match a sibling sharing a name prefix', () => {
    expect(isExcludedGuidePath('tool-guides-old/x', patterns)).toBeNull();
  });

  it('returns null with no patterns', () => {
    expect(isExcludedGuidePath('tool-guides', [])).toBeNull();
  });
});
