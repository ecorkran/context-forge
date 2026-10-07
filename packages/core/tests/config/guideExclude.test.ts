import { describe, it, expect } from 'vitest';
import {
  GuideExcludeError,
  matchingGuidePatterns,
  parseGuideExclude,
  sameExcludeList,
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

  describe('protected paths (D1)', () => {
    const insideProjectGuides = (entry: string): string =>
      `guide.exclude entry "${entry}" is inside project-guides, which cf requires. ` +
      'Only subpaths of project-guides/lint can be excluded.';
    const insideScripts = (entry: string): string =>
      `guide.exclude entry "${entry}" is inside scripts, which cf requires. ` +
      'Only subpaths of project-guides/lint can be excluded.';
    const wouldRemove = (entry: string, protectedPath: string): string =>
      `guide.exclude entry "${entry}" would remove ${protectedPath}, which cf requires.`;
    const wholeLint = (entry: string): string =>
      `guide.exclude entry "${entry}" would remove the whole lint directory. ` +
      'Exclude individual languages instead, e.g. "project-guides/lint/<language>".';

    it.each([
      ['project-guides/lint/csharp', ['project-guides/lint/csharp']],
      ['project-guides/lint/csharp/', ['project-guides/lint/csharp']],
      ['project-guides/lint/csharp/**', ['project-guides/lint/csharp']],
      ['project-guides/lint/csharp/rules.json', ['project-guides/lint/csharp/rules.json']],
      ['project-guides/lint/python, project-guides/lint/csharp', ['project-guides/lint/csharp', 'project-guides/lint/python']],
    ])('allows %j', (raw, expected) => {
      expect(parseGuideExclude(raw)).toEqual(expected);
    });

    it.each([
      ['project-guides/lint', wholeLint('project-guides/lint')],
      ['project-guides/lint/', wholeLint('project-guides/lint/')],
      ['project-guides/lint/**', wholeLint('project-guides/lint/**')],
      ['project-guides/rules', insideProjectGuides('project-guides/rules')],
      ['project-guides/templates', insideProjectGuides('project-guides/templates')],
      ['project-guides/lint-other', insideProjectGuides('project-guides/lint-other')],
      ['project-guides', wouldRemove('project-guides', 'project-guides')],
      ['project-guides/**', wouldRemove('project-guides/**', 'project-guides')],
      ['scripts', wouldRemove('scripts', 'scripts')],
      ['scripts/x.sh', insideScripts('scripts/x.sh')],
      ['scripts/setup-ide', insideScripts('scripts/setup-ide')],
    ])('refuses %j with the exact message', (raw, message) => {
      expect(rejection(raw).message).toBe(message);
    });

    it('refuses a list when any entry is refused, naming that entry', () => {
      expect(rejection('project-guides/lint/csharp, project-guides/rules').message).toBe(
        insideProjectGuides('project-guides/rules'),
      );
    });
  });

  it('does not treat a shared name prefix as protected', () => {
    expect(parseGuideExclude('scripts-old,project-guides-archive')).toEqual([
      'project-guides-archive',
      'scripts-old',
    ]);
  });
});

describe('matchingGuidePatterns()', () => {
  const patterns = ['CHANGELOG.md', 'tool-guides'];

  it('matches an exact file', () => {
    expect(matchingGuidePatterns('CHANGELOG.md', patterns)).toEqual(['CHANGELOG.md']);
  });

  it('matches a path under a directory pattern', () => {
    expect(matchingGuidePatterns('tool-guides/x/y.md', patterns)).toEqual(['tool-guides']);
  });

  it('matches the directory itself', () => {
    expect(matchingGuidePatterns('tool-guides', patterns)).toEqual(['tool-guides']);
  });

  it('returns every overlapping pattern', () => {
    expect(matchingGuidePatterns('tool-guides/x/y.md', ['tool-guides', 'tool-guides/x'])).toEqual([
      'tool-guides',
      'tool-guides/x',
    ]);
  });

  it('does not match a sibling sharing a name prefix', () => {
    expect(matchingGuidePatterns('tool-guides-old/x', patterns)).toEqual([]);
  });

  it('returns [] with no patterns', () => {
    expect(matchingGuidePatterns('tool-guides', [])).toEqual([]);
  });
});

describe('sameExcludeList()', () => {
  it('is true for identical lists, including two empty ones', () => {
    expect(sameExcludeList(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameExcludeList([], [])).toBe(true);
  });

  it('is false when an entry or the length differs', () => {
    expect(sameExcludeList(['a', 'b'], ['a', 'c'])).toBe(false);
    expect(sameExcludeList(['a'], ['a', 'b'])).toBe(false);
  });

  it('does not treat a comma join as equal lists', () => {
    expect(sameExcludeList(['a,b'], ['a', 'b'])).toBe(false);
  });
});
