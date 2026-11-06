import { describe, expect, it } from 'vitest';
import { buildArchiveText } from '../../src/devlog/archiveText.js';

const base = { quarterLabel: '2025 Q4', projectName: 'demo', today: '20261105' };

describe('buildArchiveText idempotence', () => {
  it('skips a section already archived as a whole section', () => {
    const existing = '# A\n\n## 20251101\n\nnote\n\n';
    expect(buildArchiveText({ ...base, existing, moved: ['## 20251101\n\nnote\n\n'] })).toBeNull();
  });

  it('still writes a section whose text is only a substring of a longer archived section', () => {
    const existing = '# A\n\n## 20251101\n\nnote and more\n\n';
    const result = buildArchiveText({ ...base, existing, moved: ['## 20251101\n\nnote\n\n'] });
    expect(result).not.toBeNull();
    expect(result!.indexOf('## 20251101\n\nnote\n\n')).toBeLessThan(result!.indexOf('note and more'));
  });
});
