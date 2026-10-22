import { describe, it, expect } from 'vitest';
import { classifyProbeRun, type ProbeRun } from '../../src/detection/squadronProbe.js';

function exited(stdout: string, stderr = '', exitCode = 0): ProbeRun {
  return { kind: 'exited', exitCode, stdout, stderr };
}

describe('classifyProbeRun', () => {
  it('reports not-found with no warnings', () => {
    expect(classifyProbeRun({ kind: 'not-found' })).toEqual({
      kind: 'unavailable',
      reason: { kind: 'not-found' },
      warnings: [],
    });
  });

  it('carries the detail of could-not-run', () => {
    expect(classifyProbeRun({ kind: 'could-not-run', detail: 'ETIMEDOUT' })).toEqual({
      kind: 'unavailable',
      reason: { kind: 'could-not-run', detail: 'ETIMEDOUT' },
      warnings: [],
    });
  });

  it('reports a non-zero exit and keeps the stderr line', () => {
    const outcome = classifyProbeRun(exited('', "No such command 'probe'.\n", 2));
    expect(outcome).toEqual({
      kind: 'unavailable',
      reason: { kind: 'non-zero-exit', exitCode: 2 },
      warnings: ["No such command 'probe'."],
    });
  });

  it('reports non-JSON stdout as unreadable output', () => {
    const outcome = classifyProbeRun(exited('not json'));
    expect(outcome).toMatchObject({ kind: 'unavailable', reason: { kind: 'unreadable-output' } });
  });

  it.each(['[1]', 'null', '"x"'])('reports JSON that is not an object (%s) as unreadable', (stdout) => {
    const outcome = classifyProbeRun(exited(stdout));
    expect(outcome).toMatchObject({ kind: 'unavailable', reason: { kind: 'unreadable-output' } });
  });

  it.each([
    ['{"probe_version":2}', '2'],
    ['{}', 'missing'],
    ['{"probe_version":"1"}', '"1"'],
  ])('reports %s as unsupported-version with value %s', (stdout, value) => {
    const outcome = classifyProbeRun(exited(stdout));
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: { kind: 'unsupported-version', value },
    });
  });

  it('returns the trimmed stdout unchanged as json when available', () => {
    const outcome = classifyProbeRun(exited('  {"probe_version":1,"x":null}\n'));
    expect(outcome).toEqual({
      kind: 'available',
      json: '{"probe_version":1,"x":null}',
      warnings: [],
    });
  });

  it('keeps stderr lines verbatim minus trailing whitespace and empty lines', () => {
    const outcome = classifyProbeRun(exited('{"probe_version":1}', 'WARNING a  \n\n  \nWARNING b\n'));
    expect(outcome.warnings).toEqual(['WARNING a', 'WARNING b']);
  });
});
