import { describe, expect, it } from 'vitest';
import { parseDevlog } from '../../src/devlog/devlogSections.js';
import { NO_MOVE_REASON, planDevlogArchive } from '../../src/devlog/planDevlogArchive.js';
import { CF_DEVLOG_EXCERPT } from '../fixtures/devlog.js';

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const bytes = (s: string): number => Buffer.byteLength(s, 'utf8');

function plan(text: string, target: number) {
  return planDevlogArchive(parseDevlog(text), target);
}

describe('planDevlogArchive', () => {
  it('moves from the first section that exceeds the target, even if a later one is small', () => {
    const text =
      '# L\n\n' + section('20260301', 'a'.repeat(50)) + section('20260201', 'b'.repeat(500)) + section('20260101', 'c');
    const result = plan(text, 150);
    expect(result.keptText).toBe('# L\n\n' + section('20260301', 'a'.repeat(50)));
    expect(result.movedCount).toBe(2);
    expect(result.movedByQuarter.get('2026-Q1')).toHaveLength(2);
  });

  it('files an out-of-order heading by its own quarter and keeps relative order', () => {
    const text =
      section('20260301', 'new') +
      section('20260718', 'q3 late') +
      section('20260105', 'q1') +
      section('20260717', 'q3');
    const result = plan(text, bytes(section('20260301', 'new')));
    expect([...result.movedByQuarter.keys()]).toEqual(['2026-Q3', '2026-Q1']);
    expect(result.movedByQuarter.get('2026-Q3')?.map((t) => t.split('\n')[0])).toEqual(['## 20260718', '## 20260717']);
  });

  it('counts bytes, not characters', () => {
    const wide = section('20260301', 'é'.repeat(100)); // 200 bytes of body
    const text = wide + section('20260201', 'x');
    expect(wide.length).toBeLessThan(bytes(wide));
    expect(plan(text, wide.length + 5).movedCount).toBe(1);
    expect(plan(text, bytes(wide) + bytes(section('20260201', 'x'))).movedCount).toBe(0);
  });

  it('keeps one huge section whole and reports D5', () => {
    const result = plan(section('20260301', 'z'.repeat(1000)), 100);
    expect(result.movedCount).toBe(0);
    expect(result.reason).toBe(NO_MOVE_REASON.NewestExceedsTarget);
    expect(result.keptText).toBe(section('20260301', 'z'.repeat(1000)));
  });

  it('reports D3 when there are no dated headings', () => {
    const result = plan('# Log\n\n## Notes\n', 10);
    expect(result.reason).toBe(NO_MOVE_REASON.NoDatedHeadings);
    expect(result.movedCount).toBe(0);
  });

  it('handles a CRLF file', () => {
    const text = '# L\r\n\r\n## 20260301\r\n\r\nnew\r\n\r\n## 20250101\r\n\r\nold\r\n';
    const result = plan(text, 30);
    expect(result.keptText).toBe('# L\r\n\r\n## 20260301\r\n\r\nnew\r\n\r\n');
    expect(result.movedByQuarter.get('2025-Q1')).toEqual(['## 20250101\r\n\r\nold\r\n\r\n']);
  });

  it('does not let a final section without a newline join the next heading', () => {
    const result = plan('## 20260301\n\nnew\n\n## 20250101\n\nold', 20);
    const [moved] = result.movedByQuarter.get('2025-Q1') ?? [];
    expect(moved).toBe('## 20250101\n\nold\n\n');
  });

  it('keeps size at or under the target except under D5', () => {
    const text =
      '# L\n\n' +
      Array.from({ length: 30 }, (_, i) =>
        section(`2026${String((i % 12) + 1).padStart(2, '0')}01`, 'x'.repeat(40 + i)),
      ).join('');
    const result = plan(text, 600);
    expect(bytes(result.keptText)).toBeLessThanOrEqual(600);
  });

  it.each([
    ['real fixture', CF_DEVLOG_EXCERPT, 120],
    [
      'generated',
      '# L\n\n' +
        Array.from({ length: 20 }, (_, i) =>
          section(
            `2025${String((i % 12) + 1).padStart(2, '0')}${String(i + 1).padStart(2, '0')}`,
            `entry-${i} ` + 'é'.repeat(i + 3),
          ),
        ).join(''),
      300,
    ],
    ['no trailing newline', '## 20260301\n\nnew\n\n## 20250101\n\nold', 20],
  ])('conserves every section exactly once: %s', (_name, text, target) => {
    const parsed = parseDevlog(text);
    const result = planDevlogArchive(parsed, target);
    const output = [result.keptText, ...[...result.movedByQuarter.values()].flat()].join('\u0000');
    for (const s of parsed.sections) {
      const trimmed = s.text.replace(/\s+$/, '');
      expect(output.split(trimmed).length - 1).toBe(1);
    }
  });
});
