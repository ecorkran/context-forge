---
docType: slice-design
slice: review-artifact-discovery-and-config-keys
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: []
interfaces: [241, 242, 243, 244]
dateCreated: 20260626
dateUpdated: 20260701
status: complete
---

# Slice Design: Review Artifact Discovery and Config Keys

## Overview

This is the foundation slice for initiative 240 (Review-Aware Workflow Gating). It adds the three things every later gate slice depends on, and **no gate logic of its own**:

1. A `review` discovery slot in `DocumentDetectionResult`, plus a detection rule in `documentDetector.ts` that locates a slice's review artifact by index and review type.
2. The three global review config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`) in `ConfigKeys.ts`, with `validate`/`enum` enforcement, plus the per-gate override (`workflow.review_gates.*`) namespace decision and structure.
3. A renaming of the `getNext()` branch comments from fragile ordinals (`Priority 1` … `2.5` … `7`) to named, category-prefixed branches (`GUARD:` / `LIFECYCLE:`), opening a labeled `review-gate` slot between `in-implementation` and `complete → advance` where slice 241 will add the gate branch.

After this slice, `cf next` / `workflow_next` behave **identically to today** — the new config keys default to off, the `review` slot is populated but read by nobody, and the branch renaming is comment-only. The slice is observable only through unit tests and `cf config list`.

## Value

Architectural enablement. This slice unblocks slices 241 (gate logic), 242 (consistency rule), and 244 (initiative-level gate) by giving each a stable interface to build on:

- 241 reads `detectionResult.review` and the three config keys to derive `pending-review` / `review-failed` and fills the reserved `LIFECYCLE: review-gate` branch.
- 242 reads the same detection slot and config to emit consistency findings.
- 244 reuses the detection rule with `reviewType = "arch"` at a different cascade point.

Delivering these as one isolated foundation slice keeps the higher-risk gate-logic slice (241) focused purely on decision logic, with its inputs already in place and tested.

## Technical Scope

**Included:**

- Add `review: string | null` to `DocumentDetectionResult` (`packages/core/src/introspection/types.ts`).
- Add a review-artifact detection rule to `detectDocuments()` (`packages/core/src/introspection/parsers/documentDetector.ts`) that scans `project-documents/user/reviews/` for `NNN-review.{reviewType}.*.md`.
- Add the three global config keys to `CONFIG_KEYS` (`packages/core/src/config/ConfigKeys.ts`) with `enum`/`validate` enforcement.
- Define the `workflow.review_gates.*` per-gate override config approach (decision documented below) and add its key definitions.
- Rename the `getNext()` branch comments (ordinals → named `GUARD:`/`LIFECYCLE:` branches) to reserve the gate insertion point.
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
| `getNext()` branches | `introspection/WorkflowNavigator.ts` | rename branch comments only (ordinals → named) |

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
- TOML bare keys disallow `-`, so transition names use `_` (`pre_advance`, `pre_slice_plan`, `pre_tasks`, `pre_implementation`). This is the one deviation from the arch doc's illustrative `pre-advance` spelling. It is a documentation obligation handed to slice 243 — see "Provides to Other Slices" below, where the requirement is captured explicitly so it is not lost. (243 is listed in this slice's `interfaces`.)

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

### TD-4: Name the cascade branches — comments only, no logic change

`getNext()` is a chain of early-return branches: it checks conditions top to bottom and returns the first matching recommendation. The branches are labeled only by comments, currently as ordinals (`// Priority 1` … `// Priority 7`, plus a wedged-in fraction `// Priority 2.5` at `WorkflowNavigator.ts:187`). Nothing reads these labels — they appear only as inline comments and one doc-comment cross-reference (`:318`), never in any `NextAction` field, CLI output, MCP response, or log. The **order of branches in the file** is what determines precedence; the labels are purely a map for whoever reads the source (human or AI).

**Problem with the ordinals.** They are labels standing in for logical structure — fragile by the project's own rule against that. Inserting the review gate between `in-implementation` and `complete → advance` leaves no integer free, and the existing `2.5` shows where that road leads. They also flatten two genuinely different kinds of branch into one "priority" list, which can mislead a reader (or an AI editing the file) into thinking each branch is a numbered workflow state.

**Decision: replace the ordinals with named branches, prefixed by category so the distinction is explicit.** Two categories:

- `GUARD:` — preconditions and routing checks. **Not** cf workflow phases. They run before (or instead of) any slice-lifecycle reasoning.
- `LIFECYCLE:` — branches that track a selected slice progressing through its work. Some map to a stock cf phase (noted inline); the review gate and the advance branch do **not** — the prefix deliberately avoids `PHASE:` so nothing implies they are stock cf phases.

```
current label            →  named branch                    category / note
Priority 1   no projectPath   // GUARD: no-project-path       precondition, not a cf phase
Priority 2   no fileSlice      // GUARD: no-active-slice       routing — dispatches to first-run / arch / plan / pick-slice
Priority 2.5 arch missing      // GUARD: arch-file-missing     precondition — slice selected but arch absent (fraction retired)
Priority 3   needs-design      // LIFECYCLE: needs-design      cf Phase 4
Priority 4   needs-tasks       // LIFECYCLE: needs-tasks       cf Phase 5
Priority 5   in-implementation // LIFECYCLE: in-implementation cf Phase 6
(insertion point)              // LIFECYCLE: review-gate       initiative 240 review gate (added slice 241) — NOT a stock cf phase
Priority 6   complete→advance  // LIFECYCLE: complete-advance  slice complete → recommend next slice (not a phase)
Priority 7   complete, no plan // GUARD: complete-no-plan      fallback — slice complete but no slice plan
```

This slice performs the rename and inserts a placeholder comment at the gate's home:

```
// LIFECYCLE: review-gate — reserved for initiative 240 review gate (added in slice 241).
// Not a stock cf workflow phase. No branch logic here yet.
```

It also updates the one stale cross-reference at `:318` ("falls through to standard Priority 2 logic" → "falls through to the `no-active-slice` guard"). No branch is added, removed, or reordered; the doc-comment at `:81` describing the function may be reworded but its meaning is unchanged. Behavior is byte-for-byte identical.

**Why named, not renumbered:** a named slot never needs re-labeling when the next branch is inserted, the `GUARD:`/`LIFECYCLE:` split stops a future editor from reading a routing guard as a workflow phase, and it satisfies the project rule against labels-as-logical-structure. The fraction is retired as a side effect, not as the goal.

**Why this lands in 240, not 241:** the rename is foundation/structure with no behavioral effect; folding it into 241 would bury a large comment-only diff inside the gate-logic review and obscure the actual decision matrix being added. 241 only fills the reserved `review-gate` slot with logic.

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
- **Reserved `LIFECYCLE: review-gate` slot** — the named insertion point for 241's branch (created by renaming the cascade branches and retiring the old `2.5` fraction; see TD-4).
- **To slice 243 (documentation): the TOML underscore-spelling obligation.** The per-gate transition names ship as `pre_advance`, `pre_slice_plan`, `pre_tasks`, `pre_implementation` (underscores, not the arch's illustrative `pre-advance` hyphens — TOML bare keys disallow `-`; see TD-1). Slice 243 must document the keys with the underscore spelling and explain the deviation from the arch's illustrative form, so users do not copy the hyphenated examples. This is the cross-slice commitment that resolves review finding F008.

### Consumes from Other Slices

Nothing. Foundation slice.

### Deferred to Other Slices

- **File-read / parse failure handling → slice 241 (per arch §Technical Considerations).** The arch requires that a review file which exists but cannot be parsed (malformed YAML, unreadable encoding, permission error) must **not** silently pass — it is treated as `UNKNOWN` and `review_unknown_as` applies. This slice deliberately does not parse review frontmatter; `detectDocuments` only *locates* the file and returns its path (or `null` when absent). All verdict reading and the UNKNOWN/unparseable failure-mode evaluation are gate logic owned by slice 241. 240 does not implement, partially handle, or silently swallow these cases — it never opens the file. This explicit acknowledgment resolves review finding F009.

## Success Criteria

### Functional Requirements

- `DocumentDetectionResult` has a `review` field; `detectDocuments` populates it from `reviews/` when a `reviewType` is supplied, selecting the lexicographically last match, and leaves it `null` otherwise.
- `cf config list` shows the three new `workflow.review_*` keys with their defaults and descriptions.
- `cf config set workflow.review_threshold bogus` fails with a validation error naming the allowed values; `cf config set workflow.review_threshold pass` succeeds.
- The four `workflow.review_gates.*.{review_type,threshold}` keys are settable and round-trip through `.context-forge.toml` as a nested table.
- `cf next` / `workflow_next` output is unchanged from before this slice for any project (gating off by default; branch rename is comment-only).

### Technical Requirements

- Unit tests:
  - detection rule: match found (single), multiple matches → last wins, no `reviewType` → null, empty/missing `reviews/` dir → null, non-matching index → null.
  - config validation: valid/invalid `review_threshold`, valid/invalid `review_unknown_as`, `review_enabled` type check.
  - existing `detectDocuments` callers still pass (two-arg invocation, `review` null).
- `pnpm build` and existing test suite pass with no `cf next` behavioral diff (a regression test asserting an unchanged recommendation for a sample project is sufficient).
- No `any`; explicit return types on changed exported functions.

### Verification Walkthrough

This is the demo script proving the slice delivers its (foundation-level) value. Verified during Phase 6 implementation; commands and output below are what actually ran.

1. **Config keys exist and validate.**

   Correction from the original draft: the CLI has no `cf config list` subcommand. Listing all keys is `cf config get` with no key argument (per `cf config --help`: "Get a configuration key, or show all keys if none specified").

   ```bash
   cd packages/cli
   node dist/index.js config get | grep workflow.review
   # actual output:
   #   workflow.review_enabled                               false      default
   #   workflow.review_threshold                             concerns   default
   #   workflow.review_unknown_as                            fail       default
   #   workflow.review_gates.pre_advance.review_type                    default
   #   workflow.review_gates.pre_advance.threshold                      default
   #   workflow.review_gates.pre_slice_plan.review_type                 default
   #   workflow.review_gates.pre_slice_plan.threshold                   default
   #   workflow.review_gates.pre_tasks.review_type                      default
   #   workflow.review_gates.pre_tasks.threshold                        default
   #   workflow.review_gates.pre_implementation.review_type             default
   #   workflow.review_gates.pre_implementation.threshold               default

   node dist/index.js config set workflow.review_threshold bogus
   # actual output:
   #   Error: Config key "workflow.review_threshold" must be one of ["pass", "concerns"], got "bogus"

   node dist/index.js config set workflow.review_threshold pass --project <scratch-dir>
   node dist/index.js config get workflow.review_threshold --project <scratch-dir>
   # actual output:
   #   Key:     workflow.review_threshold
   #   Value:   pass
   #   Source:  project
   ```
   Caveat: use a scratch/throwaway `--project` dir for this step (or a disposable user config) — `set` persists to real config files.

2. **Per-gate override round-trips as nested TOML.**
   ```bash
   node dist/index.js config set workflow.review_gates.pre_advance.review_type code --project <scratch-dir>
   node dist/index.js config set workflow.review_gates.pre_advance.threshold concerns --project <scratch-dir>
   grep -A2 'review_gates' <scratch-dir>/.context-forge.toml
   # actual output:
   #   [workflow.review_gates.pre_advance]
   #   review_type = "code"
   #   threshold = "concerns"
   ```

3. **Detection rule (unit-level, since no surface consumes `review` yet).**

   Correction: the fixture uses index 100 (the existing shared introspection fixture), not 210 — three files were added under `packages/core/tests/fixtures/introspection/project/project-documents/user/reviews/`: `100-review.code.first-pass.md`, `100-review.code.second-pass.md`, `100-review.arch.only-pass.md`. `detectDocuments(path, 100, 'code').review` resolves to the `second-pass` file (lexicographically last); `detectDocuments(path, 100).review` (no type) returns `null`.
   ```bash
   pnpm --filter @context-forge/core test documentDetector
   # actual: 15 passed (15)
   ```

4. **No behavioral change to `cf next`.**
   Confirmed via the full existing `WorkflowNavigator.test.ts` suite (49 pre-existing `getNext()`/status tests, all asserting full recommendation objects) plus one explicit regression test added for this slice (`produces an unchanged recommendation for in-implementation after the branch rename (240 baseline)`), asserting the complete `NextAction` object is unchanged after the `Priority N` → `GUARD:`/`LIFECYCLE:` comment rename.
   ```bash
   pnpm --filter @context-forge/core test WorkflowNavigator
   # actual: 50 passed (50)
   ```

5. **Build is clean.**
   ```bash
   pnpm -r build   # actual: all 5 workspace packages built clean
   pnpm -r test    # actual: only 7 pre-existing failures unrelated to this slice —
                   # 3 in packages/core/tests/storage/FileProjectStore.test.ts (field-migration
                   # regression from commit 88d9364, already on main) and 4 in
                   # packages/cli/tests/commands/list.test.ts ("cf list initiatives", also
                   # pre-existing on main, zero diff in packages/cli/ from this slice).
                   # All 826 other core tests pass, all 183 mcp tests pass.
   ```

## Implementation Notes

### Development Approach

Suggested order (each step independently testable):

1. `types.ts` — add `review` field. (Compiles; existing detector returns object missing the field → TS error guides next step.)
2. `documentDetector.ts` — add `reviews/` scan, optional `reviewType`, last-match selection; populate `review`. Add tests.
3. `ConfigKeys.ts` — add the three global keys + four gate-override key pairs with enum/validate. Add config-validation tests.
4. `WorkflowNavigator.ts` — rename branch comments (ordinals → `GUARD:`/`LIFECYCLE:`), insert the reserved `review-gate` placeholder comment, fix the stale `:318` cross-reference. Add/confirm the `cf next` regression test.
5. `pnpm build && pnpm test`.

### Special Considerations

- **Do not let `review_gates` creep into gate logic.** The temptation will be to also wire the override resolution ("override else global") here. That is 241. This slice ships the keys inert; resist adding the consumer.
- **`at(-1)` vs `[0]`.** The review detector intentionally takes the last sorted match (most recent), unlike sibling detectors. Add an inline comment so a future reader doesn't "fix" it to `[0]`.
