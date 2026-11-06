import { describe, expect, it } from 'vitest';
import { headingQuarter, parseDevlog, quarterKey } from '../../src/devlog/devlogSections.js';
import { CF_DEVLOG_EXCERPT, SQUADRON_ARCHIVE_EXCERPT } from '../fixtures/devlog.js';

describe('parseDevlog', () => {
  it('parses every real heading form in order, with quarters', () => {
    const { preamble, sections } = parseDevlog(CF_DEVLOG_EXCERPT);
    expect(preamble).toContain('# Development Log');
    expect(preamble).toContain('Format: `## YYYY-MM-DD`');
    expect(sections.map((s) => [s.heading, quarterKey(s)])).toEqual([
      ['## 20260331', '2026-Q1'],
      ['## 2026-11-03', '2026-Q4'],
      ['## 2026-07-17', '2026-Q3'],
      ['## 2026-07-18', '2026-Q3'],
      ['## 2026-07-05 – 2026-07-06', '2026-Q3'],
      ['## 2025-11-18 (reconstructed from git)', '2025-Q4'],
      ['## 2025-10 (summary)', '2025-Q4'],
      ['## 2025-09 (summary)', '2025-Q3'],
    ]);
  });

  it('round-trips byte for byte', () => {
    const { preamble, sections } = parseDevlog(CF_DEVLOG_EXCERPT);
    expect(preamble + sections.map((s) => s.text).join('')).toBe(CF_DEVLOG_EXCERPT);
  });

  it('parses a squadron-format archive with a preamble citing #141', () => {
    const { preamble, sections } = parseDevlog(SQUADRON_ARCHIVE_EXCERPT);
    expect(preamble).toContain('(#141)');
    expect(sections.map((s) => s.heading)).toEqual(['## 20260930', '## 20260701']);
  });

  it('treats invalid month or day as undated', () => {
    expect(headingQuarter('## 2026-13-01')).toBeNull();
    expect(headingQuarter('## 2026-00')).toBeNull();
    expect(headingQuarter('## 2026-02-32')).toBeNull();
    expect(headingQuarter('## 20261301')).toBeNull();
    expect(headingQuarter('## 2026-11-03')).toEqual({ year: 2026, quarter: 4 });
  });

  it('does not treat a level-3 heading or a longer digit run as dated', () => {
    expect(headingQuarter('### 2026-11-03')).toBeNull();
    expect(headingQuarter('## 202611031')).toBeNull();
  });

  it('ignores a ## line inside a code fence', () => {
    const text = '## 2026-01-01\n\n```\n## 2026-02-02\n```\n';
    expect(parseDevlog(text).sections).toHaveLength(1);
  });

  it('keeps a literal template heading in the preamble', () => {
    const { preamble, sections } = parseDevlog('# Log\n\n## YYYYMMDD\n\nnotes\n\n## 20260101\n\nx\n');
    expect(preamble).toContain('## YYYYMMDD');
    expect(sections).toHaveLength(1);
  });

  it('keeps an undated ## below a dated one inside the section above', () => {
    const { sections } = parseDevlog('## 20260101\n\na\n\n## Notes\n\nb\n\n## 20250101\n\nc\n');
    expect(sections).toHaveLength(2);
    expect(sections[0].text).toContain('## Notes');
  });

  it('gives no sections when there are no dated headings', () => {
    const parsed = parseDevlog('# Log\n\n## Notes\n');
    expect(parsed.sections).toEqual([]);
    expect(parsed.preamble).toBe('# Log\n\n## Notes\n');
  });

  it('preserves CRLF', () => {
    const text = '# Log\r\n\r\n## 20260101\r\n\r\na\r\n';
    const { preamble, sections } = parseDevlog(text);
    expect(sections[0].heading).toBe('## 20260101');
    expect(preamble + sections[0].text).toBe(text);
  });

  it('parses a file without a trailing newline', () => {
    const { sections } = parseDevlog('## 20260101\n\nlast line');
    expect(sections[0].text).toBe('## 20260101\n\nlast line');
  });
});

describe('code fence types', () => {
  it('a shorter or different fence inside a fence does not close it', () => {
    const text = '## 20260101\n\n````\n```\n## 20250101\n```\n````\n\n## 20241201\n\nx\n';
    expect(parseDevlog(text).sections.map((s) => s.heading)).toEqual(['## 20260101', '## 20241201']);
    const tilde = '## 20260101\n\n~~~\n```\n## 20250101\n~~~\n';
    expect(parseDevlog(tilde).sections).toHaveLength(1);
  });
});
