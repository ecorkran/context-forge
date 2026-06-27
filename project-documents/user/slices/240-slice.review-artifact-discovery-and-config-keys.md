---
docType: slice-design
slice: review-artifact-discovery-and-config-keys
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: []
interfaces: [241, 242, 244]
dateCreated: 20260626
dateUpdated: 20260626
status: not_started
---

# Slice Design: Review Artifact Discovery and Config Keys

## Overview

This is the foundation slice for initiative 240 (Review-Aware Workflow Gating). It adds the three things every later gate slice depends on, and **no gate logic of its own**:

1. A `review` discovery slot in `DocumentDetectionResult`, plus a detection rule in `documentDetector.ts` that locates a slice's review artifact by index and review type.
2. The three global review config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`) in `ConfigKeys.ts`, with `validate`/`enum` enforcement, plus the per-gate override (`workflow.review_gates.*`) namespace decision and structure.
3. A renumbering of the `getNext()` priority cascade comments to open a labeled insertion point between current Priority 5 (`in-implementation`) and Priority 6 (`complete → advance`), where slice 241 will add the gate branch.

After this slice, `cf next` / `workflow_next` behave **identically to today** — the new config keys default to off, the `review` slot is populated but read by nobody, and the cascade renumbering is comment-only. The slice is observable only through unit tests and `cf config list`.

## Value

Architectural enablement. This slice unblocks slices 241 (gate logic), 242 (consistency rule), and 244 (initiative-level gate) by giving each a stable interface to build on:

- 241 reads `detectionResult.review` and the three config keys to derive `pending-review` / `review-failed` and insert its branch at the labeled cascade point.
- 242 reads the same detection slot and config to emit consistency findings.
- 244 reuses the detection rule with `reviewType = "arch"` at a different cascade point.

Delivering these as one isolated foundation slice keeps the higher-risk gate-logic slice (241) focused purely on decision logic, with its inputs already in place and tested.

## Technical Scope

**Included:**

- Add `review: string | null` to `DocumentDetectionResult` (`packages/core/src/introspection/types.ts`).
- Add a review-artifact detection rule to `detectDocuments()` (`packages/core/src/introspection/parsers/documentDetector.ts`) that scans `project-documents/user/reviews/` for `NNN-review.{reviewType}.*.md`.
- Add the three global config keys to `CONFIG_KEYS` (`packages/core/src/config/ConfigKeys.ts`) with `enum`/`validate` enforcement.
- Define the `workflow.review_gates.*` per-gate override config approach (decision documented below) and add its key definitions.
- Renumber / relabel the `getNext()` priority cascade comments to reserve the gate insertion point.
- Unit tests for the detection rule and config-key validation.

**Explicitly excluded (owned by later slices):**

- No `SliceStatus` enum changes, no `deriveSliceStatus()` changes, no gate branch logic (→ 241).
- No verdict reading, threshold comparison, or `review_unknown_as` evaluation (→ 241). This slice does not parse review frontmatter; it only locates the file.
- No `ConsistencyChecker` rule (→ 242).
- No initiative-level (`pre-slice-plan`) detection wiring (→ 244).
- No documentation/README updates beyond config-key `description` strings (→ 243).

## Dependencies

### Prerequisites

None. This slice is purely additive to initiative 160's infrastructure (`WorkflowNavigator`, `ConfigKeys`, `documentDetector`). No 160 interfaces change.

### Interfaces Required

- The existing `detectDocuments(projectPath, sliceIndex)` signature and its `matchFiles`/`safeReaddir` helpers — extended, not replaced.
- The existing `CONFIG_KEYS` flat `Record<string, ConfigKeyDefinition>` shape and `ConfigManager.get/set` dotted-key resolution.

## Architecture

### Component Structure

Three independent edit sites, no new modules:

| Component | File | Change |
|---|---|---|
| `DocumentDetectionResult` | `introspection/types.ts` | add `review` field |
| `detectDocuments()` | `introspection/parsers/documentDetector.ts` | add reviews-dir scan + match |
| `CONFIG_KEYS` | `config/ConfigKeys.ts` | add review keys |
| `getNext()` cascade | `introspection/WorkflowNavigator.ts` | renumber priority comments only |

### Data Flow

The detection rule mirrors the existing slice/task/arch detection in the same function:

```
sliceIndex (number)
   │
   ▼
detectDocuments()
   ├─ safeReaddir(reviews/)            ← new dir added to existing Promise.all
   ├─ matchFiles(files, `${idx}-review.{reviewType}.`, reviewsDir)
   └─ review = last match | null       ← lexicographic-last wins (see below)
   │
   ▼
DocumentDetectionResult.review : string | null   ← consumed by 241/242/244
```

The `reviewType` is **not** known to the detector from project state alone — it is the gate's concern (different transitions require different review types). For this foundation slice the detector accepts an optional `reviewType` parameter and, when omitted, returns no review match (rather than guessing). The default reviewType that maps a slice transition to a review type is a gate-logic decision and lives in 241. See Technical Decisions.

### State Management

Stateless. The detector reads the filesystem; config keys are read through `ConfigManager` (project → user → default resolution). No new persisted state.

## Technical Decisions

### TD-1: `review_gates` config schema — flat dotted-key namespace (resolves arch open item)

The architecture (`240-arch` §Technical Considerations) flagged an open decision: `workflow.review_gates` is a nested TOML table, but `ConfigKeyDefinition` models only scalar keys (`type: 'string' | 'boolean' | 'number'`), and `ConfigManager.get/set` resolve dotted keys to a **scalar leaf**. The slice plan assigns the binding decision to slice 241.

**Decision for the schema shape (made here, so 240 can lay the structure): use a flat dotted-key namespace, not a nested-table extension to `ConfigKeyDefinition`.**

Each per-gate override becomes two flat scalar keys, e.g.:

```toml
workflow.review_gates.pre_advance.review_type = "code"
workflow.review_gates.pre_advance.threshold   = "concerns"
```

Rationale:

- It fits the existing `ConfigManager` machinery with **zero changes** — `resolveKey`/`setKey` already walk dotted paths into nested TOML tables, and each leaf is a scalar `string`, exactly what `ConfigKeyDefinition` supports today.
- Extending `ConfigKeyDefinition` to model nested object shapes would add `validate`/`enum`/`type` complexity for a four-row override map — disproportionate to the need, and against the project principle to resist complexity.
- The dotted keys still render as a nested `[workflow.review_gates.pre_advance]` table in `.context-forge.toml`, so the user-facing TOML reads naturally.
- TOML bare keys disallow `-`, so transition names use `_` (`pre_advance`, `pre_slice_plan`, `pre_tasks`, `pre_implementation`). This is the one deviation from the arch doc's illustrative `pre-advance` spelling and must be reflected in slice 243 docs.

**Scope boundary for 240 vs 241:** this slice adds the *key definitions* for the four known gate transitions' `review_type` and `threshold` (as enum/validated scalar keys, defaulting empty = "use the global key"). Slice 241 owns *consuming* them — the resolution rule "per-gate override else `workflow.review_threshold`" is gate logic and is implemented and tested there. 240 ships the keys inert.

If a future need genuinely requires arbitrary/unknown gate names, revisit with a nested-shape extension then — not now.

### TD-2: Detection rule — optional `reviewType`, explicit no-guess

`detectDocuments` is extended to:

```ts
async function detectDocuments(
  projectPath: string,
  sliceIndex: number,
  reviewType?: string,   // new, optional
): Promise<DocumentDetectionResult>
```

- When `reviewType` is provided, scan `reviews/` for `${idx}-review.${reviewType}.` prefixed `.md` files and set `review` to the **lexicographically last** match (consistent with arch §"lexicographically last wins"). Note this is `at(-1)`, whereas the existing slice/arch detection takes `[0]` (first) — the difference is deliberate and documented inline: reviews accrue over re-runs and "most recent by sort order" is the desired one; design/arch docs are singular.
- When `reviewType` is omitted, `review` is `null`. The detector never infers a review type. This honors "Do not guess" and the no-silent-fallback principle — a missing reviewType yields an honest null, not a guessed match.

Existing callers of `detectDocuments` pass two arguments and are unaffected (the third parameter is optional, `review` is simply `null` for them). 241 will pass the gate-resolved reviewType.

### TD-3: Global config keys — enum + validate, conservative defaults

```ts
'workflow.review_enabled': {
  type: 'boolean',
  default: false,
  description: 'Enable review gating in the workflow navigator (off by default; no behavior change when false)',
},
'workflow.review_threshold': {
  type: 'string',
  default: 'concerns',
  description: 'Verdict floor that clears a review gate: "pass" requires PASS; "concerns" clears on PASS or CONCERNS',
  enum: ['pass', 'concerns'],
},
'workflow.review_unknown_as': {
  type: 'string',
  default: 'fail',
  description: 'How to treat an UNKNOWN/absent/unparseable verdict: "fail" blocks, "concern" treats as CONCERNS, "pass" clears',
  enum: ['fail', 'concern', 'pass'],
},
```

- `enum` gives fail-fast validation through the existing `validateValue` path (arch "Fail-fast on configuration errors" — the `validate`/`enum` hook is the enforcement point). An invalid `review_threshold` is rejected at `cf set`, not silently passed.
- Threshold vocabulary is **lowercase config tokens** (`pass`, `concerns`), distinct from the **uppercase verdict vocabulary** (`PASS`, `CONCERNS`, `FAIL`, `UNKNOWN`) that 241 reads from frontmatter. Keeping config tokens lowercase matches the existing `guide.git_strategy` enum style and avoids implying the config value is a verdict. The case-mapping between them is gate logic (241).
- Defaults encode "conservative by default": gating off; when on, `concerns` clears PASS/CONCERNS; UNKNOWN fails.

### TD-4: Cascade renumbering — comments only, no logic change

`getNext()` is a priority-ordered chain of early-return branches: it checks conditions top to bottom and returns on the first match. The branches are labeled only by comments (`// Priority 1` … `// Priority 7`); nothing reads those numbers — the **order of branches in the file** is what determines priority. The labels are a map for human readers.

The current cascade already carries a fractional label: `Priority 2.5` (`WorkflowNavigator.ts:187`, the "arch set but file missing" branch) was wedged between 2 and 3. Initiative 240 needs to insert the review gate between current Priority 5 (`in-implementation`) and Priority 6 (`complete → advance`) — and there is no integer label free for it. Inventing another fraction (`5.5`) would compound the existing smell.

**Renumbering = re-label the entire sequence to clean integers** so the new gate branch gets a real number **and the existing `2.5` fraction is retired** — with zero logic change. No branch is added, removed, or reordered; only the comment labels change:

```
current (fractional)         after renumber (integers)
P1   no projectPath          P1  no projectPath
P2   no fileSlice            P2  no fileSlice
P2.5 arch missing       →    P3  arch missing            ← fraction retired
P3   needs-design            P4  needs-design
P4   needs-tasks             P5  needs-tasks
P5   in-implementation       P6  in-implementation
                             P7  [reserved: review gate — added in slice 241]
P6   complete → advance      P8  complete → advance
P7   complete, no plan       P9  complete, no plan
```

This slice makes the renumbering change and inserts a `// P7 reserved for review gate (initiative 240, slice 241)` placeholder comment at the insertion point. Because the branches are unchanged in order and content, behavior is byte-for-byte identical. This isolates the (purely cosmetic) relabeling churn from 241's logic diff, keeping 241's review focused on the decision matrix.

**Why this lands in 240, not 241:** retiring the `2.5` fraction and reserving the slot is foundation/structure with no behavioral effect; folding it into 241 would mix a large comment-only diff into the gate-logic review and obscure the actual decision matrix being added.

## Implementation Details

### Patterns and Conventions

- Reuse `matchFiles` and `safeReaddir` exactly; add `reviews` to the existing `Promise.all` rather than a separate await, matching the current concurrency pattern.
- Config keys follow the existing `workflow.*` ordering and formatting in `CONFIG_KEYS`.
- No `any`; the new `reviewType?` is `string | undefined`, `review` is `string | null` (matching sibling slots).

## Integration Points

### Provides to Other Slices

- **`DocumentDetectionResult.review: string | null`** — the relative path to the resolved review artifact (or null). Consumed by 241, 242, 244.
- **`detectDocuments(path, index, reviewType?)`** — the discovery entry point. 241/244 pass a gate-resolved `reviewType`.
- **`workflow.review_enabled | review_threshold | review_unknown_as`** and **`workflow.review_gates.{transition}.{review_type|threshold}`** config keys — readable via `ConfigManager.get`. 241 consumes the global keys and the override resolution; 242 reads `review_enabled`.
- **Reserved P7 cascade slot** — the labeled, integer-numbered insertion point for 241's branch (created by renumbering the cascade and retiring the old `2.5` fraction; see TD-4).

### Consumes from Other Slices

Nothing. Foundation slice.

## Success Criteria

### Functional Requirements

- `DocumentDetectionResult` has a `review` field; `detectDocuments` populates it from `reviews/` when a `reviewType` is supplied, selecting the lexicographically last match, and leaves it `null` otherwise.
- `cf config list` shows the three new `workflow.review_*` keys with their defaults and descriptions.
- `cf config set workflow.review_threshold bogus` fails with a validation error naming the allowed values; `cf config set workflow.review_threshold pass` succeeds.
- The four `workflow.review_gates.*.{review_type,threshold}` keys are settable and round-trip through `.context-forge.toml` as a nested table.
- `cf next` / `workflow_next` output is unchanged from before this slice for any project (gating off by default; cascade renumber is comment-only).

### Technical Requirements

- Unit tests:
  - detection rule: match found (single), multiple matches → last wins, no `reviewType` → null, empty/missing `reviews/` dir → null, non-matching index → null.
  - config validation: valid/invalid `review_threshold`, valid/invalid `review_unknown_as`, `review_enabled` type check.
  - existing `detectDocuments` callers still pass (two-arg invocation, `review` null).
- `pnpm build` and existing test suite pass with no `cf next` behavioral diff (a regression test asserting an unchanged recommendation for a sample project is sufficient).
- No `any`; explicit return types on changed exported functions.

### Verification Walkthrough

This is the demo script proving the slice delivers its (foundation-level) value. It will be refined after Phase 6.

1. **Config keys exist and validate.**
   ```bash
   cd packages/cli   # or wherever cf is invoked
   cf config list | grep workflow.review
   # expect:
   #   workflow.review_enabled      false     (default)
   #   workflow.review_threshold    concerns  (default)
   #   workflow.review_unknown_as   fail      (default)

   cf config set workflow.review_threshold bogus
   # expect: error — must be one of ["pass", "concerns"]

   cf config set workflow.review_threshold pass
   cf config get workflow.review_threshold        # → pass (source: project)
   ```

2. **Per-gate override round-trips as nested TOML.**
   ```bash
   cf config set workflow.review_gates.pre_advance.review_type code
   cf config set workflow.review_gates.pre_advance.threshold concerns
   grep -A2 'review_gates' .context-forge.toml
   # expect a [workflow.review_gates.pre_advance] table with review_type/threshold
   ```

3. **Detection rule (unit-level, since no surface consumes `review` yet).**
   Run the detector test that points at a fixture project containing
   `project-documents/user/reviews/210-review.code.demo.md` and asserts
   `detectDocuments(path, 210, 'code').review` returns that path, while
   `detectDocuments(path, 210).review` (no type) returns `null`.
   ```bash
   pnpm --filter @context-forge/core test documentDetector
   ```

4. **No behavioral change to `cf next`.**
   On any existing project with gating left at defaults:
   ```bash
   cf next
   # expect identical recommendation/rationale to pre-slice output
   ```
   Confirmed by the regression test asserting an unchanged recommendation.

5. **Build is clean.**
   ```bash
   pnpm build && pnpm test
   ```

## Implementation Notes

### Development Approach

Suggested order (each step independently testable):

1. `types.ts` — add `review` field. (Compiles; existing detector returns object missing the field → TS error guides next step.)
2. `documentDetector.ts` — add `reviews/` scan, optional `reviewType`, last-match selection; populate `review`. Add tests.
3. `ConfigKeys.ts` — add the three global keys + four gate-override key pairs with enum/validate. Add config-validation tests.
4. `WorkflowNavigator.ts` — renumber cascade comments, insert reserved-slot placeholder comment. Add/confirm the `cf next` regression test.
5. `pnpm build && pnpm test`.

### Special Considerations

- **Do not let `review_gates` creep into gate logic.** The temptation will be to also wire the override resolution ("override else global") here. That is 241. This slice ships the keys inert; resist adding the consumer.
- **`at(-1)` vs `[0]`.** The review detector intentionally takes the last sorted match (most recent), unlike sibling detectors. Add an inline comment so a future reader doesn't "fix" it to `[0]`.
