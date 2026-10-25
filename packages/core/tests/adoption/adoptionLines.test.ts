import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import {
  AdoptionError,
  BROWNFIELD_LINE,
  BROWNFIELD_MIN_SOURCE_LINES,
  INCOMPLETE_ADOPTION_LINE,
  adoptionNavLines,
  inconclusiveDetectionLine,
  legacyAdoptionStateNotice,
} from '../../src/adoption/index.js';
import { ADOPTION_OPT_OUT, LEGACY_ADOPTION_STATES } from '../../src/config/ConfigKeys.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../helpers/adoptionFixtures.js';

const WALK_FAILURE_MESSAGE = 'Cannot measure source volume: EACCES at /x/src';
const PLAIN_FAILURE_MESSAGE = 'unexpected bug';
const LEGACY_VALUE = LEGACY_ADOPTION_STATES[0];

const roots: string[] = [];

function fixture(options: AdoptionFixtureOptions = {}, sourceLines?: number): string {
  const { root } = createAdoptionFixture({ ...options, sourceLines });
  roots.push(root);
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('adoptionNavLines', () => {
  it('opted out: no line, even with existing code', async () => {
    const root = fixture({ state: ADOPTION_OPT_OUT }, BROWNFIELD_MIN_SOURCE_LINES);
    expect(await adoptionNavLines(root)).toEqual({ warnings: [], skipFirstRun: false });
  });

  it('adoption incomplete: the incomplete line', async () => {
    const root = fixture({ arch: true });
    expect(await adoptionNavLines(root)).toEqual({ warnings: [INCOMPLETE_ADOPTION_LINE], skipFirstRun: false });
  });

  it('already planned with an existing-state plan: no line, first run skipped', async () => {
    const root = fixture({ arch: true, plan: ALL_RETROACTIVE_ENTRIES });
    expect(await adoptionNavLines(root)).toEqual({ warnings: [], skipFirstRun: true });
  });

  it('already planned without an existing-state plan: no line, first run not skipped', async () => {
    const root = fixture({ otherPlan: true }, BROWNFIELD_MIN_SOURCE_LINES);
    expect(await adoptionNavLines(root)).toEqual({ warnings: [], skipFirstRun: false });
  });

  it('brownfield: the brownfield line', async () => {
    const root = fixture({}, BROWNFIELD_MIN_SOURCE_LINES);
    expect(await adoptionNavLines(root)).toEqual({ warnings: [BROWNFIELD_LINE], skipFirstRun: false });
  });

  it('greenfield: no line', async () => {
    const root = fixture({}, BROWNFIELD_MIN_SOURCE_LINES - 1);
    expect(await adoptionNavLines(root)).toEqual({ warnings: [], skipFirstRun: false });
  });

  it('a legacy value adds the notice beside the row line', async () => {
    const root = fixture({ state: LEGACY_VALUE }, BROWNFIELD_MIN_SOURCE_LINES);
    expect(await adoptionNavLines(root)).toEqual({
      warnings: [legacyAdoptionStateNotice(LEGACY_VALUE), BROWNFIELD_LINE],
      skipFirstRun: false,
    });
  });

  it('a walk that throws AdoptionError gives the inconclusive line', async () => {
    const root = fixture();
    const failingWalk = () => Promise.reject(new AdoptionError(WALK_FAILURE_MESSAGE));
    expect(await adoptionNavLines(root, failingWalk)).toEqual({
      warnings: [inconclusiveDetectionLine(WALK_FAILURE_MESSAGE)],
      skipFirstRun: false,
    });
  });

  it('a walk that throws any other error propagates', async () => {
    const root = fixture();
    const buggyWalk = () => Promise.reject(new Error(PLAIN_FAILURE_MESSAGE));
    await expect(adoptionNavLines(root, buggyWalk)).rejects.toThrow(PLAIN_FAILURE_MESSAGE);
  });
});
