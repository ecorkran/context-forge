import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import {
  classifyEvidence,
  describeWeakEvidence,
} from '../../src/introspection/reviewProvenance.js';
import { parseFrontmatter } from '../../src/introspection/parsers/frontmatterParser.js';

describe('classifyEvidence (TD-3 table)', () => {
  it('absent verdictSource and recoveryTurn → strong (hand-written / pre-919 reviews)', () => {
    expect(classifyEvidence({ verdict: 'PASS' })).toBe('strong');
  });

  it('verdictSource: stated → strong', () => {
    expect(classifyEvidence({ verdictSource: 'stated' })).toBe('strong');
  });

  it('verdictSource: derived → weak', () => {
    expect(classifyEvidence({ verdictSource: 'derived' })).toBe('weak');
  });

  it('unrecognized verdictSource → weak', () => {
    expect(classifyEvidence({ verdictSource: 'garbage' })).toBe('weak');
  });

  it('recoveryTurn: false → strong', () => {
    expect(classifyEvidence({ verdictSource: 'stated', recoveryTurn: 'false' })).toBe('strong');
  });

  it('recoveryTurn: true → weak, even with verdictSource: stated', () => {
    expect(classifyEvidence({ verdictSource: 'stated', recoveryTurn: 'true' })).toBe('weak');
  });

  it('unrecognized recoveryTurn → weak', () => {
    expect(classifyEvidence({ recoveryTurn: 'yes' })).toBe('weak');
  });

  it('case and whitespace variants classify the same', () => {
    expect(classifyEvidence({ verdictSource: ' Derived ' })).toBe('weak');
    expect(classifyEvidence({ verdictSource: ' STATED ' })).toBe('strong');
    expect(classifyEvidence({ recoveryTurn: 'True' })).toBe('weak');
    expect(classifyEvidence({ recoveryTurn: ' FALSE ' })).toBe('strong');
  });

  it('empty values count as absent', () => {
    expect(classifyEvidence({ verdictSource: '', recoveryTurn: '  ' })).toBe('strong');
  });
});

describe('describeWeakEvidence', () => {
  it('names both signals when both are weak', () => {
    const description = describeWeakEvidence({ verdictSource: 'derived', recoveryTurn: 'true' });
    expect(description).toBe('derived from finding severities; recovered on a second prompt');
  });

  it('quotes the raw unrecognized value', () => {
    expect(describeWeakEvidence({ verdictSource: 'Garbage' })).toContain("'Garbage'");
  });

  it('is empty for strong evidence', () => {
    expect(describeWeakEvidence({ verdictSource: 'stated' })).toBe('');
  });
});

describe('classifyEvidence on squadron-written frontmatter', () => {
  it('reads the string-typed "true" from squadron persistence.py layout', async () => {
    // Field order and layout follow squadron _review_frontmatter_lines (v0.17.0),
    // including the nested findings block that follows.
    const dir = mkdtempSync(join(tmpdir(), 'cf-provenance-'));
    const path = join(dir, '950-review.tasks.big.md');
    writeFileSync(
      path,
      [
        '---',
        'docType: review',
        'layer: project',
        'reviewType: tasks',
        'slice: big',
        'project: context-forge',
        'verdict: PASS',
        'verdictSource: derived',
        'recoveryTurn: true',
        'sourceDocument: project-documents/user/tasks/950-tasks.big.md',
        'findings:',
        '  - id: F001',
        '    severity: pass',
        '---',
        '',
        '# Review',
      ].join('\n'),
    );

    const frontmatter = await parseFrontmatter(path);
    expect(frontmatter.data.recoveryTurn).toBe('true');
    expect(classifyEvidence(frontmatter.data)).toBe('weak');
    expect(describeWeakEvidence(frontmatter.data)).toBe(
      'derived from finding severities; recovered on a second prompt',
    );
  });
});
