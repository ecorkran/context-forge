import { describe, it, expect, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { WorkflowNavigator } from "../../src/introspection/WorkflowNavigator.js";
import {
  BROWNFIELD_LINE,
  INCOMPLETE_ADOPTION_LINE,
} from "../../src/adoption/adoptionLines.js";
import { BROWNFIELD_MIN_SOURCE_LINES } from "../../src/adoption/adoptionOutcome.js";
import { legacyAdoptionStateNotice } from "../../src/adoption/adoptionState.js";
import {
  ADOPTION_OPT_OUT,
  LEGACY_ADOPTION_STATES,
} from "../../src/config/ConfigKeys.js";
import type { NextAction } from "../../src/introspection/types.js";
import { GATE_DISABLED_CONFIG } from "../helpers/workflowNavigatorFixtures.js";
import {
  MIXED_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from "../helpers/adoptionFixtures.js";

const CONCEPT_INSTRUCTION = "Phase 0: Concept";
const REGISTERED = {
  fileArch: "100-arch.existing",
  fileSlicePlan: "100-slices.existing",
};
const FIRST_NEW_SLICE_COMMAND = "cf set slice 102";
const BUILD_COMMAND = "cf build";
const OUT_OF_ENUM_VALUE = "bogus";
const LEGACY_VALUE = LEGACY_ADOPTION_STATES[0];
const ADOPTION_LINES = [BROWNFIELD_LINE, INCOMPLETE_ADOPTION_LINE];

const roots: string[] = [];

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

async function nextFor(
  options: AdoptionFixtureOptions,
  overrides: Parameters<
    ReturnType<typeof createAdoptionFixture>["project"]
  >[0] = {},
): Promise<NextAction> {
  const fixture = createAdoptionFixture(options);
  roots.push(fixture.root);
  return new WorkflowNavigator(GATE_DISABLED_CONFIG).getNext(
    fixture.project({ instruction: CONCEPT_INSTRUCTION, ...overrides }),
  );
}

function adoptionLinesIn(action: NextAction): string[] {
  return (action.warnings ?? []).filter((text) => ADOPTION_LINES.includes(text));
}

/** The action with the adoption lines removed: what navigation recommends on its own. */
function withoutAdoptionLines(action: NextAction): NextAction {
  const { warnings, ...rest } = action;
  const remaining = (warnings ?? []).filter((text) => !ADOPTION_LINES.includes(text));
  return remaining.length > 0 ? { ...rest, warnings: remaining } : rest;
}

// Phase 0 navigation may suggest cf build for the concept; adoption adds nothing of its own, so
// the action minus the adoption line equals the opted-out action for the same files.
async function expectNormalNavigation(action: NextAction, options: AdoptionFixtureOptions): Promise<void> {
  const declined = await nextFor({ ...options, state: ADOPTION_OPT_OUT });
  expect(withoutAdoptionLines(action)).toEqual(declined);
  expect(JSON.stringify(action.warnings ?? [])).not.toContain(BUILD_COMMAND);
}

describe("WorkflowNavigator adoption warnings (slice 269 D6)", () => {
  it("brownfield: one brownfield line on otherwise normal navigation", async () => {
    const options = { sourceLines: BROWNFIELD_MIN_SOURCE_LINES };
    const brownfield = await nextFor(options);
    expect(adoptionLinesIn(brownfield)).toEqual([BROWNFIELD_LINE]);
    await expectNormalNavigation(brownfield, options);
  });

  it("adoption incomplete: one incomplete line", async () => {
    const options = { concept: true, arch: true };
    const next = await nextFor(options);
    expect(adoptionLinesIn(next)).toEqual([INCOMPLETE_ADOPTION_LINE]);
    await expectNormalNavigation(next, options);
  });

  it("opted out: no adoption line", async () => {
    const next = await nextFor({
      state: ADOPTION_OPT_OUT,
      concept: true,
      arch: true,
      sourceLines: BROWNFIELD_MIN_SOURCE_LINES,
    });
    expect(adoptionLinesIn(next)).toEqual([]);
  });

  it("greenfield: no adoption line, navigation as before", async () => {
    const greenfield = await nextFor({ concept: true, sourceLines: BROWNFIELD_MIN_SOURCE_LINES - 1 });
    const declined = await nextFor({ state: ADOPTION_OPT_OUT, concept: true });
    expect(greenfield).toEqual(declined);
  });

  it("adopted: navigated to the first unbuilt slice", async () => {
    const next = await nextFor(
      { concept: true, arch: true, plan: MIXED_ENTRIES, sourceLines: BROWNFIELD_MIN_SOURCE_LINES },
      REGISTERED,
    );
    expect(adoptionLinesIn(next)).toEqual([]);
    expect(next.suggestedCommand).toBe(FIRST_NEW_SLICE_COMMAND);
  });

  it("legacy value: the notice joins the warnings", async () => {
    const next = await nextFor({ state: LEGACY_VALUE, sourceLines: BROWNFIELD_MIN_SOURCE_LINES });
    expect(next.warnings).toContain(legacyAdoptionStateNotice(LEGACY_VALUE));
    expect(adoptionLinesIn(next)).toEqual([BROWNFIELD_LINE]);
  });

  it("writes nothing to the config", async () => {
    const fixture = createAdoptionFixture({ state: LEGACY_VALUE, concept: true, arch: true });
    roots.push(fixture.root);
    const before = fixture.configBytes();
    await new WorkflowNavigator(GATE_DISABLED_CONFIG).getNext(fixture.project());
    expect(fixture.configBytes()).toBe(before);
  });

  it("rejects an out-of-enum adoption.state with the readAdoptionOptOut message", async () => {
    const attempt = nextFor({ state: OUT_OF_ENUM_VALUE, concept: true });
    await expect(attempt).rejects.toThrow(
      `adoption.state is "${OUT_OF_ENUM_VALUE}", which is not one of`,
    );
  });
});
