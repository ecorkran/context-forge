---
docType: slice-design
slice: centralize-normalizedstatus-references
project: context-forge
parent: project-documents/user/architecture/900-arch.maintenance-and-refactoring.md
dependencies: [241]
interfaces: []
dateCreated: 20260707
dateUpdated: 20260707
status: not_started
---

# Slice Design: Centralize NormalizedStatus References

## Overview

Slice 241 introduced the `STATUS` `as const` object in `introspection/types.ts` (`STATUS.Complete`, `STATUS.InProgress`, `STATUS.NotStarted`, `STATUS.Deprecated`) and referenced it from its own new code, but explicitly deferred sweeping pre-existing bare-string sites to this slice (241 TD-6). This slice performs that sweep: every production-code site that assigns or compares a `NormalizedStatus` value as a bare string literal (`'complete'`, `'in-progress'`, `'not-started'`, `'deprecated'`) is rewritten to reference `STATUS.*` instead.

This is a pure mechanical refactor with no behavior change. `STATUS.Complete === 'complete'` by construction (`241`'s `as const` + derived union), so every rewritten site is byte-identical at runtime. The existing test suite is the regression guard — no new test *behavior* is needed, only confirmation that nothing changed.

## Value

Closes the "define comparison values once, reference everywhere" gap the project's own CLAUDE.md calls out: today, changing what `'in-progress'` is spelled as requires editing dozens of scattered sites with no compiler assistance. After this slice, `NormalizedStatus` values are defined in exactly one place (`STATUS` in `types.ts`), and every reference is a compiler-checked property access — a typo like `'in-progres'` becomes a compile error instead of a silent runtime mismatch.

## Technical Scope

**Included:**

- Sweep all `NormalizedStatus`-value bare-string literals in production code (`packages/core/src/**/*.ts`, excluding `*.test.ts`) to `STATUS.*` references. Confirmed sites (counts as of 20260707, post-912):

  | File | Site count | Pattern |
  |---|---|---|
  | `introspection/ConsistencyChecker.ts` | 36 | `=== 'complete'` / `'in-progress'` comparisons across ~15 rule functions |
  | `introspection/parsers/statusNormalizer.ts` | 13 (of 16 total; 3 are alias keys, see Excluded) | `STATUS_MAP` value side |
  | `introspection/types.ts` | 5 (of 8 total; 4 are the `STATUS` definition itself) | `TaskFileResult['inferredStatus']` union literal |
  | `introspection/WorkflowNavigator.ts` | 3 | `=== 'complete'` checks |
  | `introspection/parsers/taskFileParser.ts` | 4 | `inferredStatus = 'complete'` assignments |
  | `introspection/parsers/slicePlanParser.ts` | 4 | ternary `status: isChecked ? 'complete' : 'not-started'` (×2 sites) |
  | `introspection/ProjectModelBuilder.ts` | 0 (its one literal is `'unknown'`, not a `STATUS` value — see Excluded) | — |

  Total: ~65 literal occurrences across 6 files sweep to `STATUS.*`.

- Retype `TaskFileResult.inferredStatus` (`introspection/types.ts:44`) from its standalone union `'complete' | 'in-progress' | 'not-started'` to `NormalizedStatus`. It is missing only `'deprecated'` (task files have no deprecated concept), which is fine — `NormalizedStatus` is a superset and the field simply never takes that value. This removes a second, drifting definition of the same three values and lets `taskFileParser.ts`'s assignments use `STATUS.*` with no cast.

**Explicitly excluded:**

- **`schema/frontmatterSchema.ts`** (`VALID_STATUSES` and the alias-normalization block). This module uses a *different* vocabulary — underscore-separated raw frontmatter tokens (`not_started`, `in_progress`, `deferred`) plus alias inputs (`'completed'`, `'active'`, `'draft'`) that don't match `NormalizedStatus` 1:1 (`deferred` has no `NormalizedStatus` equivalent at all — confirmed in `statusNormalizer.ts`'s own doc comment). Conflating these would be a correctness bug, not a cleanup. Out of scope.
- **`statusNormalizer.ts`'s `STATUS_MAP` keys** (`complete:`, `completed:`, `done:`, `in_progress:`, etc.) — these are raw alias strings being *mapped from*, not `NormalizedStatus` values; they must stay literal. Only the map's **values** (the right-hand side, already-typed `NormalizedStatus`) sweep to `STATUS.*`.
- **`introspection/types.ts`'s `SliceStatus.status` union** (`'needs-design' | 'needs-tasks' | 'in-implementation' | 'complete' | 'no-active-slice' | 'pending-review' | 'review-failed'`) — a distinct, larger workflow-position union introduced across slices 240/241/911, not `NormalizedStatus`. Its `'complete'` member is incidental overlap in spelling, not the same type. Out of scope; touching it risks conflating two independent unions.
- **`ProjectModelBuilder.ts`'s `'unknown'` fallback** (line 179) — an explicit sentinel for malformed/unrecognized frontmatter status per TD-2a (an earlier design decision), not one of the four `NormalizedStatus` values. Not a `STATUS` site.
- Test files — grep confirms zero `.test.ts` files assert against these literals directly (tests exercise behavior through parsers/fixtures, not string comparison), so no test changes are needed. Tests instead serve as the regression guard for this sweep.
- `ConsistencyChecker.ts`'s file size (1320 lines, exceeds the ~300-line guideline) — pre-existing condition, flagged informationally in the slice 912 code review (F005) and explicitly out of scope there. This slice touches many lines inside that file but does not restructure it; splitting it is a separate, larger effort not implied by "sweep string literals."

## Dependencies

### Prerequisites

- **Slice 241 (complete).** Defines `STATUS` and derives `NormalizedStatus` from it in `introspection/types.ts`. This slice only consumes that definition — no changes to `STATUS` itself.

### Interfaces Required

- `STATUS` (`introspection/types.ts`) — imported into every swept file that doesn't already import it (`statusNormalizer.ts` already imports `NormalizedStatus` as a type-only import; it gains a value import of `STATUS` alongside).

## Architecture

### Component Structure

No new components. Existing files edited in place:

| File | Change |
|---|---|
| `introspection/types.ts` | Retype `TaskFileResult.inferredStatus` to `NormalizedStatus` |
| `introspection/ConsistencyChecker.ts` | Replace 36 bare-string comparisons with `STATUS.*` |
| `introspection/ProjectModelBuilder.ts` | No change (its literal is out of scope; listed for completeness) |
| `introspection/WorkflowNavigator.ts` | Replace 3 bare-string comparisons with `STATUS.*` |
| `introspection/parsers/taskFileParser.ts` | Replace 4 bare-string assignments with `STATUS.*` |
| `introspection/parsers/slicePlanParser.ts` | Replace 4 bare-string ternary branches with `STATUS.*` |
| `introspection/parsers/statusNormalizer.ts` | Replace 13 bare-string map values with `STATUS.*`; add `STATUS` value import alongside existing type-only `NormalizedStatus` import |

### Migration Plan

- **Source:** bare string literals (`'complete'`, `'in-progress'`, `'not-started'`, `'deprecated'`) at ~65 call sites across 6 files.
- **Destination:** `STATUS.Complete`, `STATUS.InProgress`, `STATUS.NotStarted`, `STATUS.Deprecated` — same runtime values, compiler-checked references.
- **Consumer updates:** none required outside `packages/core` — this is an internal-representation change only. `NormalizedStatus`'s type (the union of string values) is unchanged, so anything consuming a `NormalizedStatus`-typed value from `core` (CLI, MCP server) sees no difference in the values that flow across the package boundary. No public API signature changes.
- **Behavior verification:** the existing core test suite (931/934 passing, 3 pre-existing unrelated `FileProjectStore` failures) is the regression guard. Since `STATUS.X` and `'x'` are the same value by construction, no test assertions should need to change; a swept site that somehow changes test outcomes indicates a transcription error in the sweep, not a needed behavior update.
- **Order of work (mechanical, file-by-file).** Steps are independently buildable/testable *except* the first pair: retyping `TaskFileResult.inferredStatus` and sweeping its one producer (`taskFileParser.ts`) share a single type contract and must land together, or the intermediate state fails to build. All later steps are genuinely independent — each is a self-contained file's literals swept to already-defined `STATUS` values.
  1. `types.ts` + `taskFileParser.ts` together — retype `TaskFileResult.inferredStatus` to `NormalizedStatus` and sweep its 4 assignment sites to `STATUS.*` in the same step (retyping alone would leave `taskFileParser.ts`'s still-bare-string assignments failing to compile). Build + run `taskFileParser`'s test file.
  2. `slicePlanParser.ts` — sweep 4 sites (2 ternaries), add `STATUS` import. Build + run its test file.
  3. `statusNormalizer.ts` — sweep 13 value-side sites, add `STATUS` value import (keep the existing `NormalizedStatus` type import). Build + run its test file.
  4. `WorkflowNavigator.ts` — sweep 3 sites (likely already imports `STATUS` per 241's TD-6 usage; confirm). Build + run its test file.
  5. `ConsistencyChecker.ts` — sweep 36 sites across its rule functions. Largest file; consider sub-batching by rule function and re-building after each batch to catch transcription slips early rather than at the end. Build + run its test file.
  6. `pnpm -r build && pnpm -r test` — full monorepo pass, confirm the pre-existing baseline (931/934 core, 428/432 cli, 184/184 mcp) is unchanged.

## Technical Decisions

### TD-1: Retype `TaskFileResult.inferredStatus` rather than leave its standalone union

`inferredStatus` was independently typed as `'complete' | 'in-progress' | 'not-started'` before `STATUS`/`NormalizedStatus` existed. Leaving it as a separate union would mean `taskFileParser.ts`'s swept assignments (`inferredStatus = STATUS.Complete`) still type-check against a *different* literal-union type that happens to overlap — technically sound but reintroduces exactly the "two definitions of the same values" problem this slice exists to remove. Retyping to `NormalizedStatus` (a strict superset, missing only the inapplicable `deprecated`) is a one-line, purely-widening change with no behavioral effect on any consumer, since nothing in the codebase currently validates that `inferredStatus` *excludes* `'deprecated'`.

### TD-2: `frontmatterSchema.ts` is a separate vocabulary, not part of this sweep

Confirmed by direct inspection: `VALID_STATUSES` uses `not_started`/`in_progress` (underscored, matching raw frontmatter convention) and includes `deferred`, which has no `NormalizedStatus` counterpart per `statusNormalizer.ts`'s own documented exclusion. These are two intentionally distinct vocabularies — raw frontmatter tokens (validated/aliased at the schema layer) versus normalized internal status (`NormalizedStatus`, produced by `normalizeStatus()`). Sweeping `frontmatterSchema.ts` onto `STATUS` would either lose the `deferred` value or require adding it to `NormalizedStatus`, which is a semantic change outside this slice's "mechanical, no behavior change" scope. If unifying these vocabularies is ever wanted, it is a distinct future slice with its own design tradeoffs, not folded in here.

### TD-3: `SliceStatus.status` is excluded as a distinct union

Same reasoning as TD-2: `SliceStatus.status` (workflow-position statuses like `needs-design`, `pending-review`, `review-failed`) is a different, larger union that happens to share the spelling `'complete'` with one `NormalizedStatus` member. Sweeping it onto `STATUS.Complete` would be correct for that one member but implies the two unions are related, which they aren't — `SliceStatus.status` describes lifecycle position, `NormalizedStatus` describes checkbox/frontmatter completion state. Left untouched.

## Implementation Details

### Patterns and Conventions

- Every swept site becomes a direct `STATUS.X` reference — no intermediate aliasing, no local re-export.
- `statusNormalizer.ts` keeps its existing `import type { NormalizedStatus } from '../types.js';` and adds a plain (value) import of `STATUS` from the same module — both imports from `types.ts`, matching the pattern already established in `statusDerivation.ts`.
- No new abstractions, no helper functions — this is a find-and-replace-with-verification sweep, not a redesign.

## Integration Points

### Provides to Other Slices

- None. This slice has no downstream interface — it changes internal representation only.

### Consumes from Other Slices

- `STATUS` / `NormalizedStatus` from slice 241.

### Deferred to Other Slices

- Unifying `frontmatterSchema.ts`'s raw-token vocabulary with `NormalizedStatus` (if ever desired) — not scoped here (TD-2).
- Splitting `ConsistencyChecker.ts` to address its file-size guideline overage — pre-existing, informational-only per the 912 review (F005), unrelated to this sweep's purpose.

## Success Criteria

### Functional Requirements

- No bare `NormalizedStatus`-value string literals (`'complete'`, `'in-progress'`, `'not-started'`, `'deprecated'`) remain in production code outside `types.ts`'s own `STATUS` definition. Verified via `grep -roE "'(complete|in-progress|not-started|deprecated)'" --include="*.ts" packages/core/src | grep -v '.test.ts' | grep -v 'introspection/types.ts:[3-6]:'` (or equivalent) returning zero matches in the six swept files.
- `frontmatterSchema.ts` and `SliceStatus.status` remain untouched (confirmed out of scope, not accidentally swept).
- `TaskFileResult.inferredStatus` is typed as `NormalizedStatus`.

### Technical Requirements

- `pnpm -r build` clean across all packages.
- `pnpm -r test` shows the identical pre-existing baseline with zero new failures: core 931/934 (3 pre-existing `FileProjectStore` failures), cli 428/432 (4 pre-existing `list.test.ts` failures), mcp 184/184.
- No `any` introduced; no new type assertions needed (a correctly-typed sweep requires none).

### Verification Walkthrough

1. **Before/after literal count.**
   ```bash
   grep -roE "'(complete|in-progress|not-started|deprecated)'" --include="*.ts" packages/core/src | grep -v '.test.ts' | wc -l
   # Before: ~75 (includes the 4-site STATUS definition + 8 out-of-scope sites in frontmatterSchema.ts/types.ts SliceStatus)
   # After: 4 (only the STATUS const definition itself in types.ts) + the intentionally-excluded frontmatterSchema.ts (3) and SliceStatus.status (4) sites
   ```
2. **Type safety spot-check.** Temporarily typo one swept reference (e.g. `STATUS.Compelte`) and confirm `pnpm --filter @context-forge/core build` fails at compile time — demonstrating the compiler now catches what used to be a silent string mismatch. Revert.
3. **Behavior unchanged.**
   ```bash
   pnpm -r build
   pnpm -r test
   # Same pass/fail counts as pre-sweep baseline; zero new failures.
   ```
4. **Spot-check a live command** unaffected in output:
   ```bash
   cf status --project context-forge
   cf list slices --project context-forge
   # Output identical to pre-sweep (status strings render the same, since STATUS.X === 'x').
   ```
