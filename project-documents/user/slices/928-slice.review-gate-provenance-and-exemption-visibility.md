---
docType: slice-design
slice: review-gate-provenance-and-exemption-visibility
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260930
dateUpdated: 20260930
status: not_started
---

# Slice Design: review-gate-provenance-and-exemption-visibility

## Overview

The review gate (`evaluateReviewGate` in `packages/core/src/introspection/reviewGate.ts`) has two blind spots:

1. **It trusts every PASS the same way.** Squadron review artifacts now say how the verdict was obtained: `verdictSource: derived` means the model's summary failed to parse and squadron rebuilt the verdict from finding severities (#89), and `recoveryTurn: true` means the model only produced the review after a second prompt (#105). The gate reads `verdict:` and nothing else, so a rebuilt or recovered PASS clears exactly like a clean one.
2. **It can't tell "skipped" from "cleared."** A `review: none` exemption and a passing review both return `null`. `cf check` and `cf next` show them identically, which is how slices 924 and 925 went unreviewed without anyone noticing (#83). `cf check --set-review-none` also runs silently, so an agent can use it to get past a gate.

This slice makes the gate's result say *why* it didn't block, lets a project decline to auto-clear a weak-evidence PASS, surfaces exemptions in `cf check` and `cf next`, and puts a confirmation step in front of `--set-review-none`. It also picks up #67 (a numbering collision in the slice-plan parser), because the fix turns out to be small and doesn't touch the gate.

## Value

- **PMs running squadron reviews** can set one config key and stop a rebuilt or recovered PASS from moving a slice forward on its own. Default behavior doesn't change.
- **Anyone reading `cf check` / `cf next`** sees when a slice's reviews are waived. The 924/925 failure mode becomes visible the first time it happens instead of after release.
- **Agents lose the silent bypass.** `--set-review-none` states what it waives and needs `--yes` or an interactive "y".
- **Developers** get a gate result they can switch on (`clears` / `exempt` / `pending-review` / `review-failed`) instead of a `null` that means three things.

## Technical Scope

**Included**

- `reviewGate.ts`: a new result union (TD-1), provenance reading (TD-3), and a weak-PASS policy (TD-2).
- `ConfigKeys.ts`: one new key, `workflow.review_weak_pass_as`.
- `WorkflowNavigator`: carry an exemption note through `SliceStatus` and append it to the `cf next` / `workflow_next` rationale.
- `ConsistencyChecker.ruleReviewGate`: one `info` finding per exempt slice whose plan entry is incomplete.
- `packages/cli/src/commands/check.ts`: `--set-review-none` explains itself and requires confirmation.
- #67: `ruleDuplicateIndex` wording that knows about `indexSource`, and `checkSlice`'s plan-entry lookup preferring explicit indices.
- Docs: CHANGELOG entry, and docs/REVIEW-GATING.md updated for the new key and the exemption visibility.

**Excluded**

- Squadron-side changes. Squadron already emits both keys.
- Separate policy keys for `derived` and `recoveryTurn` (TD-2 explains why).
- Showing grandfathered (`review_gate_effective_date`) slices. They get their own exempt reason in the result type, but nothing displays it (TD-1).
- #84 (docs/REVIEW-GATING.md documents a field that doesn't exist). Fine to fix while we're in that file, but it's not a success criterion.
- Moving fallback indices into a separate numbering space (#67's broader option). Only the diagnostic and lookup fixes are in scope.

## Dependencies

### Prerequisites

- #106 per-part review gating (commit 20ffeb0, on main). Provenance is checked per part on top of it.
- None from other slices.

### Interfaces Required

- `detectDocuments` → `review`, `reviewParts` (existing).
- `parseFrontmatter` → `data: Record<string, string>`. Every frontmatter value arrives as a string, so `recoveryTurn: true` shows up as `"true"`.
- `SlicePlanEntry.indexSource: 'explicit' | 'fallback'` (existing, added by slice 913).
- `askConfirmation` (`packages/cli/src/utils/confirm.ts`) and `withYesOption` (existing).

## Architecture

### Component Structure

```
reviewGate.ts
  evaluateReviewGate() ──► GateResult (union)   ◄── new return contract
  classifyEvidence()   ──► 'strong' | 'weak'     ◄── new pure helper
  resolveGateConfig()  ──► ResolvedGate + weakPassAs
        │                                  │
        ▼                                  ▼
WorkflowNavigator.deriveSliceStatus   ConsistencyChecker.ruleReviewGate
  exempt → SliceStatus.gateNote         exempt + entry incomplete → info finding
  getNext(): enrich() appends note      clears → nothing
```

### Data Flow

For each review part (in the #106 loop):

1. `verdict = normalizeVerdict(fm.verdict)` (unchanged).
2. If `verdict === 'PASS'` and `classifyEvidence(fm) === 'weak'`, evaluate the stand-in verdict `weakPassAs` instead (`'pass'` → PASS, `'concerns'` → CONCERNS, `'fail'` → FAIL) against the boundary's threshold, using the existing `evaluateVerdict`.
3. If the part doesn't clear, return `review-failed`. The rationale names the provenance, for example: `verdict PASS (derived from finding severities; recovered on a second prompt) treated as CONCERNS by workflow.review_weak_pass_as, does not clear threshold 'pass' …`.
4. If every part clears, return `{ status: 'clears' }`.

Exemption flow: the grandfather check returns `{ status: 'exempt', reason: 'grandfathered' }`, and the `review: none` check returns `{ status: 'exempt', reason: 'review-none' }`. Callers act only on `review-none`.

### State Management

No new persisted state. The only write is the existing `--set-review-none` frontmatter update, now behind a confirmation step.

## Technical Decisions

### TD-1: Gate result becomes a discriminated union

```ts
type GateResult =
  | { status: 'clears' }
  | { status: 'exempt'; reason: ExemptReason; rationale: string }
  | GateEvaluation;               // 'pending-review' | 'review-failed' (unchanged shape)
type ExemptReason = 'review-none' | 'grandfathered';
```

- `null` now means only "gating is off" (no config, or `review_enabled: false`). The pre-241 short-circuit stays identical.
- We use a variant instead of a separate `isReviewExempt()` helper because a helper would re-read the same frontmatter the gate already parsed, and callers could still mix up "clears" and "exempt" by skipping the helper. The union makes the compiler force both callers to handle every case.
- `grandfathered` exists so the type doesn't pretend a grandfathered slice cleared. It isn't displayed: turning on gating for a project with history would otherwise flood `cf check` with info findings.
- `ExemptReason` values are defined once as an `as const` object in `reviewGate.ts`. Callers compare against that object, never against string literals.

### TD-2: One policy key, stand-in verdict, no new gate status

Settles design questions (a) and (b) from the slice plan entry.

- **Key:** `workflow.review_weak_pass_as`, enum `['pass', 'concerns', 'fail']`, default `'pass'`, scope Shared.
- **Meaning:** a PASS backed by weak evidence (see TD-3) is evaluated as this verdict instead of PASS. This follows the existing `review_unknown_as` pattern and reuses `evaluateVerdict` and the per-boundary thresholds. So `'concerns'` blocks under a `pass` threshold and clears under `concerns`, and `'fail'` always blocks.
- **One key, not two:** both signals mean the same thing to the gate ("this PASS is weaker than usual"), and a project that distrusts one almost certainly distrusts the other. If someone later needs them separately, adding a second key doesn't break the first.
- **No new gate status:** a declined weak PASS is `review-failed` with a rationale naming the provenance and the key. `cf next` already routes `review-failed` to "re-run or resolve the review," which is the right action. A new status would mean new routing in `getNext`, new CLI rendering, and new MCP output for no behavioral gain.
- **PASS only (b):** CONCERNS and FAIL keep going through the existing threshold logic. At default thresholds they already block or clear on their own merits, and weak evidence behind a CONCERNS or FAIL shouldn't make the gate *more* lenient.
- **Default `'pass'`:** existing projects see no change, including those with squadron artifacts already carrying `derived`.

### TD-3: Provenance parsing — untrusted, never throws

Settles design question (d).

`classifyEvidence(data: Record<string, string>): 'strong' | 'weak'`:

| Field | Value (after trim + lowercase) | Effect |
|---|---|---|
| `verdictSource` | absent | no signal (hand-written and pre-919 reviews) |
| `verdictSource` | `stated` | no signal |
| `verdictSource` | `derived` | weak |
| `verdictSource` | anything else | weak |
| `recoveryTurn` | absent, `false` | no signal |
| `recoveryTurn` | `true` | weak |
| `recoveryTurn` | anything else | weak |

Either field weak → `'weak'`.

- **Absent is not weak.** The slice plan entry said absent or malformed values should "degrade like an unknown verdict." Doing that for *absent* would turn every hand-written review into UNKNOWN, and under the default `review_unknown_as: fail` that blocks existing projects. That breaks the no-change-by-default rule, so absent means "no signal."
- **Present but unrecognized means weak.** A value we can't vouch for is treated as weak evidence and goes through `review_weak_pass_as`, not `review_unknown_as`. The verdict itself was readable, so only its provenance is in doubt. At the default `'pass'` this changes nothing, and it never throws.
- The accepted values live in one `as const` object (`PROVENANCE`) in `reviewGate.ts`.

### TD-4: Split reviews — provenance per part

Settles design question (c). The #106 loop already evaluates each part on its own. Provenance is classified inside that loop, per part, so one derived part among stated ones blocks by itself (when the policy says so), and the rationale names that part's path. There is no folding across parts, for the same reason #106 chose per-part evaluation.

### TD-5: Exemption visibility

- **`SliceStatus.gateNote?: string`** (new, optional). `deriveSliceStatus` sets it when any boundary it evaluated returned `exempt` with reason `review-none`: `review gate skipped: slice declares review: none`. The status itself falls through as today (`needs-tasks` / `in-implementation` / `complete`).
- **`getNext`:** `enrich()` appends ` (review gate skipped: slice declares review: none)` to `rationale` when `slice.gateNote` is set. That's one place, and it covers every recommendation branch that follows an exempt fall-through. `workflow_next` (MCP) calls the same `getNext`, so it picks up the note with no extra work.
- **`cf check`:** `ruleReviewGate` currently evaluates up to three boundaries per slice. Exemption is a property of the slice, not of a boundary, so it emits **at most one** `info` finding per slice, and only when `planEntry` exists and `!planEntry.isChecked`:
  `Slice 925 is review-exempt (review: none) — slice, tasks, and code review gates are skipped. Confirm this is intended.` The location is the slice design path. It isn't fixable.
- Nothing is emitted for complete exempt slices, which keeps history quiet as #83 asks.

### TD-6: `--set-review-none` confirmation

Before writing, it prints:

```
Slice 925: project-documents/user/slices/925-slice.guide-install-robustness.md
Setting review: none waives the slice, tasks, and code review gates for this slice.
This is a Project Manager decision.
Proceed? [y/N]
```

- `--yes` skips the prompt. `--json` without `--yes` is an error, so a JSON caller can't hang on a prompt.
- When `process.stdin.isTTY` is false and there's no `--yes`, it throws a `UserError` saying `--yes` is required. Without that check, `readline` on a closed stdin never resolves, and an agent's call would just hang or exit silently.
- On decline it prints `Cancelled.` and writes nothing. This copies the `cf worktree rm` pattern.

`--yes` is still one flag away for an agent. The guard is that it has to be a deliberate, visible act in the transcript. The rule against agents doing it at all lives in the guide (004-slice-design), not here.

### TD-7: #67 — include, minimal fix

It's small and independent of the gate, so it's in.

- **`ruleDuplicateIndex`:** group by index as today, but word the finding by the sources in the group:
  - All `explicit`: unchanged text (a real authoring duplicate).
  - Mixed: `Slice index N: '(N) Real Name' collides with auto-numbered unindexed entry 'Other Name'` with suggested fix `Give the unindexed entry an explicit (NNN) index`.
  - All `fallback`: can't happen within one file, because the counter is monotonic. No branch for it.
- **`checkSlice` lookup:** prefer an `explicit` entry with the matching index and fall back to a `fallback` entry. A real slice never resolves to a placeholder.
- The parser itself doesn't change. Fallback numbering is unchanged, so anything that relies on it today still works.

### Patterns and Conventions

- Comparison values (`ExemptReason`, provenance tokens, `weakPassAs` tokens) are each defined once and referenced everywhere.
- Config parsing reuses the `parseUnknownPolicy` shape: an out-of-vocabulary config value throws a descriptive error (project policy, fail fast), and a frontmatter value never throws (external data).
- The existing callers' `safeEvaluateGate` try/catch stays as it is.

## Implementation Details

### API Contracts

**Config key (new)**

| Key | Type | Default | Enum | Description |
|---|---|---|---|---|
| `workflow.review_weak_pass_as` | string | `pass` | `pass`, `concerns`, `fail` | How to treat a PASS whose review artifact reports weak provenance (`verdictSource` other than `stated`, or `recoveryTurn: true`). `pass` accepts it (default), `concerns` evaluates it as CONCERNS against the gate's threshold, `fail` blocks. |

**`ResolvedGate`** gains `weakPassAs: UnknownPolicy`. It uses the same three-token vocabulary, so the type can be reused. If that reads badly, rename the type to `StandInPolicy` and alias the old name.

**`evaluateReviewGate`** returns `Promise<GateResult | null>` (TD-1).

**`SliceStatus`** gains `gateNote?: string`.

**`cf check --set-review-none <index>`** adds the confirmation step from TD-6. `--yes` is already registered on `check`.

**MCP:** no schema changes. `workflow_next` rationale text gains the exemption note, and `workflow_check` findings include the new `info` finding.

## Integration Points

### Provides to Other Slices

- A `GateResult` union any future gate consumer can switch on.
- `classifyEvidence()` as the one place that interprets squadron provenance keys. If squadron adds another signal later, it's one row in TD-3's table.

### Consumes from Other Slices

- Squadron's frontmatter contract (`verdictSource`, `recoveryTurn`). If squadron renames or drops a key, affected artifacts fall back to "no signal" (absent), which is today's behavior.

## Success Criteria

### Functional Requirements

1. With `review_weak_pass_as` unset, every existing gate test passes unchanged, and a PASS with `verdictSource: derived` clears.
2. With `review_weak_pass_as: concerns` and threshold `pass`, a PASS with `verdictSource: derived` yields `review-failed`, and the rationale names `derived` and the config key.
3. Same as (2) for `recoveryTurn: true` with `verdictSource: stated`.
4. With `review_weak_pass_as: concerns` and threshold `concerns`, a derived PASS clears.
5. With `review_weak_pass_as: fail`, a derived PASS blocks at any threshold.
6. `verdictSource: stated`, an absent `verdictSource`, and `recoveryTurn: false` never count as weak. `verdictSource: garbage` and `recoveryTurn: yes` count as weak. None of these throw.
7. CONCERNS and FAIL verdicts behave identically whatever their provenance.
8. Split review: parts [stated PASS, derived PASS] under `weak_pass_as: fail` → `review-failed` pointing at the derived part.
9. `evaluateReviewGate` returns `{status:'exempt', reason:'review-none'}` for a `review: none` slice at preTasks, preImplementation, and preAdvance. It returns `{status:'exempt', reason:'grandfathered'}` below the effective date, `{status:'clears'}` for a passing review, and `null` only when gating is off.
10. `cf next` on an active `review: none` slice shows the fall-through recommendation with `(review gate skipped: slice declares review: none)` in the rationale. `workflow_next` shows the same.
11. `cf check` emits exactly one `info` finding per exempt slice with an incomplete plan entry, and none for complete ones.
12. `cf check --set-review-none N` in a non-TTY without `--yes` exits non-zero and writes nothing. With `--yes` it writes and prints the waiver text. Interactively, answering "n" writes nothing.
13. A plan with `(5) Real` and a fifth unindexed entry: `ruleDuplicateIndex` reports the mixed-source wording, and `checkSlice(5)` resolves to `(5) Real`.

### Technical Requirements

- No `any` and no string literals for exempt reasons or provenance tokens outside their definitions.
- Unit tests for `classifyEvidence` (every row of TD-3's table), weak-PASS evaluation per policy, split-review provenance, and every `GateResult` variant. There are caller tests in the navigator and checker test suites and a CLI test for the confirmation paths. Fixture frontmatter uses squadron's real key spelling and layout (`verdictSource: derived` on its own line, followed by `recoveryTurn: true`), taken from `squadron/src/squadron/review/persistence.py`.
- Full core and CLI test suites pass, and `pnpm -r build` succeeds.
- `reviewGate.ts` stays around 300 lines. If it doesn't, move provenance parsing into `reviewProvenance.ts`.

### Integration Requirements

- The CLI and MCP (`workflow_next`, `workflow_check`) both show the exemption note and finding without MCP code changes.
- CHANGELOG Unreleased has entries for #89, #105, #83, and #67. docs/REVIEW-GATING.md documents `review_weak_pass_as` and the exemption visibility.

### Verification Walkthrough

Run from the repo root after `pnpm -r build`, using `node packages/cli/dist/index.js` (the global `cf` is the published npm build). Use a scratch copy of a project with gating on (`cf config set workflow.review_enabled true`).

1. **Default is unchanged.** Pick a slice whose slice review has `verdict: PASS`. Add `verdictSource: derived` to that review's frontmatter.
   `node packages/cli/dist/index.js next` → same recommendation as before the edit (for example "needs tasks").
2. **Decline a derived PASS.**
   `node packages/cli/dist/index.js config set workflow.review_threshold pass`
   `node packages/cli/dist/index.js config set workflow.review_weak_pass_as concerns`
   `node packages/cli/dist/index.js next` → "Blocked: review verdict does not clear threshold", with a rationale naming `derived` and `workflow.review_weak_pass_as`.
3. **Recovered PASS.** Change `verdictSource` back to `stated` and add `recoveryTurn: true`. `next` is still blocked, and the rationale names the recovery. Remove `recoveryTurn` and `next` clears.
4. **Exemption shows up.** On an in-progress slice, run `node packages/cli/dist/index.js check --set-review-none <index> < /dev/null` → error saying `--yes` is required. `git diff` shows nothing written.
   Run it again with `--yes` → prints the slice path and the waiver text, then writes the field.
   `node packages/cli/dist/index.js check` → one `info` finding: `Slice <index> is review-exempt (review: none) …`.
   `node packages/cli/dist/index.js next` → rationale ends with `(review gate skipped: slice declares review: none)`.
5. **#67.** Temporarily add a fifth unindexed entry to a scratch plan that also holds a `(5)` entry. `check` reports the collision with the auto-numbered wording.
6. Revert the scratch edits.

## Risk Assessment

### Technical Risks

- **Changing the return contract.** Both callers read `null` as "nothing to flag." If one is missed, exempt and clears silently behave differently from today.

### Mitigation Strategies

- Make the union change first, with no behavior change, and let the compiler find every caller (there are two, plus tests). Commit that on its own before adding provenance or visibility.
- Criterion 1 (defaults unchanged) runs against the entire existing gate test suite before any new test is added.

## Implementation Notes

### Development Approach

1. **Refactor:** introduce `GateResult`. Update `evaluateReviewGate`, `WorkflowNavigator.evaluateGate`/`deriveSliceStatus`, and `ConsistencyChecker.safeEvaluateGate`/`ruleReviewGate`/`ruleArchReviewGate` so that `clears` and `exempt` behave exactly like today's `null`. The existing tests stay green. Commit.
2. **Provenance:** add `classifyEvidence`, the config key, `weakPassAs` in `ResolvedGate`, and per-part evaluation. Add tests.
3. **Visibility:** `gateNote` plus the `enrich` append, and the `ruleReviewGate` info finding. Add tests.
4. **CLI confirmation:** `setReviewNoneAction` prompt, TTY check, and `--json` handling. Add tests.
5. **#67:** `ruleDuplicateIndex` wording and `checkSlice` lookup preference. Add tests.
6. Docs (CHANGELOG, docs/REVIEW-GATING.md), full build, and the full test suite.

### Special Considerations

- Squadron frontmatter is untrusted input. Nothing in this slice may throw on a frontmatter value, only on the project's own config.
- `ruleArchReviewGate` (preSlicePlan) never sees `review-none` exemptions, but it can see `grandfathered` and must treat it as "nothing to flag."
