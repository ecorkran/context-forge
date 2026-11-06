import { afterEach, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { MIXED_ENTRIES, createAdoptionFixture } from '../helpers/adoptionFixtures.js';

const section = (date: string, body: string): string => `## ${date}\n\n${body}\n\n`;
const BIG = 'x'.repeat(300);
const DEVLOG = '# Development Log\n\n' + section('20260301', BIG) + section('20251101', BIG) + section('20250701', BIG);
const REGISTERED = { fileArch: '100-arch.existing', fileSlicePlan: '100-slices.existing' };

describe('ConsistencyChecker devlog-size rule (slice 936)', () => {
  const roots: string[] = [];
  afterEach(() => {
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  function setup(limits?: { max: number; target: number }) {
    const fixture = createAdoptionFixture({ concept: true, arch: true, plan: MIXED_ENTRIES });
    roots.push(fixture.root);
    writeFileSync(join(fixture.root, 'DEVLOG.md'), DEVLOG);
    if (limits) {
      writeFileSync(join(fixture.root, '.context-forge.toml'), `[devlog]\nmax_bytes = ${limits.max}\ntarget_bytes = ${limits.target}\n`);
    }
    return { fixture, project: fixture.project(REGISTERED) };
  }

  const checkerFor = (root: string, withConfig = true) =>
    new ConsistencyChecker(new ArtifactIntrospector(), withConfig ? new ConfigManager(root) : undefined);
  const devlogFindings = (r: { findings: { rule: string }[] }) => r.findings.filter((f) => f.rule === 'devlog-size');

  it('yields one devlog-size finding for an over-limit project', async () => {
    const { fixture, project } = setup({ max: 600, target: 450 });
    expect(devlogFindings(await checkerFor(fixture.root).checkAll(project))).toHaveLength(1);
  });

  it('is silent at or under the limit (default limits)', async () => {
    const { fixture, project } = setup();
    expect(devlogFindings(await checkerFor(fixture.root).checkAll(project))).toHaveLength(0);
  });

  it('yields nothing without a ConfigManager', async () => {
    const { fixture, project } = setup({ max: 600, target: 450 });
    expect(devlogFindings(await checkerFor(fixture.root, false).checkAll(project))).toHaveLength(0);
  });

  it('does not run for a slice-scoped check', async () => {
    const { fixture, project } = setup({ max: 600, target: 450 });
    const result = await checkerFor(fixture.root).check({ ...project, fileSlice: '102-new-work' });
    expect(devlogFindings(result)).toHaveLength(0);
  });

  it('reports an invalid limit pair as an error finding without stopping other rules', async () => {
    const { fixture, project } = setup({ max: 600, target: 600 });
    const [finding] = devlogFindings(await checkerFor(fixture.root).checkAll(project));
    expect(finding).toMatchObject({ severity: 'error', fixable: false });
  });
});
