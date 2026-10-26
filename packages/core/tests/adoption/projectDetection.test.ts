import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AdoptionError,
  BROWNFIELD_LINE,
  BROWNFIELD_MIN_SOURCE_LINES,
  DETECTION_ERROR_CODES,
  DetectionError,
  INCOMPLETE_ADOPTION_LINE,
  OVERRIDE_REMEDY,
  detectProject,
  legacyAdoptionStateNotice,
  outcomeLine,
  type ProjectDetection,
} from '../../src/adoption/index.js';
import { ADOPTION_OPT_OUT, LEGACY_ADOPTION_STATES } from '../../src/config/ConfigKeys.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  ARCH_FILE,
  CONCEPT_FILE,
  PLAN_FILE,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../helpers/adoptionFixtures.js';

const GUIDES_DIR = 'project-documents/user/project-guides';
const ARCH_DIR = 'project-documents/user/architecture';
const CI_FILE = '.github/workflows/ci.yml';
const OUT_OF_SET_STATE = 'not-a-state';
const UNPARSEABLE_TOML = 'adoption = [unclosed\n';
const WALK_FAILURE = `Cannot measure source volume: EACCES at /x/src. ${OVERRIDE_REMEDY}`;
const LEGACY_VALUE = LEGACY_ADOPTION_STATES[0];

const roots: string[] = [];

function track(root: string): string {
  roots.push(root);
  return root;
}

function fixture(options: AdoptionFixtureOptions = {}): string {
  return track(createAdoptionFixture(options).root);
}

function tempDir(): string {
  return track(mkdtempSync(join(tmpdir(), 'cf-detect-')));
}

function writeAt(root: string, relativePath: string, body = ''): void {
  const full = join(root, relativePath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, body);
}

async function detectionErrorOf(attempt: Promise<unknown>): Promise<DetectionError> {
  try {
    await attempt;
  } catch (error) {
    if (error instanceof DetectionError) return error;
    throw error;
  }
  throw new Error('expected a DetectionError, but the call succeeded');
}

const failingWalk = () => Promise.reject(new AdoptionError(WALK_FAILURE));

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('detectProject outcomes', () => {
  it('opted-out: no notice, even with existing code', async () => {
    const result = await detectProject(fixture({ state: ADOPTION_OPT_OUT, sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(result.outcome.kind).toBe('opted-out');
    expect(result.notices).toEqual([]);
  });

  it('adoption-incomplete: the incomplete line and the derived architecture', async () => {
    const result = await detectProject(fixture({ concept: true, arch: true }));
    expect(result.outcome.kind).toBe('adoption-incomplete');
    expect(result.artifacts).toEqual({
      concept: `${GUIDES_DIR}/${CONCEPT_FILE}`,
      derivedArchitectures: [`${ARCH_DIR}/${ARCH_FILE}`],
      existingStatePlan: null,
    });
    expect(result.notices).toEqual([INCOMPLETE_ADOPTION_LINE]);
  });

  it('already-planned: all three artifacts, no notice', async () => {
    const result = await detectProject(fixture({ concept: true, arch: true, plan: ALL_RETROACTIVE_ENTRIES }));
    expect(result.outcome.kind).toBe('already-planned');
    expect(result.artifacts.existingStatePlan).toBe(`${ARCH_DIR}/${PLAN_FILE}`);
    expect(result.notices).toEqual([]);
  });

  it('brownfield: capped source and the brownfield line', async () => {
    const result = await detectProject(fixture({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(result.outcome.kind).toBe('brownfield');
    expect(result.source).toMatchObject({ measured: true, capped: true });
    expect(result.notices).toEqual([BROWNFIELD_LINE]);
  });

  it('greenfield: measured, not capped, no notice', async () => {
    const result = await detectProject(fixture());
    expect(result.outcome.kind).toBe('greenfield');
    expect(result.source).toMatchObject({ measured: true, capped: false });
    expect(result.notices).toEqual([]);
  });

  it('notices come from outcomeLine', async () => {
    const result = await detectProject(fixture({ sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(result.notices).toEqual([outcomeLine(result.outcome)]);
  });

  it('a stored legacy adoption.state puts the legacy notice first', async () => {
    const result = await detectProject(fixture({ state: LEGACY_VALUE, sourceLines: BROWNFIELD_MIN_SOURCE_LINES }));
    expect(result.notices).toEqual([legacyAdoptionStateNotice(LEGACY_VALUE), BROWNFIELD_LINE]);
  });
});

describe('detectProject facts', () => {
  it('a directory outside git has unknown history with a reason', async () => {
    const result = await detectProject(fixture());
    expect(result.history.kind).toBe('unknown');
    expect(result.history.kind === 'unknown' && result.history.reason.length).toBeGreaterThan(0);
  });

  it('a monorepo subdirectory is judged on the subfolder, with root-level CI reported by a climbing path', async () => {
    const repo = tempDir();
    mkdirSync(join(repo, '.git'));
    writeAt(repo, CI_FILE);
    const project = join(repo, 'packages', 'app');
    mkdirSync(project, { recursive: true });
    const result = await detectProject(project);
    expect(result.projectRoot).toBe(project);
    expect(result.ci).toEqual([`../../${CI_FILE}`]);
  });

  it('reports every path except projectRoot as relative', async () => {
    const root = fixture({ concept: true, arch: true, plan: ALL_RETROACTIVE_ENTRIES });
    writeAt(root, 'README.md');
    writeAt(root, 'CLAUDE.md');
    writeAt(root, 'docs/adr/0001.md');
    writeAt(root, CI_FILE);
    const result = await detectProject(root);
    const paths = [
      ...result.docs,
      ...result.adrs,
      ...result.ci,
      ...result.ruleFiles,
      ...result.artifacts.derivedArchitectures,
      result.artifacts.concept,
      result.artifacts.existingStatePlan,
    ].filter((path): path is string => path !== null);
    expect(paths.length).toBeGreaterThan(5);
    paths.forEach((path) => expect(path.startsWith('/')).toBe(false));
  });
});

describe('detectProject errors', () => {
  async function codeOf(attempt: Promise<ProjectDetection>): Promise<string> {
    const error = await detectionErrorOf(attempt);
    expect(DETECTION_ERROR_CODES).toContain(error.code);
    return error.code;
  }

  it('path-not-found for a missing path', async () => {
    const missing = join(tempDir(), 'missing');
    expect(await codeOf(detectProject(missing))).toBe('path-not-found');
  });

  it('path-not-found for a file path', async () => {
    const root = tempDir();
    writeAt(root, 'a-file.txt');
    const error = await detectionErrorOf(detectProject(join(root, 'a-file.txt')));
    expect(error.code).toBe('path-not-found');
    expect(error.message).toContain('not a directory');
  });

  it('invalid-config for an out-of-set adoption.state', async () => {
    expect(await codeOf(detectProject(fixture({ state: OUT_OF_SET_STATE })))).toBe('invalid-config');
  });

  it('invalid-config for unparseable TOML', async () => {
    const root = fixture();
    writeAt(root, '.context-forge.toml', UNPARSEABLE_TOML);
    expect(await codeOf(detectProject(root))).toBe('invalid-config');
  });

  it('unreadable-planning when a planning directory cannot be listed', async () => {
    const root = tempDir();
    // A file where the architecture directory should be makes readdir fail with ENOTDIR.
    writeAt(root, ARCH_DIR);
    expect(await codeOf(detectProject(root))).toBe('unreadable-planning');
  });

  it('a non-absolute root is a programming error, not a DetectionError', async () => {
    const error = await detectProject('relative/path').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DetectionError);
  });
});

describe('detectProject with a failing source walk', () => {
  it('a planned project still reports, with the source unmeasured', async () => {
    const root = fixture({ arch: true, plan: ALL_RETROACTIVE_ENTRIES });
    const result = await detectProject(root, failingWalk);
    expect(result.outcome.kind).toBe('already-planned');
    expect(result.source).toEqual({ measured: false, reason: WALK_FAILURE });
  });

  it('an unplanned project fails with source-unmeasurable and the remedy exactly once', async () => {
    const error = await detectionErrorOf(detectProject(fixture(), failingWalk));
    expect(error.code).toBe('source-unmeasurable');
    expect(error.message).toBe(WALK_FAILURE);
    expect(error.message.split(OVERRIDE_REMEDY)).toHaveLength(2);
  });

  it('a walk that throws any other error propagates', async () => {
    const buggyWalk = () => Promise.reject(new Error('unexpected bug'));
    await expect(detectProject(fixture(), buggyWalk)).rejects.toThrow('unexpected bug');
  });
});
