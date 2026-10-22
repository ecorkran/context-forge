import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  classifyProbeRun,
  runProbeProcess,
  runSquadronProbe,
  type ProbeRun,
} from '../../src/detection/squadronProbe.js';

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

describe('runProbeProcess', () => {
  const dirs: string[] = [];
  const limits = { timeoutMs: 5000, maxBufferBytes: 1024 * 1024 };

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Writes a script into a fresh temp dir and returns a command that runs it with node. */
  function fakeCommand(source: string): { dir: string; command: { file: string; args: string[] } } {
    const dir = mkdtempSync(join(tmpdir(), 'cf-probe-'));
    dirs.push(dir);
    const script = join(dir, 'fake.mjs');
    writeFileSync(script, source);
    return { dir, command: { file: process.execPath, args: [script] } };
  }

  it('reports a missing executable as not-found', async () => {
    const run = await runProbeProcess({ file: 'cf-test-no-such-command-262', args: [] }, tmpdir(), limits);
    expect(run).toEqual({ kind: 'not-found' });
  });

  it('captures stdout and stderr of a clean exit', async () => {
    const { dir, command } = fakeCommand(
      "process.stdout.write('out text'); process.stderr.write('err text');",
    );
    expect(await runProbeProcess(command, dir, limits)).toEqual({
      kind: 'exited',
      exitCode: 0,
      stdout: 'out text',
      stderr: 'err text',
    });
  });

  it('reports a non-zero exit code with its stderr', async () => {
    const { dir, command } = fakeCommand("process.stderr.write('bad'); process.exit(3);");
    expect(await runProbeProcess(command, dir, limits)).toEqual({
      kind: 'exited',
      exitCode: 3,
      stdout: '',
      stderr: 'bad',
    });
  });

  it('runs in the given working directory', async () => {
    const { dir, command } = fakeCommand('process.stdout.write(process.cwd());');
    const run = await runProbeProcess(command, dir, limits);
    expect(run).toMatchObject({ kind: 'exited', stdout: realpathSync(dir) });
  });

  it('reports a timeout as could-not-run', async () => {
    const { dir, command } = fakeCommand('setTimeout(() => {}, 5000);');
    const run = await runProbeProcess(command, dir, { ...limits, timeoutMs: 200 });
    expect(run.kind).toBe('could-not-run');
    expect(run.kind === 'could-not-run' && run.detail.length).toBeGreaterThan(0);
  });

  it('reports output over the buffer as could-not-run', async () => {
    const { dir, command } = fakeCommand("process.stdout.write('x'.repeat(2048));");
    const run = await runProbeProcess(command, dir, { ...limits, maxBufferBytes: 1024 });
    expect(run.kind).toBe('could-not-run');
  });
});

describe('runSquadronProbe', () => {
  it('returns an outcome instead of throwing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf-probe-'));
    try {
      // Which reason applies depends on the machine's `sq`, so only the kind is asserted.
      // Spawn failures are in the type: the wrapper never rejects.
      const outcome = await runSquadronProbe(dir);
      expect(['available', 'unavailable']).toContain(outcome.kind);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
