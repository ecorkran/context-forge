import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { RETROACTIVE_NOTE } from '../../src/introspection/reviewGate.js';
import type { ProjectData } from '../../src/types/project.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { GATE_ENABLED_DEFAULTS, GATE_DISABLED_CONFIG } from '../helpers/workflowNavigatorFixtures.js';

const MARKER = '`retroactive`';

describe('WorkflowNavigator — retroactive active slice (slice 263 R3)', () => {
  /** A project whose plan holds two retroactive entries (100, 101) and one unchecked entry (102), none with design or task files. */
  function makeAdoptedProject(activeSlice: string, firstBox = 'x'): ProjectData {
    const root = mkdtempSync(join(tmpdir(), 'cf-nav-263-'));
    mkdirSync(join(root, 'project-documents', 'user', 'architecture'), { recursive: true });
    writeFileSync(
      join(root, 'project-documents', 'user', 'architecture', '800-slices.scratch-plan.md'),
      `---\ndocType: slice-plan\nproject: scratch-project\n---\n\n# Slice Plan: Scratch\n\n` +
        `1. [${firstBox}] **(100) Existing System** ${MARKER} — built before adoption.\n` +
        `2. [x] **(101) Existing Tooling** ${MARKER} — built before adoption.\n` +
        `3. [ ] **(102) New Work** — not started.\n`,
    );
    return {
      id: 'scratch-1',
      name: 'scratch-project',
      template: 'default',
      fileSlice: activeSlice,
      fileSlicePlan: '800-slices.scratch-plan',
      instruction: 'implementation',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
      developmentPhase: 'Phase 6: Implementation',
    };
  }

  it('reports a retroactive active slice complete with gating off', async () => {
    const status = await new WorkflowNavigator(GATE_DISABLED_CONFIG).getStatus(makeAdoptedProject('100-slice.existing-system.md'));
    expect(status.activeSlice).toMatchObject({ index: 100, status: 'complete', retroactive: true });
  });

  it('reports it complete with gating on, and evaluates no gate', async () => {
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const status = await new WorkflowNavigator(config).getStatus(makeAdoptedProject('100-slice.existing-system.md'));
    expect(status.activeSlice).toMatchObject({ index: 100, status: 'complete', retroactive: true });
    expect(status.activeSlice?.gateInfo).toBeUndefined();
    expect(status.activeSlice?.gateExempt).toBeUndefined();
  });

  it('advances getNext to the first unfinished slice and notes the retroactive history', async () => {
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const next = await new WorkflowNavigator(config).getNext(makeAdoptedProject('100-slice.existing-system.md'));
    expect(next.suggestedCommand).toBe('cf set slice 102');
    expect(next.rationale).toContain(RETROACTIVE_NOTE);
  });

  it('does not shortcut an unchecked retroactive active slice: it agrees with the plan entry (D2)', async () => {
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const status = await new WorkflowNavigator(config).getStatus(makeAdoptedProject('100-slice.existing-system.md', ' '));
    expect(status.activeSlice).toMatchObject({ index: 100, status: 'needs-design' });
    expect(status.activeSlice?.retroactive).toBeUndefined();
    expect(status.slicePlan?.entries.find((e) => e.index === 100)?.status).toBe('not_started');
  });

  it('leaves a non-retroactive slice with no design at needs-design', async () => {
    const config = makeStubConfig(GATE_ENABLED_DEFAULTS);
    const status = await new WorkflowNavigator(config).getStatus(makeAdoptedProject('102-slice.new-work.md'));
    expect(status.activeSlice).toMatchObject({ index: 102, status: 'needs-design' });
    expect(status.activeSlice?.retroactive).toBeUndefined();
  });
});
