import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import {
  ADOPTION_OPT_OUT,
  BROWNFIELD_LINE,
  BROWNFIELD_MIN_SOURCE_LINES,
  DETECTION_ERROR_CODES,
  REPORT_VERSION,
  type DetectionErrorCode,
} from '@context-forge/core/node';
import { registerDetectCommand } from '../../src/commands/detect.js';
import { createAdoptionFixture, type AdoptionFixtureOptions } from '../../../core/tests/helpers/adoptionFixtures.js';

/** `cf detect` over real fixtures (slice 271 D1/D5). Only `detectProject` can be forced to throw. */

let forcedFailure: Error | null = null;

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    detectProject: (...args: Parameters<typeof actual.detectProject>) => {
      if (forcedFailure) return Promise.reject(forcedFailure);
      return actual.detectProject(...args);
    },
  };
});

const FORCED_BUG_MESSAGE = 'forced unexpected failure';
const ARCH_DIR = 'project-documents/user/architecture';
const roots: string[] = [];
let lockedDir: string | null = null;

interface Run {
  stdout: string;
  stderr: string;
  logged: string;
  exitCode: number | string | undefined;
}

function fixture(options: AdoptionFixtureOptions = {}): string {
  const { root } = createAdoptionFixture(options);
  roots.push(root);
  return root;
}

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-detect-cli-'));
  roots.push(dir);
  return dir;
}

async function runDetect(...args: string[]): Promise<Run> {
  const program = new Command();
  program.exitOverride();
  registerDetectCommand(program);
  process.exitCode = undefined;
  vi.mocked(process.stdout.write).mockClear();
  vi.mocked(process.stderr.write).mockClear();
  vi.mocked(console.log).mockClear();
  await program.parseAsync(['node', 'cf', 'detect', ...args]);
  const written = (spy: unknown): string =>
    vi.mocked(spy as typeof process.stdout.write).mock.calls.map((call) => String(call[0])).join('');
  return {
    stdout: written(process.stdout.write),
    stderr: written(process.stderr.write),
    logged: vi.mocked(console.log).mock.calls.map((call) => call.join(' ')).join('\n'),
    exitCode: process.exitCode,
  };
}

function snapshotTree(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .map((entry) => {
      const full = join(entry.parentPath, entry.name);
      const stats = statSync(full);
      return `${full}|${stats.isDirectory() ? 'dir' : stats.size}|${stats.mtimeMs}`;
    })
    .sort();
}

describe('cf detect', () => {
  beforeEach(() => {
    forcedFailure = null;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
    if (lockedDir) chmodSync(lockedDir, 0o755);
    lockedDir = null;
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  describe('--json success', () => {
    it('greenfield: the D3 shape, exit 0', async () => {
      const root = fixture();
      const run = await runDetect('--path', root, '--json');
      const report = JSON.parse(run.stdout);
      expect(report).toMatchObject({ reportVersion: REPORT_VERSION, projectRoot: root, outcome: 'greenfield' });
      expect(report.facts.source).toMatchObject({ measured: true, capped: false });
      expect(report.artifacts).toEqual({ concept: null, derivedArchitectures: [], existingStatePlan: null });
      expect(run.exitCode).toBeUndefined();
    });

    it('brownfield: the outcome and its notice, exit 0', async () => {
      const root = fixture({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES });
      const run = await runDetect('--path', root, '--json');
      const report = JSON.parse(run.stdout);
      expect(report.outcome).toBe('brownfield');
      expect(report.facts.source).toMatchObject({ measured: true, capped: true });
      expect(report.notices).toEqual([BROWNFIELD_LINE]);
      expect(run.exitCode).toBeUndefined();
    });
  });

  describe('--json failures: one envelope on stdout, nothing on stderr, exit 1', () => {
    async function expectEnvelope(run: Run, code: DetectionErrorCode): Promise<void> {
      expect(DETECTION_ERROR_CODES).toContain(code);
      const envelope = JSON.parse(run.stdout);
      expect(Object.keys(envelope)).toEqual(['reportVersion', 'error']);
      expect(envelope.reportVersion).toBe(REPORT_VERSION);
      expect(envelope.error.code).toBe(code);
      expect(envelope.error.message.length).toBeGreaterThan(0);
      expect(run.stderr).toBe('');
      expect(run.exitCode).toBe(1);
    }

    it('path-not-found', async () => {
      await expectEnvelope(await runDetect('--path', join(scratchDir(), 'missing'), '--json'), 'path-not-found');
    });

    it('invalid-config', async () => {
      await expectEnvelope(await runDetect('--path', fixture({ state: 'bogus' }), '--json'), 'invalid-config');
    });

    it('unreadable-planning', async () => {
      const root = scratchDir();
      mkdirSync(join(root, ARCH_DIR, '..'), { recursive: true });
      // A file where the architecture directory should be makes the listing fail with ENOTDIR.
      writeFileSync(join(root, ARCH_DIR), '');
      await expectEnvelope(await runDetect('--path', root, '--json'), 'unreadable-planning');
    });

    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    it.skipIf(isRoot || process.platform === 'win32')('source-unmeasurable', async () => {
      const root = fixture();
      lockedDir = join(root, 'locked');
      mkdirSync(lockedDir);
      chmodSync(lockedDir, 0o000);
      await expectEnvelope(await runDetect('--path', root, '--json'), 'source-unmeasurable');
    });

    it('internal, with the original message', async () => {
      forcedFailure = new Error(FORCED_BUG_MESSAGE);
      const run = await runDetect('--path', fixture(), '--json');
      await expectEnvelope(run, 'internal');
      expect(JSON.parse(run.stdout).error.message).toBe(FORCED_BUG_MESSAGE);
    });
  });

  describe('without --json', () => {
    it('prints the outcome and the notices', async () => {
      const run = await runDetect('--path', fixture({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
      expect(run.logged).toContain('brownfield');
      expect(run.logged).toContain(BROWNFIELD_LINE);
      expect(run.exitCode).toBeUndefined();
    });

    it('prints only the outcome when there is no notice', async () => {
      const run = await runDetect('--path', fixture({ state: ADOPTION_OPT_OUT }));
      expect(run.logged).toContain('opted-out');
      expect(run.logged.split('\n')).toHaveLength(1);
    });
  });

  it('writes nothing and leaves the project unregistered', async () => {
    const dataDir = scratchDir();
    const previousDataDir = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
    try {
      const root = fixture({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES });
      const treeBefore = snapshotTree(root);
      const configBefore = readFileSync(join(root, '.context-forge.toml'), 'utf8');
      const storeBefore = snapshotTree(dataDir);

      const run = await runDetect('--path', root, '--json');

      expect(JSON.parse(run.stdout).outcome).toBe('brownfield');
      expect(snapshotTree(root)).toEqual(treeBefore);
      expect(readFileSync(join(root, '.context-forge.toml'), 'utf8')).toBe(configBefore);
      expect(snapshotTree(dataDir)).toEqual(storeBefore);
      // Unregistered: registering would have created projects.json in the store directory.
      expect(readdirSync(dataDir)).toEqual([]);
    } finally {
      if (previousDataDir === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
      else process.env.CONTEXT_FORGE_DATA_DIR = previousDataDir;
    }
  });
});
