import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPendingDecisions } from '../../src/schema/pendingDecisions.js';
import { VALID_STATUSES } from '../../src/schema/frontmatterSchema.js';
import {
  GUIDE_RELATIVE_PATH,
  SLICE_DESIGN_TEMPLATE_RELATIVE_PATH,
} from '../../src/guides/types.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** A one-decision design body with the given status line under `### D1 — Example`. */
function designWith(statusLine: string): string {
  return ['# Design', '', '### D1 — Example', statusLine, '', 'Body.'].join('\n');
}

describe('findPendingDecisions — blocks', () => {
  // Pins the pending-word list. Widening or narrowing it is a deliberate behavior change.
  it.each([
    'pending-pm',
    'pending_pm',
    'pending',
    'tbd',
    'undecided',
    'open',
  ])('blocks on the word %s', (word) => {
    expect(findPendingDecisions(designWith(`Status: ${word}`))).toHaveLength(1);
  });

  it.each([
    ['trailing period', 'Status: pending-pm.'],
    ['trailing semicolon', 'Status: pending-pm;'],
    ['prose after the word', 'Status: Pending-PM — waiting on PM'],
    ['trailing emphasis', 'Status: pending-pm*'],
    ['two-word form', 'Status: pending pm'],
    ['uppercase word', 'Status: TBD'],
    ['bold label', '**Status:** pending-pm'],
    ['bold label, colon outside', '**Status**: pending-pm'],
    ['underscore emphasis', '__Status:__ pending-pm'],
    ['bullet label', '- Status: pending-pm'],
    ['star bullet and bold', '* **Status:** pending-pm'],
    ['lowercase label', 'status: Pending PM'],
    ['no space after the colon', 'Status:pending-pm'],
    ['bold value', 'Status: **pending-pm**'],
    ['indented 4-space code block', '    Status: pending-pm'],
    ['blockquote', '> Status: pending-pm'],
    ['nested blockquote', '> > Status: pending-pm'],
  ])('blocks on %s', (_name, line) => {
    expect(findPendingDecisions(designWith(line))).toEqual([
      { heading: 'D1 — Example', line: 4 },
    ]);
  });
});

describe('findPendingDecisions — does not block', () => {
  it.each([
    ['decided', 'Status: decided'],
    ['decided with period', 'Status: decided.'],
    ['decided with prose', 'Status: Decided — PM 20261017'],
    ['misspelling', 'Status: pendng-pm'],
    ['empty value', 'Status:'],
    ['executed prose', '**Status:** Executed and verified'],
    ['scrapped prose', '**STATUS: SCRAPPED**'],
    ['shipped prose', 'Status: shipped in 0.12'],
    ['inline code', '`Status: pending-pm`'],
    ['label not at line start', 'The Status: pending-pm form is documented elsewhere'],
  ])('ignores %s', (_name, line) => {
    expect(findPendingDecisions(designWith(line))).toEqual([]);
  });

  it.each(VALID_STATUSES)('ignores frontmatter vocabulary value %s', (value) => {
    expect(findPendingDecisions(designWith(`Status: ${value}`))).toEqual([]);
  });

  it('ignores the design frontmatter status field', () => {
    const text = ['---', 'docType: slice-design', 'status: pending', '---', '# Design'].join('\n');
    expect(findPendingDecisions(text)).toEqual([]);
  });

  it('ignores a pending line inside a backtick fence', () => {
    const text = ['# Design', '### D1 — Example', '```', 'Status: pending-pm', '```'].join('\n');
    expect(findPendingDecisions(text)).toEqual([]);
  });

  it('ignores a pending line inside a tilde fence', () => {
    const text = ['# Design', '~~~markdown', 'Status: pending-pm', '~~~'].join('\n');
    expect(findPendingDecisions(text)).toEqual([]);
  });

  it('blocks again after the fence closes', () => {
    const text = ['# Design', '```', 'x', '```', 'Status: pending-pm'].join('\n');
    expect(findPendingDecisions(text)).toHaveLength(1);
  });
});

describe('findPendingDecisions — attribution', () => {
  it('names each pending decision by its own heading and line', () => {
    const text = [
      '### D1 — First',
      'Status: pending-pm',
      '### D2 — Second',
      'Status: decided',
      '### D3 — Third',
      'Status: tbd',
    ].join('\n');
    expect(findPendingDecisions(text)).toEqual([
      { heading: 'D1 — First', line: 2 },
      { heading: 'D3 — Third', line: 6 },
    ]);
  });

  it('tells duplicate headings apart by line', () => {
    const text = ['### Same', 'Status: open', '### Same', 'Status: open'].join('\n');
    expect(findPendingDecisions(text)).toEqual([
      { heading: 'Same', line: 2 },
      { heading: 'Same', line: 4 },
    ]);
  });

  it('uses the placeholder when no heading precedes the line', () => {
    expect(findPendingDecisions('Status: pending-pm')).toEqual([
      { heading: '(no heading)', line: 1 },
    ]);
  });

  it('does not use a heading inside a fence', () => {
    const text = ['## Real', '```', '## Fake', '```', 'Status: pending-pm'].join('\n');
    expect(findPendingDecisions(text)).toEqual([{ heading: 'Real', line: 5 }]);
  });

  it('counts lines past frontmatter and handles CRLF', () => {
    const text = ['---', 'status: complete', '---', '## D1', 'Status: pending-pm'].join('\r\n');
    expect(findPendingDecisions(text)).toEqual([{ heading: 'D1', line: 5 }]);
  });

  it('flags only the pending decision in an amoeba-108-style design', () => {
    const text = [
      '---',
      'docType: slice-design',
      'status: in_progress',
      '---',
      '## Technical Decisions',
      '',
      '### D1 — Storage location',
      'Status: decided',
      'Body text.',
      '',
      '### D6 — Retry policy',
      '**Status:** Decided — PM 20261001',
      '',
      '### D7 — Where amoeba finds the CF data directory',
      'Status: pending-pm',
      'Open question for the PM.',
    ].join('\n');
    expect(findPendingDecisions(text)).toEqual([
      { heading: 'D7 — Where amoeba finds the CF data directory', line: 15 },
    ]);
  });
});

describe('findPendingDecisions — real documents', () => {
  it('finds nothing in the installed slice-design template', () => {
    const templatePath = resolve(
      REPO_ROOT,
      GUIDE_RELATIVE_PATH,
      SLICE_DESIGN_TEMPLATE_RELATIVE_PATH,
    );
    // readFileSync throws if the template is missing, which fails the test rather than skipping it.
    expect(findPendingDecisions(readFileSync(templatePath, 'utf-8'))).toEqual([]);
  });

  it("finds nothing in this slice's own design", () => {
    const designPath = resolve(
      REPO_ROOT,
      'project-documents/user/slices/245-slice.pending-decision-gate.md',
    );
    expect(findPendingDecisions(readFileSync(designPath, 'utf-8'))).toEqual([]);
  });
});
