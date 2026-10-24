import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RESOLUTIONS_HEADING } from '../../src/ideInstall/resolutions.js';
import {
  FIXTURE_RESOLUTION,
  HAND_WRITTEN_CLAUDE,
  bullet,
  read,
  sectionOf,
  writeProjectRules,
} from './resolutionsFixture.js';
import { makeProject, makeTmpDir, run, writeFiles } from './harness.js';

const BEGIN = '<!-- BEGIN:context-forge -->';
const END = '<!-- END:context-forge -->';
const OPTIONS = { ruleResolutions: [FIXTURE_RESOLUTION] };

/** Composite files each target writes a managed block into. */
const COMPOSITES: [target: string, files: string[]][] = [
  ['claude', ['CLAUDE.md']],
  ['agents', ['AGENTS.md']],
  ['copilot', ['.github/copilot-instructions.md', 'AGENTS.md']],
  ['cursor', ['AGENTS.md']],
];

describe('resolutions rendered into every composite', () => {
  let tmp: string;
  let project: string;
  let guide: string;

  beforeEach(() => {
    tmp = makeTmpDir();
    ({ project, guide } = makeProject(tmp));
    writeProjectRules(project);
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  describe.each(COMPOSITES)('%s', (target, files) => {
    it.each(files)('%s ends its block with the section', (file) => {
      expect(run(guide, project, [target], OPTIONS).code).toBe(0);
      const text = read(project, file);
      const lines = text.split('\n');
      const begin = lines.indexOf(BEGIN);
      const end = lines.indexOf(END);
      const heading = lines.indexOf(RESOLUTIONS_HEADING);
      expect(begin).toBeGreaterThanOrEqual(0);
      expect(heading).toBeGreaterThan(begin);
      // Last thing inside the pair: heading, precedence line, blank, one bullet, then END.
      expect(lines.slice(heading, end)).toEqual([
        RESOLUTIONS_HEADING,
        "Where a rule above conflicts with the project's own rules, the resolution below applies.",
        '',
        bullet(FIXTURE_RESOLUTION),
      ]);
    });

    it('is byte-identical on a re-run', () => {
      run(guide, project, [target], OPTIONS);
      const first = files.map((f) => read(project, f));
      run(guide, project, [target], OPTIONS);
      expect(files.map((f) => read(project, f))).toEqual(first);
    });
  });

  it('leaves the project text outside the block untouched (CLAUDE.md)', () => {
    run(guide, project, ['claude'], OPTIONS);
    expect(read(project, 'CLAUDE.md').startsWith(HAND_WRITTEN_CLAUDE)).toBe(true);
  });

  it('agents: the section follows the scoped "Additional Rules" index', () => {
    run(guide, project, ['agents'], OPTIONS);
    const text = read(project, 'AGENTS.md');
    expect(text.indexOf('## Additional Rules')).toBeGreaterThan(-1);
    expect(text.indexOf(RESOLUTIONS_HEADING)).toBeGreaterThan(text.indexOf('## Additional Rules'));
  });

  it('keeps the section unchanged when a guide rule body changes but its basename stays', () => {
    run(guide, project, ['claude'], OPTIONS);
    const before = sectionOf(read(project, 'CLAUDE.md'));
    const rule = path.join(guide, 'project-guides', 'rules', 'always-a.md');
    fs.writeFileSync(rule, fs.readFileSync(rule, 'utf-8') + '\nA reworded paragraph with new headings.\n\n## New heading\n');
    run(guide, project, ['claude'], OPTIONS);
    expect(sectionOf(read(project, 'CLAUDE.md'))).toBe(before);
  });

  it('a re-run keeps project text after the block and a single section', () => {
    writeFiles(project, { 'AGENTS.md': '# Mine\n' });
    run(guide, project, ['agents'], OPTIONS);
    writeFiles(project, { 'AGENTS.md': read(project, 'AGENTS.md') + 'Trailing project note.\n' });
    run(guide, project, ['agents'], OPTIONS);
    const text = read(project, 'AGENTS.md');
    expect(text.endsWith('Trailing project note.\n')).toBe(true);
    expect(text.indexOf(RESOLUTIONS_HEADING)).toBeLessThan(text.indexOf(END));
    expect(text.split(RESOLUTIONS_HEADING)).toHaveLength(2);
  });
});
