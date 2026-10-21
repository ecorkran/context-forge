import { describe, it, expect } from 'vitest';
import {
  NOT_EVALUATED,
  renderAdoptionFacts,
  renderSquadronFact,
  type AdoptionFactsInput,
} from '../../src/adoption/adoptionFacts.js';

const base: AdoptionFactsInput = {
  outcome: { kind: 'brownfield', source: { files: 2, lines: 2000, capped: true } },
  state: 'in_progress',
  stateSetByBuild: false,
  history: { kind: 'known', commits: 42, shallow: false },
  docs: [],
  adrs: [],
  ruleFiles: [],
  ci: { recognized: false, matches: [] },
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

  it('the squadron bullet comes from renderSquadronFact()', () => {
    expect(render()).toContain(`- ${renderSquadronFact()}`);
  });
});
