import { describe, it, expect } from 'vitest';
import {
  requiredHeadings,
  documentHeadingKeys,
  missingHeadings,
} from '../../src/schema/sliceDesignValidator.js';

const TEMPLATE = [
  '# Slice Design: {slice-name}',
  '<!-- required -->',
  '',
  '## Overview',
  '<!-- required -->',
  '',
  '## Optional Section',
  'text',
  '',
  '## Value',
  '   <!-- required -->   ',
  '',
  '### Verification Walkthrough (agent-runnable)',
  '<!-- required -->',
].join('\n');

/** Required headings of TEMPLATE missing from a document. */
function missingFrom(doc: string, template = TEMPLATE): string[] {
  return missingHeadings(requiredHeadings(template), documentHeadingKeys(doc)).map(
    (r) => r.heading,
  );
}

describe('requiredHeadings', () => {
  it('picks headings followed by the marker and ignores unmarked ones', () => {
    const headings = requiredHeadings(TEMPLATE).map((r) => r.heading);
    expect(headings).toEqual([
      '# Slice Design: {slice-name}',
      '## Overview',
      '## Value',
      '### Verification Walkthrough (agent-runnable)',
    ]);
  });

  it('accepts the marker with surrounding whitespace', () => {
    expect(requiredHeadings('## Value\n  <!-- required -->  ')).toHaveLength(1);
  });

  it('keeps the original heading text and a normalized key', () => {
    const [first] = requiredHeadings('### Verification Walkthrough (x)\n<!-- required -->');
    expect(first.heading).toBe('### Verification Walkthrough (x)');
    expect(first.key).toEqual({ level: 3, text: 'verification walkthrough' });
  });

  it('returns nothing when the template has no markers', () => {
    expect(requiredHeadings('## Overview\n## Value')).toEqual([]);
  });
});

describe('heading normalization', () => {
  const required = '## Technical Decisions\n<!-- required -->';

  it.each([
    ['case differences', '## technical DECISIONS'],
    ['extra whitespace', '##    Technical Decisions   '],
    ['HTML comments', '## Technical Decisions <!-- note -->'],
    ['parentheticals', '## Technical Decisions (summary)'],
  ])('matches despite %s', (_label, docHeading) => {
    expect(missingFrom(docHeading, required)).toEqual([]);
  });

  it('cuts template text at a {placeholder} and prefix-matches', () => {
    expect(missingFrom('# Slice Design: Store Foundation', '# Slice Design: {slice-name}\n<!-- required -->')).toEqual([]);
  });

  it('does not treat a line without a space after # as a heading', () => {
    expect(documentHeadingKeys('#hashtag text')).toEqual([]);
  });
});

describe('missingHeadings', () => {
  it('fails on a level mismatch', () => {
    expect(missingFrom('### Value', '## Value\n<!-- required -->')).toEqual(['## Value']);
  });

  it('ignores headings inside fenced code blocks', () => {
    const doc = ['```markdown', '## Value', '```'].join('\n');
    expect(missingFrom(doc, '## Value\n<!-- required -->')).toEqual(['## Value']);
  });

  it('handles CRLF in both template and document', () => {
    const doc = '# Slice Design: X\r\n## Overview\r\n## Value\r\n### Verification Walkthrough\r\n';
    expect(missingFrom(doc, TEMPLATE.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  it('returns missing entries in template order with original text', () => {
    expect(missingFrom('# Slice Design: X\n## Value')).toEqual([
      '## Overview',
      '### Verification Walkthrough (agent-runnable)',
    ]);
  });
});
