---
docType: slice-design
project: context-forge
slice: 922
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dateCreated: 20260806
dateUpdated: 20260809
status: not_started
---

# Slice 922: Unify Canonical Status Vocabulary

Fixes GitHub issue #72. Blocks #73 and, transitively, squadron slice 172.

## Problem

Two constants define the same five status values with different spellings.

```ts
// packages/core/src/introspection/types.ts:2-8
export const STATUS = {
  Complete: 'complete',
  InProgress: 'in-progress',   // hyphen
  NotStarted: 'not-started',   // hyphen
  Deprecated: 'deprecated',
  Deferred: 'deferred',
} as const;

// packages/core/src/schema/frontmatterSchema.ts:31-37
export const VALID_STATUSES = [
  'not_started',   // underscore
  'in_progress',   // underscore
  'complete', 'deferred', 'deprecated',
] as const;
```

`ConsistencyChecker`'s `update-frontmatter` fix actions write `STATUS.InProgress` / `STATUS.NotStarted`, so `cf check --fix` writes values absent from `VALID_STATUSES`, while the `suggestedFix` text describes the underscored form. Description and applied fix disagree.

**Reproduced live on this repo** (20260806, commit `b04eea4`):

```
$ cf check --json | grep -o '"value": "[^"]*"'
"value": "in-progress"
```

That is a real pending fix action that would write a non-canonical value.

### Why this blocks a gate, not just cosmetics

`validateFrontmatter` currently papers over the mismatch:

```ts
// packages/core/src/schema/frontmatterSchema.ts:256-264
let effectiveValue = normalizedValue;
if (field === 'status') {
  const normalized = normalizeStatus(effectiveValue);
  effectiveValue = normalized ? normalized.replace(/-/g, '_') : effectiveValue.replace(/[-\s]/g, '_');
}
```

The comment documents the mismatch rather than fixing it. Consequence: `validateFrontmatter` **accepts** `status: in-progress`. A pre-commit gate built on it (squadron slice 172) would pass exactly the values `cf check --fix` writes — enforcing nothing while appearing to work. This is why #72 must land before #73, and why the fix is not merely a find-replace.

## Design Decision: which vocabulary becomes canonical

The slice plan entry flags this as the open question. It is settled here.

### Evidence

`NormalizedStatus` values are **not internal**. Verified live:

```
$ cf list slices --json | grep -o '"status": "[^"]*"' | sort -u
"status": "complete"
"status": "not-started"
```

The derived status reaches stdout verbatim via `cf list slices|arch --json`, `cf status --json`, `cf next --json`, and the MCP `introspection_*` / `project_get` tools (which document `inferredStatus` in their descriptions at `introspectionTools.ts:138`, `projectTools.ts:130`). Sibling tooling consumes these.

Two facts constrain the choice:

1. **Frontmatter-on-disk must be underscored.** `VALID_STATUSES` matches `file-naming-conventions.md`, it is the published schema, and squadron's gate validates against it. This is not negotiable.
2. **Changing `--json` wire values is a breaking change** to a machine-readable surface with an external consumer.

### Options considered

| | Approach | Wire values | Vocabularies alive |
|---|---|---|---|
| A | Flip `STATUS` to underscores; `VALID_STATUSES` derives from it | changes (breaking) | one |
| B | Keep `STATUS` hyphenated; translate at the write boundary only | unchanged | two (translation retained) |
| C | Flip `STATUS` to underscores; translate at the *display/JSON* boundary | unchanged | one internally |

### Decision: **Option A** — single underscored vocabulary, wire values change.

Rationale:

- **Option B is the status quo with better manners.** It keeps two vocabularies and keeps a translation step; the `.replace()` merely moves. The core defect — "one enum should define the canonical spelling and everything else references it" (CLAUDE.md: define comparison values once) — survives. It also leaves `--json` emitting `not-started` while frontmatter says `not_started`, which is the confusing state we are trying to end.
- **Option C** avoids the break but reintroduces at the JSON boundary the exact translation layer we are deleting at the validation boundary. Net vocabularies: still two, just relocated.
- **Option A's cost is bounded and one-time.** The break is confined to two derived-status values (`in-progress` → `in_progress`, `not-started` → `not_started`); `complete`, `deferred`, `deprecated` are already identical in both vocabularies and do not move. After this slice, one value spelling exists everywhere: on disk, in memory, on the wire.

**This is a deliberate breaking change to `--json` / MCP output and must be released as such** — see Release & Compatibility below. It is not a silent behavior change.

### What does *not* change: lenient reads

`normalizeStatus()` stays lenient permanently. It must continue mapping `in-progress`, `in progress`, `active`, `not-started`, `not started`, `ready`, `pending`, `planned`, `done`, `completed` to canonical values. Documents already on disk carry hyphenated values (this repo's own artifacts among them); refusing to read them would be a regression, and the guide's own leniency rule requires it.

The asymmetry is the whole point:

- **read** — lenient, accepts every historical spelling
- **write** — strict, emits only `VALID_STATUSES`
- **validate** — strict, rejects anything not in `VALID_STATUSES`

## Implementation

### Ordering constraint (hard)

Fix the constants **before** removing the `.replace()` workaround. Reversed, `validateFrontmatter` turns strict while `STATUS` still emits hyphens, and `cf check` begins flagging documents `cf` itself just wrote. Each step below must leave the suite green.

### Step 1 — one definition, one derivation

`STATUS` in `introspection/types.ts` becomes the single source:

```ts
export const STATUS = {
  Complete: 'complete',
  InProgress: 'in_progress',
  NotStarted: 'not_started',
  Deprecated: 'deprecated',
  Deferred: 'deferred',
} as const;
```

`NormalizedStatus` already derives from it (`(typeof STATUS)[keyof typeof STATUS]`) and needs no edit — the union changes shape automatically, and `tsc` will surface every incompatible site.

`VALID_STATUSES` in `schema/frontmatterSchema.ts` stops restating values and derives instead:

```ts
export const VALID_STATUSES = Object.values(STATUS);
```

Order within the array is display-order only (it appears in the "expected: …" message); preserve the existing order explicitly if the message text is asserted in tests.

**Import-direction check required at implementation time.** `schema/` importing from `introspection/types.js` must not create a cycle (`frontmatterSchema.ts` already imports `normalizeStatus` from `introspection/parsers/`, so the direction is established — confirm, don't assume). If a cycle appears, hoist `STATUS` to a leaf module rather than duplicating the values.

### Step 2 — sweep source references

30 `STATUS.InProgress` / `STATUS.NotStarted` references across 10 files:

- `packages/core/src/introspection/` — `types.ts`, `ConsistencyChecker.ts`, `ProjectModelBuilder.ts`, `WorkflowNavigator.ts`, `statusDerivation.ts`
- `packages/core/src/introspection/parsers/` — `slicePlanParser.ts`, `taskFileParser.ts`, `statusNormalizer.ts`
- `packages/cli/src/` — `output/entryStatusDisplay.ts`, `commands/slice.ts`, `commands/arch.ts`

Because 910 already swept literals into `STATUS.*`, **most of these need no edit** — they reference the constant and follow it automatically. The sweep is a verification pass, not a rewrite. Two categories do need attention:

- `statusNormalizer.ts`'s `STATUS_MAP` **keys** must keep both spellings (`in_progress` *and* `'in-progress'`) — the keys are input aliases, not canonical values. Only the map's values follow `STATUS`.
- `ConsistencyChecker.ts:410`'s user-facing string `Frontmatter status is "not-started" but tasks are in progress` hardcodes the hyphenated spelling in prose. Update to match what is actually written.

### Step 3 — delete the workaround

Remove the `.replace(/-/g, '_')` block at `frontmatterSchema.ts:256-264`.

> **Resolution (20260809, PM decision during implementation).** This step as
> originally drafted prescribed `effectiveValue = normalizeStatus(normalizedValue)
> ?? normalizedValue`, which contradicts Success Criterion 4: once `STATUS` is
> underscored, `normalizeStatus('in-progress')` returns `'in_progress'`, so that
> expression *accepts* hyphenated status — and, on the same principle, every other
> alias (`done`, `completed`, `ready`, `pending`, `planned`). There is no
> principled middle ground between rejecting `in-progress` and rejecting `done`;
> they are all non-canonical aliases. The PM resolved this as **strict +
> auto-fix**, superseding the #63-era alias-acceptance posture:
>
> - `validateFrontmatter` compares the value as written directly against
>   `VALID_STATUSES` — no normalization in the gate. All aliases are rejected.
> - When the intended canonical value is recoverable, the finding carries a
>   `fixAction` (`update-frontmatter` with the canonical value), so
>   `cf check --fix` migrates old documents instead of stranding them. Recovery
>   uses `suggestStatus()` in `statusNormalizer.ts`: exact alias lookup first,
>   then a conservative edit-distance match (≤2, inputs ≥6 chars, ambiguous ties
>   refused) that rescues obvious typos like `in-progres`.
> - Truly unknown values (`backlog`, `resolved`) get a plain finding, no fixAction.
>
> `normalizeStatus()` itself is unchanged and stays lenient for reads
> (`cf list`/`cf status`); the asymmetry section below still holds, with
> "validate — strict" now meaning strict against aliases too.

### Step 4 — bare-literal audit

Post-910 there are no bare hyphenated status literals in source outside comments and the one prose string in Step 2 (verified: `grep -rn --include='*.ts' 'in-progress\|not-started' packages/*/src | grep -v 'STATUS\.'` returns only `types.ts` definitions, five comments, one description string, and the workaround comment). Re-run this grep after Steps 1–3; it should return comments only.

## Test Plan

145 hyphenated-status literals across 18 test files. Concentration is extreme — three files hold 100 of them:

| File | Count |
|---|---|
| `core/tests/introspection/ConsistencyChecker.test.ts` | 72 |
| `core/tests/introspection/WorkflowNavigator.test.ts` | 18 |
| `core/tests/introspection/statusNormalizer.test.ts` | 10 |
| `cli/tests/commands/list-derived-status.test.ts` | 8 |
| `cli/tests/commands/list.test.ts` | 7 |
| 13 further files | ≤5 each |

**Each literal requires a judgment call — this is not a find-replace.** Classify every occurrence:

1. **Asserting a canonical value** (expected output of `normalizeStatus`, a derived `status` field, a `fixAction.value`, JSON output) → **flip to underscore**.
2. **Supplying lenient-read input** (a frontmatter fixture, a `STATUS_MAP` key case, a document body the parser consumes) → **must stay hyphenated**. These are the regression guard proving leniency survived. `statusNormalizer.test.ts`'s 10 occurrences are almost entirely this category and should mostly *not* change.

A blanket sed across these files would destroy the leniency coverage while leaving the suite green — the worst possible outcome, since it removes exactly the tests that would catch a future regression. Task breakdown must treat `ConsistencyChecker.test.ts` and `statusNormalizer.test.ts` as separate, individually-reviewed units.

### New regression tests (required)

- `frontmatterSchema.test.ts` — `validateFrontmatter` **rejects** `status: in-progress` and `status: not-started` (the assertion that is impossible today; this is the gate #73 depends on).
- `frontmatterSchema.test.ts` — accepts all five `VALID_STATUSES` values.
- `frontmatterSchema.test.ts` — `VALID_STATUSES` and `Object.values(STATUS)` are equal as sets, pinning the single-source-of-truth invariant against future drift.
- `statusNormalizer.test.ts` — every historical alias (`in-progress`, `in progress`, `active`, `not-started`, `not started`, `ready`, `pending`, `planned`, `done`, `completed`) still maps to a canonical value.
- `ConsistencyChecker.test.ts` — a `--fix` round-trip: a document needing a status change is written with the underscored value, and the result passes `validateFrontmatter`. This closes the loop the issue identifies (write side and validate side agreeing) and is the single most valuable test in the slice.

## Release & Compatibility

The `--json` / MCP wire-value change is breaking for consumers that compare against `'in-progress'` / `'not-started'`.

- Ship as a **minor version bump with an explicit breaking-change note** in the release notes naming the two changed values and the affected surfaces (`cf list slices|arch --json`, `cf status --json`, `cf next --json`, MCP `introspection_*`, `project_get`).
- All four publishable packages release in lockstep, as always.
- Known consumer: squadron. Its slice 172 is the reason for this change and will consume the new values; no coordination gap. Flag to the PM if any other consumer is known.
- **No deprecated alias / dual-emission.** Emitting both spellings would recreate the two-vocabulary problem on the wire, which is the defect being fixed.

## Success Criteria

1. `STATUS` uses underscored values; `VALID_STATUSES` derives from `STATUS` rather than restating values.
2. The `.replace(/-/g, '_')` workaround at `frontmatterSchema.ts:256-264` is deleted.
3. `cf check --fix` writes `in_progress` / `not_started` into frontmatter — never the hyphenated form.
4. `validateFrontmatter` **rejects** `status: in-progress`.
5. `normalizeStatus` still reads `in-progress`, `in progress`, `active`, `not-started`, and all other historical aliases.
6. No bare hyphenated status literal remains in source outside comments.
7. Full suite green across core, cli, mcp-server; full build clean.
8. Breaking `--json` change documented in release notes.

## Verification Walkthrough

Run from the repo root after implementation.

**1. The reported defect is gone.** Before this slice, this prints `"value": "in-progress"`:

```bash
cf check --json | grep -o '"value": "[^"]*"' | sort -u
```

Expect only underscored status values (and non-status fix values). No hyphenated status.

**2. Write side is canonical, end to end.** On a scratch copy of a project whose slice-plan status disagrees with its task completion:

```bash
cf check --fix
grep '^status:' <the-document-it-fixed>
```

Expect `status: in_progress`. This is the exact scenario from the issue's reproduction, which produced `status: in-progress`.

**3. The gate actually rejects.** In a Node REPL against the built core:

```js
const { validateFrontmatter } = require('./packages/core/dist/index.js');
validateFrontmatter({ docType: 'slice-plan', project: 'x', status: 'in-progress' }, 'f.md');
// expect a frontmatter-schema finding: invalid value 'in-progress'
validateFrontmatter({ docType: 'slice-plan', project: 'x', status: 'in_progress' }, 'f.md');
// expect no status finding
```

Step 3 is the one that proves #73 can be built on this. Today the first call returns clean.

**4. Reads stayed lenient.** This repo's own artifacts still contain hyphenated statuses on disk:

```bash
cf list slices
cf list arch
cf status
```

Expect every entry to render a real status — no `⚠ unreadable`, no `not started` where the document says in-progress. This is the regression that would indicate leniency was broken.

**5. Wire values changed as designed.**

```bash
cf list slices --json | grep -o '"status": "[^"]*"' | sort -u
```

Expect `complete` and `not_started` — confirming the intended breaking change landed on the documented surface.

## Dependencies

- **910** (`STATUS` const sweep) — complete. Its work is why Step 2 is a verification pass rather than a 50-site rewrite.
- Blocks **#73** (`cf validate frontmatter`), which blocks **squadron slice 172**.

## Risk

**Medium.** The status path is read by every introspection consumer, and the change touches a machine-readable output surface.

- *Silent leniency loss* — a blanket search-replace across test files flips lenient-read fixtures to canonical values, leaving the suite green while deleting the coverage that guards on-disk compatibility. Mitigation: per-occurrence classification (Test Plan), and the explicit alias-coverage test.
- *Ordering inversion* — removing the workaround before flipping the constants makes `cf check` flag `cf`'s own output. Mitigation: hard step ordering, suite green at each step.
- *Import cycle* — `schema/` deriving from `introspection/types.js` may cycle. Mitigation: verify at Step 1; hoist `STATUS` to a leaf module if needed rather than duplicating values.

Effort: 3/5.
