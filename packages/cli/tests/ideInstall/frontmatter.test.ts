import { describe, expect, it } from 'vitest';
import {
  convertPathsToGlobs,
  frontmatterWarning,
  getApplyTo,
  getFrontmatterField,
  hasAlwaysApply,
  stripNameField,
} from '../../src/ideInstall/frontmatter.js';

describe('hasAlwaysApply', () => {
  it('is true for alwaysApply: true inside the frontmatter', () => {
    expect(hasAlwaysApply('---\nalwaysApply: true\n---\nbody\n')).toBe(true);
    expect(hasAlwaysApply('---\nalwaysApply:true\n---\n')).toBe(true);
  });

  it('is false once the frontmatter closes without it', () => {
    expect(hasAlwaysApply('---\nalwaysApply: false\n---\nalwaysApply: true\n')).toBe(false);
  });

  it('counts unclosed frontmatter and no frontmatter as always-on', () => {
    expect(hasAlwaysApply('---\ndescription: x\n')).toBe(true);
    expect(hasAlwaysApply('# Just a heading\n')).toBe(true);
    expect(hasAlwaysApply('')).toBe(true);
  });

  it('does not treat a CRLF fence as a fence', () => {
    expect(hasAlwaysApply('---\r\nalwaysApply: false\r\n---\r\n')).toBe(true);
  });
});

describe('frontmatterWarning', () => {
  it('passes a scoped rule', () => {
    expect(frontmatterWarning('---\ndescription: d\npaths:\n  - x\n---\n', 'a.mdc')).toBeNull();
  });

  it('flags each missing piece in order', () => {
    expect(frontmatterWarning('no fences\n', 'a.mdc')).toBe('⚠️  WARNING: a.mdc missing frontmatter');
    expect(frontmatterWarning('---\nglobs: x\n---\n', 'a.mdc')).toBe(
      "⚠️  WARNING: a.mdc missing 'description' in frontmatter",
    );
    expect(frontmatterWarning('---\ndescription: d\n---\n', 'a.mdc')).toBe(
      "⚠️  WARNING: a.mdc missing 'paths', 'globs', or 'alwaysApply' in frontmatter",
    );
  });

  it('greps the whole file, not just the frontmatter', () => {
    expect(frontmatterWarning('---\n---\ndescription: in body\nglobs: too\n', 'a.mdc')).toBeNull();
  });
});

describe('getApplyTo', () => {
  it('joins paths with commas and strips quotes', () => {
    expect(getApplyTo('---\npaths:\n  - "**/*.aa"\n  - "**/*.ab"\n---\n')).toBe('**/*.aa,**/*.ab');
  });

  it('stops collecting at the next key', () => {
    expect(getApplyTo('---\npaths:\n  - a\nother: b\n  - c\n---\n')).toBe('a');
  });

  it('pins #40: no paths gives the default twice, newline-separated', () => {
    expect(getApplyTo('---\ndescription: d\n---\nbody\n')).toBe('**\n**');
  });

  it('gives the default once with no frontmatter', () => {
    expect(getApplyTo('body only\n')).toBe('**');
  });

  it('is empty for unclosed frontmatter with paths', () => {
    expect(getApplyTo('---\npaths:\n  - a\n')).toBe('');
  });
});

describe('getFrontmatterField', () => {
  it('returns the first match inside the frontmatter, one quote pair stripped', () => {
    expect(getFrontmatterField('---\nname: "a"\nname: b\n---\n', 'name')).toBe('a');
    expect(getFrontmatterField('---\ndescription:   ""x""\n---\n', 'description')).toBe('"x"');
  });

  it('ignores the body and returns empty when absent', () => {
    expect(getFrontmatterField('---\nx: 1\n---\nname: body\n', 'name')).toBe('');
  });
});

describe('convertPathsToGlobs', () => {
  it('turns paths into globs (quotes kept) and drops name', () => {
    const source = '---\nname: n\ndescription: d\npaths:\n  - "**/*.aa"\n  - "**/*.ab"\n---\n\n# Body\n';
    expect(convertPathsToGlobs(source)).toBe(
      '---\ndescription: d\nglobs: ["**/*.aa", "**/*.ab"]\n---\n\n# Body\n',
    );
  });

  it('reopens frontmatter mode on a later fence in the body', () => {
    const source = '---\npaths:\n  - a\n---\nbody\n---\nname: gone\n---\n';
    expect(convertPathsToGlobs(source)).toBe('---\nglobs: [a]\n---\nbody\n---\nglobs: [a]\n---\n');
  });

  it('adds a final newline the source lacked', () => {
    expect(convertPathsToGlobs('---\ndescription: d\n---\nbody')).toBe('---\ndescription: d\n---\nbody\n');
  });
});

describe('stripNameField', () => {
  it('drops name only inside the first frontmatter block', () => {
    expect(stripNameField('---\nname: a\nx: 1\n---\nname: kept\n---\nname: kept too\n---\n')).toBe(
      '---\nx: 1\n---\nname: kept\n---\nname: kept too\n---\n',
    );
  });
});
