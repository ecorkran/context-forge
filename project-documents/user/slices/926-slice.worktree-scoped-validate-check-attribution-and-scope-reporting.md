---
docType: slice-design
project: context-forge
slice: 926
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
dateCreated: 20260922
dateUpdated: 20260922
status: not_started
---

# Slice Design: 926 — Worktree-Scoped Validate/Check Attribution and Scope Reporting

## Overview

Fixes GitHub issues #88, #92, #96, and #87 — four defects on the worktree-aware validation and check surface. Three of them (#88, #92, #96) make `cf validate frontmatter` report a clean pass when it examined nothing; the fourth (#87) makes `cf check` blame the wrong checkout for a finding.

All four share one root question the codebase answers inconsistently: *which checkout does this path belong to?* `cf check` already answers it (`applyWorktreeOverlay` per worktree, [check.ts:221-223](packages/cli/src/commands/check.ts#L221-L223)); `cf validate frontmatter` never asks it, and `cf check` discards the answer before rendering. This slice makes both commands resolve and retain worktree identity, and makes the validator say what it skipped instead of silently returning zero.

The defects are all **silent** — exit 0, no warning. Two external consumers depend on this surface: squadron's pre-commit frontmatter gate and its `test_schema_drift.py` suite, which asserts on `filesChecked` precisely because a zero cannot currently be trusted.

## Value

Developer-facing and tooling-facing.

- A validator that reports "0 files checked" when it should have checked something is worse than no validator — it produces false confidence, and both a CI step and a human reading exit 0 conclude the documents are fine. #88 makes this the *normal* outcome inside a worktree.
- `cf check` misattribution costs real investigation time. The issue reporter went looking for a filename-matching bug that did not exist, and nearly missed a genuine finding sitting in the same output. Worktrees are becoming the normal way to run several agents on one project, and a lagging branch is the ordinary state of one — so this noise grows with parallelism and is worst exactly when parallelism is highest.
- #96 unblocks squadron's commit gate. Today it must fail closed on any `filesChecked: 0`, forcing `--no-verify` on every release-shaped commit (`CHANGELOG.md`, `pyproject.toml`, `uv.lock` — all legitimately out of scope). It also lets squadron delete a local duplicate of cf's scope predicate.

## Technical Scope

**Included:**

1. Worktree-correct root resolution for `cf validate frontmatter` (#88).
2. A per-path outcome report in the validator result, replacing silent skipping (#92, #96).
3. Worktree attribution on `cf check` findings, in both terminal and JSON output (#87).
4. A single shared path→worktree resolution helper used by both commands.
5. Extraction of the duplicated `mergeCheckResults` into core, so the CLI and the MCP `workflow_check` tool share one attribution-aware merge.

**Explicitly excluded:**

- Changing *which* files are in scope. `project-documents/user/**` remains the document root; this slice reports the boundary accurately, it does not move it. Validating root-level `DEVLOG.md` is out of scope — #92 asks for a diagnostic, not inclusion.
- `--worktree` / `--this-worktree` filter flags on `cf check`. Issue #87 lists these as follow-on considerations, not required for the fix. Attribution first; filtering can be proposed separately once labels reveal the real volume.
- Any change to frontmatter schema rules or `--fix` behavior.
- Recursive document discovery. `discoverAllDocuments` stays non-recursive over `DOC_SCAN_DIRS`.

## Dependencies

### Prerequisites

None. Worktree registration, detection, and overlay all exist and ship today:
- `resolveProjectWorktree` — [packages/cli/src/utils/project.ts:119](packages/cli/src/utils/project.ts#L119), already returns `worktreeId`
- `findProjectByCwd` — [packages/cli/src/utils/project.ts:38](packages/cli/src/utils/project.ts#L38), longest-prefix match over `projectPath` + every `worktreePath`
- `applyWorktreeOverlay` — `packages/core/src/utils/worktree-overlay.ts:4`
- `resolveOperationPath` — `packages/cli/src/utils/worktree-overlay.ts:16`

### Interfaces Required

- `WorktreeContext` ([packages/core/src/types/worktree.ts:6](packages/core/src/types/worktree.ts#L6)) — supplies `id`, `name`, and `worktreePath`, everything the attribution label needs.
- `FileProjectStore` for project/worktree records.
- `ConsistencyFinding` — `packages/core/src/introspection/types.ts:232-245` (`rule`, `severity`, `location`, `description`, `suggestedFix`, `fixable`, optional `fixAction`). No worktree field exists; one is added.
- `ConsistencyCheckResult` — `packages/core/src/introspection/types.ts:247-256`.

## Architecture

### Component Structure

**New: shared path→worktree resolver.** A single function answering "which registered checkout owns this absolute path?", placed in core so both the validator and check can use it:

```
packages/core/src/utils/worktree-overlay.ts  (or a sibling module)
  resolveWorktreeForPath(project, absolutePath) -> { worktreeId?, name, rootPath } | null
```

It reuses the longest-prefix-wins rule already implemented in `findProjectByCwd`, generalized from `process.cwd()` to an arbitrary path argument. `findProjectByCwd` is refactored to call it, so the matching rule exists once. This is the "shared primitive" the slice plan entry requires — note it is a *generalization of existing logic*, not a new concept.

**Changed: `frontmatterFileValidator`** ([packages/core/src/schema/frontmatterFileValidator.ts](packages/core/src/schema/frontmatterFileValidator.ts)) — `resolveExplicitPaths` (lines 52–66) currently drops paths through three unrecorded `continue` branches; the main loop adds a fourth at line 94. All four become recorded outcomes.

**Changed: `validate` command** ([packages/cli/src/commands/validate.ts](packages/cli/src/commands/validate.ts)) — line 89 destructures only `{ id }` from `resolveProjectWorktree`, discarding `worktreeId`; line 100 then passes the Identity `project.projectPath`. This one-line discard is #88's entire root cause.

**Changed: `check` command** ([packages/cli/src/commands/check.ts](packages/cli/src/commands/check.ts)) — `mergeCheckResults` (lines 47–71) and `printCheckOutput` (lines 273–310). Note `printCheckOutput` currently receives only `projectName`, so worktree information is not merely dropped at render time — it never reaches the renderer at all.

**Changed: MCP `workflow_check`.** `mergeCheckResults` is **duplicated verbatim** in `packages/mcp-server/src/tools/workflowTools.ts:26-52`, with the same per-worktree view building at lines 275–283. Both copies already carry a `// TODO: Extract to @context-forge/core shared utility`. Fixing only the CLI copy would leave the MCP tool misattributing findings — so the merge (with attribution) is extracted to core and both call sites use it. This turns a pre-existing TODO into a requirement of this slice rather than optional cleanup.

### Data Flow

**`cf validate frontmatter <paths>` today (#88):**

```
CWD (inside worktree)
  → resolveProjectWorktree → { id, worktreeId }   ← worktreeId computed
  → store.getById(id).projectPath                 ← worktreeId DISCARDED
  → documentRoot = <identity path>/project-documents/user
  → relative(documentRoot, <worktree file>) starts with '..'  → skipped
  → filesChecked: 0, exit 0                        ← silent false pass
```

**After:**

```
CWD (inside worktree)
  → resolveProjectWorktree → { id, worktreeId }
  → resolveOperationPath(project, worktreeId)     ← worktreeId APPLIED
  → documentRoot = <worktree path>/project-documents/user
  → path is in-root → checked
```

Each explicit path additionally yields a recorded outcome rather than a silent `continue`.

**`cf check` today (#87):** one project view per worktree (lines 221–223) → `checker.checkAll(view)` per view → `mergeCheckResults` flattens all findings into one list and sets `projectPath = results[0].projectPath` (line 60) → renderer prints findings with no worktree mention.

**After:** each view carries its worktree identity into the findings it produces, so attribution survives the merge.

**Critical ordering constraint:** the dedup key at [check.ts:53](packages/cli/src/commands/check.ts#L53) is `rule|location|description` — no worktree component. Attribution must therefore be attached to each finding *before* the merge loop, not derived afterward. Deriving it after merge would be impossible for genuinely duplicate findings and wrong for the first-seen-wins case.

A second constraint: aggregate rules run per view and legitimately produce identical findings across views (the comment at lines 217–219 says dedup collapses them "correctly"). Adding worktree identity to the dedup key would therefore *break* that collapse and multiply project-level findings by worktree count. The dedup key must stay as-is; attribution rides alongside it.

### State Management

No persistent state. All resolution is per-invocation and read-only against the existing project record. Nothing is written to project config.

## Technical Decisions

### Technology Choices

No new libraries. Node `path` primitives (`resolve`, `relative`, `isAbsolute`) already do the containment test.

**D1 — Generalize `findProjectByCwd`'s matcher rather than write a new one.** The longest-prefix-wins rule, including the worktree-preferred-on-tie tiebreak ([project.ts:70-77](packages/cli/src/utils/project.ts#L70-L77)), is subtle and already correct. Duplicating it would guarantee eventual divergence — the exact failure this slice exists to fix. Rejected: a fresh resolver in the validator.

**D2 — Place the shared resolver in core, not CLI.** A `TODO(slice-186)` at [project.ts:97](packages/cli/src/utils/project.ts#L97) already anticipates this extraction. The validator lives in core and must not depend on CLI.

**D3 — Additive JSON only.** The validate JSON shape is built inline at [validate.ts:137-148](packages/cli/src/commands/validate.ts#L137-L148) with no declared interface. All five existing fields (`filesChecked`, `totalFindings`, `errors`, `warnings`, `findings`) keep their current meaning and type. New fields are added alongside. This is a hard constraint: squadron's gate parses this output today, and a consumer that ignores the new fields must behave exactly as it does now. The same applies to `cf check --json`.

Part of this decision is to **declare the interface** while adding to it — the current untyped `Record<string, unknown>` is how the shape drifted from documentation in the first place.

**D4 — Report per-path outcomes, not just a skipped count.** Issue #96 asks for either a `filesSkipped` array or a per-file status list. A per-path outcome with a *reason* is chosen because the reasons are not interchangeable: "out of scope" is benign and a caller should proceed; "not found" is benign for a staged deletion; "no frontmatter" may be a real defect. A bare count collapses these again and would leave #96 half-fixed.

Proposed outcome vocabulary (a discriminated union, per the project's TypeScript rules, defined once as a `const` object and referenced everywhere — never scattered string literals):

| Outcome | Meaning | Caller action |
|---|---|---|
| `checked` | frontmatter parsed and validated | trust findings |
| `skipped-out-of-scope` | valid path, outside the document root | safe to ignore |
| `skipped-not-markdown` | not a `.md` file | safe to ignore |
| `skipped-not-found` | path does not exist (e.g. staged deletion) | safe to ignore |
| `skipped-no-frontmatter` | file exists in scope but has no parseable frontmatter | may warrant attention |

This distinction is what lets squadron stop failing closed on a bare zero: "every path resolved to `skipped-out-of-scope`" is provably benign, whereas zero paths with no explanation is not.

**D5 — Emit the resolved document root in validate's JSON.** Validate currently emits no `projectPath` at all, so a consumer cannot tell which checkout was scanned — the precise blind spot that let #88 go unnoticed. `cf check` already emits one. Adding it makes the #88 class of bug self-diagnosing in future.

**D5a — Carry worktree identity as a structured field, not a description prefix.** There is an existing precedent for the opposite: slice attribution is smuggled into the description string at `ConsistencyChecker.ts:128-131` (`[917] ...`) and parsed back out with a regex at [check.ts:100-104](packages/cli/src/commands/check.ts#L100-L104). Do **not** extend that pattern — it violates the project rule against using user-visible labels as logical structure, and it would force JSON consumers to regex a display string. Worktree identity becomes a real field on the finding.

Related constraint: `location` cannot be used to derive attribution, because it is not always a filesystem path — `ConsistencyChecker.ts:461` emits `slice plan entry ${sliceIndex}` as a `location`. Attribution must come from the view that produced the finding, not from parsing `location`.

**D6 — Keep `cf check`'s top-level `projectPath`, add per-finding attribution.** Issue #87 notes `projectPath` names the invoking checkout even for foreign findings. Changing or removing it would be a breaking change for existing consumers. Instead it keeps its literal meaning (the invoking checkout) and per-finding worktree identity is added where the ambiguity actually is. Consider documenting the field's meaning rather than altering it.

### Patterns and Conventions

- Outcome constants defined once as an `as const` object with a derived union type; no bare string literals at comparison sites.
- Exported functions carry explicit return types.
- Error handling: this slice *removes* silent-skip behavior; it must not introduce any. Every new branch either records an outcome or raises.
- A worktree with no `worktreePath` set falls back to the project path — matching `WorktreeService`'s existing treatment of the implicit `default` worktree.

## Implementation Details

### Migration Plan

Not a code-move slice, but it does change a published output contract, so the compatibility path is stated explicitly.

- **Changing:** validate's JSON gains fields; check's JSON gains per-finding attribution; check's terminal output gains a worktree label.
- **Consumers inside this repo:** `packages/cli/tests/commands/validate.test.ts` and `packages/core/tests/schema/frontmatterFileValidator.test.ts` assert on the current shape and must be updated in the same slice.
- **Consumers outside this repo:** squadron's `frontmatter_gate.py` and `tests/documents/test_schema_drift.py`. Neither may break. Because every change is additive (D3), an unmodified squadron continues to work — it simply keeps fail-closing on zero until it opts into the new fields. **This slice does not require a coordinated squadron release.**
- **Behavior preservation:** for every invocation from the default checkout with in-scope paths, `filesChecked` and `findings` must be byte-identical to today. A regression test should pin this.

### API Contracts

**`cf validate frontmatter --json`** — existing fields unchanged, plus:

```jsonc
{
  "filesChecked": 2,
  "totalFindings": 0,
  "errors": 0,
  "warnings": 0,
  "findings": [],

  // new
  "documentRoot": "/path/to/active/checkout/project-documents/user",
  "paths": [
    { "path": "project-documents/user/slices/926-slice.foo.md", "outcome": "checked" },
    { "path": "CHANGELOG.md", "outcome": "skipped-out-of-scope" }
  ],
  "filesSkipped": 1
}
```

`paths` is emitted for explicit-path invocations. For the no-paths full-walk form it is omitted or empty — a walk has no caller-supplied paths to report on, and listing all ~500 discovered documents would bloat the output for no consumer benefit. Task breakdown should confirm this choice against squadron's gate, which always passes explicit paths.

`filesSkipped` is a convenience count derived from `paths`; it satisfies the literal wording of #96 for consumers that want a cheap check.

**`cf check --json`** — per-finding, additive:

```jsonc
{
  "projectPath": "/path/to/invoking/checkout",   // unchanged meaning (D6)
  "findings": [
    {
      "rule": "review-gate",
      "location": "/path/to/other-worktree/project-documents/user/...",
      "description": "...",
      "worktree": { "name": "squadron-pr", "path": "/path/to/other-worktree" }  // new
    }
  ]
}
```

**`cf check` terminal output** — a label prefix, per #87's suggestion:

```
  Slice 917
  ⚠ [squadron-pr] [917] Slice 917 requires a tasks review before proceeding — no review artifact found.
    → Run the tasks review for slice 917
```

The label should be suppressed when the project has no registered worktrees (or only `default`), so single-checkout users see no change. Exact placement is a rendering detail for task breakdown; the requirement is that a reader can tell at a glance which checkout a finding belongs to.

## Integration Points

### Provides to Other Slices

- `resolveWorktreeForPath` — a reusable core answer to "which checkout owns this path?", available to any future command with the same question.
- A typed validate-result contract replacing the inline `Record<string, unknown>`.

### Consumes from Other Slices

Consumes the worktree registration/overlay machinery from the 180–188 worktree initiative. That work is complete and stable; this slice adds no requirements to it.

**External coupling:** squadron is a live consumer. Additive-only output (D3) means no lockstep release is needed. Once shipped, squadron can delete its duplicated scope predicate — that cleanup belongs to squadron, not this slice.

## Success Criteria

### Functional Requirements

1. **(#88)** `cf validate frontmatter <path>` run from a registered sibling worktree, against a path inside that worktree, reports `filesChecked: 1` — not 0. The repro table in #88 inverts: the in-worktree file is now the one that validates.
2. **(#88)** Bare `cf validate frontmatter` from a worktree continues to walk that worktree correctly (unchanged behavior).
3. **(#92)** `cf validate frontmatter --json DEVLOG.md` still reports `filesChecked: 0`, but now also reports that path with outcome `skipped-out-of-scope`. The file remains out of scope; the silence is what is fixed.
4. **(#96)** A caller can distinguish "every path was legitimately out of scope" from "nothing was checked and we don't know why" using only the JSON output, without re-deriving cf's scope rules.
5. **(#87)** `cf check` terminal output identifies which worktree each finding came from, when more than one is registered.
6. **(#87)** `cf check --json` carries per-finding worktree identity.
7. **(#87)** The MCP `workflow_check` tool carries the same attribution as the CLI, via the shared merge — no second, divergent implementation remains.
8. Single-checkout projects see byte-identical terminal output to today.
9. No invocation that previously reported findings reports fewer.

### Technical Requirements

- Path→worktree matching logic exists in exactly one place; `findProjectByCwd` delegates to it.
- Outcome values defined once as constants; no scattered literals.
- No `any`; explicit return types on exported functions.
- Unit tests: the shared resolver (in-root, out-of-root, nested worktrees, longest-prefix tie, missing `worktreePath`); each outcome value; merge-with-attribution including the duplicate-across-worktrees case.
- Integration test reproducing #88 with two registered worktrees — this is the defect that most needs a real-filesystem test, since the bug is precisely that a unit test with a mocked root would pass.
- **Close the CLI worktree-coverage gap.** `packages/cli/tests/commands/check.test.ts` has *zero* worktree coverage today: its fixture project has no `worktrees`, so `projectViews` is always a single element and `mergeCheckResults` always returns at its `results.length === 1` early guard ([check.ts:48](packages/cli/src/commands/check.ts#L48)). The multi-view merge path is entirely untested CLI-side. MCP has three such tests (`packages/mcp-server/tests/workflowTools.test.ts:608-712`) which should be mirrored, and — once the merge is shared — retargeted at the extracted core function.
- A regression test pinning default-checkout output identical to pre-slice behavior.
- `CHANGELOG.md` entry; `cf validate frontmatter --help` text updated (it currently advertises "others are silently skipped" at [validate.ts:169](packages/cli/src/commands/validate.ts#L169), which this slice makes false).

### Integration Requirements

- squadron's `test_schema_drift.py` passes 6/6 from a worktree (currently 3/6).
- An unmodified squadron `frontmatter_gate.py` continues to work against the new output.
- `cf check`, `cf next`, and `cf status` behavior otherwise unchanged.

### Verification Walkthrough

Confirms all four issues from a real two-worktree setup. Commands run against a local build — the global `cf` is a separately published npm install, so use `node packages/cli/dist/index.js` after `pnpm -r build`.

**Setup** — a project with two registered worktrees:

```bash
cf worktree list
#   Name         Range      Path
#   default      [100-959]  ~/source/repos/manta/context-forge
# * cf-pr        [960-999]  ~/source/repos/manta/context-forge-pr
```

**Step 1 — #88, the silent false pass.** From inside `context-forge-pr`:

```bash
cd ~/source/repos/manta/context-forge-pr
cf validate frontmatter --json project-documents/user/slices/926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting.md
```

*Before:* `"filesChecked": 0`, exit 0 — nothing examined, looks like a pass.
*After:* `"filesChecked": 1`, and `documentRoot` names the **`context-forge-pr`** checkout, not the default one.

**Step 2 — the no-paths form still works.** Same directory:

```bash
cf validate frontmatter --json | head -5
```

`filesChecked` should be in the hundreds, unchanged from before the slice.

**Step 3 — #92, out-of-scope is now visible.** From the default checkout:

```bash
cf validate frontmatter --json CHANGELOG.md
```

*Before:* `filesChecked: 0` and nothing else — indistinguishable from step 1's bug.
*After:* still `filesChecked: 0` (correct — it is out of scope), but `paths` now contains `{"path": "CHANGELOG.md", "outcome": "skipped-out-of-scope"}`.

**Step 4 — #96, the two zeros are now distinguishable.** Compare step 1's *before* output with step 3's *after* output. Both have `filesChecked: 0`; only one has an explanation. A caller can now write the decision that was previously impossible:

```bash
cf validate frontmatter --json CHANGELOG.md pyproject.toml \
  | jq 'if (.paths | length > 0) and (all(.paths[]; .outcome | startswith("skipped-")))
        then "benign: nothing in scope" else "investigate" end'
# "benign: nothing in scope"
```

A release-shaped commit stops forcing `--no-verify`.

**Step 5 — #87, attribution.** With a slice whose review landed in one worktree but not the other:

```bash
cd ~/source/repos/manta/context-forge
cf check
```

*Before:*
```
  Slice 917
  ⚠ [917] Slice 917 requires a tasks review before proceeding
```
*After:*
```
  Slice 917
  ⚠ [cf-pr] [917] Slice 917 requires a tasks review before proceeding
```

The reader can see the finding belongs to the other checkout and stop looking for it locally.

**Step 6 — JSON attribution.**

```bash
cf check --json | jq '.findings[] | {rule, worktree: .worktree.name}'
```

Each finding names its worktree.

**Step 7 — no regression for single-checkout users.** In a project with no registered worktrees, `cf check` and `cf validate frontmatter` output must be identical to the pre-slice build. Diff against output captured before starting.

**Step 8 — the external consumer.** From squadron, in a worktree:

```bash
cd ~/source/repos/manta/squadron-pr
uv run pytest tests/documents/test_schema_drift.py
```

Expect 6 passed (currently 3 fail). These tests assert on `filesChecked` precisely because of #88, so they are a direct external check on the fix.

## Risk Assessment

### Technical Risks

- **Breaking an external commit gate.** squadron's pre-commit hook consumes this output. A non-additive change breaks a live workflow in another repo.
- **Silently narrowing scope.** A resolver bug in the other direction — treating in-root paths as out-of-root — would reintroduce the same class of false pass this slice removes, and would be equally silent.
- **Dedup interaction.** Attaching worktree identity to findings near the dedup key ([check.ts:53](packages/cli/src/commands/check.ts#L53)) risks either multiplying project-level findings (if added to the key) or misattributing duplicates (if derived after merge).

### Mitigation Strategies

- D3's additive-only rule, enforced by a regression test pinning the existing fields for a default-checkout invocation.
- The step-7 no-worktree comparison, and the step-8 external test run, both before declaring the slice complete.
- Attribution attached pre-merge and deliberately excluded from the dedup key (stated in Architecture → Data Flow); a test covering the same finding arising in two worktrees pins this.
- Real-filesystem integration test for #88 rather than a mocked root — a mock would reproduce the bug's own assumption and pass.

## Implementation Notes

### Development Approach

Suggested order — each step leaves the system working:

1. **Extract the shared resolver** into core; refactor `findProjectByCwd` to delegate. Pure refactor, no behavior change, fully unit-testable. Establishes the primitive both fixes need.
2. **Fix #88** — apply `worktreeId` in `validate.ts` (the discarded destructure at line 89). Smallest change, highest severity; independently shippable.
3. **Add outcome reporting** (#92/#96) — thread per-path outcomes through `resolveExplicitPaths` and the main loop, declare the result interface, extend the JSON.
4. **Extract `mergeCheckResults` to core** — pure move of the verbatim CLI/MCP duplicate, with both call sites switched and existing MCP tests retargeted. No behavior change; do this *before* adding attribution so the attribution change lands in one place.
5. **Fix #87** — attribution through the extracted merge and `printCheckOutput` (which must now receive worktree context, not just `projectName`). Independent of steps 2–3; could be done in parallel.
6. **Update help text, CHANGELOG, and external verification** (step 8 above).

Steps 2 and 4 are separable; if the slice needs to be cut short, step 2 is the one that must land — it is the only defect that manufactures false confidence in a validator.

**Testing strategy:** unit tests for the resolver and outcome vocabulary; a real-filesystem integration test for the two-worktree case; a pinned-output regression test for backwards compatibility. Per project rules, the fixture must use the actual format the parser consumes in production — real document paths from a real worktree, not synthetic roots.

### Special Considerations

- **The bug hides from careless tests.** Any test that constructs `documentRoot` from the same value the code under test uses will pass while the product is broken. The two-worktree integration test must derive paths from actual registered worktree records.
- **`cf validate frontmatter` has no `--worktree` flag** while sibling commands do. Adding one is not required by any of the four issues and is left out of scope, but it is worth noting as a consistency gap for future consideration.
- **Effort:** 3/5.
