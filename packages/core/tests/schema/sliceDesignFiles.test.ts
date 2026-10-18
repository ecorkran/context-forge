import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateSliceDesignFiles,
  SliceDesignValidationError,
  DesignFailureReason,
} from '../../src/schema/sliceDesignFiles.js';
import { requiredHeadings } from '../../src/schema/sliceDesignValidator.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const REAL_TEMPLATE = join(
  REPO_ROOT,
  'project-documents/ai-project-guide/project-guides/templates/slice-design.md',
);
const REAL_DESIGN = join(
  REPO_ROOT,
  'project-documents/user/slices/214-slice.native-slice-design-validation.md',
);

const GATE_ON = { decisionGateEnabled: true };
const GATE_OFF = { decisionGateEnabled: false };

let tmpDir: string;
let designText: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'sdf-test-'));
  designText = await readFile(REAL_DESIGN, 'utf-8');
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeTmp(name: string, content: string): Promise<string> {
  const filePath = join(tmpDir, name);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** The 214 design with the `## Value` section removed. */
function withoutValueSection(text: string): string {
  return text.replace(/^## Value\n[\s\S]*?(?=^## Technical Scope$)/m, '');
}

describe('real template', () => {
  it('declares required headings, including Overview and Verification Walkthrough', async () => {
    const headings = requiredHeadings(await readFile(REAL_TEMPLATE, 'utf-8')).map((r) => r.heading);
    expect(headings.length).toBeGreaterThan(0);
    expect(headings).toContain('## Overview');
    expect(headings).toContain('### Verification Walkthrough');
  });

  it('passes the 214 slice design', async () => {
    const results = await validateSliceDesignFiles(REAL_TEMPLATE, [REAL_DESIGN], GATE_ON);
    expect(results).toEqual([{ path: REAL_DESIGN, pass: true, missing: [], pending: [] }]);
  });
});

describe('validateSliceDesignFiles', () => {
  it('reports exactly the missing heading', async () => {
    const file = await writeTmp('broken.md', withoutValueSection(designText));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON);
    expect(result).toEqual({ path: file, pass: false, missing: ['## Value'], pending: [] });
  });

  it('fails a file without docType with the doctype reason', async () => {
    const file = await writeTmp('nodoc.md', designText.replace(/^docType:.*\n/m, ''));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON);
    expect(result).toEqual({ path: file, pass: false, missing: [], pending: [], reason: DesignFailureReason.DocType });
  });

  it('accepts a quoted docType', async () => {
    const file = await writeTmp('quoted.md', designText.replace(/^docType:.*$/m, 'docType: "slice-design"'));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON);
    expect(result.pass).toBe(true);
  });

  it('checks every file in order when an earlier one fails', async () => {
    const broken = await writeTmp('broken.md', withoutValueSection(designText));
    const results = await validateSliceDesignFiles(REAL_TEMPLATE, [broken, REAL_DESIGN], GATE_ON);
    expect(results.map((r) => [r.path, r.pass])).toEqual([
      [broken, false],
      [REAL_DESIGN, true],
    ]);
  });
});

describe('pending decisions', () => {
  /** The 214 design with a pending status line appended under its own heading. */
  const withPending = (text: string): string => `${text}\n### D99 — Open question\nStatus: pending-pm\n`;

  it('fails a design with a pending decision when the gate is on', async () => {
    const file = await writeTmp('pending.md', withPending(designText));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON);
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual([]);
    expect(result.pending).toEqual([
      { heading: 'D99 — Open question', line: designText.split('\n').length + 2 },
    ]);
  });

  it('passes the same design with an empty pending list when the gate is off', async () => {
    const file = await writeTmp('pending.md', withPending(designText));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_OFF);
    expect(result).toEqual({ path: file, pass: true, missing: [], pending: [] });
  });

  it('reports a missing heading and a pending decision together', async () => {
    const file = await writeTmp('both.md', withPending(withoutValueSection(designText)));
    const [result] = await validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON);
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual(['## Value']);
    expect(result.pending).toHaveLength(1);
  });
});

describe('errors', () => {
  it('names cf guides update when the template is missing', async () => {
    const run = validateSliceDesignFiles(join(tmpDir, 'nope.md'), [REAL_DESIGN], GATE_ON);
    await expect(run).rejects.toThrow(SliceDesignValidationError);
    await expect(run).rejects.toThrow(/cf guides update/);
  });

  it('rejects a template with no required markers', async () => {
    const template = await writeTmp('template.md', '## Overview\n## Value\n');
    await expect(validateSliceDesignFiles(template, [REAL_DESIGN], GATE_ON)).rejects.toThrow(
      /template declares no required headings/,
    );
  });

  it('rejects a required heading with no matchable text', async () => {
    const template = await writeTmp('template.md', '## Overview\n<!-- required -->\n## {placeholder}\n<!-- required -->\n');
    await expect(validateSliceDesignFiles(template, [REAL_DESIGN], GATE_ON)).rejects.toThrow(
      /template heading '## \{placeholder\}' has no matchable text/,
    );
  });

  it('returns no results when a valid file precedes a missing one', async () => {
    const missing = join(tmpDir, 'missing.md');
    const run = validateSliceDesignFiles(REAL_TEMPLATE, [REAL_DESIGN, missing], GATE_ON);
    await expect(run).rejects.toThrow(SliceDesignValidationError);
    await expect(run).rejects.toThrow(`no such file: ${missing}`);
  });

  it('rejects a directory passed as a file', async () => {
    const dir = join(tmpDir, 'adir');
    await mkdir(dir);
    await expect(validateSliceDesignFiles(REAL_TEMPLATE, [dir], GATE_ON)).rejects.toThrow(
      new SliceDesignValidationError(`not a regular file: ${dir}`),
    );
  });

  const cannotBlockReads = process.getuid?.() === 0 || process.platform === 'win32';
  it.skipIf(cannotBlockReads)('rejects an unreadable file', async () => {
    const file = await writeTmp('locked.md', designText);
    await chmod(file, 0o000);
    await expect(validateSliceDesignFiles(REAL_TEMPLATE, [file], GATE_ON)).rejects.toThrow(
      new SliceDesignValidationError(`cannot read file: ${file}`),
    );
  });
});
