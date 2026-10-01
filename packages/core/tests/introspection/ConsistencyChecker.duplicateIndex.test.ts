import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { describe, it, expect } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { parseSlicePlan } from '../../src/introspection/parsers/slicePlanParser.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

const GATE_ENABLED = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_weak_pass_as': 'pass',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
};

/** Writes a plan file in the real slice-plan format and a slice design for index 5. */
function makePlanProject(planLines: string[]): { root: string; planPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'cf-dup-index-'));
  const user = join(root, 'project-documents', 'user');
  mkdirSync(join(user, 'architecture'), { recursive: true });
  mkdirSync(join(user, 'slices'), { recursive: true });
  const planPath = join(user, 'architecture', '100-slices.dup.md');
  writeFileSync(planPath, ['---', 'docType: slice-plan', '---', '', '## Slices', '', ...planLines, ''].join('\n'));
  writeFileSync(join(user, 'slices', '5-slice.real.md'), '---\nslice: real\nstatus: complete\n---\n');
  return { root, planPath };
}

/** Real introspector, with the plan parsed from the real file regardless of project config. */
function introspectorFor(planPath: string): IArtifactIntrospector {
  const real = new ArtifactIntrospector();
  return {
    parseSlicePlan: () => parseSlicePlan(planPath),
    parseTaskFile: real.parseTaskFile.bind(real),
    parseFrontmatter: real.parseFrontmatter.bind(real),
    parseFutureWork: real.parseFutureWork.bind(real),
    detectDocuments: real.detectDocuments.bind(real),
    summarize: real.summarize.bind(real),
  };
}

function makeProject(root: string): ProjectData {
  return {
    id: 'dup-1',
    name: 'dup-project',
    template: 'default',
    fileSlice: '5-slice.real',
    fileSlicePlan: '100-slices.dup',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-10-01',
    projectPath: root,
  };
}

// Four unindexed entries before the explicit (5): the fifth unindexed entry is
// auto-numbered 5 and sorts ahead of '(5) Real' (stable sort, file order).
const MIXED_PLAN = [
  '1. [ ] **Alpha** — one',
  '2. [ ] **Beta** — two',
  '3. [ ] **Gamma** — three',
  '4. [ ] **Delta** — four',
  '5. [ ] **Epsilon** — five',
  '6. [x] **(5) Real** — the real slice',
];

describe('ConsistencyChecker — #67 fallback index collision', () => {
  it('mixed explicit/fallback collision → source-aware wording and fix', async () => {
    const { root, planPath } = makePlanProject(MIXED_PLAN);
    const result = await new ConsistencyChecker(introspectorFor(planPath)).checkAll(makeProject(root));

    const dup = result.findings.filter((f) => f.rule === 'duplicate-index');
    expect(dup).toHaveLength(1);
    expect(dup[0].description).toBe(
      "Slice index 5: '(5) Real' collides with auto-numbered unindexed entry 'Epsilon'",
    );
    expect(dup[0].suggestedFix).toBe('Give the unindexed entry an explicit (NNN) index');
  });

  it('two explicit entries sharing an index → unchanged wording', async () => {
    const { root, planPath } = makePlanProject([
      '1. [ ] **(5) Real** — one',
      '2. [ ] **(5) Other** — two',
    ]);
    const result = await new ConsistencyChecker(introspectorFor(planPath)).checkAll(makeProject(root));

    const dup = result.findings.find((f) => f.rule === 'duplicate-index');
    expect(dup?.description).toBe("Duplicate slice index 5: 'Real' and 'Other'");
    expect(dup?.suggestedFix).toBe('Renumber one of the entries');
  });

  it('checkSlice resolves index 5 to the explicit entry, not the placeholder', async () => {
    // '(5) Real' is checked, 'Epsilon' isn't. The code-review gate only runs for a
    // checked plan entry, so its pending finding proves which entry was resolved.
    const { root, planPath } = makePlanProject(MIXED_PLAN);
    const checker = new ConsistencyChecker(introspectorFor(planPath), makeStubConfig(GATE_ENABLED));
    const result = await checker.check(makeProject(root));

    const codeFinding = result.findings.find(
      (f) => f.rule === 'review-gate' && f.suggestedFix.includes('code review'),
    );
    expect(codeFinding).toBeDefined();
  });
});
