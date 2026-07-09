---
docType: tasks
slice: centralize-normalizedstatus-references
project: context-forge
lld: user/slices/910-slice.centralize-normalizedstatus-references.md
dependencies: [241]
projectState: Slice 241 (complete) defined STATUS as const in introspection/types.ts and derived NormalizedStatus from it, using STATUS.* only in its own new code. ~65 pre-existing bare-string literal sites across 6 files in packages/core/src still compare/assign 'complete' | 'in-progress' | 'not-started' | 'deprecated' directly. This slice sweeps those sites to STATUS.* references. Pure mechanical refactor, no behavior change.
dateCreated: 20260708
dateUpdated: 20260709
status: complete
---

## Context Summary
- Working on the `centralize-normalizedstatus-references` slice (910), part of the `900-slices.maintenance-and-refactoring` plan.
- `STATUS` (`introspection/types.ts`) and `NormalizedStatus` already exist (slice 241, complete) — this slice only consumes them, does not modify their definition.
- Six files sweep from bare string literals to `STATUS.*`: `types.ts` (retype only), `taskFileParser.ts`, `slicePlanParser.ts`, `statusNormalizer.ts`, `WorkflowNavigator.ts`, `ConsistencyChecker.ts`.
- Explicitly out of scope (do not touch): `schema/frontmatterSchema.ts` (different vocabulary, includes `deferred`), `introspection/types.ts`'s `SliceStatus.status` union (different, larger union), `ProjectModelBuilder.ts`'s `'unknown'` fallback (not a `STATUS` value), and any `.test.ts` file (no test assertions reference these literals directly).
- Delivers: single source of truth for `NormalizedStatus` values; compiler-checked references replace ~65 bare-string sites; zero behavior change (`STATUS.X === 'x'` by construction).
- No next slice is planned immediately after this one in the maintenance-and-refactoring plan; this is currently the last unstarted feature slice.

## Tasks

- [x] **0. Record pre-sweep literal-count baseline** — Effort: 1/5
  - [x] Run `grep -roE "'(complete|in-progress|not-started|deprecated)'" --include="*.ts" packages/core/src | grep -v '.test.ts' | wc -l` and record the resulting count before making any changes.
  - [x] Success: baseline count recorded (expected ~75 per the slice design's pre-sweep estimate) for comparison against Task 16's post-sweep count.

- [x] **1. Retype `TaskFileResult.inferredStatus` and sweep `taskFileParser.ts` together** — Effort: 2/5
  - [x] In `packages/core/src/introspection/types.ts`, change `TaskFileResult.inferredStatus`'s type from the standalone union `'complete' | 'in-progress' | 'not-started'` to `NormalizedStatus` (per design TD-1). No other changes to `types.ts` in this task.
  - [x] In `packages/core/src/introspection/parsers/taskFileParser.ts`, add an import of `STATUS` from `../types.js` (alongside any existing imports from that module).
  - [x] Replace all 4 bare-string assignments to `inferredStatus` (`'not-started'`, `'complete'`, `'in-progress'`, `'not-started'`) with `STATUS.NotStarted`, `STATUS.Complete`, `STATUS.InProgress`, `STATUS.NotStarted` respectively, preserving the existing if/else-if branch structure exactly.
  - [x] These two files must be changed together — retyping `types.ts` alone leaves `taskFileParser.ts`'s still-bare-string assignments failing to compile (design Migration Plan, step 1).
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds with zero type errors.

- [x] **2. Test `taskFileParser.ts` behavior is unchanged** — Effort: 1/5
  - [x] Run `pnpm --filter @context-forge/core test taskFileParser` (or the equivalent test file path for this parser).
  - [x] Confirm all tests that were passing before this slice's changes still pass, with no new failures and no changed assertions required.
  - [x] Success: `taskFileParser` test suite is 100% green with no test file edits needed.

- [x] **3. Commit checkpoint: types.ts + taskFileParser.ts** — Effort: 1/5
  - [x] Stage `packages/core/src/introspection/types.ts` and `packages/core/src/introspection/parsers/taskFileParser.ts`.
  - [x] Commit with message `refactor: centralize NormalizedStatus literals in taskFileParser (910)`.
  - [x] Success: commit created; `git status` shows a clean working tree for these two files.

- [x] **4. Sweep `slicePlanParser.ts` to `STATUS.*`** — Effort: 1/5
  - [x] In `packages/core/src/introspection/parsers/slicePlanParser.ts`, add an import of `STATUS` from `../types.js` if not already present.
  - [x] Replace both ternary sites (`status: isChecked ? 'complete' : 'not-started'`, appearing twice — once each for the indexed and unindexed entry-parsing branches) with `status: isChecked ? STATUS.Complete : STATUS.NotStarted`.
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds; zero bare `'complete'`/`'not-started'` literals remain in this file (verify via `grep -nE "'(complete|in-progress|not-started|deprecated)'" packages/core/src/introspection/parsers/slicePlanParser.ts` returning no matches).

- [x] **5. Test `slicePlanParser.ts` behavior is unchanged** — Effort: 1/5
  - [x] Run `pnpm --filter @context-forge/core test slicePlanParser`.
  - [x] Confirm all existing tests pass unchanged.
  - [x] Success: `slicePlanParser` test suite is 100% green with no test file edits needed.

- [x] **6. Sweep `statusNormalizer.ts` value side to `STATUS.*`** — Effort: 2/5
  - [x] In `packages/core/src/introspection/parsers/statusNormalizer.ts`, add a plain (value) import of `STATUS` from `../types.js`, keeping the existing `import type { NormalizedStatus } from '../types.js';` line unchanged (per design Implementation Details — matches the pattern in `statusDerivation.ts`).
  - [x] In the `STATUS_MAP` object, replace only the **value** side (right of each colon) of all 13 non-alias-key entries with the matching `STATUS.*` reference — e.g. `complete: 'complete'` becomes `complete: STATUS.Complete`, `in_progress: 'in-progress'` becomes `in_progress: STATUS.InProgress`, and so on for every key mapping to `'complete'`, `'in-progress'`, `'not-started'`, or `'deprecated'`.
  - [x] Do **not** change the map's keys (`complete`, `completed`, `done`, `in_progress`, `'in-progress'`, `'in progress'`, `active`, `not_started`, `'not-started'`, `'not started'`, `ready`, `pending`, `planned`, `deprecated`) — these are raw alias strings being mapped *from*, not `NormalizedStatus` values, and must stay literal per design TD (Explicitly excluded).
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds; `STATUS_MAP`'s keys are unchanged (14 keys, all still string literals); its values are all `STATUS.*` references.

- [x] **7. Test `statusNormalizer.ts` behavior is unchanged** — Effort: 1/5
  - [x] Run `pnpm --filter @context-forge/core test statusNormalizer`.
  - [x] Confirm all existing tests pass unchanged, including alias-mapping cases (e.g. `'completed'` → `complete`, `'active'` → `in-progress`).
  - [x] Success: `statusNormalizer` test suite is 100% green with no test file edits needed.

- [x] **8. Commit checkpoint: slicePlanParser.ts + statusNormalizer.ts** — Effort: 1/5
  - [x] Stage `packages/core/src/introspection/parsers/slicePlanParser.ts` and `packages/core/src/introspection/parsers/statusNormalizer.ts`.
  - [x] Commit with message `refactor: centralize NormalizedStatus literals in slicePlanParser and statusNormalizer (910)`.
  - [x] Success: commit created; working tree clean for these two files.

- [x] **9. Sweep `WorkflowNavigator.ts` to `STATUS.*`** — Effort: 2/5
  - [x] In `packages/core/src/introspection/WorkflowNavigator.ts`, confirm whether `STATUS` is already imported (slice 241 used it in this file's new code per its TD-6). Add the import if it is not already present.
  - [x] Locate all 3 bare-string `'complete'` comparison/assignment sites and replace each with `STATUS.Complete`. Do not modify any comparisons against `SliceStatus.status` values that are not `NormalizedStatus` (e.g. `'pending-review'`, `'review-failed'`, `'needs-design'` are a different union per design TD-3 — leave these untouched).
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds; the 3 identified `NormalizedStatus`-value sites reference `STATUS.Complete`; `SliceStatus.status`-union literals are unchanged.

- [x] **10. Test `WorkflowNavigator.ts` behavior is unchanged** — Effort: 1/5
  - [x] Run `pnpm --filter @context-forge/core test WorkflowNavigator`.
  - [x] Confirm all existing tests pass unchanged, including the gating-off regression test and per-boundary review-gate tests introduced in slices 241/911/912.
  - [x] Success: `WorkflowNavigator` test suite is 100% green with no test file edits needed.

- [x] **11. Commit checkpoint: WorkflowNavigator.ts** — Effort: 1/5
  - [x] Stage `packages/core/src/introspection/WorkflowNavigator.ts`.
  - [x] Commit with message `refactor: centralize NormalizedStatus literals in WorkflowNavigator (910)`.
  - [x] Success: commit created; working tree clean for this file.

- [x] **12. Sweep `ConsistencyChecker.ts` to `STATUS.*` (batch 1 of 2)** — Effort: 3/5
  - [x] In `packages/core/src/introspection/ConsistencyChecker.ts`, confirm/add an import of `STATUS` from `./types.js`.
  - [x] Identify all 36 bare-string `NormalizedStatus`-value literal sites (`'complete'`, `'in-progress'`, `'not-started'`) across the file's rule functions. Working top-to-bottom through the file, sweep the first half of the rule functions (roughly lines 280–550 in the pre-sweep file) to `STATUS.*` references, preserving all existing comparison/branch logic exactly.
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds after this partial sweep with zero type errors.

- [x] **13. Sweep `ConsistencyChecker.ts` to `STATUS.*` (batch 2 of 2)** — Effort: 3/5
  - [x] Continue the sweep through the remainder of the file (roughly lines 550–1000 in the pre-sweep file), replacing all remaining bare-string `NormalizedStatus`-value literals with `STATUS.*` references.
  - [x] Confirm via `grep -nE "'(complete|in-progress|not-started|deprecated)'" packages/core/src/introspection/ConsistencyChecker.ts` that zero matches remain in this file.
  - [x] Success: `pnpm --filter @context-forge/core build` succeeds; grep confirms zero remaining bare `NormalizedStatus`-value literals in this file.

- [x] **14. Test `ConsistencyChecker.ts` behavior is unchanged** — Effort: 2/5
  - [x] Run `pnpm --filter @context-forge/core test ConsistencyChecker` (covering all `ConsistencyChecker.*.test.ts` files, including `reviewGate` and `reviewGateWidened` variants).
  - [x] Confirm all existing tests pass unchanged, with no test file edits needed.
  - [x] Success: all `ConsistencyChecker`-related test suites are 100% green.

- [x] **15. Commit checkpoint: ConsistencyChecker.ts** — Effort: 1/5
  - [x] Stage `packages/core/src/introspection/ConsistencyChecker.ts`.
  - [x] Commit with message `refactor: centralize NormalizedStatus literals in ConsistencyChecker (910)`.
  - [x] Success: commit created; working tree clean for this file.

- [x] **16. Full-repo verification sweep** — Effort: 2/5
  - [x] Run `grep -roE "'(complete|in-progress|not-started|deprecated)'" --include="*.ts" packages/core/src | grep -v '.test.ts'` and confirm the only remaining matches are: the 4-site `STATUS` const definition in `introspection/types.ts`, the 3 intentionally-excluded sites in `schema/frontmatterSchema.ts`, and the intentionally-excluded `SliceStatus.status` union literals in `introspection/types.ts` (per design Success Criteria).
  - [x] Run `pnpm -r build` and confirm a clean build across all packages.
  - [x] Run `pnpm -r test` and confirm the pre-existing baseline is unchanged: core 931/934 passing (3 pre-existing `FileProjectStore` failures), cli 428/432 passing (4 pre-existing `list.test.ts` failures), mcp 184/184 passing. Zero new failures anywhere.
  - [x] Run `git diff main -- packages/core/src | grep -E '(as any|: any)'` (or equivalent diff against the pre-slice state) and confirm no matches — the sweep must introduce zero `any` and zero new type assertions (TR-6).
  - [x] Success: grep output matches the expected exclusion set exactly; `pnpm -r build` and `pnpm -r test` both confirm no regressions; the `any`/type-assertion diff check returns no matches.

- [x] **17. Type-safety spot-check (verification walkthrough step 2)** — Effort: 1/5
  - [x] Temporarily introduce a typo into one swept reference (e.g. change `STATUS.Complete` to `STATUS.Compelte` at one call site).
  - [x] Run `pnpm --filter @context-forge/core build` and confirm it fails at compile time with a type error.
  - [x] Revert the typo (`git checkout` the affected file, or manually restore the correct reference) and re-run the build to confirm it is clean again.
  - [x] Success: the deliberate typo produces a compile-time failure; after reverting, the build is clean. This is a manual verification step, not a committed change — do not commit the typo.

- [x] **18. Live CLI spot-check (verification walkthrough step 4)** — Effort: 1/5
  - [x] Run `cf status --project context-forge` and `cf list slices --project context-forge` against the local built CLI.
  - [x] Confirm output is unchanged from pre-sweep behavior (status strings render identically, since `STATUS.X === 'x'`).
  - [x] Success: both commands produce output consistent with the project's current slice/task state, with no anomalies attributable to this slice's changes.

- [x] **19. Final commit and slice closeout** — Effort: 1/5
  - [x] Confirm `git status` shows a clean working tree (all prior checkpoints committed; no stray changes from the spot-checks in tasks 17–18).
  - [x] Update this task file's frontmatter `status` to `complete` and `dateUpdated` to the current date.
  - [x] Update the parent slice design document's frontmatter `status` to `complete`.
  - [x] Success: task file and slice design both reflect `complete` status; working tree clean; ready for Phase 6 code review per the project's review-gate configuration.
