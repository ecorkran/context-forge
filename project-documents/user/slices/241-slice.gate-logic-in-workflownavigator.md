---
docType: slice-design
slice: gate-logic-in-workflownavigator
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [240]
interfaces: [242, 243, 244]
dateCreated: 20260702
dateUpdated: 20260702
status: not-started
---

# Slice Design: Gate Logic in WorkflowNavigator

## Overview

This is the first *behavioral* slice of initiative 240. Slice 240 laid the inert foundation — the `review` discovery slot, the `workflow.review_*` config keys, and the reserved `LIFECYCLE: review-gate` branch. Slice 241 fills that reserved branch with the actual gate: it reads a slice's review artifact, extracts its `verdict`, compares it against the configured threshold, and — when the review is absent or below threshold — returns a `review` or `blocked` recommendation instead of the `advance` recommendation the state machine produces today.

Three units of work:

1. **Config reaches the navigator.** `WorkflowNavigator` gains an optional `ConfigManager` constructor dependency. When present and `workflow.review_enabled = true`, the gate is live; when the config is absent or gating is off, behavior is byte-for-byte identical to today.
2. **Two new slice statuses.** `pending-review` and `review-failed` are added to the `SliceStatus` union, and `deriveSliceStatus()` sets them when a slice is otherwise `complete` but a configured gate does not clear.
3. **The gate branch.** The reserved `LIFECYCLE: review-gate` slot returns `review` (pending) or `blocked` (failed) recommendations with a structured rationale naming the review type, verdict, and threshold.

The full verdict decision matrix — the `PASS`/`CONCERNS`/`FAIL`/`UNKNOWN` × `review_threshold` × `review_unknown_as` cross product, plus absent-artifact and unparseable-file handling — is implemented and exhaustively unit-tested here.

## Value

This is the slice that makes review gating *do* something. After it, a project that sets `workflow.review_enabled = true` and configures a gate will see `cf next` / `workflow_next` route to a review instead of recommending an advance when the review is missing or failing. Downstream runners (Amoeba, Squadron nodes) can act on the new `review` / `blocked` recommendation vocabulary and the `pending-review` / `review-failed` statuses without reimplementing the gate — which is the whole point of the initiative: CF is the authoritative workflow-position reporter.

Slices 242 (consistency rule) and 244 (initiative-level `pre-slice-plan` gate) build directly on the verdict-evaluation logic and the config-resolution helper this slice introduces.

## Technical Scope

**Included:**

- Add an optional `ConfigManager` dependency to `WorkflowNavigator` (constructor injection). Wire it through the two CLI call sites (`next.ts`, `status.ts`) and the two MCP call sites (`workflowTools.ts`).
- Add `pending-review` and `review-failed` to the `SliceStatus` `status` union (`introspection/types.ts`).
- Add a verdict-evaluation module (`introspection/reviewGate.ts`) that:
  - resolves per-gate config against the global keys ("override else global");
  - maps lowercase config tokens (`pass`/`concerns`) to the uppercase verdict vocabulary (`PASS`/`CONCERNS`/`FAIL`/`UNKNOWN`);
  - reads the review artifact's `verdict` frontmatter field via the existing `parseFrontmatter`;
  - applies the threshold and `review_unknown_as` policy;
  - treats an absent artifact, an absent/unrecognized `verdict`, and an unreadable/unparseable file all as the documented "no clearing verdict" outcomes.
- Extend `deriveSliceStatus()` to evaluate the `pre-advance` gate when a slice would otherwise be `complete`, and set `pending-review` / `review-failed` accordingly.
- Fill the reserved `LIFECYCLE: review-gate` branch in `getNext()` with the two recommendations.
- Full unit test coverage of the decision matrix and the new statuses/recommendations, plus a regression test that gating-off leaves every existing recommendation unchanged.

**Explicitly excluded (owned by later slices):**

- No `ConsistencyChecker` rule (→ 242). The verdict-evaluation module is shared, but 242 wires it into the checker.
- No initiative-level (`pre-slice-plan`) gate wiring (→ 244). This slice implements only the `pre-advance` (slice-level) transition. The verdict module is built transition-agnostic so 244 reuses it, but 244 owns its cascade insertion point.
- No documentation/README updates beyond code comments and config-key `description` strings already shipped in 240 (→ 243).
- No numeric `score` enforcement. `score` is out of v1 scope per the architecture; this slice reads and compares `verdict` only.

## Dependencies

### Prerequisites

- **Slice 240 (complete).** Provides `DocumentDetectionResult.review`, `detectDocuments(path, index, reviewType?)`, the `workflow.review_*` config keys, and the reserved `LIFECYCLE: review-gate` branch.

### Interfaces Required

- `detectDocuments(projectPath, sliceIndex, reviewType?)` — 241 passes the gate-resolved `reviewType`.
- `parseFrontmatter(filePath)` (`introspection/parsers/frontmatterParser.ts`) — reads the `verdict` field. **Note:** this parser never throws; it returns `{ found: false, data: {} }` on any read/parse error. That is exactly the behavior the gate needs — a read failure and a missing frontmatter both surface as "no `verdict` present," which the gate maps to `UNKNOWN`.
- `ConfigManager.get(key)` — resolves the `workflow.review_*` keys through the project → user → default chain.
- `CONFIG_KEYS` review keys (global + `workflow.review_gates.pre_advance.*`) shipped by 240.

## Architecture

### Component Structure

| Component | File | Change |
|---|---|---|
| `WorkflowNavigator` | `introspection/WorkflowNavigator.ts` | add optional `ConfigManager` ctor dep; extend `deriveSliceStatus()`; fill `review-gate` branch |
| `reviewGate` (new) | `introspection/reviewGate.ts` | verdict evaluation: config resolution, token→verdict mapping, threshold + unknown-as policy |
| `SliceStatus` | `introspection/types.ts` | add `pending-review`, `review-failed` to the status union |
| CLI `next` / `status` | `cli/src/commands/next.ts`, `status.ts` | construct `ConfigManager(projectPath)`, pass to `WorkflowNavigator` |
| MCP workflow tools | `mcp-server/src/tools/workflowTools.ts` | same wiring at the two navigator instantiations |

The verdict logic lives in a **standalone `reviewGate.ts` module**, not inline in the navigator, so slices 242 and 244 reuse it without importing the navigator. The navigator orchestrates (detect artifact → call `reviewGate` → set status → branch); `reviewGate` decides.

### Config Injection (resolves the one open design decision)

`WorkflowNavigator` today is `new WorkflowNavigator()` with no arguments, and `getNext(project)` reads only `ProjectData` + filesystem. **Decision: inject `ConfigManager` through the constructor, optional.**

```ts
export class WorkflowNavigator {
  constructor(private readonly config?: ConfigManager) {}
  // ...
}
```

- **Optional parameter preserves every existing call path.** When constructed with no config (or when `workflow.review_enabled` resolves false), the gate is skipped and behavior is identical to today. This is the conservative-by-default guarantee, enforced structurally.
- **The navigator owns the resolution logic** — it calls `this.config?.get(...)` and hands the raw values to `reviewGate`. Surfaces (CLI, MCP) only have to construct a `ConfigManager(project.projectPath)` and pass it; they do not resolve keys themselves.
- **Worktree-scoped config is inherited for free.** The CLI already resolves the worktree-aware project path before constructing the navigator; passing `new ConfigManager(project.projectPath)` means the gate reads config at the same scope 180 established, with no extra work here.

Rejected alternatives: resolving config *inside* the navigator (couples core to config-file I/O and worktree path resolution, and is harder to unit-test — you must stub the filesystem rather than inject a fake); passing a pre-resolved gate-config object to `getNext()` (pushes resolution into every surface and grows the `getNext` signature). Constructor injection keeps resolution in one place and unit tests inject a stub `ConfigManager`.

### Data Flow

```
getNext(project)  /  deriveSliceStatus(project, projectPath)
   │
   │  slice would otherwise be `complete`
   ▼
resolveGate(config, 'pre_advance')                     ← reviewGate.ts
   ├─ review_enabled? ──false──▶ gate skipped → status stays `complete`
   │        │ true
   │        ▼
   ├─ reviewType   = review_gates.pre_advance.review_type || (default: 'code')
   ├─ threshold    = review_gates.pre_advance.threshold   || review_threshold
   ├─ unknownAs    = review_unknown_as
   ▼
detectDocuments(projectPath, index, reviewType).review   ← 240 discovery
   ├─ null ──────────────────────────────────▶ evaluate(UNKNOWN-absent) → status
   │  path
   ▼
parseFrontmatter(path).data.verdict                      ← never throws
   ▼
evaluateVerdict(verdict, threshold, unknownAs)           ← reviewGate.ts
   ├─ clears  ▶ status `complete`  (advance recommendation, unchanged)
   ├─ pending ▶ status `pending-review`  (recommendation: `review`)
   └─ failed  ▶ status `review-failed`   (recommendation: `blocked`)
```

### State Management

Stateless. `reviewGate` is pure functions over `(verdict, threshold, unknownAs)` and a config-resolution helper over `ConfigManager`. The navigator reads config and filesystem per call, as it does today. No new persisted state.

## Technical Decisions

### TD-1: Verdict evaluation is a standalone pure module

`reviewGate.ts` exports pure, side-effect-free functions:

```ts
/** Uppercase verdict vocabulary from the Squadron slice 300 frontmatter contract. */
type Verdict = 'PASS' | 'CONCERNS' | 'FAIL' | 'UNKNOWN';

/** Lowercase config threshold token (from workflow.review_threshold / per-gate override). */
type ThresholdToken = 'pass' | 'concerns';

/** Policy for an UNKNOWN verdict (from workflow.review_unknown_as). */
type UnknownPolicy = 'fail' | 'concerns' | 'pass';

/** Outcome of a gate evaluation — a discriminated result the navigator maps to status. */
type GateOutcome = 'clears' | 'pending' | 'failed';
```

- `normalizeVerdict(raw: string | undefined): Verdict` — uppercases and matches against the known set; anything absent or unrecognized → `UNKNOWN`.
- `evaluateVerdict(verdict, threshold, unknownAs): GateOutcome` — the decision matrix (below).
- `resolveGate(config, gateName): ResolvedGate | null` — reads `review_enabled`, the per-gate `review_type`/`threshold` overrides, and the global `review_threshold`/`review_unknown_as`; returns `null` when gating is off (caller skips the gate). "Override else global" resolution lives here, tested here.

Keeping this out of the navigator satisfies the project DRY principle and lets 242 (consistency) and 244 (initiative gate) import the same evaluator rather than re-deriving it.

### TD-2: The decision matrix

The recognized verdict vocabulary is `PASS`, `CONCERNS`, `FAIL`, `UNKNOWN` (uppercase, from frontmatter). `threshold` and `unknownAs` are lowercase config tokens. Mapping is explicit — no string-equality between a config token and a verdict.

| `verdict` | `threshold = pass` | `threshold = concerns` |
|---|---|---|
| `PASS` | clears | clears |
| `CONCERNS` | **failed** | clears |
| `FAIL` | failed | failed |
| `UNKNOWN` | apply `unknownAs` (below) | apply `unknownAs` (below) |

`UNKNOWN` handling (`review_unknown_as`), evaluated *before* the threshold table by substituting a stand-in verdict:

- `unknownAs = fail` → treat as `FAIL` → **failed** (default; conservative)
- `unknownAs = concerns` → treat as `CONCERNS` → then apply the threshold row for `CONCERNS` (so it clears under `concerns`, fails under `pass`). This is the intended, arch-documented interaction: the same `UNKNOWN` artifact passes or blocks depending on the threshold.
- `unknownAs = pass` → treat as `PASS` → clears

The distinction between `pending` and `failed` outcomes for status assignment:

- **Absent artifact** (`detectDocuments(...).review === null`) → the review has not been done → `GateOutcome` `pending` → status `pending-review` → recommendation `review`.
- **Present artifact, verdict does not clear** → the review was done and did not pass → `GateOutcome` `failed` → status `review-failed` → recommendation `blocked`.
- **Present artifact, `verdict` absent/unrecognized/unreadable** → mapped to `UNKNOWN`, then `unknownAs` applies. Whether the *result* is surfaced as `pending-review` or `review-failed` follows the `unknownAs` substitution: `unknownAs=fail` → `review-failed` (blocked); `unknownAs=concerns`/`pass` that clears → `complete`; a `concerns` substitution under `threshold=pass` → `review-failed`. An artifact that exists but is unparseable is never silently treated as `pending` (which would imply "not yet reviewed") — it is a present-but-uncleared review, consistent with the arch's "must not silently pass."

`evaluateVerdict` returns only `clears` / `pending` / `failed` from the verdict+threshold+policy inputs; the navigator decides `pending` vs `failed` for the **absent** case using the artifact-presence signal it already has (`review === null`). `reviewGate` exposes both the outcome and enough context (the normalized verdict, the resolved threshold, whether the artifact was present) for the navigator to build the rationale string.

### TD-3: `pre-advance` default reviewType is `code`

When `workflow.review_gates.pre_advance.review_type` is empty (its default), the gate needs a review type to look for. Per the architecture's illustrative config (`pre-advance = { reviewType = "code" }`), the pre-advance gate defaults to `code`. This default is centralized as a named constant in `reviewGate.ts` (not scattered), per the project's no-magic-defaults rule:

```ts
const GATE_DEFAULT_REVIEW_TYPE = { pre_advance: 'code' } as const;
```

244 adds `pre_slice_plan: 'arch'` to the same map when it lands. An explicitly-set empty `review_type` with gating enabled uses this default rather than failing — the per-gate key exists to *override*, and empty means "use the sensible default for this transition."

### TD-4: `deriveSliceStatus` evaluates the gate; `getNext` only routes

`deriveSliceStatus()` already computes `complete` vs `in-implementation` from task state. The gate evaluation is folded in **there**, at the point `complete` is determined, so the new statuses flow through `getStatus()` to every consumer (the summary line, MCP `workflow_status`, the visualizer) — not only through `getNext()`. `getNext()`'s reserved `review-gate` branch then simply maps `pending-review` → `review` recommendation and `review-failed` → `blocked` recommendation, mirroring how the existing branches map a status to a recommendation.

This keeps status derivation as the single source of truth for "what state is this slice in," consistent with the existing design (`getNext` reads `status.activeSlice.status` and never recomputes it). `deriveSliceStatus` gains the `config` dependency (already on `this`) and becomes gate-aware only when config is present and gating is on.

### TD-5: Recommendation vocabulary — additive only

The architecture requires the `NextAction` return *type* not change — only new `recommendation` string values are added (Amoeba depends on a stable shape). The two new recommendations:

```
pending-review → {
  recommendation: 'Review required before advancing',
  rationale: 'Slice NNN is complete but requires a code review before advancing — no review artifact found.',
  ...
}
review-failed → {
  recommendation: 'Blocked: review verdict does not clear threshold',
  rationale: "Review artifact present but verdict FAIL does not clear threshold 'concerns' for slice NNN.",
  ...
}
```

No new field on `NextAction`. The `recommendation`/`rationale`/`summary` strings carry the gate detail. `slice` and `warnings` are populated via the existing `enrich()` helper. The exact human-readable strings are finalized in implementation; the rationale must always name the review type, and — for `review-failed` — the verdict and threshold that produced the block (arch "gate is a routing rule … with a rationale").

## Implementation Details

### Patterns and Conventions

- Discriminated `GateOutcome` union drives status assignment via an exhaustive `switch` (per the TS rules: compiler-enforced exhaustiveness, no string guessing).
- No `any`. `verdict` from frontmatter is `string | undefined` (the parser yields a flat `Record<string, string>`); `normalizeVerdict` narrows it to the `Verdict` union.
- Config values from `ConfigManager.get()` are `string | boolean | number`; narrow explicitly before use (e.g. `=== true` for the boolean `review_enabled`, string-narrow the token keys).
- `reviewGate.ts` stays under ~50-line functions; the module is small and single-purpose.
- Reuse `enrich()` and the warnings pattern for the two new branches exactly as the sibling branches do.

## Integration Points

### Provides to Other Slices

- **`reviewGate.ts` evaluator** — `normalizeVerdict`, `evaluateVerdict`, `resolveGate`. 242 (consistency rule) and 244 (initiative gate) import these rather than re-deriving the matrix.
- **`SliceStatus` values `pending-review` / `review-failed`** — surfaced through `getStatus()`; consumed by the visualizer and any status reader.
- **`review` / `blocked` recommendation vocabulary** — the stable strings runners route on.
- **Config-injected `WorkflowNavigator(config?)` constructor** — the wiring pattern 244 extends for the `pre-slice-plan` insertion point.

### Consumes from Other Slices

- Everything slice 240 provides (detection slot, config keys, reserved branch). No other consumption.

### Deferred to Other Slices

- ConsistencyChecker wiring of the evaluator → 242.
- `pre-slice-plan` (arch review) gate cascade point → 244.
- Documentation of the new statuses, recommendations, and config behavior → 243.
- Numeric `score` enforcement → out of v1 (arch), activated by Squadron slice 301.

## Success Criteria

### Functional Requirements

- With `workflow.review_enabled = false` (default), `cf next` / `workflow_next` output is **identical** to pre-241 for every project — no `pending-review`, no `review-failed`, gate never fires.
- With gating enabled and a `pre_advance` gate configured, a slice whose tasks are all complete but with **no** `code` review artifact reports status `pending-review` and `cf next` recommends a review (recommendation `review`).
- With a `code` review artifact whose `verdict` is `FAIL` (or an `UNKNOWN`/absent-verdict artifact under default `review_unknown_as = fail`), the slice reports `review-failed` and `cf next` recommends `blocked`, with a rationale naming the verdict and threshold.
- With a `code` review artifact whose `verdict` clears the threshold (`PASS` always; `CONCERNS` when `threshold = concerns`), the slice reports `complete` and `cf next` recommends the advance, exactly as today.
- Per-gate `threshold` override takes precedence over the global `review_threshold`; empty override falls back to the global. Per-gate empty `review_type` falls back to the transition default (`code` for `pre_advance`).
- An unparseable/unreadable review file that exists is treated as `UNKNOWN` (never silently cleared) and follows `review_unknown_as`.

### Technical Requirements

- Unit tests covering the full decision matrix: {`PASS`,`CONCERNS`,`FAIL`,`UNKNOWN`,absent-verdict,unparseable-file,absent-artifact} × {`threshold=pass`,`threshold=concerns`} × {`unknownAs=fail`,`concerns`,`pass`} where the combination is meaningful, plus per-gate-override-vs-global resolution.
- A regression test asserting that with no config / gating off, the complete set of existing `getNext` recommendations is unchanged (extends the 240 baseline test).
- New test fixtures under `packages/core/tests/fixtures/` providing review artifacts **with** `verdict` frontmatter (the 240 fixtures have none — they were discovery-only). At minimum: a `PASS`, a `CONCERNS`, a `FAIL`, an artifact with no `verdict` field, and one absent (no file) case.
- CLI (`next`, `status`) and MCP (`workflowTools`) construct and pass a `ConfigManager`; existing CLI/MCP tests still pass.
- No `any`; explicit return types on exported `reviewGate` functions and the changed navigator methods. `pnpm -r build` clean; core + mcp + cli suites green (modulo the 7 pre-existing unrelated failures noted in slice 240).

### Verification Walkthrough

Draft demo script (refined in Phase 6). Uses a scratch project so `cf config set` does not touch real config.

1. **Gating off — no change.** On any existing project with `review_enabled` unset:
   ```bash
   cf next            # unchanged: recommends advance when the active slice is complete
   ```

2. **Enable gating, configure the pre-advance gate** (scratch project):
   ```bash
   cf config set workflow.review_enabled true --project <scratch>
   cf config set workflow.review_gates.pre_advance.review_type code --project <scratch>
   # threshold left empty → inherits workflow.review_threshold (concerns)
   ```

3. **Complete slice, no review artifact → pending-review.**
   With the active slice's tasks all checked and no `NNN-review.code.*.md` present:
   ```bash
   cf status          # active slice shows: pending-review
   cf next            # Next: Review required before advancing
                      # Rationale: ... requires a code review ... no review artifact found.
   ```

4. **Add a FAIL review → review-failed / blocked.**
   Drop `NNN-review.code.first.md` with `verdict: FAIL` into `reviews/`:
   ```bash
   cf status          # active slice shows: review-failed
   cf next            # Next: Blocked: review verdict does not clear threshold
                      # Rationale: ... verdict FAIL does not clear threshold 'concerns' ...
   ```

5. **Replace with a CONCERNS review → clears (threshold=concerns) → advance.**
   Add `NNN-review.code.second.md` with `verdict: CONCERNS` (lexicographically later → wins):
   ```bash
   cf next            # Next: Advance to slice <next> ...  (gate cleared)
   ```

6. **Tighten threshold to pass → CONCERNS no longer clears.**
   ```bash
   cf config set workflow.review_threshold pass --project <scratch>
   cf next            # Next: Blocked ... verdict CONCERNS does not clear threshold 'pass'
   ```

7. **Build and tests.**
   ```bash
   pnpm -r build
   pnpm --filter @context-forge/core test reviewGate
   pnpm --filter @context-forge/core test WorkflowNavigator
   ```

## Implementation Notes

### Development Approach

Suggested order (each step independently testable):

1. `introspection/types.ts` — add `pending-review`, `review-failed` to the `SliceStatus` union. (Compiles; exhaustive switches over status may flag missing cases → guides next steps.)
2. `introspection/reviewGate.ts` — the pure evaluator (`normalizeVerdict`, `evaluateVerdict`, `resolveGate`) + the transition-default map. Full matrix unit tests here first — this is the risk core and is testable with zero navigator involvement.
3. `WorkflowNavigator.ts` — add the optional `ConfigManager` ctor dep; extend `deriveSliceStatus()` to call `reviewGate` when a slice is otherwise `complete`; fill the reserved `review-gate` branch in `getNext()`. Add the gating-off regression test and the new-status/recommendation tests.
4. Wire the four surface call sites (`cli/next.ts`, `cli/status.ts`, `mcp workflowTools.ts` ×2) to construct `ConfigManager(project.projectPath)` and pass it.
5. Add `verdict`-bearing test fixtures.
6. `pnpm -r build && pnpm -r test`.

### Special Considerations

- **Conservative default is structural.** If `config` is undefined *or* `review_enabled` is false, `deriveSliceStatus` must not even look for a review artifact — the `complete` path stays exactly as today. Verify with the gating-off regression test, not by inspection.
- **Present-but-unparseable ≠ pending.** An artifact that exists but can't be read/parsed is `UNKNOWN` under `review_unknown_as`, surfaced as `review-failed` (not `pending-review`) unless the policy clears it. Do not let the null-vs-present distinction collapse.
- **Case boundary.** Config tokens are lowercase (`pass`/`concerns`/`fail`); frontmatter verdicts are uppercase (`PASS`/`CONCERNS`/`FAIL`/`UNKNOWN`). All crossing happens in `normalizeVerdict`/`evaluateVerdict` — never compare a config token to a raw verdict elsewhere.
- **Don't reach into 242/244 scope.** The evaluator is built reusable, but this slice wires only `deriveSliceStatus` (`pre_advance`). Resist adding the consistency-check call or the `pre_slice_plan` cascade point here.
