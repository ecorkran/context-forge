// Contract test (slice 262 D8): the v1 field names live here and nowhere in src/.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { classifyProbeRun } from '../../src/detection/squadronProbe.js';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures/squadron-probe/v1.json',
);

const TOP_LEVEL_KEYS = ['baseline', 'graph', 'probe_version', 'sq_version', 'surfaces'];
const SURFACE_KEYS = [
  'analysis_skill_installed',
  'concept',
  'entry',
  'graph_build',
  'understand_plugin_installed',
];
const GRAPH_KEYS = ['commit', 'commits_behind', 'path', 'present'];
const BASELINE_KEYS = ['available'];

const fixtureText = readFileSync(FIXTURE_PATH, 'utf8');
const fixture = JSON.parse(fixtureText) as Record<string, Record<string, Record<string, unknown>>>;

describe('squadron probe v1 contract', () => {
  it('has exactly the contract keys at every level', () => {
    expect(Object.keys(fixture).sort()).toEqual(TOP_LEVEL_KEYS);
    expect(Object.keys(fixture.graph).sort()).toEqual(GRAPH_KEYS);
    expect(Object.keys(fixture.baseline).sort()).toEqual(BASELINE_KEYS);
    // Surface names are not part of the contract; every entry has the same keys.
    const surfaces = Object.values(fixture.surfaces);
    expect(surfaces.length).toBeGreaterThan(0);
    for (const surface of surfaces) {
      expect(Object.keys(surface).sort()).toEqual(SURFACE_KEYS);
    }
  });

  it('classifies the fixture as available with the text unchanged', () => {
    const outcome = classifyProbeRun({ kind: 'exited', exitCode: 0, stdout: fixtureText, stderr: '' });
    expect(outcome).toEqual({ kind: 'available', json: fixtureText.trim(), warnings: [] });
  });

  it('classifies a newer probe_version as unsupported', () => {
    const newer = JSON.stringify({ ...fixture, probe_version: 2 });
    const outcome = classifyProbeRun({ kind: 'exited', exitCode: 0, stdout: newer, stderr: '' });
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: { kind: 'unsupported-version', value: '2' },
    });
  });
});
