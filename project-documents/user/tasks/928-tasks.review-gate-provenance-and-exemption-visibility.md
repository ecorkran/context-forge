---
docType: tasks
slice: review-gate-provenance-and-exemption-visibility
project: context-forge
lld: user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md
dependencies: []
projectState: main is at 6edc49c with 0.18.1 published; #106 per-part review gating (20ffeb0) is on main, unreleased. Slice 928 design is revised after a CONCERNS review (F001–F006 resolved in the design; 240-arch contract principle already amended). No code written for this slice. evaluateReviewGate still returns null for gating-off, exempt, and clears alike.
dateCreated: 20261001
dateUpdated: 20261001
status: not_started
---

## Context Summary

- Working on slice 928: GitHub #89 (`verdictSource: derived`), #105
  (`recoveryTurn: true`), #83 (`review: none` exemptions invisible;
  `--set-review-none` silent), plus #67 (slice-plan fallback index collision)
  as a rider.
- Design decisions TD-1–TD-7 and the Review Resolution section are settled.
  Do not relitigate. Key points:
  - `evaluateReviewGate` returns a `GateResult` union; `null` means only
    "gating off" (TD-1).
  - One config key `workflow.review_weak_pass_as`, default `pass`; a weak PASS
    is evaluated as a stand-in verdict; no new gate status (TD-2).
  - Absent provenance = no signal; present-but-unrecognized = weak (TD-3).
  - Provenance is classified per split-review part (TD-4).
  - `SliceStatus.gateExempt?: ExemptReason` (typed, not free text); all display
    text from one `EXEMPT_NOTE` map; `cf check` info findings for exemptions
    and weak clears, incomplete plan entries only (TD-5).
  - `--set-review-none` requires `--yes` or an interactive "y" (TD-6).
  - #67: diagnostic wording + lookup preference only; parser unchanged (TD-7).
- **Default behavior must not change.** With `review_weak_pass_as` unset, every
  gate decision is identical to today. The only default-visible additions are
  `info` findings in `cf check` and a rationale suffix in `cf next`.
- Prerequisite: #106 per-part loop in `reviewGate.ts` (on main).
- Delivers: provenance-aware gate, exemption and weak-clear visibility,
  confirmed `--set-review-none`, #67 diagnostics.
- Next planned slice: none scheduled.

Full rationale: `user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md`.

**Testing locally:** the global `cf` is the published npm build. Use
`node packages/cli/dist/index.js` after `pnpm -r build`.

**Mid-implementation note:** `deriveSliceStatus` evaluates no gate for a slice
with task progress that isn't complete. Task 11 covers that case with
`evaluateExemption` (extracted in Task 1), so the `cf next` note shows at every
stage.

## Branch Setup

- [ ] **Task 0: Create slice branch**
  - [ ] Run `cf config get git.integration_branch`; the target is its value, or `main` if empty
  - [ ] `git checkout -b 928-slice.review-gate-provenance-and-exemption-visibility {target}`
  - [ ] Success: on the new branch, `git status` clean

## Part 1 — GateResult Refactor (no behavior change)

- [ ] **Task 1: Introduce `GateResult` in `reviewGate.ts`** (effort 2)
  - [ ] In `packages/core/src/introspection/reviewGate.ts`, add an `as const` object `EXEMPT_REASON` with keys for `review-none` and `grandfathered`, and derive `type ExemptReason` from it (see the `LogLevel` pattern in `.claude/rules/typescript.md`)
  - [ ] Add exported `type GateResult` per design TD-1: `{ status: 'clears'; weakParts: string[] }` | `{ status: 'exempt'; reason: ExemptReason; rationale: string }` | `GateEvaluation`
  - [ ] Add exported type guard `isBlockingGate(result: GateResult | null): result is GateEvaluation` (true for `pending-review` / `review-failed`)
  - [ ] Extract the grandfather and `review: none` checks (near lines 207–221) into an exported pure function `evaluateExemption(boundary, gate: ResolvedGate, gatedFrontmatter: Record<string, string> | null)` returning the `exempt` variant or `null` (design TD-5, mid-implementation bullet). No I/O: callers pass the frontmatter they already parsed
    - [ ] Grandfather → `exempt` with `grandfathered` reason and a short rationale naming the effective date
    - [ ] `review: none` (not at `preSlicePlan`) → `exempt` with `review-none` reason
  - [ ] Change `evaluateReviewGate` return type to `Promise<GateResult | null>`:
    - [ ] Call `evaluateExemption` with the gated artifact's parsed frontmatter (existing code near line 198); return its result when non-null
    - [ ] Final `return null` after the per-part loop → `{ status: 'clears', weakParts: [] }`
    - [ ] Gating-off path (`gate === null`) still returns `null`
  - [ ] Update the JSDoc on `evaluateReviewGate` to describe the four outcomes
  - [ ] No string literals for exempt reasons outside `EXEMPT_REASON`
  - [ ] Success: `pnpm --filter @context-forge/core exec tsc --noEmit` reports errors only at the two caller files (fixed in Tasks 2–3)

- [ ] **Task 2: Update `WorkflowNavigator` callers** (effort 2)
  - [ ] `evaluateGate()` (near line 696) returns `Promise<GateResult | null>`; update its JSDoc
  - [ ] The arch gate in `getNext` (near line 175, `preSlicePlan`): replace `if (gate)` with `if (isBlockingGate(gate))`
  - [ ] The three `deriveSliceStatus` gate sites (`preTasks`, `preAdvance`, `preImplementation`): replace `if (gate)` with `if (isBlockingGate(gate))`
  - [ ] Success: `clears` and `exempt` fall through exactly as `null` did; core typechecks for this file

- [ ] **Task 3: Update `ConsistencyChecker` callers** (effort 2)
  - [ ] `safeEvaluateGate` (near line 580) returns `{ gate: GateResult | null; errorFinding }`
  - [ ] `ruleReviewGate` and `ruleArchReviewGate`: replace `if (result === null) continue;` with `if (!isBlockingGate(result)) continue;` so `buildGateFinding` still receives a `GateEvaluation`
  - [ ] Success: `pnpm --filter @context-forge/core exec tsc --noEmit` is clean

- [ ] **Task 4: Refactor tests and checkpoint** (effort 2)
  - [ ] In `packages/core/tests/introspection/reviewGate.test.ts` and `reviewGate.cutoffIntegration.test.ts`, update assertions that expect `null` for a clearing, `review: none`, or grandfathered case to expect the matching `GateResult` variant. Assertions for gating-off keep `null`
  - [ ] Add tests for design criterion 9: `review-none` exempt at `preTasks`, `preImplementation`, `preAdvance`; `grandfathered` below the effective date; `{ status: 'clears', weakParts: [] }` for a passing review; `null` only when gating is off
  - [ ] Unit-test `evaluateExemption` directly: `review: none` exempt at slice boundaries but not `preSlicePlan`; grandfather cutoff; empty effective date; `null` frontmatter → `null`
  - [ ] Add a test that `preSlicePlan` with `grandfathered` produces no `cf check` finding (`ruleArchReviewGate` treats it as nothing to flag)
  - [ ] Navigator and checker suites pass **unmodified** (proves no behavior change)
  - [ ] Success: `pnpm --filter @context-forge/core test` passes
  - [ ] Commit: `refactor(core): return GateResult union from evaluateReviewGate`

## Part 2 — Provenance and Weak-PASS Policy

- [ ] **Task 5: Rename `UnknownPolicy` → `StandInPolicy`** (effort 1)
  - [ ] In `reviewGate.ts`: rename the type, `KNOWN_UNKNOWN_POLICIES` → `KNOWN_STAND_IN_POLICIES`, `parseUnknownPolicy` → `parseStandInPolicy`; update `evaluateVerdict`'s parameter and `ResolvedGate.unknownAs`
  - [ ] No alias for the old name (it is not exported from the package)
  - [ ] Update any test file references (`grep -rn UnknownPolicy packages/` returns nothing afterward)
  - [ ] Success: core typechecks and tests pass

- [ ] **Task 6: Add `workflow.review_weak_pass_as` config key** (effort 1)
  - [ ] In `packages/core/src/config/ConfigKeys.ts`, add the key next to `workflow.review_unknown_as`: type string, default `pass`, enum `['pass', 'concerns', 'fail']`, scope `ConfigScope.Shared`
  - [ ] Description text from the design's API Contracts table
  - [ ] Success: `node packages/cli/dist/index.js config get workflow.review_weak_pass_as` (after build) prints `pass`

- [ ] **Task 7: Implement `classifyEvidence` in `reviewProvenance.ts`** (effort 2)
  - [ ] Create `packages/core/src/introspection/reviewProvenance.ts` (keeps `reviewGate.ts` near 300 lines)
    - [ ] Note: design TD-3 places `PROVENANCE` in `reviewGate.ts`; this move is the design's own ~300-line escape hatch (Technical Requirements). `reviewProvenance.ts` is the single source of truth for provenance tokens. Do not move them back. `EXEMPT_REASON` / `EXEMPT_NOTE` stay in `reviewGate.ts`
  - [ ] Define one `as const` object `PROVENANCE` holding the field names (`verdictSource`, `recoveryTurn`) and recognized tokens (`stated`, `derived`, `true`, `false`)
  - [ ] Export `type EvidenceStrength = 'strong' | 'weak'` and `classifyEvidence(data: Record<string, string>): EvidenceStrength` implementing design TD-3's table exactly (trim + lowercase before comparing)
  - [ ] Export a helper that returns a short human description of the weak signals present (for example `derived from finding severities`, `recovered on a second prompt`), used by Task 9's rationale and Task 13's finding text. Text defined once, here
  - [ ] Never throws on any input
  - [ ] Success: compiles; no provenance string literals outside this file

- [ ] **Task 8: Test `classifyEvidence`** (effort 2)
  - [ ] New file `packages/core/tests/introspection/reviewProvenance.test.ts`
  - [ ] One case per row of TD-3's table, including absent `verdictSource`, `recoveryTurn: false`, `verdictSource: garbage`, `recoveryTurn: yes`
  - [ ] Case/whitespace variants (`" Derived "`) classify the same
  - [ ] Both fields weak → weak; description helper names both signals
  - [ ] At least one fixture parsed through `parseFrontmatter` from a file using squadron's real layout (`verdictSource: derived` on its own line followed by `recoveryTurn: true`, per `squadron/src/squadron/review/persistence.py` `_review_frontmatter_lines`), so the string-typed `"true"` path is exercised
  - [ ] Success: tests pass

- [ ] **Task 9: Apply the weak-PASS policy in `evaluateReviewGate`** (effort 3)
  - [ ] `ResolvedGate` gains `weakPassAs: StandInPolicy`; `resolveGateConfig` reads `workflow.review_weak_pass_as` through `parseStandInPolicy` (bad value throws, naming the key)
  - [ ] Inside the #106 per-part loop: when the normalized verdict is `PASS` and `classifyEvidence` returns `weak`, evaluate the stand-in verdict for `weakPassAs` via `evaluateVerdict` instead of PASS. Reuse the existing stand-in mapping; do not duplicate it
  - [ ] Weak part that does not clear → `review-failed` with that part's path as `artifactPath`, and a rationale naming the provenance description, the stand-in verdict, the threshold, and `workflow.review_weak_pass_as` (see design Data Flow step 3)
  - [ ] Weak part that clears → collect its path into `weakParts`; continue the loop
  - [ ] Return `{ status: 'clears', weakParts }` when every part clears
  - [ ] CONCERNS, FAIL, and UNKNOWN verdicts are not affected by provenance
  - [ ] Success: core typechecks; `reviewGate.ts` stays around 300 lines

- [ ] **Task 10: Test the weak-PASS policy** (effort 3)
  - [ ] In `reviewGate.test.ts` (or a new `reviewGate.provenance.test.ts` if the file would pass ~450 lines), cover design criteria 1–8:
    - [ ] 1: key unset → derived PASS clears, with its path in `weakParts`
    - [ ] 2: `concerns` + threshold `pass` → derived PASS is `review-failed`; rationale contains `derived` and `workflow.review_weak_pass_as`
    - [ ] 3: same as 2 for `recoveryTurn: true` with `verdictSource: stated`
    - [ ] 4: `concerns` + threshold `concerns` → derived PASS clears
    - [ ] 5: `fail` → derived PASS blocks at both thresholds
    - [ ] 6: stated / absent / `recoveryTurn: false` are never weak; garbage values are weak; none throw
    - [ ] 7: CONCERNS and FAIL give identical results with and without provenance keys
    - [ ] 8: split review [stated PASS, derived PASS] under `fail` → `review-failed` with `artifactPath` = the derived part
  - [ ] Invalid `review_weak_pass_as` value → `resolveGateConfig` throws naming the key
  - [ ] Success: `pnpm --filter @context-forge/core test` passes
  - [ ] Commit: `feat(core): gate weak-provenance PASS verdicts via review_weak_pass_as`

## Part 3 — Exemption and Weak-Clear Visibility

- [ ] **Task 11: Exemption note in `cf next`** (effort 2)
  - [ ] In `reviewGate.ts`, add exported `EXEMPT_NOTE: Record<ExemptReason, string>`; the `review-none` entry reads `review gate skipped: slice declares review: none`. This is the only place that text exists
  - [ ] `SliceStatus` (`packages/core/src/introspection/types.ts` near line 296) gains `gateExempt?: ExemptReason` with a JSDoc line
  - [ ] `deriveSliceStatus`: when any gate it evaluates returns `exempt` with reason `review-none`, set `gateExempt` on the returned status. `grandfathered` is not surfaced
  - [ ] Mid-implementation branch (final `in-implementation` return, where no gate is evaluated): when `this.config` is set and `resolveGateConfig` returns non-null, parse `docs.sliceDesign` frontmatter and call `evaluateExemption('preImplementation', gate, frontmatter.data)`; set `gateExempt` on a `review-none` result. Never block from this branch
  - [ ] `getNext`'s `enrich()` (near line 286): when `slice.gateExempt` is set, append ` (${EXEMPT_NOTE[slice.gateExempt]})` to the action's `rationale`. Confirm `slice` is in scope at `enrich`'s definition; if not, pass it in rather than duplicating the append at each call site
  - [ ] Success: core typechecks

- [ ] **Task 12: Test the exemption note** (effort 2)
  - [ ] New file `packages/core/tests/introspection/WorkflowNavigator.reviewVisibility.test.ts` (do not grow `WorkflowNavigator.test.ts`, already ~1500 lines)
  - [ ] Gating on, `review: none` slice with a design and no task file → `getNext` rationale ends with the `EXEMPT_NOTE` text; `getStatus().activeSlice.gateExempt === 'review-none'`
  - [ ] Same `review: none` slice mid-implementation (some tasks checked, not all) → note present, status still `in-implementation`
  - [ ] Same slice with all tasks complete → note present
  - [ ] Same slice with gating off → no note, no `gateExempt`
  - [ ] Grandfathered slice → no note
  - [ ] Normal passing slice → no note
  - [ ] Success: tests pass

- [ ] **Task 13: `cf check` info findings** (effort 3)
  - [ ] In `ConsistencyChecker.ruleReviewGate`, track per slice whether any boundary returned `exempt` / `review-none`; after the boundary loop, emit **one** `info` finding (`rule: 'review-gate'`, `fixable: false`, location = slice design absolute path) when `planEntry` exists and `!planEntry.isChecked`. Description built from `EXEMPT_NOTE` and matching design TD-5's example
  - [ ] For each boundary returning `clears` with non-empty `weakParts`, emit one `info` finding per weak part under the same plan-entry rule. Location = that review's absolute path. Description uses Task 7's provenance description and names `workflow.review_weak_pass_as` (see TD-5 example)
  - [ ] `ruleArchReviewGate` emits nothing for `exempt` or `clears` (unchanged from Task 3)
  - [ ] Success: core typechecks

- [ ] **Task 14: Test the `cf check` findings** (effort 2)
  - [ ] In `packages/core/tests/introspection/ConsistencyChecker.reviewGate.test.ts`:
    - [ ] Exempt slice, unchecked plan entry, design + task file present → exactly one `info` exemption finding (not one per boundary)
    - [ ] Exempt slice, checked plan entry → none
    - [ ] Derived PASS at default policy, unchecked entry → one `info` finding naming the review path and `derived`
    - [ ] Same with checked entry → none
    - [ ] Clean stated PASS → no finding
  - [ ] MCP parity (criteria 10, 11, 11a; Integration Requirements). In `packages/mcp-server/tests/workflowTools.test.ts`:
    - [ ] `workflow_next` constructs `WorkflowNavigator` with a `ConfigManager` for the project path (gating depends on it), mirroring the existing `workflow_check` construction test
    - [ ] `workflow_next` returns a `getNext` rationale containing `EXEMPT_NOTE['review-none']` unchanged
    - [ ] `workflow_check` returns an `info` `review-gate` finding unchanged, and counts it in `infos`
  - [ ] Success: `pnpm --filter @context-forge/core test` and `pnpm --filter @context-forge/mcp test` pass
  - [ ] Commit: `feat(core): surface review exemptions and weak-provenance clears`

## Part 4 — `--set-review-none` Confirmation

- [ ] **Task 15: Remove the duplicate `askConfirmation`** (effort 1)
  - [ ] In `packages/cli/src/commands/check.ts`, delete the private `askConfirmation` (near line 38) and import it from `../utils/confirm.js`
  - [ ] Remove the now-unused `readline` import if nothing else uses it
  - [ ] Success: CLI typechecks; existing `cf check --fix` tests pass

- [ ] **Task 16: Add confirmation to `setReviewNoneAction`** (effort 2)
  - [ ] After resolving the slice design and before `updateFrontmatterField`, apply design TD-6:
    - [ ] `--json` without `--yes` → throw `UserError` saying `--yes` is required with `--json`
    - [ ] No `--yes` and `process.stdin.isTTY` falsy → throw `UserError` saying `--yes` is required in a non-interactive shell
    - [ ] No `--yes`, TTY → print slice index and path, the waiver line, and the PM-decision line (TD-6 text), then `askConfirmation('Proceed? [y/N] ')`; on decline print `Cancelled.` and return without writing
    - [ ] With `--yes` (non-JSON) → still print the slice path and waiver text, then write
  - [ ] Update the function's JSDoc to describe the confirmation
  - [ ] Success: CLI typechecks

- [ ] **Task 17: Test the confirmation paths** (effort 2)
  - [ ] In `packages/cli/tests/commands/check.test.ts`, `describe('cf check --set-review-none')`: the existing tests do not pass `--yes` and will now fail under vitest's non-TTY stdin. Add `--yes` to each where the test expects a write
  - [ ] Mock `../../src/utils/confirm.js` following `packages/cli/tests/commands/worktree.test.ts` (line ~41)
  - [ ] New cases (design criterion 12):
    - [ ] Non-TTY, no `--yes` → rejects with the `--yes` message; file unchanged
    - [ ] `--json` without `--yes` → error; file unchanged
    - [ ] TTY stubbed true, confirm resolves false → prints `Cancelled.`; file unchanged
    - [ ] TTY stubbed true, confirm resolves true → file has `review: none`
    - [ ] `--yes` → output includes the slice path and waiver text; file written
  - [ ] Restore `process.stdin.isTTY` after each test that stubs it
  - [ ] Success: `pnpm --filter @context-forge/cli test` passes
  - [ ] Commit: `feat(cli): require confirmation for check --set-review-none`

## Part 5 — #67 Fallback Index Collision

- [ ] **Task 18: Source-aware `ruleDuplicateIndex` wording** (effort 2)
  - [ ] In `ConsistencyChecker.ruleDuplicateIndex` (near line 688), group entries (not just names) by index so `indexSource` is available
  - [ ] All `explicit` in a group → current text and fix, unchanged
  - [ ] Mixed `explicit` and `fallback` → the TD-7 wording (`Slice index N: '(N) Real Name' collides with auto-numbered unindexed entry 'Other Name'`) and suggested fix `Give the unindexed entry an explicit (NNN) index`
  - [ ] No branch for all-`fallback` (cannot occur within one file)
  - [ ] Success: core typechecks

- [ ] **Task 19: Prefer explicit entries in `checkSlice` lookup** (effort 1)
  - [ ] In `checkSlice` (near line 261), replace the single `find` with: an entry matching the index with `indexSource === 'explicit'`, else one with `fallback`, else `null`
  - [ ] Success: core typechecks

- [ ] **Task 20: Test #67** (effort 2)
  - [ ] Add tests next to the existing `duplicate-index` tests in `ConsistencyChecker.test.ts`, or in a new `ConsistencyChecker.duplicateIndex.test.ts` (preferred; that file is already ~1900 lines)
  - [ ] Plan with `(5) Real` and a fifth unindexed entry → mixed-source wording (criterion 13)
  - [ ] Two explicit `(5)` entries → unchanged wording
  - [ ] `checkSlice(5)` on the mixed plan resolves to `(5) Real` (observable through a plan-entry-dependent finding, such as a review-gate or task-vs-plan finding)
  - [ ] Parser tests (`slicePlanParser.test.ts`) unchanged and passing
  - [ ] Success: core tests pass
  - [ ] Commit: `fix(core): clarify fallback index collisions and prefer explicit plan entries (closes #67)`

## Part 6 — Docs and Final Validation

- [ ] **Task 21: CHANGELOG** (effort 1)
  - [ ] Under `## [Unreleased]` in `CHANGELOG.md`, add entries for #89/#105 (new `workflow.review_weak_pass_as`; weak-provenance clears reported by `cf check`), #83 (exemption visibility in `cf check` / `cf next`; `--set-review-none` confirmation, `--yes` now required non-interactively), and #67, under the appropriate Added / Changed / Fixed headings
  - [ ] Call out the `--set-review-none` change as behavior-visible for scripts

- [ ] **Task 22: `docs/REVIEW-GATING.md`** (effort 2)
  - [ ] Add `workflow.review_weak_pass_as` to the config table (near line 35) and the key descriptions (near line 45)
  - [ ] Add a short section on provenance: what `verdictSource` / `recoveryTurn` mean, the TD-3 rules (absent = no signal, unrecognized = weak), per-part evaluation, and the weak-clear `info` finding
  - [ ] Add a short section on exemption visibility: `cf next` note, `cf check` info finding (incomplete slices only), `--set-review-none` confirmation and `--yes`
  - [ ] Commit: `docs: document review provenance policy and exemption visibility`

- [ ] **Task 23: Full build and test** (effort 1)
  - [ ] `pnpm -r build` succeeds
  - [ ] `pnpm -r test` passes
  - [ ] `grep -rn "'review-none'\|'grandfathered'" packages/*/src` hits only the `EXEMPT_REASON` definition
  - [ ] `grep -rn "'derived'\|'stated'" packages/core/src` hits only `reviewProvenance.ts`
  - [ ] No `any` in code this slice touched (no lint rule enforces it): `git diff main --name-only -- 'packages/*/src' | xargs grep -nE ':\s*any\b|as any\b|<any>'` returns nothing

- [ ] **Task 24: Verification walkthrough** (effort 2)
  - [ ] Run design § Verification Walkthrough steps 1–6 against a scratch copy of a project with gating on, using `node packages/cli/dist/index.js`
  - [ ] For step 4, also confirm the `cf next` note on a slice with tasks partly checked
  - [ ] Record any deviation and fix before proceeding
  - [ ] Success: every step behaves as described; scratch edits reverted
  - [ ] Commit any fixes found: `fix: …` as appropriate
