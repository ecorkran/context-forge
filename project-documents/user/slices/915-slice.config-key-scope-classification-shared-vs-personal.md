---
docType: slice-design
slice: config-key-scope-classification-shared-vs-personal
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [914]
interfaces: []
dateCreated: 20260713
dateUpdated: 20260713
status: not_started
---

# Slice Design: Config Key Scope Classification (Shared vs. Personal)

## Overview

`cf config set --project` writes every project-scoped key into a single `.context-forge.toml` at the repo root, with no distinction between team-wide policy (`workflow.*`, `guide.*`) and per-developer settings (`git.integration_branch`). Because that one file is normally committed, personal settings leak into shared history the moment a developer runs `cf config set git.integration_branch ... --project` — this is exactly the bug fixed ad hoc as a 916 prerequisite (a scope-*resolution* bug, not the scope-*classification* gap this slice closes).

This slice adds a `scope: 'shared' | 'personal'` classification to every entry in `CONFIG_KEYS`, routes project-level reads/writes to one of two files based on that classification, and gives `cf init` and `cf check` enough awareness to keep personal settings out of git.

## Value

Developer-facing and architectural. Prevents personal git-topology/workflow settings from being silently committed and applied to every teammate's checkout, without asking users to make an ad hoc gitignore decision per key. Closes the class of bug that the 916 prerequisite fix patched one symptom of.

## Technical Scope

**In scope:**
- Add `scope: 'shared' | 'personal'` to `ConfigKeyDefinition` and classify all existing keys in `CONFIG_KEYS`.
- Add a second project-level config file, `.context-forge.local.toml`, for personal-scope keys.
- Update `ConfigManager.get/set/delete/list` to route project-scoped reads/writes to the correct file automatically, based on the key's registry classification — callers keep passing `scope: 'project'`; they do not choose shared vs. personal directly.
- Update read precedence to: project-personal → project-shared → user → default.
- `cf init` ensures `.context-forge.local.toml` is covered by `.gitignore` (minimal one-line addition, reusing the pattern already used for personal ignores; a full gitignore-scaffolding overhaul is a separate Future Work item).
- A `cf check` finding that detects personal-scope keys present in the *shared* file (the pre-existing-commit migration case) and a `cf config migrate-personal` command that moves them to the personal file.
- Update `packages/mcp-server/src/tools/configTools.ts` to surface both project config paths.

**Explicitly excluded:**
- No change to `cf config set`'s CLI surface (`--project`/`--global` flags are unaffected; this slice only changes which file "project" resolves to per-key).
- No automatic gitignore scaffolding beyond the one line this feature needs (tracked separately in Future Work).
- No auto-fix wiring through `workflow.auto_fix` / `ConsistencyFinding.fixAction` — the migration path is a dedicated CLI command, not a checker auto-fix action (see Migration Plan).
- No change to user-scope (`{storagePath}/config.toml`) behavior — personal-vs-shared is a project-scope-only distinction; there is nothing to leak at user scope.

## Dependencies

### Prerequisites
- **914** (`git.integration_branch` rename) — done. This slice's canonical personal key is `git.integration_branch`; it must already be under its final name.
- The 916 prerequisite fix (already merged to `main`) established `--project`/`--global` as the CLI's explicit scope-selection flags. This slice does not change that surface, only what "project" resolves to internally.

### Interfaces Required
- Existing `ConfigManager` public API (`get`, `set`, `delete`, `list`) — signatures are unchanged; only internal file routing changes. Every current caller (CLI `config.ts`, MCP `configTools.ts`, `branchGuard.ts`, `WorkflowNavigator`, `ConsistencyChecker`, `check.ts`, `next.ts`, `status.ts`, `guides.ts`) continues to call these methods exactly as today and needs no changes beyond what's listed in Technical Scope.

## Architecture

### Component Structure

```
packages/core/src/config/
  ConfigKeys.ts        — adds `scope` field to ConfigKeyDefinition; classifies all keys
  configPaths.ts        — adds getProjectPersonalConfigPath(projectPath)
  ConfigManager.ts      — routes project reads/writes through the correct file per key.scope;
                           precedence order updated in get()/list()
  index.ts              — export additions (new path helper)

packages/cli/src/commands/
  init.ts                — ensures .context-forge.local.toml is gitignored
  config.ts               — adds `migrate-personal` subcommand
  check.ts                — no code change; benefits automatically via ConsistencyChecker

packages/core/src/introspection/
  ConsistencyChecker.ts  — new check: personal-scope keys present in the shared project file

packages/mcp-server/src/tools/
  configTools.ts          — config_get response includes both project config paths
```

### Data Flow

**Read (`ConfigManager.get(key)`):**
1. Look up `CONFIG_KEYS[key]` — if `scope === 'personal'` and `projectPath` is set, check `.context-forge.local.toml` first.
2. If not found there (or key is `shared`), check `.context-forge.toml` (shared project file) — but only if the key's own scope is `shared`, OR it's a personal key falling through from step 1 with no value yet found there (see Migration Plan — pre-existing personal values sitting in the shared file must still resolve, not silently disappear).
3. Then user config (`{storagePath}/config.toml`), same as today.
4. Then built-in default.

**Write (`ConfigManager.set(key, value, scope: 'project')`):**
1. Look up `CONFIG_KEYS[key].scope`.
2. `'personal'` → write to `.context-forge.local.toml`.
3. `'shared'` → write to `.context-forge.toml` (unchanged from today).
4. `scope: 'user'` is unaffected — always writes to `{storagePath}/config.toml` regardless of key classification (a user can still set a personal-default at the user level; this is the existing "personal machine-wide default" use case and is not part of this slice's file-split concern).

**Delete:** mirrors write — deletes from whichever project file the key's scope maps to. `migrate-personal` (see below) is the one exception that touches the *other* project file, by design.

### State Management

Two TOML files instead of one at project scope. No schema change to either file's *shape* — both remain flat dotted-key TOML tables, parsed with the existing `smol-toml` read/write helpers (`readToml`/`writeToml`/`resolveKey`/`setKey`/`deleteKey` in `ConfigManager.ts` are reused as-is, called against whichever path is selected).

## Technical Decisions

### Key classification (initial pass)

| Key | Scope | Rationale |
|---|---|---|
| `guide.auto_update` | shared | Team-wide policy on whether guides auto-update |
| `guide.source` | shared | Team-wide guide source location |
| `guide.git_strategy` | shared | Team-wide guide management strategy |
| `workflow.auto_advance` | shared | Team-wide workflow policy |
| `workflow.auto_fix` | shared | Team-wide workflow policy |
| `workflow.review_enabled` | shared | Team-wide review gating policy |
| `workflow.review_threshold` | shared | Team-wide review gating policy |
| `workflow.review_unknown_as` | shared | Team-wide review gating policy |
| `workflow.review_gates.*.threshold` | shared | Team-wide per-gate policy |
| `workflow.review_gate_effective_date` | shared | Team-wide grandfather cutoff |
| `git.integration_branch` | personal | Per-developer/per-worktree git topology; the motivating example in the slice plan |

Rationale for the split: every key today except `git.integration_branch` is a policy decision the whole team should share and see in code review. `git.integration_branch` is the only key where each developer legitimately wants a different value in their own checkout. This mirrors an `.env.local`-style split, which is a familiar pattern to reach for (Next.js and similar tooling use exactly this local-override-file convention).

`scope` becomes a **required** field on `ConfigKeyDefinition` (no default) — adding a new config key forces an explicit shared-vs-personal decision at review time, rather than silently defaulting to one or the other.

### File naming: `.context-forge.local.toml`

Chosen over alternatives (`.context-forge.personal.toml`, a `personal/` subdirectory, or a `[personal]` TOML table inside the same file):
- `.local.` is an established convention (`.env.local`) that communicates "not committed" without needing a comment.
- A single extra sibling file keeps the existing `readToml`/`writeToml` helpers, `getProjectConfigPath`-style resolution, and file-not-found-means-empty semantics completely unchanged — just called against a second path.
- A `[personal]` table inside one file was rejected: it doesn't solve the actual problem (the whole file must still be gitignored-or-not as a unit; you can't gitignore half a file).

### Precedence: project-personal → project-shared → user → default

Personal is the most specific override (matches the existing principle that more specific scope wins). A developer's local `git.integration_branch` override always wins over whatever the shared file — or a stale pre-migration value inside it — says.

### Routing lives inside `ConfigManager`, not at call sites

`set`/`delete`/`get` keep their existing signatures (`scope: 'user' | 'project'`). `ConfigManager` internally resolves `'project'` to the correct file via `CONFIG_KEYS[key].scope`. This was chosen over adding a third `scope` enum value (e.g. `'project-personal'`) that callers would have to pass, because:
- It removes an entire class of caller bug (writing a personal key to the shared file, or vice versa, by passing the wrong scope string) — the classification is a property of the *key*, not a choice the caller makes per-call.
- No existing caller (CLI, MCP, `branchGuard.ts`, etc.) needs to know or care which physical file a key lives in; they already just say "project scope."

## Implementation Details

### Migration Plan

**Problem:** Projects that ran `cf config set git.integration_branch ... --project` before this slice shipped (or before the 916 prerequisite fix, when the bug made this the *default* behavior) have `git.integration_branch` — a personal key — sitting inside the committed `.context-forge.toml`. Reads must not silently drop that value out from under the user the moment this slice ships, and there must be an explicit path to fix it.

**Read-time compatibility:** As described in Data Flow, a personal key's read falls through to the shared file if not found in the personal file. This means a pre-existing shared-file value for `git.integration_branch` keeps working exactly as it does today — no functional regression — it just now also gets flagged (see below) so the user knows to migrate it.

**Detection:** New `ConsistencyChecker` rule (added alongside the existing config-hygiene-style checks) scans the shared project file for any key whose `CONFIG_KEYS[key].scope === 'personal'`. Emits a `warning`-severity `ConsistencyFinding` (`rule: 'personal-config-in-shared-file'`) naming the key and both file paths, `fixable: false` (no `fixAction` — see below for why this isn't wired to `workflow.auto_fix`). Surfaces automatically through `cf check` and MCP `workflow_check`, since both already run the full `ConsistencyChecker` suite.

**Fix path — dedicated command, not an auto-fixer:** `ConsistencyFinding.fixAction.type` is a closed union (`'update-checkbox' | 'update-frontmatter'`) used for document-editing fixes; a cross-file config move doesn't fit that shape and forcing it in would be exactly the kind of complexity this project's guidelines warn against adding without necessity. Instead: `cf config migrate-personal [--project <id>]` reads every personal-scope key currently present in the shared file, writes each to the personal file, deletes each from the shared file, and reports what moved. This is an explicit, reviewable, one-time operation — appropriate for a migration that rewrites two files a team may have already committed history around.

**Collision semantics:** if a personal key exists in *both* files (e.g. the developer already ran `cf config set git.integration_branch dev/alice --project` under this slice's new routing, and the shared file also still has a stale pre-migration `git.integration_branch = "main"` from before), `migrate-personal` must not silently overwrite the personal file's value — that would destroy the developer's local preference, and it's already the value that wins at read time per the precedence order. Per-key rule: if the key is absent from the personal file, move it (write personal, then delete shared). If the key is already present in the personal file with a **different** value, skip the move, leave both files untouched for that key, and report it as a `skipped (personal value already set)` line rather than an error — the shared-file copy is stale and harmless once flagged, and clearing it is a separate, explicit `cf config unset <key> --project` the user can run once they've confirmed the personal value is correct. If the values are **identical**, delete the now-redundant shared-file copy (no data at risk) and report it as moved.

**Failure modes:**
- `migrate-personal` per-key ordering is write-personal-then-delete-shared, never the reverse, so a failure between the two steps (permission denied, disk full, TOML serialization error) leaves the key present in both files rather than in neither — recoverable via the same read-time fallback and re-runnable (the command is idempotent: a key already present identically in both files is simply deleted from the shared side on the next run). The command processes keys independently and continues past a single key's failure, reporting that key as `failed: <error>` in its summary rather than aborting the whole run.
- `ConfigManager.set` writes to `.context-forge.local.toml` using the same `writeToml` helper already used for the shared and user files today; a write failure (permission, disk full) throws exactly as it does for those existing files now — no new error-handling path is introduced, since this is the same helper with a different path argument.
- `cf init`'s `.gitignore` append is a plain file read-modify-write; a failure there (permission denied) throws and aborts `cf init` with the underlying error surfaced via the existing `handleError` path, consistent with how other `cf init` file-write failures are already handled — this is not a new failure category, just a new file touched by an existing code path.

**Consumers to update:** none beyond what's listed in Technical Scope — every existing reader goes through `ConfigManager.get()`, which already absorbs the file-routing change transparently.

**Behavior verification:** covered in Success Criteria / Verification Walkthrough below — a project with a pre-existing shared-file `git.integration_branch` must (a) still resolve correctly before migration, (b) surface a `cf check` warning, and (c) resolve identically, with the warning cleared, after running `migrate-personal`.

### `.gitignore` handling in `cf init`

`cf init` currently writes no `.gitignore` at all (confirmed — no gitignore-writing logic exists anywhere in `packages/cli`/`packages/core` today). This slice adds the minimum needed for its own feature: if `.gitignore` doesn't exist, create it containing `.context-forge.local.toml`; if it exists, append that one line only if not already present (via a substring/line check, not a full parse — matching this project's "prefer lenient handling over over-fitted parsing" convention for simple line-based files). No other gitignore entries are added by this slice — the broader default-gitignore-template Future Work item (`.env`, `*.pem`, etc.) is separately scoped and out of bounds here.

### API Contracts

`ConfigKeyDefinition` (packages/core/src/config/ConfigKeys.ts):
```typescript
export interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  scope: 'shared' | 'personal';
  enum?: string[];
  validate?: (value: string | boolean | number) => string | null;
}
```

`configPaths.ts` addition:
```typescript
/** Returns the project-level personal config file path: {projectPath}/.context-forge.local.toml */
export function getProjectPersonalConfigPath(projectPath: string): string;
```

`ConfigManager` — no signature changes to `get`/`set`/`delete`/`list`. `ConfigResult.source` gains a new possible value: `'project'` currently means "the shared project file"; this slice adds `'project-personal'` so callers (CLI output, MCP `config_get`) can tell users which file a value actually came from. Both current consumers of `.source` — `packages/cli/src/commands/config.ts` (`get`/`list` display, lines 86 and 100) and MCP `configTools.ts` (passes the whole `ConfigResult` through to `jsonResult`) — interpolate it as a plain display string with no exhaustive switch, so the added union member requires no code change in either; this was verified by inspection, not assumed. Any *future* consumer that does add an exhaustive switch over `source` gets a compile error on the new variant, which is the intended safety net:
```typescript
export interface ConfigResult {
  key: string;
  value: string | boolean | number;
  source: 'project-personal' | 'project' | 'user' | 'default';
  description: string;
}
```

New CLI subcommand:
```
cf config migrate-personal [-p, --project <id>]
```
Reports moved keys, e.g.:
```
Moved 1 personal key from .context-forge.toml to .context-forge.local.toml:
  git.integration_branch
```
No-op with a clear message ("No personal keys found in the shared config file.") if nothing to migrate.

## Integration Points

### Provides to Other Slices
- The `scope` field on `CONFIG_KEYS` becomes the canonical place any future config key declares shared-vs-personal — future slices adding config keys must set this field (enforced at compile time, since it's required with no default).

### Consumes from Other Slices
- `git.integration_branch`'s existence and validation rules (914) — unchanged here, only its `scope` classification is added.

## Success Criteria

### Functional Requirements
- `cf config set git.integration_branch dev/erik --project` writes to `.context-forge.local.toml`, not `.context-forge.toml`.
- `cf config set workflow.review_enabled true --project` continues to write to `.context-forge.toml`, unchanged.
- `cf config get git.integration_branch --project` resolves correctly whether the value lives in the personal file, the shared file (pre-migration case), or neither (falls through to user/default).
- `cf init` on a fresh project leaves `.context-forge.local.toml` gitignored from the start.
- `cf check` on a project with a personal key sitting in the shared file reports exactly one `warning`-severity finding for it.
- `cf config migrate-personal --project <id>` moves any personal keys out of the shared file and into the personal file; a subsequent `cf check` no longer reports the finding.

### Technical Requirements
- All existing `ConfigManager`, CLI `config` command, and MCP `configTools` tests continue to pass unmodified in behavior (only fixture/expectation updates for the new `scope` field and new file, no logic-test rewrites).
- New unit tests: `ConfigKeys` scope classification completeness (every key has a `scope`), `ConfigManager` file-routing and precedence (including the personal-key-in-shared-file fallback), `ConsistencyChecker`'s new rule, `migrate-personal` command (happy path + no-op path).
- No `any` types introduced (project TypeScript rule); `ConfigResult.source` union is extended, not widened to a generic string.

### Verification Walkthrough

Steps run in this order deliberately: the shared-file fallback (steps 1-2) is proven
*before* anything is ever written to the personal file, because once a value exists in
the personal file it always wins per precedence — a later step can't demonstrate the
fallback if an earlier step already populated the personal file for the same key. An
earlier draft of this walkthrough set `git.integration_branch` via the personal file
first and only then tried to demonstrate the fallback, which is unobservable once the
personal file already holds a value; this ordering avoids that trap.

Also note: `--project` is the default scope for `cf config set`/`get`/`unset` (per the
916 prerequisite fix), so it's omitted below except where a flag is otherwise required.

1. In a scratch project (`cf init --lite` in an empty directory), simulate the
   pre-migration case: manually edit `.context-forge.toml` to add
   `git.integration_branch = "legacy/value"` under `[git]` (as if it had been committed
   before this slice existed). Run:
   ```
   cf config get git.integration_branch
   ```
   Confirm it resolves to `legacy/value` with `source: project` (not `project-personal`)
   — proving the fallback keeps working when the personal file doesn't exist yet.

2. Run:
   ```
   cf config set git.integration_branch dev/erik
   ```
   Confirm `.context-forge.local.toml` was created with `git.integration_branch = "dev/erik"`
   and `.context-forge.toml` still contains the untouched `legacy/value` copy. Run
   `cf config get git.integration_branch` again — confirm it now resolves to `dev/erik`
   with `source: project-personal` (personal wins over the still-present shared value).

3. Run:
   ```
   cf config set workflow.review_enabled true
   ```
   Confirm this lands in `.context-forge.toml`, unchanged from current behavior.

4. Run `cat .gitignore` — confirm `.context-forge.local.toml` is present.

5. Run `cf check` (or `workflow_check` via MCP). Confirm a `warning`-severity finding names `git.integration_branch` and both file paths.

6. Run:
   ```
   cf config migrate-personal --project <id>
   ```
   Confirm the report shows `git.integration_branch` **skipped (personal value already set)**
   — `.context-forge.toml`'s `legacy/value` and `.context-forge.local.toml`'s `dev/erik`
   are different, so per collision semantics neither file is touched. Confirm
   `.context-forge.toml` still contains the stale copy and `.context-forge.local.toml`
   still has `dev/erik`.

7. Known gap (not fixed by this slice — confirmed low-risk since no project has this
   key set in the wild yet): `cf config unset git.integration_branch --project` does
   **not** clear the stale shared-file copy here. `unset` for a `--project`-scoped
   personal key routes to the personal file, by the same auto-routing logic as `set`/
   `get` — this is correct, intended behavior, not a bug, but it means there is
   currently no CLI command that targets the shared copy specifically once
   `migrate-personal` has skipped it on a collision. Run:
   ```
   cf config unset git.integration_branch --project
   ```
   and confirm `.context-forge.local.toml` is now empty (the personal file was cleared,
   *not* the shared file) and `cf check` **still** reports the warning — this is the
   expected/known behavior, not a walkthrough failure. Manually edit `.context-forge.toml`
   to remove the stale `[git]` section instead, then re-run `cf check` and confirm the
   finding is gone. Re-run `cf config set git.integration_branch dev/erik` to restore the
   personal value cleared by the `unset` above, before continuing to step 8.

8. Re-run `cf config get git.integration_branch` — confirm it resolves to
   `dev/erik`, with `source: project-personal`.

9. Collision-then-clean-move case: manually re-add `git.integration_branch = "dev/erik"`
   to `.context-forge.toml` (simulating a second commit of the *same* value the personal
   file already has). Run `cf config migrate-personal --project <id>` again — confirm the
   report shows it moved (identical-value case deletes the now-redundant shared copy, no
   personal-file write needed). Confirm `.context-forge.toml` no longer contains the key
   and `.context-forge.local.toml`'s value is unchanged (`dev/erik`). Re-run `cf check` —
   confirm it is clean.

## Risk Assessment

### Technical Risks
- **Precedence change is a behavior change for any project that already has a personal key committed in the shared file** — mitigated by the read-time fallback (Migration Plan) so nothing breaks silently; the only user-visible change pre-migration is a new `cf check` warning, not a functional regression.
- **New file adds a second thing to keep in sync mentally** (two project config files instead of one) — mitigated by `ConfigManager` fully absorbing the routing, so no caller code needs to reason about which file a key lives in.

### Mitigation Strategies
- Ship the `ConsistencyChecker` detection rule and `migrate-personal` command in the same slice as the precedence change, not as follow-up work, so there's never a window where personal keys can silently linger in the shared file without a surfaced warning and an available fix.

## Implementation Notes

### Development Approach
Suggested order:
1. `ConfigKeys.ts` — add `scope` field, classify all keys (compiler enforces completeness once the field is required).
2. `configPaths.ts` — add `getProjectPersonalConfigPath`.
3. `ConfigManager.ts` — routing + precedence + `ConfigResult.source` union update. This is the core of the slice; get its tests solid before moving on.
4. `ConsistencyChecker.ts` — detection rule.
5. `cf config migrate-personal` CLI command.
6. `cf init` — gitignore line.
7. `configTools.ts` (MCP) — surface `getProjectPersonalConfigPath` in `config_get`'s `configPaths` response.
8. Full verification walkthrough (manual, in a scratch project) — mirrors the pattern used for 916.

### Special Considerations
- Effort 3/5 per the slice plan reflects the file-routing/migration work, not raw line count — keep the `migrate-personal` command minimal (no dry-run flag, no interactive confirmation prompt beyond the existing CLI conventions) unless the Project Manager asks for more.
