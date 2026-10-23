import { describe, it, expect } from 'vitest';
import {
  NOT_EVALUATED,
  renderAdoptionFacts,
  renderSquadronFacts,
  type AdoptionFactsInput,
} from '../../src/adoption/adoptionFacts.js';
import type { ProbeOutcome, ProbeUnavailableReason } from '../../src/detection/squadronProbe.js';

const AVAILABLE: ProbeOutcome = { kind: 'available', json: '{"probe_version":1}', warnings: [] };

const base: AdoptionFactsInput = {
  outcome: { kind: 'brownfield', source: { files: 2, lines: 2000, capped: true } },
  state: 'in_progress',
  stateSetByBuild: false,
  history: { kind: 'known', commits: 42, shallow: false },
  docs: [],
  adrs: [],
  ruleFiles: [],
  ci: { recognized: false, matches: [] },
  probe: AVAILABLE,
};

const render = (overrides: Partial<AdoptionFactsInput> = {}): string =>
  renderAdoptionFacts({ ...base, ...overrides });

describe('renderAdoptionFacts', () => {
  it('starts with the heading', () => {
    expect(render().startsWith('### Adoption Facts')).toBe(true);
  });

  it('brownfield (capped): outcome says 2000+ and the threshold note', () => {
    const out = render();
    expect(out).toContain('- Outcome: brownfield: 2000+ non-blank source lines');
    expect(out).toContain('count stopped at the threshold');
  });

  it('adoption in progress names the state', () => {
    expect(render({ outcome: { kind: 'adoption-in-progress' } })).toContain(
      '- Outcome: adoption in progress',
    );
  });

  it('NOT_EVALUATED says so and omits the source volume bullet', () => {
    const out = render({ outcome: NOT_EVALUATED });
    expect(out).toContain('not evaluated (explicit brownfield-adoption instruction)');
    expect(out).not.toContain('Source volume');
  });

  it('shows the notice only when the build set the state', () => {
    expect(render({ stateSetByBuild: true })).toContain(
      'adoption.state was set to in_progress by this build. To treat the project as new instead: `cf config set adoption.state declined`.',
    );
    expect(render({ stateSetByBuild: false })).not.toContain('set to in_progress by this build');
  });

  it('adoption completed: states complete, names the plan path, omits source volume, keeps the squadron lines', () => {
    const planPath = 'project-documents/user/architecture/100-slices.existing.md';
    const out = render({
      outcome: { kind: 'adoption-completed', planPath },
      state: 'complete',
      stateSetByBuild: true,
    });
    expect(out).toContain('- Outcome: adoption completed by this build');
    expect(out).toContain(
      `- adoption.state: complete. adoption.state was set to complete by this build: existing-state slice plan found at ${planPath}. Adoption is finished; run \`cf next\` for the next step.`,
    );
    expect(out).not.toContain('Source volume');
    expect(out).not.toContain('set to in_progress');
    expect(out).toContain('- Squadron probe (`sq probe --json`), verbatim:');
  });

  it('renders an empty state as unset', () => {
    expect(render({ state: '' })).toContain('adoption.state: unset');
  });

  it('writes "none found" for empty docs, ADRs, rule files and CI', () => {
    const out = render();
    for (const label of ['Docs', 'ADRs', 'Rule files', 'CI']) {
      expect(out).toContain(`- ${label}: none found`);
    }
  });

  it('lists present items', () => {
    const out = render({
      docs: ['README.md', 'docs'],
      ci: { recognized: true, matches: ['/r/.github/workflows/ci.yml'] },
    });
    expect(out).toContain('- Docs: README.md, docs');
    expect(out).toContain('- CI: /r/.github/workflows/ci.yml');
  });

  it('reports history facts, shallow and unknown', () => {
    expect(render({ history: { kind: 'known', commits: 1, shallow: true } })).toContain('1 commits (shallow');
    expect(render({ history: { kind: 'unknown', reason: 'timed out after 5s' } })).toContain(
      '- History: unknown: timed out after 5s',
    );
  });

  it('appends the squadron lines after the other bullets', () => {
    const lines = render().split('\n');
    expect(lines.at(-1)).toBe('- Probe warnings (stderr, verbatim): none');
    expect(lines.indexOf('- Squadron probe (`sq probe --json`), verbatim:')).toBeGreaterThan(
      lines.indexOf('- CI: none found'),
    );
  });
});

describe('renderSquadronFacts', () => {
  it('available, no warnings: the JSON block equals the input and warnings read none', () => {
    expect(renderSquadronFacts({ kind: 'available', json: '{"probe_version":1,"x":null}', warnings: [] })).toEqual([
      '- Squadron probe (`sq probe --json`), verbatim:',
      '  ```json',
      '  {"probe_version":1,"x":null}',
      '  ```',
      '- Probe warnings (stderr, verbatim): none',
    ]);
  });

  it('indents every line of a multi-line JSON block', () => {
    const lines = renderSquadronFacts({ kind: 'available', json: '{\n  "a": 1\n}', warnings: [] });
    expect(lines.slice(1, 6)).toEqual(['  ```json', '  {', '    "a": 1', '  }', '  ```']);
  });

  it('available with two warnings: nested bullets in order', () => {
    const lines = renderSquadronFacts({ kind: 'available', json: '{}', warnings: ['WARNING a', 'WARNING b'] });
    expect(lines.slice(-3)).toEqual([
      '- Probe warnings (stderr, verbatim):',
      '  - WARNING a',
      '  - WARNING b',
    ]);
  });

  const reasons: Array<[ProbeUnavailableReason, string]> = [
    [{ kind: 'not-found' }, '`sq` was not found on PATH'],
    [
      { kind: 'could-not-run', detail: 'ETIMEDOUT' },
      '`sq probe` could not run or did not finish within 10 s with at most 1 MiB of output (ETIMEDOUT)',
    ],
    [{ kind: 'non-zero-exit', exitCode: 2 }, '`sq probe --json` exited with code 2'],
    [{ kind: 'unreadable-output' }, '`sq probe --json` printed output that is not a JSON object'],
    [
      { kind: 'unsupported-version', value: 'missing' },
      '`sq probe` reports probe_version missing; this cf supports 1',
    ],
  ];

  it.each(reasons)('unavailable (%o) states its reason', (reason, text) => {
    expect(renderSquadronFacts({ kind: 'unavailable', reason, warnings: [] })).toEqual([
      `- Squadron: unavailable. ${text}.`,
    ]);
  });

  it('unavailable with a stderr line shows it; without one shows no warnings line', () => {
    const lines = renderSquadronFacts({
      kind: 'unavailable',
      reason: { kind: 'non-zero-exit', exitCode: 2 },
      warnings: ["No such command 'probe'."],
    });
    expect(lines).toEqual([
      '- Squadron: unavailable. `sq probe --json` exited with code 2.',
      '- Probe warnings (stderr, verbatim):',
      "  - No such command 'probe'.",
    ]);
  });

  it('fences JSON with one more backtick than its longest run', () => {
    const three = renderSquadronFacts({ kind: 'available', json: '{"a":"```"}', warnings: [] });
    expect(three[1]).toBe('  ````json');
    expect(three[3]).toBe('  ````');
    const four = renderSquadronFacts({ kind: 'available', json: '{"a":"````"}', warnings: [] });
    expect(four[1]).toBe('  `````json');
  });

  it('fences JSON with hundreds of thousands of backtick runs without overflowing the stack', () => {
    const json = `{"a":"${'` '.repeat(300_000)}"}`;
    const lines = renderSquadronFacts({ kind: 'available', json, warnings: [] });
    expect(lines[1]).toBe('  ```json');
  });
});
