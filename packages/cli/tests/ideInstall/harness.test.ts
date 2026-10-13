/**
 * Tests for the harness itself: normalization and snapshot text. The guide's
 * missing-snapshot gate test is not ported: a missing `.snap` is handled by
 * vitest's own toMatchFileSnapshot rules (it fails in CI).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTmpDir, normalize, snapshot, writeFiles } from './harness.js';

let tmp: string;
afterEach(() => {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

describe('harness', () => {
  it('test_harness_normalize_strips_ansi_and_replaces_paths', () => {
    tmp = makeTmpDir();
    const root = path.join(tmp, 'project');
    const guide = path.join(root, 'project-documents', 'ai-project-guide');
    fs.mkdirSync(guide, { recursive: true });
    const text =
      `\x1b[0;32m✅ ok ${guide}/scripts\x1b[0m\n` +
      `root ${root}/CLAUDE.md\n` +
      'sandbox /private/var/folders/ab/cd/T/tmp.Xy12/claude\n' +
      'sandbox /var/folders/ab/cd/T/tmp.Zz34\n' +
      'plain /tmp/tmp.Qq56/x\n';
    expect(normalize(text, root, guide)).toBe(
      '✅ ok <GUIDE>/scripts\n' +
        'root <ROOT>/CLAUDE.md\n' +
        'sandbox <TMP>\n' +
        'sandbox <TMP>\n' +
        'plain <TMP>\n',
    );
  });

  it('test_harness_normalize_handles_private_prefix_variants', () => {
    tmp = makeTmpDir();
    const root = path.join(tmp, 'project');
    const guide = path.join(root, 'guide');
    fs.mkdirSync(guide, { recursive: true });
    // The same directory spelled with and without macOS's /private prefix.
    const real = fs.realpathSync(root);
    const plain = real.startsWith('/private/') ? real.slice('/private'.length) : real;
    const prefixed = '/private' + plain;
    expect(normalize(`${plain}/x`, root, guide)).toBe('<ROOT>/x');
    expect(normalize(`${prefixed}/x`, root, guide)).toBe('<ROOT>/x');
  });

  it('test_harness_snapshot_lists_sorted_files_with_visible_cr', () => {
    tmp = makeTmpDir();
    writeFiles(tmp, {
      '.claude/rules/b.md': 'b\n',
      '.claude/rules/a.md': 'a\n',
      'CLAUDE.md': Buffer.from('line one\r\nline two'),
      'project-documents/ignored.md': 'not listed\n',
      'unrelated.txt': 'not listed\n',
    });
    fs.mkdirSync(path.join(tmp, '.claude', 'empty'));
    const guide = path.join(tmp, 'guide');
    fs.mkdirSync(guide);
    const runs = [{ args: ['claude'], code: 0, stdout: 'out\n', stderr: '', guide }];

    const text = snapshot(tmp, runs);

    expect(text.startsWith('== run 1: setup-ide claude\nexit: 0\n-- stdout\nout\n')).toBe(true);
    expect(text.split('== files\n')[1]).toBe(
      '--- .claude/empty/ (empty directory)\n' +
        '--- .claude/rules/a.md\n' +
        'a\n' +
        '--- .claude/rules/b.md\n' +
        'b\n' +
        '--- CLAUDE.md\n' +
        'line one\\r\n' +
        'line two\n' +
        '<no final newline>\n',
    );
  });
});
