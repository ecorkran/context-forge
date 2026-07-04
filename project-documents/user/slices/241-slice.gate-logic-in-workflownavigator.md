---
docType: slice-design
slice: gate-logic-in-workflownavigator
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [240]
interfaces: [242, 243, 910]
dateCreated: 20260702
dateUpdated: 20260702
status: not-started
---

# Slice Design: Gate Logic in WorkflowNavigator

## Overview

This is the behavioral core of initiative 240. Slice 240 laid the inert foundation — the `review` discovery slot, the `workflow.review_*` config keys, and the reserved `LIFECYCLE: review-gate` branch. Slice 241 fills that branch with the review gate covering **all four lifecycle boundaries** in one coherent mechanism.

The central design idea, settled during Phase 4 review with the Project Manager: **the review type is derived from the slice's lifecycle position, never configured.** Every phase boundary owes exactly one review — the review of the artifact that phase produces:

| Slice is at… | Phase just completed | Review owed to leave | Boundary name |
|---|---|---|---|
| arch exists, no slice plan | Phase 2 (Architecture) | `arch` | pre-slice-plan |
| design exists, no tasks | Phase 4 (Slice Design) | `slice` | pre-tasks |
| task file exists, not implemented | Phase 5 (Task Breakdown) | `tasks` | pre-implementation |
| tasks all checked (implementation done) | Phase 6 (Implementation) | `code` | pre-advance |

CF reads the boundary it is already sitting at and looks for that review type. The user configures only *whether* gating is on and *how strict* — never *which* review, because position determines it.

Four units of work:

1. **Config reaches the navigator.** `WorkflowNavigator` gains an optional `ConfigManager` constructor dependency. Gating off (no config, or `review_enabled = false`) ⇒ behavior byte-for-byte identical to today.
2. **Two new slice statuses.** `pending-review` and `review-failed` added to the `SliceStatus` union, set by `deriveSliceStatus()` (and the pre-slice-plan path) when a boundary's gate does not clear.
3. **The `reviewGate.ts` evaluator.** A standalone module: position→reviewType derivation, verdict decision matrix, threshold + `review_unknown_as` resolution. Reused by slice 242.
4. **The gate branch + boundary wiring.** The reserved `LIFECYCLE: review-gate` branch returns `review` / `blocked` recommendations; the four boundaries are evaluated at the points in the cascade where they occur.

Additionally, this slice introduces the `STATUS` `as const` object (referenced by its own new code); the sweep of ~50 pre-existing literal sites is deferred to maintenance slice 910.

## Value

This is the slice that makes review gating *do* something, across the whole lifecycle. After it, a project that sets `workflow.review_enabled = true` sees `cf next` / `workflow_next` route to the appropriate review — arch, slice, tasks, or code — whenever the review for the just-completed phase is missing or failing, instead of recommending the next step. Downstream runners (Amoeba, Squadron nodes) act on the new `review` / `blocked` vocabulary and the `pending-review` / `review-failed` statuses without reimplementing the gate — the initiative's whole purpose: CF is the authoritative workflow-position reporter.

Slice 242 (consistency rule) reuses this slice's `reviewGate.ts` evaluator directly.

## Technical Scope

**Included:**

- Add optional `ConfigManager` dependency to `WorkflowNavigator` (constructor injection). Wire the two CLI call sites (`next.ts`, `status.ts`) and two MCP call sites (`workflowTools.ts`) to construct and pass it.
- Add `pending-review` and `review-failed` to the `SliceStatus` `status` union (`introspection/types.ts`).
- Introduce `STATUS` `as const` in `introspection/types.ts` with `NormalizedStatus` derived from it (union stays byte-identical). Reference it in this slice's new code. (Sweeping existing sites → slice 910.)
- Add `introspection/reviewGate.ts`:
  - `positionToReviewType()` — maps a lifecycle boundary to its review type (`arch`/`slice`/`tasks`/`code`).
  - `normalizeVerdict()` — raw frontmatter `verdict` → the `PASS`/`CONCERNS`/`FAIL`/`UNKNOWN` union.
  - `evaluateVerdict()` — the decision matrix over `(verdict, threshold, unknownAs)`.
  - `resolveGateConfig()` — reads `review_enabled` + global threshold/unknown-as (and any retained per-gate threshold override); returns `null` when gating is off.
- Extend `deriveSliceStatus()` to evaluate the `code` gate when a slice would otherwise be `complete`, and the `slice`/`tasks` gates at the `needs-tasks`/`in-implementation` boundaries; extend the no-active-slice / pre-slice-plan path for the `arch` gate. Set `pending-review` / `review-failed` accordingly.
- Fill the reserved `LIFECYCLE: review-gate` branch in `getNext()`; route each boundary's gated status to `review` / `blocked`.
- Full unit coverage: decision matrix, every boundary, per-boundary reviewType derivation, and a gating-off regression test.

**Explicitly excluded (owned by later slices):**

- No `ConsistencyChecker` rule wiring (→ 242). The `reviewGate.ts` evaluator is shared; 242 imports it.
- No documentation/README updates beyond code comments and the config-key `description` strings already shipped in 240 (→ 243).
- No sweep of pre-existing `NormalizedStatus` literals (→ 910). This slice only *introduces* `STATUS` and uses it in new code.
- No numeric `score` enforcement (out of v1 per arch).

**Retired by this slice's model:** the separately-planned slice **244** (initiative-level pre-slice-plan gate) is folded in here — with reviewType position-derived, the `arch` boundary is just one more case of the single mechanism, not a distinct slice. The architecture's original v1 deferral of the `pre-slice-plan` transition is withdrawn; the arch doc has been updated to authorize this (Scope revision note, 20260702).

**Cascade renumbering already done (arch Technical Considerations).** The architecture asks that "the slice implementing the gate logic should renumber the full cascade (or convert to named stages)." This was completed in **slice 240's TD-4** — the `getNext()` branches were renamed from ordinals (`Priority 1…7`, `2.5`) to named `GUARD:`/`LIFECYCLE:` branches, and the `LIFECYCLE: review-gate` slot was reserved. 241 fills that reserved slot; no further renumbering is needed here.

## Dependencies

### Prerequisites

- **Slice 240 (complete).** Provides `DocumentDetectionResult.review`, `detectDocuments(path, index, reviewType?)`, the `workflow.review_*` config keys, and the reserved `LIFECYCLE: review-gate` branch.

### Interfaces Required

- `detectDocuments(projectPath, sliceIndex, reviewType?)` — 241 passes the position-derived `reviewType`.
- `parseFrontmatter(filePath)` (`introspection/parsers/frontmatterParser.ts`) — reads the `verdict` field. **This parser never throws** — it returns `{ found: false, data: {} }` on any read/parse error. That is exactly the behavior the gate needs: a read failure and a missing frontmatter both surface as "no `verdict` present," which the gate maps to `UNKNOWN`.
- `ConfigManager.get(key)` — resolves `workflow.review_*` through the project → user → default chain (worktree-scoped when the surface passes a worktree-resolved path). **Note two behaviors that shape TD-8:** (1) a *missing* config file is not an error — `readToml` maps ENOENT to `{}`, so `get()` returns the built-in default (gating off); (2) `get()` does **not** validate the value it reads — `validateValue` runs only in `set()`. Both are handled explicitly in TD-8.
- The `workflow.review_*` config keys shipped by 240.

## Architecture

### Component Structure

| Component | File | Change |
|---|---|---|
| `WorkflowNavigator` | `introspection/WorkflowNavigator.ts` | add optional `ConfigManager` ctor dep; gate-evaluate at each boundary; fill `review-gate` branch |
| `reviewGate` (new) | `introspection/reviewGate.ts` | position→reviewType, verdict normalization, decision matrix, config resolution |
| `SliceStatus` / `STATUS` | `introspection/types.ts` | add `pending-review`/`review-failed`; add `STATUS` const, derive `NormalizedStatus` |
| CLI `next` / `status` | `cli/src/commands/next.ts`, `status.ts` | construct `ConfigManager(projectPath)`, pass to navigator |
| MCP workflow tools | `mcp-server/src/tools/workflowTools.ts` | same wiring at the two navigator instantiations |

The verdict + reviewType logic lives in a **standalone `reviewGate.ts`**, not inline in the navigator, so slice 242 reuses it without importing the navigator. The navigator orchestrates (identify boundary → derive reviewType → detect artifact → evaluate → set status → branch); `reviewGate` decides.

### Config Injection (resolves the one open design decision)

`WorkflowNavigator` today is `new WorkflowNavigator()` with no arguments. **Decision: inject `ConfigManager` through the constructor, optional.**

```ts
export class WorkflowNavigator {
  constructor(private readonly config?: ConfigManager) {}
  // ...
}
```

- **Optional parameter preserves every existing call path.** No config (or `review_enabled` false) ⇒ the gate is skipped and behavior is identical to today. The conservative-by-default guarantee is structural.
- **The navigator owns resolution** — it calls `this.config?.get(...)` and hands raw values to `reviewGate`. Surfaces only construct `ConfigManager(project.projectPath)` and pass it.
- **Worktree scope inherited for free** — the CLI already resolves the worktree-aware path before constructing the navigator, so the gate reads config at the scope 180 established.

Rejected alternatives: resolving config *inside* the navigator (couples core to config-file I/O + worktree resolution, harder to unit-test); passing a pre-resolved gate-config object to `getNext()` (pushes resolution into every surface, grows the signature). Constructor injection keeps resolution in one place; unit tests inject a stub `ConfigManager`.

### The position-derived reviewType (core mechanism)

A review always sits *between* two phases, and it reviews the output of the phase it follows. So the boundary CF is at uniquely determines the review type:

```ts
// reviewGate.ts — the single source of truth for boundary → review type
const BOUNDARY_REVIEW_TYPE = {
  preSlicePlan:     'arch',   // Phase 2 output — gates slice-plan creation
  preTasks:         'slice',  // Phase 4 output — gates task breakdown
  preImplementation:'tasks',  // Phase 5 output — gates implementation
  preAdvance:       'code',   // Phase 6 output — gates advancing to next slice
} as const;
```

CF never asks the user which review a boundary needs — it reads the boundary it is at (which `deriveSliceStatus` / the no-active-slice path already compute) and looks up the type. This is why the per-gate `review_type` config keys shipped in 240 are unnecessary under this model (see TD-4).

### Boundary → signal (how CF knows a phase is done)

Each gate fires when the *previous phase's output exists*. For three boundaries that is an artifact CF can `stat`; for the code boundary it is checkbox completion:

| Boundary | "Prior output done" signal | Source |
|---|---|---|
| pre-slice-plan (`arch`) | arch file exists, no slice plan | file presence (existing) |
| pre-tasks (`slice`) | design file exists, no task file | `detectDocuments` (existing) |
| pre-implementation (`tasks`) | task file exists, not complete | `detectDocuments` (existing) |
| pre-advance (`code`) | all task checkboxes checked | `inferredStatus === STATUS.Complete` (existing) |

The `code` boundary deliberately uses **checkbox completion** as its "implementation done" signal — the only signal at CF's artifact/checkbox layer. CF does **not** inspect git/commits/PRs to confirm code exists; a false "done" claim (boxes checked, nothing built) is caught by the code review itself (the reviewer finds no implementation → verdict FAIL), not by CF pre-verifying. This keeps CF artifact-shaped, consistent with the arch's layer boundaries. See TD-5.

### Data Flow (pre-advance / code example)

```
deriveSliceStatus(project, projectPath)
   │  tasks parse → inferredStatus === STATUS.Complete   (would advance today)
   ▼
resolveGateConfig(config)                                  ← reviewGate.ts
   ├─ review_enabled? ──false──▶ gate skipped → status stays STATUS.Complete
   │        │ true
   │        ▼
   ├─ reviewType = BOUNDARY_REVIEW_TYPE.preAdvance = 'code'
   ├─ threshold  = review_threshold (or retained per-gate override)
   ├─ unknownAs  = review_unknown_as
   ▼
detectDocuments(projectPath, index, 'code').review         ← 240 discovery
   ├─ null ─────────────────────────▶ outcome 'pending' → status pending-review
   │  path
   ▼
parseFrontmatter(path).data.verdict                        ← never throws
   ▼
evaluateVerdict(normalizeVerdict(verdict), threshold, unknownAs)   ← reviewGate.ts
   ├─ 'clears'  ▶ status complete   (advance recommendation, unchanged)
   └─ 'failed'  ▶ status review-failed  (recommendation: blocked)
```

The `slice`, `tasks`, and `arch` boundaries follow the identical shape, differing only in the boundary detected and the reviewType looked up.

### State Management

Stateless. `reviewGate` is pure functions over `(verdict, threshold, unknownAs)` plus a config-resolution helper over `ConfigManager`. The navigator reads config + filesystem per call, as today. No new persisted state.

## Technical Decisions

### TD-1: `reviewGate.ts` is a standalone pure module

Exports pure, side-effect-free functions (verdict/threshold/policy in, outcome out) plus one thin config reader:

```ts
type Verdict = 'PASS' | 'CONCERNS' | 'FAIL' | 'UNKNOWN';        // frontmatter vocabulary (uppercase)
type ThresholdToken = 'pass' | 'concerns';                     // config token (lowercase)
type UnknownPolicy  = 'fail' | 'concerns' | 'pass';            // review_unknown_as
type GateOutcome    = 'clears' | 'pending' | 'failed';         // drives status assignment
type Boundary = 'preSlicePlan' | 'preTasks' | 'preImplementation' | 'preAdvance';
```

- `positionToReviewType(boundary): string` — `BOUNDARY_REVIEW_TYPE[boundary]`.
- `normalizeVerdict(raw: string | undefined): Verdict` — uppercase + match known set; absent/unrecognized → `UNKNOWN`.
- `evaluateVerdict(verdict, threshold, unknownAs): GateOutcome` — the matrix (TD-2).
- `resolveGateConfig(config): ResolvedGate | null` — reads `review_enabled` + `review_threshold` + `review_unknown_as`; returns `null` when gating off (caller skips). If per-gate threshold overrides are retained (TD-4), the boundary-specific threshold is resolved here. Its I/O failure and invalid-value handling are specified in **TD-8** (a read error or an out-of-vocabulary value is not silently accepted).

Keeping this out of the navigator satisfies DRY and lets 242 import the same evaluator rather than re-deriving it.

### TD-2: The decision matrix

Verdict vocabulary is uppercase (frontmatter); `threshold`/`unknownAs` are lowercase config tokens. Mapping is explicit — never string-equality between a config token and a verdict.

| `verdict` | `threshold = pass` | `threshold = concerns` |
|---|---|---|
| `PASS` | clears | clears |
| `CONCERNS` | **failed** | clears |
| `FAIL` | failed | failed |
| `UNKNOWN` | apply `unknownAs` | apply `unknownAs` |

`UNKNOWN` handling, evaluated by substituting a stand-in verdict *then* applying the threshold row:

- `unknownAs = fail` → treat as `FAIL` → **failed** (default; conservative).
- `unknownAs = concerns` → treat as `CONCERNS` → clears under `concerns`, fails under `pass`. This is the intended, arch-documented interaction: the same `UNKNOWN` artifact passes or blocks depending on threshold.
- `unknownAs = pass` → treat as `PASS` → clears.

`pending` vs `failed` for status assignment:

- **Absent artifact** (`detectDocuments(...).review === null`) → not yet reviewed → outcome `pending` → status `pending-review` → recommendation `review`.
- **Present artifact, verdict does not clear** → reviewed, did not pass → outcome `failed` → status `review-failed` → recommendation `blocked`.
- **Present but `verdict` absent/unrecognized/unreadable** → `UNKNOWN`, then `unknownAs`. An artifact that *exists* but is unparseable is never surfaced as `pending` (which would imply "not yet reviewed") — it is a present-but-uncleared review, per the arch's "must not silently pass."

`evaluateVerdict` returns `clears`/`pending`/`failed`; the navigator supplies the `pending` outcome for the **absent** case from the `review === null` signal it already holds. `reviewGate` also exposes the normalized verdict and resolved threshold so the navigator can build the rationale.

### TD-3: Gate evaluation lives in status derivation; `getNext` only routes

The gate is folded into `deriveSliceStatus()` (and the no-active-slice/pre-slice-plan path), at the point each boundary is determined, so the new statuses flow through `getStatus()` to every consumer (summary line, MCP `workflow_status`, visualizer) — not only through `getNext()`. `getNext()`'s reserved `review-gate` branch then maps `pending-review` → `review` and `review-failed` → `blocked`, mirroring how existing branches map a status to a recommendation. Status derivation stays the single source of truth for "what state is this slice in." `deriveSliceStatus` becomes gate-aware only when `config` is present and gating is on.

**Implementation note (20260704):** `getNext()`'s `NextAction` doesn't carry the gate's rationale/reviewType by itself, so `SliceStatus` gained an optional `gateInfo: { reviewType, rationale }` field, populated by `deriveSliceStatus()` when a gate fires and simply read (not recomputed) by `getNext()`'s routing branch — avoiding a second filesystem/config read per call. Separately, the `preSlicePlan`/`arch` gate could not be evaluated only in the post-`detectFirstRunContext` fallback as originally sketched: `detectFirstRunContext`'s FR-3b (Phase 2) and FR-4 (Phase 3) branches both fire on the identical condition (`archFileExists && slicePlan === null`) and would return their own "advance"/"create plan" recommendation before the fallback code ever ran. The gate is evaluated immediately after `archFileExists`/`initiativePlanExists` are computed, before `detectFirstRunContext` is called, so it intercepts every phase-specific first-run message for that boundary, not just the fallback.

### TD-4: reviewType is position-derived — the 240 per-gate `review_type` keys become inert

Slice 240 shipped `workflow.review_gates.{gate}.review_type` and `.threshold` keys (inert). Under the position-derived model, **`review_type` is unnecessary** — the boundary determines the type. Decision for 241:

- **`review_type` per-gate keys:** leave them *defined but unread* (they default empty and harm nothing), and hand slice 243 the obligation to document them as inert/deprecated. Removing config keys that shipped in a released version risks breaking a user's existing `.context-forge.toml`; leaving them inert is the conservative, backward-compatible choice. (If the team prefers a clean removal before any real user depends on them, that is a one-line deletion in `ConfigKeys.ts` + tests — flagged for the PM at implementation.)
- **`threshold` per-gate keys:** *retain and consume.* A stricter bar at one boundary (e.g. `pass` for `code`, `concerns` elsewhere) is a legitimate need and cheap to honor — `resolveGateConfig` uses the per-boundary threshold override when set, else the global `review_threshold`. This is the one piece of per-gate config that survives.

This resolves the 240 slice-plan open item ("241 owns the `review_gates` schema decision") in favor of: position drives type; only threshold is overridable per boundary.

### TD-5: `code` boundary trigger = checkbox completion (`STATUS.Complete`)

The `code` gate must know implementation is *done* before owing a code review. The only signal at CF's layer is `inferredStatus === STATUS.Complete` (all task checkboxes checked) — which is *exactly* today's "would advance" state, so the gate slots precisely into the reserved `pre-advance` position. CF does not detect "code exists" via git/commits/PRs (that is the runner's layer per the arch); the code review itself catches a false "done." Confirmed with the PM. This is why the reserved slot sits between `in-implementation` and `complete → advance`.

### TD-6: `STATUS` const introduced here; sweep deferred to 910

`NormalizedStatus` currently exists only as a type union, so every comparison re-types a bare literal (`inferredStatus === 'complete'`) — a pre-existing "define once" violation across ~50 sites. This slice introduces:

```ts
export const STATUS = {
  Complete: 'complete',
  InProgress: 'in-progress',
  NotStarted: 'not-started',
  Deprecated: 'deprecated',
} as const;
export type NormalizedStatus = (typeof STATUS)[keyof typeof STATUS];  // union unchanged
```

241's new code references `STATUS.Complete` etc. from day one. The mechanical sweep of the ~50 existing literal sites is **maintenance slice 910** (`dependencies: 241`), kept out of this slice so a large no-behavior diff doesn't bury the gate-logic review — the same rationale 240's TD-4 applied to the branch rename.

### TD-7: Recommendation vocabulary — additive only

The `NextAction` return *type* does not change (Amoeba depends on a stable shape); only new `recommendation` string values are added. Two new recommendations, e.g.:

```
pending-review → {
  recommendation: 'Review required before advancing',
  rationale: 'Slice NNN is complete but requires a code review before advancing — no review artifact found.',
}
review-failed → {
  recommendation: 'Blocked: review verdict does not clear threshold',
  rationale: "Review artifact present but verdict FAIL does not clear threshold 'concerns' for slice NNN.",
}
```

The rationale must always name the review type; for `review-failed`, also the verdict and threshold that produced the block. `slice`/`warnings` populated via the existing `enrich()` helper. Exact strings finalized in implementation.

### TD-8: Config read failures and invalid values — explicit, fail-fast (resolves review F002/F003)

`resolveGateConfig` adds a new I/O path (`ConfigManager.get()` reads `.context-forge.toml`). Two failure classes must be handled explicitly rather than left to implicit behavior; neither may silently pass or silently block a gate.

**(a) Read/parse failure of the config file** (corrupt TOML, permission error, `ConfigManager.get()` throws). This is distinct from a *missing* config file — `ConfigManager` already treats a missing file as "fall through to defaults" (ENOENT → `{}`), which correctly yields `review_enabled = false` (gating off, no behavior change). A genuine read/parse failure, by contrast, means CF cannot determine whether gating is even configured.

Decision: **a config-read failure is surfaced, not swallowed.** `resolveGateConfig` does not catch-and-default a thrown `ConfigManager.get()`. The navigator lets the error propagate to the surface (CLI `next`/`status`, MCP `workflow_next`), where the existing `handleError` path reports it — the same way a corrupt project file is reported today. Rationale: silently skipping gating on an unreadable config would violate conservative-by-default (a project that *intended* to gate would silently advance); silently blocking would be an equally opaque failure. The honest outcome is "your config could not be read," surfaced immediately. This does **not** regress the gating-off default: a missing config file is not a failure (it is the default path), so ungated projects never hit this.

**(b) Invalid value read from config.** `ConfigManager.get()` validates only on `set()`, **not** on `get()` (confirmed: `validateValue` is called solely in `ConfigManager.set`). So a value hand-edited into the TOML, or one that was valid under an older enum, can reach `resolveGateConfig` out-of-vocabulary (e.g. `review_threshold = "foobar"`, `review_unknown_as = "maybe"`). The architecture requires this be "surfaced immediately, not a silent pass or silent block."

Decision: **`resolveGateConfig` validates every value it reads against the known token set and throws a descriptive config error on any mismatch** (naming the key, the bad value, and the allowed values — mirroring `ConfigManager`'s own `validateValue` message). It does not coerce to a default. `normalizeVerdict` narrows the *frontmatter* verdict (untrusted external data → `UNKNOWN` on anything unrecognized); config tokens are *the project's own declared policy* and a bad one is a configuration error, so they fail fast rather than degrading to `UNKNOWN`. The narrowing helper is small and shared: a `parseThresholdToken(raw): ThresholdToken` / `parseUnknownPolicy(raw): UnknownPolicy` that throws on miss, keeping the check in one place per token type (no scattered comparisons).

Together: **missing config → gating off (silent, correct); unreadable config → surfaced error; readable-but-invalid value → surfaced error.** No path silently passes or silently blocks. Unit tests cover all three (missing, unreadable/throwing stub, invalid-token stub).

## Implementation Details

### Patterns and Conventions

- Discriminated `GateOutcome` / `Boundary` unions drive assignment via exhaustive `switch` (TS rules: compiler-enforced exhaustiveness, no string guessing).
- No `any`. `verdict` from frontmatter is `string | undefined`; `normalizeVerdict` narrows to `Verdict`. Config values are `string | boolean | number`; narrow explicitly (`=== true` for `review_enabled`).
- No magic strings: boundary→type in `BOUNDARY_REVIEW_TYPE`, status values via `STATUS`, verdict/token unions as named types.
- `reviewGate.ts` functions stay under ~50 lines; module is small and single-purpose.
- Reuse `enrich()` and the warnings pattern for the new branches exactly as siblings do.

## Integration Points

### Provides to Other Slices

- **`reviewGate.ts` evaluator** — `positionToReviewType`, `normalizeVerdict`, `evaluateVerdict`, `resolveGateConfig`. Slice 242 imports these.
- **`SliceStatus` values `pending-review` / `review-failed`** — surfaced through `getStatus()`; consumed by the visualizer and any status reader.
- **`review` / `blocked` recommendation vocabulary** — the stable strings runners route on.
- **`STATUS` const** — referenced by slice 910's sweep.
- **Config-injected `WorkflowNavigator(config?)` constructor** — the wiring pattern.

### Consumes from Other Slices

- Everything slice 240 provides (detection slot, config keys, reserved branch). Nothing else.

### Deferred to Other Slices

- ConsistencyChecker wiring of the evaluator → 242.
- Documentation of statuses, recommendations, the position-derived model, and the inert `review_type` keys → 243.
- Sweep of pre-existing `NormalizedStatus` literals → 910.
- Numeric `score` enforcement → out of v1 (Squadron slice 301).

## Success Criteria

### Functional Requirements

- With `workflow.review_enabled = false` (default), `cf next` / `workflow_next` output is **identical** to pre-241 for every project — no gate fires at any boundary.
- With gating enabled, at each boundary the correct review type is looked for automatically (no user config of type): `arch` before slice-plan creation, `slice` before tasks, `tasks` before implementation, `code` before advance.
- **pre-advance:** a slice whose tasks are all complete with no `code` review reports `pending-review`; `cf next` recommends a review. A `FAIL` (or `UNKNOWN`/absent-verdict under default `review_unknown_as = fail`) reports `review-failed`; `cf next` recommends `blocked` with a rationale naming verdict + threshold. A clearing verdict (`PASS` always; `CONCERNS` under `threshold = concerns`) reports `complete` and recommends advance, exactly as today.
- The same clears/pending/failed behavior holds at the `slice`, `tasks`, and `arch` boundaries with their respective review types.
- Per-boundary `threshold` override (if set) takes precedence over global `review_threshold`; empty → global. `review_type` per-gate keys are inert (position determines type).
- An unparseable/unreadable review file that exists is treated as `UNKNOWN` (never silently cleared) and follows `review_unknown_as`.
- **Config error handling (TD-8):** a *missing* config file leaves gating off (no error, no behavior change); an *unreadable/corrupt* config file surfaces an error through the CLI/MCP error path (not silently skipped or blocked); an *invalid* config token (`review_threshold`/`review_unknown_as` out of vocabulary) surfaces a descriptive config error naming the key, bad value, and allowed values (not coerced to a default).

### Technical Requirements

- Unit tests covering the full decision matrix — {`PASS`,`CONCERNS`,`FAIL`,`UNKNOWN`,absent-verdict,unparseable-file,absent-artifact} × {`threshold=pass`,`concerns`} × {`unknownAs=fail`,`concerns`,`pass`} where meaningful — plus per-boundary reviewType derivation and per-gate-threshold-override-vs-global resolution.
- A test per boundary (`arch`/`slice`/`tasks`/`code`) that the right review type is sought and the right status/recommendation produced.
- A regression test asserting that with no config / gating off, the complete set of existing `getNext` recommendations is unchanged (extends the 240 baseline test).
- New fixtures under `packages/core/tests/fixtures/` with review artifacts **carrying `verdict` frontmatter** (the 240 fixtures have none — discovery-only). At minimum a `PASS`, `CONCERNS`, `FAIL`, a no-`verdict` artifact, and an absent (no-file) case, for at least the `code` and `arch`/`slice` types.
- CLI (`next`, `status`) and MCP (`workflowTools`) construct and pass a `ConfigManager`; existing CLI/MCP tests still pass.
- No `any`; explicit return types on exported `reviewGate` functions and changed navigator methods. `pnpm -r build` clean; core + mcp + cli suites green (modulo the 7 pre-existing unrelated failures noted in slice 240).

### Verification Walkthrough

Draft demo script (refined in Phase 6). Uses a scratch project so `cf config set` does not touch real config.

1. **Gating off — no change.** Any existing project with `review_enabled` unset:
   ```bash
   cf next            # unchanged: recommends advance when the active slice is complete
   ```

2. **Enable gating** (scratch project):
   ```bash
   cf config set workflow.review_enabled true --project <scratch>
   # threshold left default (concerns); review type is NOT configured — derived from position
   ```

3. **pre-advance: complete slice, no code review → pending-review.**
   Active slice tasks all checked, no `NNN-review.code.*.md`:
   ```bash
   cf status          # active slice: pending-review
   cf next            # Next: Review required before advancing
                      # Rationale: ... requires a code review ... no review artifact found.
   ```

4. **Add a FAIL code review → review-failed / blocked.**
   Drop `NNN-review.code.first.md` with `verdict: FAIL`:
   ```bash
   cf status          # active slice: review-failed
   cf next            # Next: Blocked ... verdict FAIL does not clear threshold 'concerns'
   ```

5. **Replace with CONCERNS → clears → advance.**
   Add `NNN-review.code.second.md` with `verdict: CONCERNS` (lexicographically later → wins):
   ```bash
   cf next            # Next: Advance to slice <next> ...  (gate cleared)
   ```

6. **pre-tasks boundary: design present, no tasks, no slice review → pending-review (slice type).**
   On a slice with a design file but no task file, gating on:
   ```bash
   cf next            # Next: Review required — looks for a 'slice' review, not 'code'
   ```

7. **Tighten global threshold to pass → CONCERNS no longer clears.**
   ```bash
   cf config set workflow.review_threshold pass --project <scratch>
   cf next            # Next: Blocked ... verdict CONCERNS does not clear threshold 'pass'
   ```

8. **Build and tests.**
   ```bash
   pnpm -r build
   pnpm --filter @context-forge/core test reviewGate
   pnpm --filter @context-forge/core test WorkflowNavigator
   ```

## Implementation Notes

### Development Approach

Suggested order (each step independently testable):

1. `introspection/types.ts` — add `pending-review`/`review-failed` to `SliceStatus`; add `STATUS` const + derive `NormalizedStatus`. (Compiles; exhaustive switches may flag cases → guides next steps.)
2. `introspection/reviewGate.ts` — `BOUNDARY_REVIEW_TYPE`, `positionToReviewType`, `normalizeVerdict`, `evaluateVerdict`, `resolveGateConfig`. Full matrix + derivation unit tests first — the risk core, testable with zero navigator involvement.
3. `WorkflowNavigator.ts` — optional `ConfigManager` ctor dep; evaluate the gate at each boundary in `deriveSliceStatus()` + the no-active-slice/pre-slice-plan path; fill the reserved `review-gate` branch. Add gating-off regression + new-status/recommendation + per-boundary tests.
4. Wire the four surface call sites (`cli/next.ts`, `cli/status.ts`, `mcp workflowTools.ts` ×2) to construct and pass `ConfigManager(project.projectPath)`.
5. Add `verdict`-bearing fixtures.
6. `pnpm -r build && pnpm -r test`.

### Special Considerations

- **Conservative default is structural.** `config` undefined *or* `review_enabled` false ⇒ `deriveSliceStatus` must not even look for a review artifact; the existing paths stay exactly as today. Verify via the gating-off regression test, not inspection.
- **Present-but-unparseable ≠ pending.** An existing-but-unreadable artifact is `UNKNOWN` under `review_unknown_as`, surfaced as `review-failed` unless the policy clears it. Don't let the null-vs-present distinction collapse.
- **Case boundary.** Config tokens lowercase (`pass`/`concerns`/`fail`); verdicts uppercase (`PASS`/`CONCERNS`/`FAIL`/`UNKNOWN`). All crossing happens in `normalizeVerdict`/`evaluateVerdict` — never compare a token to a raw verdict elsewhere.
- **No magic strings.** Boundary→type via `BOUNDARY_REVIEW_TYPE`; status via `STATUS`; never a bare `'code'` or `'complete'` in the new code.
- **Don't reach into 242 scope.** The evaluator is built reusable, but this slice wires only the navigator boundaries. Resist adding the consistency-check call here.
