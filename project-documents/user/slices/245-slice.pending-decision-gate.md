---
docType: slice-design
slice: pending-decision-gate
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [241, 242]
interfaces: []
dateCreated: 20261017
dateUpdated: 20261017
status: not_started
---

# Slice Design: Pending Decision Gate

## Overview

ai-project-guide#44 added a per-decision status to the slice-design template. Each decision in Technical Decisions gets its own heading with a status line directly under it, and the value is `decided` or `pending-pm`. A design that still holds a `pending-pm` decision is not complete and cannot move to Phase 5. This slice makes Context Forge enforce that rule mechanically (issue #121).

The failure it prevents: in amoeba slice 108, `sq run p56 108` reached implement and failed with no code written, because design decision D7 was still waiting on the PM and Task 1.1 depended on it. A check before Phase 5 would have stopped the run at the design, where the PM can answer the question, instead of after a wasted dispatch.

Four units of work:

1. **A pure parser** finds decision-status lines in a design and returns the pending ones, each with its heading and line number.
2. **`cf validate design`** fails a design that holds any pending decision and names each one.
3. **`WorkflowNavigator`** gets a new slice status, `pending-decision`. It is set in `deriveSliceStatus()`, so `cf next`, `cf status`, and the MCP `workflow_next` / `workflow_status` tools all block Phase 5 and Phase 6 and list the pending decisions.
4. **`cf check` / MCP `workflow_check`** report a `pending-decision` finding for each affected slice.

One config key, `workflow.decision_gate_enabled` (default `true`), turns all of it off.

## Value

- **PM / pipeline operator:** an automated run (`sq run p56`) stops at the design boundary, with the open questions listed, instead of spending a dispatch on work that cannot finish.
- **Agents:** `cf next` no longer recommends task breakdown or implementation for a design with open decisions. It sends the work back to the PM, which is what the guide rule requires.
- **Squadron (squadron#223):** gets a stable, machine-readable contract to check before implement. That is `cf validate design --json` for one file, or `cf next --json` for the active slice.

## Technical Scope

**Included**
- Pure parser `findPendingDecisions()` in `packages/core/src/schema/`, with fence-aware scanning shared with the existing heading validator.
- `cf validate design` result and JSON output extended additively with the pending decisions.
- New `SliceStatus` value `pending-decision`, a `pendingDecisions` payload on `SliceStatus` and `NextAction`, and a new `LIFECYCLE: decision-gate` routing branch in `getNext()`.
- New ConsistencyChecker rule `pending-decision` (severity `warning`, not fixable).
- New config key `workflow.decision_gate_enabled`.
- Documentation: README configuration table and `docs/REVIEW-GATING.md` (new short section on the decision gate and the new status value).

**Excluded**
- Architecture documents and slice plans. The guide rule applies status lines to slice designs only. Gating other artifact types is future work, if the guide extends the field to them.
- Task files. The guide forbids tasks that depend on a PM decision. Detecting that is the BLOCKED-marker work in squadron#223, not this slice.
- Cross-checking the frontmatter `status:` of a design against pending decisions (e.g. `status: complete` with a pending decision). Not requested. File it as an issue if it turns out to matter.
- Squadron-side changes. Squadron consumes the contract defined here.

## Dependencies

### Prerequisites
- **Slice 241 (complete):** `deriveSliceStatus()` as the single source of truth for slice status, the `getNext()` lifecycle cascade, and the optional `ConfigManager` constructor dependency on `WorkflowNavigator`.
- **Slice 242 (complete):** the ConsistencyChecker per-slice rule pattern that the new rule follows.
- **ai-project-guide#44 (closed, shipped in the installed guide):** the template text that defines the status field. This is an external prerequisite, not a slice, so it is not in the frontmatter `dependencies`.
- **Scope of initiative 240:** arch 240 covers review gating only. Hosting a non-review gate in the same navigator and checker mechanisms is recorded as a scope revision in the slice plan's Notes.

### Interfaces Required
- `detectDocuments(projectPath, index)` → `sliceDesign` relative path.
- `ConfigManager.get(key)` → `{ value }` with the registry default applied when unset.
- Fence helpers currently private to `sliceDesignValidator.ts` (`openingFence`, `closesFence`, `splitLines`). Extracted in this slice (see D6).

## Architecture

### Component Structure

```
packages/core/src/schema/
  markdownLines.ts          NEW  splitLines, openingFence, closesFence (moved, not changed)
  sliceDesignValidator.ts   EDIT imports fence helpers from markdownLines.ts
  pendingDecisions.ts       NEW  findPendingDecisions(text) — pure
  sliceDesignFiles.ts       EDIT validateFile() also runs findPendingDecisions when gate enabled
  decisionGate.ts           NEW  isDecisionGateEnabled(config), readPendingDecisions(absPath) — node I/O
packages/core/src/config/ConfigKeys.ts            EDIT add workflow.decision_gate_enabled
packages/core/src/introspection/types.ts          EDIT status union, PendingDecision, payload fields
packages/core/src/introspection/WorkflowNavigator.ts  EDIT deriveSliceStatus + getNext branch
packages/core/src/introspection/ConsistencyChecker.ts EDIT one rule call in checkSlice
packages/cli/src/commands/validateDesign.ts       EDIT human + JSON output
packages/cli/src/commands/next.ts                 EDIT list pending decisions in human output
```

The MCP tools need no code changes. `workflow_next`, `workflow_status`, and `workflow_check` already serialize `NextAction`, `WorkflowStatus`, and `ConsistencyCheckResult`, so the new fields come through automatically. Only the `workflow_check` description string gets the new rule added to its "Detects:" list.

### Data Flow

```
design .md ──readFile──▶ findPendingDecisions(text) ──▶ PendingDecision[]
                                                           │
        ┌──────────────────────────────┬───────────────────┼─────────────────────────┐
        ▼                              ▼                   ▼                         ▼
 cf validate design            deriveSliceStatus()   ConsistencyChecker      (gate disabled:
 pass=false, lists each        status=pending-       rule pending-decision    parser not run)
                               decision + payload    warning per slice
                                       │
                                       ▼
                               getNext() decision-gate branch ─▶ NextAction{pendingDecisions}
                                       │
                                       ▼
                         cf next / cf status / MCP workflow_next / workflow_status
```

### State Management

None persisted. The gate is computed from the design file on every call, like the review gate. CF never writes to the design. Resolving a decision means editing its status line to `decided`, and that is a PM/Architect action.

## Technical Decisions

### D1 — Status-line grammar (lenient)
Status: decided

The grammar fails closed: anything that is not clearly `decided` or a known non-decision status blocks.

**Label.** A line is a status line when, after trimming, it starts with the `status` label: an optional bullet (`-`, `*`, `+`), optional emphasis (`**`, `__`, `*`, `_`) around the label, then a colon. The match is case-insensitive. Only this prefix is anchored; the rest of the line is free text.

```
^(?:[-*+]\s+)?[*_]{0,2}status[*_]{0,2}\s*:
```

**Value.** After the colon, leading whitespace and emphasis markers are stripped. The value is the first token, a run of `[A-Za-z0-9_-]`, lowercased. Trailing punctuation and prose are ignored, so `pending-pm.`, `pending-pm;`, `Pending-PM — waiting on PM`, and `pending-pm*` all yield the token `pending-pm`. The line is then classified:

| First token | Result |
|---|---|
| `decided` | decided |
| `not_started`, `in_progress`, `complete`, `completed`, `deferred`, `deprecated` (the frontmatter status vocabulary) | ignored: not a decision status |
| anything else, including no token | **pending** |

- "Anything else" covers the forms the guide defines (`pending-pm`, `pending pm`, `pending_pm`), misspellings (`pendng-pm`), and values that mean "not decided" (`TBD`, `open`, `undecided`). All of them block. A misread line is reported by heading and line number (D2), so a false positive costs one edit. A silent pass would repeat the amoeba-108 failure.
- Known residual: prose that starts with the label and an unlisted word (for example `Status: shipped in 0.12`) blocks. That is the accepted cost of failing closed. Adding words to the ignore list is a one-line change in the parser.
- YAML frontmatter is skipped, so a design's own `status:` field is never read as a decision.
- Lines inside fenced code blocks are skipped, using the same CommonMark fence rules as the heading validator. This lets a design (this one included) quote the grammar without tripping the gate. A line that starts with a backtick (inline code) does not match the label.
- The status line can appear anywhere in the document, as the slice plan requires. It is not tied to the Technical Decisions section, so a design that puts decisions in another section is still gated.

Rejected:
- Matching only the line directly under a `###` heading (strict). The slice plan asks for "anywhere in the design", and strict position matching fails silently on reasonable layouts, which the project's parsing rules forbid.
- Recognizing only `pending*` values and ignoring everything else (this design's first draft). Trailing punctuation and misspellings slipped through, which is the failure this slice exists to prevent.

### D2 — Naming a pending decision
Status: decided

Each pending decision is reported as the text of the nearest preceding heading outside a fence, any level, `#` markers stripped and trimmed, plus the 1-based line number of the status line. If no heading comes before it, the heading is reported as the literal placeholder `(no heading)`.

```ts
interface PendingDecision {
  heading: string;   // e.g. "D7 — Where amoeba finds the CF data directory"
  line: number;      // 1-based line of the status line
}
```

The line number makes duplicate headings unambiguous and lets an editor jump straight to the status line.

### D3 — Config key `workflow.decision_gate_enabled`, default `true`
Status: decided

`boolean`, `ConfigScope.Shared`, default `true`. When `false`, the parser is not run anywhere: `cf validate design` checks headings only, `deriveSliceStatus()` never returns `pending-decision`, and the ConsistencyChecker rule does not run. One switch for all three, so the surfaces cannot disagree.

Why `true`, unlike `review_enabled` (default `false`): the review gate needs review artifacts that many projects never produce, so turning it on by default would block everyone. The decision gate needs nothing. Designs with no status lines (every design written before ai-project-guide#44) pass unchanged, so default-on affects only designs that declare a pending decision themselves. Those are exactly the ones the guide says must not advance. Default-off would make the guide rule unenforced unless someone opts in, and #121 exists because the rule was not enforced.

Rejected: an effective-date cutoff like `review_gate_effective_date`. Older designs carry no status lines, so there is nothing to grandfather.

### D4 — Where the navigator gate fires
Status: decided

In `deriveSliceStatus()`, once a slice design exists, the decision gate is checked **before** any review gate. It fires whenever the slice would otherwise be `needs-tasks`, any review-gate status at pre-tasks or pre-implementation, or `in-implementation` (any progress). It does not fire when tasks are all checked (`complete` / pre-advance). That slice has already been implemented, and blocking its advance would not stop any work.

- **Before review gates:** answering a pending decision changes the design, which invalidates a slice review done before the answer. Sending the PM the decision first avoids a wasted review.
- **At any implementation progress, not only zero:** a pending decision found mid-implementation (added later, or a resumed pipeline) is exactly the hand-off condition #121 describes. The check costs one file read.
- **Independent of `review: none` and review gating:** the decision gate is not a review gate. `review_enabled`, `review: none`, and `review_gate_effective_date` do not affect it.
- **No `ConfigManager` (test-only construction):** gate off, matching 241's contract that a navigator built without config behaves exactly as before. Every production call site (`cf next`, `cf status`, both MCP tools) passes a config.

### D5 — Routing in `getNext()` and the `--json` contract
Status: decided

New branch `LIFECYCLE: decision-gate`, placed before `needs-tasks` in the cascade:

```ts
{
  recommendation: 'Blocked: design has pending PM decisions',
  rationale: 'Slice 108 design has 1 decision pending PM confirmation: D7 — … (line 212). Resolve each with the PM and set its status line to decided before task breakdown.',
  slice: project.fileSlice,
  phase: 'Phase 4: Slice Design',
  summary: 'Blocked — slice 108 has 1 pending PM decision',
  pendingDecisions: [{ heading: 'D7 — …', line: 212 }],
}
```

- `phase` is Phase 4 because the work owed is design work. `enrich()` therefore adds its usual `cf set phase` suggestion when the project is set to a later phase.
- `pendingDecisions` is a new optional field on `NextAction` and `SliceStatus`. It is present only for this status, and existing fields keep their shape. Squadron should test for `pendingDecisions` (or for the `pending-decision` slice status from `cf status --json`), not the `recommendation` string. The recommendation is a user-facing label and must not be used as logic.
- Human `cf next` output adds one indented line per decision under `Rationale:`.

### D6 — Extract fence helpers into `markdownLines.ts`
Status: decided

The parser needs the same fence handling as the heading validator. The private `splitLines`, `openingFence`, `closesFence`, and the `OpenFence` type move unchanged into `schema/markdownLines.ts`, and both modules import them. That avoids a second copy of the CommonMark fence rules (DRY). The existing `sliceDesignValidator` tests are the behavior-preservation check for the move.

### D7 — `cf validate design` output
Status: decided

`DesignValidationResult` gains `pending: PendingDecision[]` (always present, empty when the gate is disabled or nothing is pending). `pass` becomes `missing.length === 0 && pending.length === 0`. A docType failure still short-circuits, as today. The top-level `ValidateDesignJson` gains `decisionGateEnabled: boolean`, so a consumer can tell "nothing pending" from "not checked". Exit codes do not change: 0 all pass, 1 any fail, 2 usage/template error.

Config plumbing. Core stays config-free, and the CLI decides:

- `resolveTemplatePath` becomes `resolveCheckout`, returning `{ checkoutRoot, templatePath }`. Today it computes the checkout root and throws it away.
- `validateDesignAction` builds `new ConfigManager(checkoutRoot)` and calls `isDecisionGateEnabled(config)`.
- The flag is passed in as a named option: `validateSliceDesignFiles(templatePath, files, { decisionGateEnabled })`. Core then passes it on to `validateFile()`, which runs `findPendingDecisions` only when the flag is true.

Human output, after any `missing:` lines:

```
FAIL project-documents/user/slices/108-slice.example.md
  pending-pm: D7 — Where amoeba finds the CF data directory (line 212)
```

### D8 — ConsistencyChecker rule severity is `warning`
Status: decided

`cf check` reports artifact inconsistencies. A pending decision during Phase 4 is a legitimate in-progress state, not an inconsistency, and an `error` would fail `cf check` (and any hook that runs it) while the architect is still writing the design. `warning`, with one finding per affected slice that lists each decision, matches 242's missing-review-artifact rule. The blocking itself is done by `cf next` and `cf validate design`. **`cf check` / `workflow_check` is not a blocking gate for this condition:** a warning does not change its exit status, so a pipeline that gates on `cf check` alone will not stop. This is stated in the `docs/REVIEW-GATING.md` section as well. The rule applies to slices that have a design and are not complete (same scope as D4), and it is not auto-fixable.

## Implementation Details

### API Contracts

**Core exports** (`@context-forge/core/node`):

```ts
export interface PendingDecision { heading: string; line: number }
export function findPendingDecisions(text: string): PendingDecision[];          // pure
export async function isDecisionGateEnabled(config: ConfigManager): Promise<boolean>;
export async function readPendingDecisions(absPath: string): Promise<PendingDecision[]>;
export async function validateSliceDesignFiles(           // existing; options param added
  templatePath: string,
  files: readonly string[],
  options: { decisionGateEnabled: boolean },
): Promise<DesignValidationResult[]>;
```

`readPendingDecisions` raises a missing or unreadable design file. It does not return an empty list for one. The callers have just detected the file through `detectDocuments`, so a read failure is a real error (TD-2a), not "no decisions".

**Config key:**

| Key | Type | Default | Scope |
|---|---|---|---|
| `workflow.decision_gate_enabled` | boolean | `true` | shared |

**Type changes** (additive): `SliceStatus.status` adds `'pending-decision'`; `SliceStatus.pendingDecisions?` and `NextAction.pendingDecisions?`; `DesignValidationResult.pending`; `ValidateDesignJson.decisionGateEnabled`; ConsistencyChecker rule id `'pending-decision'`.

## Integration Points

### Provides to Other Slices
- **Squadron (squadron#223):** before an implement step, run either check and refuse to start if it reports pending decisions:
  - `cf validate design <design> --json`: exit 1, and `files[].pending` is non-empty.
  - `cf next --json`: `pendingDecisions` is present, or `cf status --json` reports `activeSlice.status === 'pending-decision'`.

  The contract is the field names above, not any human-readable string.
- **Any future artifact-level decision gate** can reuse `findPendingDecisions()` unchanged.

### Consumes from Other Slices
- 241's `deriveSliceStatus()` ordering and `enrich()` helper. The new branch fits into the cascade the same way the review-gate branch does.
- 242's per-slice rule pattern in `checkSlice()`.
- The guide template. If a later guide version renames the status values, the parser's normalization (D1) is the single place to update.

## Success Criteria

### Functional Requirements
- `findPendingDecisions` follows the D1 table: label forms (plain, bold label, bold whole, bullet, any case) are recognized; `decided` passes; the frontmatter vocabulary is ignored; every other value blocks. Frontmatter and fenced lines are skipped. Each match is attributed to the nearest preceding heading with the correct line number.
- `cf validate design` on a design with one pending decision prints `FAIL`, a `pending-pm:` line naming it, and exits 1. After the line is changed to `decided`, it prints `PASS` and exits 0.
- A design with no status lines passes `cf validate design` exactly as before 245.
- With an active slice whose design has a pending decision and no task file, `cf next` returns the decision-gate recommendation, not "Create task breakdown". With a task file at zero or partial progress, it returns the same recommendation, not "Continue implementation". With all tasks checked, it is unaffected.
- When the review gate would also block (`review_enabled = true`, no slice review), the decision gate takes precedence.
- `cf status` shows `Status: pending-decision`, and `--json` includes `pendingDecisions`.
- `cf check` emits one `pending-decision` warning per affected slice. Complete slices emit none.
- With `workflow.decision_gate_enabled = false`, all of the above revert to pre-245 behavior, and `cf validate design --json` reports `decisionGateEnabled: false`.

### Technical Requirements
- Pure parser unit tests, using the real template text (`project-documents/ai-project-guide/project-guides/templates/slice-design.md`, resolved via `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH`, which must yield zero pending) and a fixture modeled on the amoeba 108 decision layout.
- Parser fixtures that must block: trailing punctuation or prose (`pending-pm.`, `pending-pm;`, `Pending-PM — waiting on PM`, `pending-pm*`), a misspelling (`pendng-pm`), not-decided words (`TBD`, `undecided`, `open`), and an empty value. Fixtures that must not block: `decided.` and `Decided — PM 20261017`, each frontmatter-vocabulary value, and the design's own frontmatter `status:` line. The ignore-list fixture pins current behavior, so widening or narrowing that list is a deliberate change.
- Existing `sliceDesignValidator` tests pass unchanged after the fence-helper move (D6).
- Navigator tests cover each D4 position, the review-gate precedence, and the no-config case.
- No new file over ~300 lines. ConsistencyChecker gains a single call into `decisionGate.ts`, not inline parsing.
- `pnpm -r build`, lint, typecheck, and tests pass.

### Integration Requirements
- MCP `workflow_next` / `workflow_status` / `workflow_check` responses carry the new fields with no MCP code change beyond the `workflow_check` description string.
- README config table and `docs/REVIEW-GATING.md` document the key, its default, the `pending-decision` status, and the Squadron contract. They also state that `cf check` reports the condition but does not block on it (D8).

### Verification Walkthrough

Run from a scratch project (or context-forge itself), using the local build: `node packages/cli/dist/index.js` (the global `cf` is the published npm build).

1. **Validate fails on a pending decision.** Copy any passing design to `/tmp/pd.md` and add under a `### D9 — Example` heading:

   ```
   Status: pending-pm
   ```

   Run `cf validate design /tmp/pd.md`. Expect:

   ```
   FAIL /tmp/pd.md
     pending-pm: D9 — Example (line N)
   ```

   Exit code 1 (`echo $?`).
2. **Lenient forms.** Change the line to the bold label form, then the bullet form, then `status: Pending PM`, then `pending-pm.` with a trailing period, then `TBD`. Each still FAILs. Change it to `Status: decided` → `PASS`, exit 0.
3. **Fenced example ignored.** Put the pending line inside a fenced block → `PASS`.
4. **JSON contract.** `cf validate design /tmp/pd.md --json` (pending again) → `files[0].pending` has one entry with `heading` and `line`, and `decisionGateEnabled: true`.
5. **`cf next` blocks Phase 5.** In a project whose active slice has a design but no task file, add a pending line to the design. `cf next` → `Next: Blocked: design has pending PM decisions`, with the decision listed. `cf next --json` includes `pendingDecisions`. `cf status` shows `Status: pending-decision`.
6. **`cf next` blocks Phase 6.** Add a task file with some items checked. `cf next` still reports the decision gate.
7. **`cf check`.** `cf check` lists a `pending-decision` warning for that slice.
8. **Resolve.** Set the line to `decided`. `cf next` returns the normal recommendation (task breakdown or continue implementation).
9. **Switch off.** `cf config set workflow.decision_gate_enabled false`, then restore the pending line. `cf validate design` PASSes, `cf next` is unaffected, and `cf check` shows no `pending-decision` finding. `cf config unset workflow.decision_gate_enabled` restores the default.

## Implementation Notes

### Development Approach
1. Extract the fence helpers into `markdownLines.ts` (refactor commit, existing tests green).
2. Write `pendingDecisions.ts` and its unit tests (D1, D2).
3. Add the config key and `decisionGate.ts`.
4. Extend `cf validate design` (core result + CLI output).
5. Add the navigator status, payload, and `getNext()` branch, plus `cf next` human output.
6. Add the ConsistencyChecker rule and the `workflow_check` description.
7. Update the docs (README, `docs/REVIEW-GATING.md`).

Effort: 2/5.

### Special Considerations
- This design deliberately keeps every pending-status example inside a fenced block. Once implemented, `cf validate design` on this file must still PASS, which makes it a convenient real-world regression fixture.
