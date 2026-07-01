---
docType: tasks
slice: review-artifact-discovery-and-config-keys
project: context-forge
lld: project-documents/user/slices/240-slice.review-artifact-discovery-and-config-keys.md
dependencies: []
projectState: >-
  Initiative 160 infrastructure (WorkflowNavigator, ConfigKeys, documentDetector)
  is in place. detectDocuments() is the two-arg version with no review slot;
  DocumentDetectionResult has no review field; CONFIG_KEYS has no review keys;
  getNext() branches are labeled with ordinal comments (Priority 1..7, plus 2.5).
dateCreated: 20260630
dateUpdated: 20260630
status: not_started
---

## Context Summary

- Working on the **240 foundation slice** for initiative 240 (Review-Aware Workflow Gating).
- This slice adds the interfaces every later gate slice depends on and **no gate logic of its own**. After it lands, `cf next` / `workflow_next` behave identically to today.
- Three independent edit sites in `@context-forge/core`, no new modules:
  1. `DocumentDetectionResult.review` field + a review-artifact detection rule in `documentDetector.ts`.
  2. Three global review config keys + four per-gate override key pairs in `ConfigKeys.ts`.
  3. Comment-only rename of `getNext()` cascade branches (ordinals → `GUARD:`/`LIFECYCLE:`), reserving a `review-gate` slot.
- **Key assumptions (from the design — do not re-decide):**
  - The review detector takes an **optional `reviewType`**; when omitted, `review` is `null` (no guessing).
  - The review detector selects the **lexicographically last** match (`at(-1)`), unlike sibling detectors which take `[0]`. This is deliberate (reviews accrue over re-runs).
  - Per-gate overrides are **flat dotted scalar keys** (TD-1), not a nested-object schema extension. Transition names use **underscores** (`pre_advance`, `pre_slice_plan`, `pre_tasks`, `pre_implementation`) because TOML bare keys disallow `-`.
  - Config threshold tokens are **lowercase** (`pass`, `concerns`), distinct from uppercase verdict vocabulary that slice 241 reads. 240 ships keys **inert** — no consumer.
  - The branch rename is **comment-only**; behavior must be byte-for-byte identical.
- **Dependencies:** none (purely additive). **Provides to:** 241 (gate logic), 242 (consistency rule), 243 (docs), 244 (initiative gate).
- **Next planned slice:** 241 — fills the reserved `review-gate` slot with decision logic, consumes the config keys and `detectionResult.review`.

Reference the slice design (`lld` above) rather than re-deriving decisions. Relevant sections: TD-1..TD-4, Success Criteria, Verification Walkthrough.

---

## Tasks

### 1. Setup and baseline

- [ ] **1.1 Confirm working branch and clean baseline** — Effort: 1/5
  - [ ] On branch `240-planning.review-aware-workflow-gating` (planning artifacts) per Git Rules. Confirm with `git branch --show-current`.
  - [ ] `pnpm -r build` and `pnpm -r test` pass before any change (establishes the green baseline this slice must preserve).
  - [ ] Success: build + full suite green; working tree clean.

- [ ] **1.2 Capture the `cf next` regression baseline** — Effort: 1/5
  - [ ] Identify the existing `getNext()` test fixture/sample project used by `packages/core/tests/introspection/WorkflowNavigator.test.ts`.
  - [ ] Note (do not yet add a test) the current recommendation+rationale for one representative project state, to assert unchanged after the branch rename in Task 8.
  - [ ] Success: a documented expected `NextAction` for at least one fixture state, referenced by Task 8's regression test.

### 2. DocumentDetectionResult.review field

- [ ] **2.1 Add `review` field to `DocumentDetectionResult`** — Effort: 1/5
  - [ ] In `packages/core/src/introspection/types.ts`, add `review: string | null;` to the `DocumentDetectionResult` interface (sibling to `sliceDesign`/`architecture`/`slicePlan`).
  - [ ] Do not change any other field.
  - [ ] Success: `pnpm --filter @context-forge/core typecheck` now reports an error in `documentDetector.ts` (the returned object is missing `review`). This expected error guides Task 3 and confirms the field is wired into the type.

### 3. Review-artifact detection rule

- [ ] **3.1 Extend `detectDocuments` with optional `reviewType` and reviews scan** — Effort: 3/5
  - [ ] In `packages/core/src/introspection/parsers/documentDetector.ts`, add a third optional parameter `reviewType?: string` to `detectDocuments` (signature per TD-2). Keep the explicit `Promise<DocumentDetectionResult>` return type.
  - [ ] Add `reviews` to the existing `Promise.all` `safeReaddir` batch (do **not** add a separate `await`) — matches the current concurrency pattern. Use `join(projectPath, USER_DOCS, 'reviews')`.
  - [ ] When `reviewType` is provided, match with the existing `matchFiles(reviewFiles, \`${idx}-review.${reviewType}.\`, join(USER_DOCS, 'reviews'))` and set `review` to the **lexicographically last** match (`matches.at(-1) ?? null`).
  - [ ] When `reviewType` is omitted, set `review = null` without scanning/matching. The detector never infers a review type.
  - [ ] Add the `review` field to the returned object.
  - [ ] Add an inline comment at the selection site explaining `at(-1)` (last/most-recent) vs sibling detectors' `[0]`, so a future reader does not "fix" it (per Special Considerations).
  - [ ] No `any`; `review` is `string | null`.
  - [ ] Success: typecheck passes (Task 2.1 error resolved); existing two-arg callers compile unchanged.

- [ ] **3.2 Unit tests for the detection rule** — Effort: 2/5
  - [ ] In `packages/core/tests/introspection/documentDetector.test.ts`, add a fixture (or temp dir) containing `project-documents/user/reviews/` with review files for a test index.
  - [ ] Cover the cases from Success Criteria → Technical Requirements:
    1. single match found with `reviewType` supplied → returns that path
    2. multiple matches → **last** (lexicographic) wins
    3. `reviewType` omitted → `review` is `null` (even when matching files exist)
    4. empty/missing `reviews/` dir → `null`
    5. non-matching index → `null`
  - [ ] Add/confirm a test that an existing two-arg `detectDocuments(path, idx)` call returns `review: null` and is otherwise unchanged.
  - [ ] Success: `pnpm --filter @context-forge/core test documentDetector` passes all new + existing cases.

### 4. Global review config keys

- [ ] **4.1 Add `workflow.review_enabled`** — Effort: 1/5
  - [ ] In `packages/core/src/config/ConfigKeys.ts`, add the boolean key with `default: false` and the description from TD-3, placed in the existing `workflow.*` ordering.
  - [ ] Success: key present with correct type/default/description; file still valid TS.

- [ ] **4.2 Add `workflow.review_threshold`** — Effort: 1/5
  - [ ] Add the string key with `default: 'concerns'`, `enum: ['pass', 'concerns']`, and the TD-3 description (lowercase tokens).
  - [ ] Success: key present with enum enforcement via the existing `validate`/`enum` path.

- [ ] **4.3 Add `workflow.review_unknown_as`** — Effort: 1/5
  - [ ] Add the string key with `default: 'fail'`, `enum: ['fail', 'concern', 'pass']`, and the TD-3 description.
  - [ ] Success: key present with enum enforcement.

- [ ] **4.4 Unit tests for global key validation** — Effort: 2/5
  - [ ] In `packages/core/tests/config/` (extend `ConfigManager.test.ts` or add a `ConfigKeys` test consistent with the existing setup), cover Success Criteria → Technical Requirements:
    - valid + invalid `review_threshold` (e.g. `pass` ok, `bogus` rejected with a message naming allowed values)
    - valid + invalid `review_unknown_as`
    - `review_enabled` type check (boolean accepted, non-boolean rejected)
  - [ ] Success: `pnpm --filter @context-forge/core test` passes the new validation cases.

### 5. Per-gate override config keys (flat dotted scalars — TD-1)

- [ ] **5.1 Add `pre_advance` override key pair** — Effort: 1/5
  - [ ] Add `workflow.review_gates.pre_advance.review_type` and `workflow.review_gates.pre_advance.threshold` as flat scalar string keys, `default: ''` (empty = "use the global key"). Apply the same enum as the global `review_threshold` to the `.threshold` key; `.review_type` is a free string for now (its vocabulary is gate logic, 241).
  - [ ] Success: both keys present; empty default; no consumer added.

- [ ] **5.2 Add `pre_slice_plan` override key pair** — Effort: 1/5
  - [ ] Mirror 5.1 for `workflow.review_gates.pre_slice_plan.{review_type,threshold}`.
  - [ ] Success: both keys present.

- [ ] **5.3 Add `pre_tasks` override key pair** — Effort: 1/5
  - [ ] Mirror 5.1 for `workflow.review_gates.pre_tasks.{review_type,threshold}`.
  - [ ] Success: both keys present.

- [ ] **5.4 Add `pre_implementation` override key pair** — Effort: 1/5
  - [ ] Mirror 5.1 for `workflow.review_gates.pre_implementation.{review_type,threshold}`.
  - [ ] Success: both keys present. (Underscore spelling per TD-1 — do not use hyphens.)

- [ ] **5.5 Unit test for override key round-trip** — Effort: 2/5
  - [ ] Add a test that setting `workflow.review_gates.pre_advance.review_type` and `.threshold` persists and reads back via `ConfigManager.get`, and renders as a nested `[workflow.review_gates.pre_advance]` table in `.context-forge.toml` (read the written TOML in the test).
  - [ ] Confirm the `.threshold` override rejects an out-of-enum value if the enum is applied.
  - [ ] Success: round-trip test passes; nested-table rendering verified.

### 6. Checkpoint commit (additive interfaces complete)

- [ ] **6.1 Build, test, commit** — Effort: 1/5
  - [ ] `pnpm -r build && pnpm -r test` green.
  - [ ] Commit from project root. Suggested: `feat(core): add review detection slot and review config keys`.
  - [ ] Success: clean buildable checkpoint before the comment-only WorkflowNavigator change.

### 7. Rename getNext() cascade branches (comment-only — TD-4)

- [ ] **7.1 Replace ordinal branch comments with named `GUARD:`/`LIFECYCLE:` labels** — Effort: 2/5
  - [ ] In `packages/core/src/introspection/WorkflowNavigator.ts`, rename the branch comments exactly per the TD-4 mapping table:
    - `Priority 1` → `GUARD: no-project-path`
    - `Priority 2` → `GUARD: no-active-slice`
    - `Priority 2.5` → `GUARD: arch-file-missing` (fraction retired)
    - `Priority 3` → `LIFECYCLE: needs-design` (cf Phase 4)
    - `Priority 4` → `LIFECYCLE: needs-tasks` (cf Phase 5)
    - `Priority 5` → `LIFECYCLE: in-implementation` (cf Phase 6)
    - `Priority 6` → `LIFECYCLE: complete-advance`
    - `Priority 7` → `GUARD: complete-no-plan`
  - [ ] **Do not add, remove, or reorder any branch.** Comments only. Branch order (precedence) is unchanged.
  - [ ] Success: all `Priority N` comments gone; no logic diff (verify with `git diff` showing only comment lines changed).

- [ ] **7.2 Insert the reserved `review-gate` placeholder comment** — Effort: 1/5
  - [ ] Between the `LIFECYCLE: in-implementation` branch and the `LIFECYCLE: complete-advance` branch, insert the placeholder comment block from TD-4 (reserved for initiative 240 review gate, added in slice 241; not a stock cf phase; no branch logic here yet).
  - [ ] Success: placeholder present at the correct insertion point; no executable code added.

- [ ] **7.3 Fix the stale cross-reference and reword the doc-comment** — Effort: 1/5
  - [ ] Update the `:318` cross-reference: "falls through to standard Priority 2 logic" → "falls through to the `no-active-slice` guard".
  - [ ] Optionally reword the function doc-comment at `:81` if it references ordinals; meaning must stay unchanged.
  - [ ] Success: no remaining references to the retired ordinals anywhere in the file.

- [ ] **7.4 `cf next` regression test (no behavioral change)** — Effort: 2/5
  - [ ] In `packages/core/tests/introspection/WorkflowNavigator.test.ts`, add (or confirm) a test asserting the recommendation+rationale for the Task 1.2 baseline fixture is **identical** to the pre-change value.
  - [ ] Success: regression test passes, proving the rename is behavior-preserving.

### 8. Final validation and commit

- [ ] **8.1 Full build + test + behavioral check** — Effort: 1/5
  - [ ] `pnpm -r build && pnpm -r test` green.
  - [ ] Run the Verification Walkthrough steps 1–4 from the design (config keys list/validate, override round-trip, detector unit test, `cf next` unchanged). Step 5 (build) is covered above.
  - [ ] Confirm no `any` introduced and explicit return types on changed exported functions.
  - [ ] Success: all walkthrough checks pass; suite green.

- [ ] **8.2 Commit** — Effort: 1/5
  - [ ] Commit from project root. Suggested: `refactor(core): name getNext branches and reserve review-gate slot`.
  - [ ] Success: working tree clean; both checkpoints (Task 6, Task 8) recorded.

---

## Coverage Map (design element → task)

- TD-1 per-gate override schema (flat dotted keys, underscores) → Tasks 5.1–5.5
- TD-2 optional `reviewType`, no-guess, `at(-1)` selection → Tasks 3.1–3.2
- TD-3 three global keys with enum/validate, conservative defaults → Tasks 4.1–4.4
- TD-4 branch rename, reserved slot, stale-reference fix, behavior-identical → Tasks 7.1–7.4, 1.2
- `DocumentDetectionResult.review` field → Task 2.1
- Success Criteria → Technical Requirements (test matrix) → Tasks 3.2, 4.4, 5.5, 7.4
- Cross-slice obligations: F008 underscore spelling handed to 243; F009 parse-failure deferred to 241 — **no task here** (explicitly out of scope; recorded in design Integration Points).

## Out of Scope (do not implement here)

- Any reading/consuming of the new config keys or `detectionResult.review` (→ 241).
- Review frontmatter parsing, verdict/threshold comparison, `review_unknown_as` evaluation, parse-failure handling (→ 241).
- `ConsistencyChecker` rule (→ 242).
- README/docs updates beyond config-key `description` strings; TOML underscore-spelling documentation (→ 243).
- Initiative-level (`pre-slice-plan`) detection wiring (→ 244).
