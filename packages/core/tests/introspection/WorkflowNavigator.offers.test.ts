import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkflowNavigator } from '../../src/introspection/WorkflowNavigator.js';
import { SETUP_CI_OFFER_ID } from '../../src/introspection/types.js';
import { makeStubConfig } from '../helpers/stubConfig.js';
import { makeProject } from '../helpers/workflowNavigatorFixtures.js';

const SLICE_FILE = '500-slice.offers.md';
const PENDING_DESIGN = '---\ndocType: slice-design\n---\n# Design\n### D1 — Open question\nStatus: pending-pm\n';

const BASE_CONFIG = { 'workflow.decision_gate_enabled': true, 'workflow.review_enabled': false };
const offerOn = makeStubConfig({ ...BASE_CONFIG, 'workflow.setup_ci_offer': true });
const offerOff = makeStubConfig({ ...BASE_CONFIG, 'workflow.setup_ci_offer': false });

describe('WorkflowNavigator — setup-ci offer (slice 260)', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-nav-offers-'));
    await mkdir(join(root, 'project-documents/user/slices'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{}');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const project = () => makeProject({ fileSlice: SLICE_FILE, projectPath: root });

  it('attaches the offer to a normal result', async () => {
    const next = await new WorkflowNavigator(offerOn).getNext(project());
    expect(next.offers?.[0].id).toBe(SETUP_CI_OFFER_ID);
  });

  it('attaches the offer to a gate-blocked result without changing the block', async () => {
    await writeFile(join(root, 'project-documents/user/slices', SLICE_FILE), PENDING_DESIGN);
    const next = await new WorkflowNavigator(offerOn).getNext(project());
    const baseline = await new WorkflowNavigator(offerOff).getNext(project());
    expect(next.recommendation).toBe('Blocked: design has pending PM decisions');
    expect(next.offers?.[0].id).toBe(SETUP_CI_OFFER_ID);
    expect({ ...next, offers: undefined }).toEqual({ ...baseline, offers: undefined });
  });

  it('turns an offer I/O error into a warning and leaves the recommendation alone', async () => {
    await mkdir(join(root, '.github'));
    await writeFile(join(root, '.github', 'workflows'), '');
    const next = await new WorkflowNavigator(offerOn).getNext(project());
    const baseline = await new WorkflowNavigator(offerOff).getNext(project());
    expect(next.offers).toBeUndefined();
    expect(next.warnings?.some((w) => w.includes(join(root, '.github', 'workflows')))).toBe(true);
    expect(next.recommendation).toBe(baseline.recommendation);
  });

  it('makes no offer when the navigator has no config', async () => {
    const next = await new WorkflowNavigator().getNext(project());
    expect(next.offers).toBeUndefined();
  });
});
