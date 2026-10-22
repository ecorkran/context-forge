import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AdoptionError } from '../../src/adoption/contracts.js';
import { findComprehensionAnalysis } from '../../src/detection/comprehensionAnalysis.js';

// Frontmatter as squadron 362's analysis skill writes it (e.g. squadron's 944 output).
function analysisDoc(docType = 'analysis'): string {
  return `---
docType: ${docType}
project: sample
topic: codebase-comprehension
dateCreated: 20260819
dateUpdated: 20260819
status: not_started
model: claude-fable-5
---

# Codebase Comprehension — sample
`;
}

const canChmod = process.platform !== 'win32' && process.getuid?.() !== 0;

describe('findComprehensionAnalysis', () => {
  let root: string;
  let analysisDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-comprehension-'));
    analysisDir = join(root, 'project-documents', 'user', 'analysis');
  });

  afterEach(() => {
    chmodSync(root, 0o755);
    try {
      chmodSync(analysisDir, 0o755);
    } catch {
      // The directory only exists in tests that create it.
    }
    rmSync(root, { recursive: true, force: true });
  });

  function write(name: string, content = analysisDoc()): void {
    mkdirSync(analysisDir, { recursive: true });
    writeFileSync(join(analysisDir, name), content);
  }

  it('returns the single match relative to project-documents', async () => {
    write('944-analysis.codebase-comprehension.md');
    expect(await findComprehensionAnalysis(root)).toBe('user/analysis/944-analysis.codebase-comprehension.md');
  });

  it('prefers the highest index', async () => {
    write('940-analysis.codebase-comprehension.md');
    write('944-analysis.codebase-comprehension.md');
    expect(await findComprehensionAnalysis(root)).toBe('user/analysis/944-analysis.codebase-comprehension.md');
  });

  it('orders indexes numerically, not as strings', async () => {
    write('999-analysis.codebase-comprehension.md');
    write('1000-analysis.codebase-comprehension.md');
    expect(await findComprehensionAnalysis(root)).toBe('user/analysis/1000-analysis.codebase-comprehension.md');
  });

  it('skips a newer file whose docType is not analysis', async () => {
    write('940-analysis.codebase-comprehension.md');
    write('944-analysis.codebase-comprehension.md', analysisDoc('notes'));
    expect(await findComprehensionAnalysis(root)).toBe('user/analysis/940-analysis.codebase-comprehension.md');
  });

  it('matches the file name case-insensitively', async () => {
    write('944-Analysis.Codebase-Comprehension.md');
    expect(await findComprehensionAnalysis(root)).toBe('user/analysis/944-Analysis.Codebase-Comprehension.md');
  });

  it('ignores names that do not match the pattern', async () => {
    write('944-analysis.other.md');
    expect(await findComprehensionAnalysis(root)).toBeUndefined();
  });

  it('returns undefined when there is no analysis directory', async () => {
    expect(await findComprehensionAnalysis(root)).toBeUndefined();
  });

  it.skipIf(!canChmod)('throws AdoptionError when the analysis directory cannot be read', async () => {
    write('944-analysis.codebase-comprehension.md');
    chmodSync(analysisDir, 0o000);
    await expect(findComprehensionAnalysis(root)).rejects.toThrow(AdoptionError);
  });
});
