---
docType: slice-design
slice: stable-default-worktree-marker
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [932]
interfaces: []
dateCreated: 20261007
dateUpdated: 20261007
status: not_started
---

# Slice Design: Stable Default Worktree Marker

## Overview

Fixes GitHub #112 (slice 932 code review finding F002). `isDefaultWorktree()` in `packages/core/src/services/WorktreeService.ts` finds the default worktree by name: `wt.name.toLowerCase() === 'default'`. Two code paths rely on it. `chopDefaultRange()` narrows the default when a sibling claims part of its band, and `restoreDefaultRange()` (slice 932) widens it again when a sibling is removed. Because the name is user-editable, a worktree a user creates or renames as `Default` gets its range narrowed and widened, and renaming the real default turns both paths off. The project rule is that user-accessible labels never act as logical structure.

This slice records which worktree is the default in a stored boolean, `isDefault`, and matches on that instead of the name. Forward migration sets it when it creates the default. Data stored before this change gets the field in memory on every read, and the result is saved by the next ordinary store write. After that, names are labels only.

**Scope fit.** The 900 architecture lists "Pattern consolidation and code quality improvements" in its scope. Using a label as logical structure is a pattern the project rules name as an anti-pattern, and this slice removes the last such use in worktree code. It is the same kind of item as 926–932. The schema field, the migration and the result field are the smallest set that removes the anti-pattern without breaking existing data. The only item beyond the fix is the `(default)` tag in `cf worktree list`. It stays because recovering from the migration warnings and the duplicate-marker error depends on seeing which worktree is marked (see Migration rule). The architecture's scope list has no explicit "defects in shipped code" entry, even though 926–934 all fall under it. The Project Manager approved this slice as 900-plan maintenance work (20261007) without changing the architecture's scope list. Patch release.

## Value

- **Correctness.** Range narrowing and restore only ever touch the worktree that forward migration created. Renaming it, or naming another worktree `default`, has no effect on ranges.
- **Correct manual-fix hint.** `cf worktree rm` currently prints `cf worktree update default --range …`. That command fails once the default has been renamed. The hint now uses the default's actual name.
- **Diagnosable default.** `isDefault` appears on every worktree object returned by CLI `--json` and the MCP tools, and the `list` table tags the default row. A user or agent can see which worktree is the default without guessing from its name.

## Technical Scope

**Included**
- `isDefault?: boolean` on `WorktreeContext`. Forward migration writes `true`. `addWorktree` writes `false` on every worktree it creates.
- A read-time migration in `FileProjectStore` that fills in `isDefault` in memory on worktrees that don't have the field. It never writes on its own; the next ordinary store write saves it.
- `isDefaultWorktree()` reads the flag. The name constant stays only as the label forward migration gives the default and as the legacy match used by the load migration.
- More than one marked worktree is a hard error, but only on the paths that change ranges.
- `isDefault` cannot be set through create or update inputs (types and runtime).
- `RemoveWorktreeResult` gains `defaultWorktree: { id, name }` whenever it reports `restoredRange` or `rangeNotRestored`. CLI `rm` messages use that name.
- `cf worktree list` table tags the default row. MCP tool descriptions refer to the default as `isDefault: true` instead of the name `'default'`.
- Test updates in core, CLI and MCP that seed a default by name and expect chop or restore.

**Excluded**
- Any command to move the default marker to a different worktree. Recovery from the rare cases below is a hand edit of `projects.json`. A command for it is follow-up work if those cases turn out to be common.
- Enforcing unique worktree names (`getWorktreeByName` still returns the first case-insensitive match). That is a separate concern.
- Changes to the chop or restore range rules themselves (slice 932 behavior stays the same).
- Cross-process locking for `projects.json`. No store write has locking today (see Special Considerations).

## Dependencies

### Prerequisites
- Slice 932 (merged): `restoreDefaultRange()`, `RemoveWorktreeResult`, and the shared `isDefaultWorktree` / `EMPTY_RANGE` helpers this slice changes.

### Interfaces Required
- `IProjectStore` / `FileProjectStore` (`packages/core/src/storage/`): the read path (`getAll()`) where the migration runs, and the existing writes that save it.
- `WorktreeService` add, update and remove methods, and `chopDefaultRange()` / `restoreDefaultRange()`.

## Architecture

### Component Structure

| Component | Change |
|---|---|
| `types/worktree.ts` | `WorktreeContext.isDefault?: boolean`. `UpdateWorktreeInput` omits `isDefault`. `RemoveWorktreeResult.defaultWorktree?`. |
| `utils/defaultWorktree.ts` (new) | Holds the default-worktree knowledge in one place: `DEFAULT_WORKTREE_NAME`, `isDefaultWorktree(wt)`, `findDefaultWorktree(worktrees)` (throws on more than one), and `markLegacyDefaultWorktree(project)` (the migration, a pure function). It imports only from `types/`. It lives in `utils/`, next to `worktree-overlay.ts`, so both `storage/` and `services/` can import it without the store depending on the services layer. This also moves code out of the 482-line `WorktreeService.ts`. |
| `services/WorktreeService.ts` | Sets the flag at creation. Chop and restore use `findDefaultWorktree`. Update keeps `isDefault` the same way it keeps `id`. |
| `storage/FileProjectStore.ts` | `getAll()` runs the migration over every project it parses and prints the migration's warnings (once per process). It does not write. `create`, `update` and `delete` already read through `getAll()`, so their normal write saves the migrated data. |
| `cli/commands/worktree.ts` | `rm` notes and hint use `defaultWorktree.name`. `list` tags the default row. |
| `mcp-server/tools/worktreeTools.ts` | Description text only. The flag already comes through on the returned worktree objects. |

Dependency direction: `storage → utils → types` and `services → utils, storage (interface)`. No module in `storage/` imports from `services/`.

### Data Flow

1. **Read.** `getAll()` parses `projects.json` as today, then runs `markLegacyDefaultWorktree` on each project and returns the result. It prints any warnings not already printed in this process to stderr. Every consumer reads migrated data, including callers that read `project.worktrees` directly from the store (`cf worktree list --json`, `buildAttributedViews`). Nothing is written.
2. **Save.** `create`, `update` and `delete` read through `getAll()` and write the whole array, so the first ordinary write after upgrade saves the migrated fields for every project. Until then, each process recomputes the same result. A crash before that write loses nothing; the next read recomputes it.
3. **Create.** Forward migration builds the default with `isDefault: true`. The new worktree, and any worktree appended later, gets `isDefault: false`.
4. **Chop / restore.** `findDefaultWorktree(worktrees)` returns the single worktree with `isDefault === true`, or none. It throws if more than one is marked. The range logic after that is unchanged.
5. **Remove.** When the restore runs, the result carries the default's `{ id, name }`. The CLI prints that name.

### State Management

Each worktree now stores one more field. The three values mean:

| Stored value | Meaning |
|---|---|
| `true` | This is the default (created by forward migration, or marked by the load migration). |
| `false` | Not the default. Written by `addWorktree` and by the load migration. |
| absent | Written before 934 (or by an older `cf` binary). Only the load migration interprets it, and it always replaces it with `true` or `false`. |

An absent field is how the code knows a migration is pending, so no project-level stamp is needed. The migration resolves every absent value in a single pass and is deterministic, so recomputing it on each read before the first save gives the same answer every time. Once a write has saved it, no value is absent and the migration has nothing to do. A rename is itself a write, so it saves the migrated values in the same write as the new name; a later rename to `default` never triggers the migration again.

Because the migration happens inside `getAll()`, no read in any process can see unmigrated data, so `ensureInitialized()` needs no change.

## Technical Decisions

### Marker shape: flag, not a dedicated ID
A flag is chosen. A reserved ID (e.g. `wt_default`) would mean rewriting the ID of every existing default worktree. IDs are opaque, other code may hold references to them, and `updateWorktree` treats them as immutable. A flag adds one optional field and leaves IDs alone.

### Explicit `false` on non-defaults
The load migration has to run exactly once. Otherwise, after the real default is removed, a worktree a user later names `default` would be marked again, which is the bug this slice fixes. Writing `false` explicitly lets "absent" mean "written before this change", so no separate stamp field is needed. The cost is one boolean on each new worktree, set in a single place (`addWorktree`).

### Migration rule (`markLegacyDefaultWorktree`)
The function runs on each project with at least one worktree whose `isDefault` is absent. It returns `{ changed: boolean; warnings: string[] }`.

1. If some worktree already has `isDefault === true`, every absent value becomes `false`.
2. Otherwise, the candidates are the worktrees with an absent value whose name is `default` (case-insensitive), the shape forward migration has always written:
   - one candidate: it gets `true`;
   - more than one: keep only the candidates whose `worktreePath` equals `project.projectPath` (forward migration always sets that). If exactly one is left, it gets `true`.
3. Every absent value still left becomes `false`. That includes the candidates in a case that is still ambiguous. After this step no worktree in the project has an absent value, so the project's migration is finished. The next ordinary write saves it, and reads after that find nothing to do.

When the outcome leaves the project with no default, chop and restore do nothing for it, so no worktree's range is changed based on a guess. The migration warns in the two cases where that outcome is probably not what the user wants:

| Outcome | Warning |
|---|---|
| Ambiguous: several candidates, path check doesn't narrow to one | Names the project and each candidate by name and id. |
| No candidate, but a worktree's `worktreePath` equals `project.projectPath`. This is likely a default that was renamed before upgrading. | Names the project and that worktree by name and id. Says it may be a renamed default. |
| No candidate, and no worktree at the project path | None. This is a normal project without a default, because forward migration only creates one when the project had workflow fields at its first `worktree init`. |

Both warnings end with the same recovery step: `Range narrowing and restore are off for this project. To turn them on, set "isDefault": true on the intended worktree in <full projects.json path>.` The `list` tag and the `--json` field then confirm the edit took effect. A warning prints at most once per process, and only while the migration is unsaved. A process that only reads (for example, with a read-only config directory) prints it on every run until something writes or the user makes the hand edit.

**Name matching is limited to this bootstrap step.** The migration is the one place left that reads the name `default`, and it does so for a single reason: data from before 934 has no other record of which worktree is the default. The name was the only identifier the old code used, so matching it reproduces the old behavior exactly once and then stops. After migration no code reads the name. The path check only narrows the name match and never marks a worktree on its own.

**Mistakes stay recoverable.** The migration only adds `isDefault`. It never changes or removes an existing value, so a wrong `false` loses no data, and a hand edit of one field reverts it. The cases where a guess would most likely be wrong (ambiguous candidates, or a probable rename) do not guess. They mark nothing and warn instead.

**Follow-up trigger.** Recovery is a hand edit, and this slice adds no command for it (see Excluded). Open a maintenance item for a command that moves the default marker, such as a `cf worktree update --set-default` option, when either of these happens:
- the first report of a project that needed the hand edit, from either warning or from a duplicate-marker error;
- any later slice needs to set the default by program.

Until then, a command would cost more than the cases it would serve.

### Where the migration runs: the store, not the service
In `WorktreeService`, the migration would only be persisted by mutations, and raw store readers would see unmigrated data. The CLI `list` and the attribution views both read `project.worktrees` directly. `FileProjectStore.getAll()` is the one read that every store reader and writer goes through, so the new step runs there. The domain rule lives in `utils/defaultWorktree.ts`. The store calls it and owns only applying the result and printing warnings.

**Store responsibilities.** This adds one duty to the store: it applies a pure domain migration to data it has just read. It does not save the result itself; saving rides on the store's existing writes. The store does no worktree reasoning of its own. The decision is made in `markLegacyDefaultWorktree`, which returns `{ changed, warnings }`, and the store only applies the result and emits the warnings.

**Why not write on read.** An earlier revision saved the migration on the first read and failed the command if that write failed. That broke read-only commands (`cf worktree list`, `cf check`, MCP `worktree_list`) in a read-only config directory right after an upgrade. Migrating in memory keeps those working, and every consumer still sees the same migrated data. The "act on an unsaved default" risk does not apply: any command that changes a range writes, and that write saves the migrated values along with the change.

**Warning output channel.** Core has no logger abstraction. The store writes each warning with `console.warn`, which goes to stderr. Stdout is never used, for these reasons:
- The MCP server runs over the stdio transport, where stdout carries the JSON-RPC stream. Any stdout write there would corrupt the protocol.
- Stderr is the channel the MCP server already uses for its own diagnostics (`packages/mcp-server/src/index.ts` logs via `console.error`). MCP hosts capture or discard stderr without affecting the session.
- In the CLI, stderr keeps `--json` output on stdout parseable.

An agent using only MCP does not see the warning text. It can still see the outcome, since `worktree_list` shows no worktree with `isDefault: true`. A test asserts that the migration writes nothing to stdout.

Injecting the migration into `FileProjectStore` was considered and rejected. The store is built with `new FileProjectStore()` at many CLI and MCP sites, and an optional injected function would either need a default (the same import, made indirect) or could be silently left out at one of those sites. A direct import from a neutral `utils/` module keeps the dependency direction correct without that risk.

### Rename and `cf worktree init --name default`
Names are labels only. Renaming the default leaves `isDefault` unchanged. `init --name default` (CLI or MCP) creates an ordinary worktree with `isDefault: false`. The CLI still resolves `default` by name like any other name.

### More than one marked worktree is rejected where it matters
Only forward migration (when no worktrees exist) and the load migration (at most one per project) write `true`, and neither the create nor the update input can carry it. So two marked worktrees can only come from editing `projects.json` by hand.

`findDefaultWorktree` throws: `Project '<project>' has more than one default worktree: '<name>' (<id>), '<name>' (<id>). Set "isDefault": true on only one of them in projects.json.` It is called only by `chopDefaultRange` and `restoreDefaultRange`. That means the error reaches these operations:
- `addWorktree` without override;
- `updateWorktree` with a range change;
- `removeWorktree` when other worktrees remain.

Everything that lets the user diagnose the problem keeps working, because none of it calls `findDefaultWorktree`:
- `cf worktree list` (table and `--json`; the table tags both marked rows);
- MCP `worktree_list` and `worktree_get`;
- `cf check` attribution;
- updates that don't change a range.

The error message carries ids, so duplicate or similar names don't hide which entries to edit.

### `isDefault` is not user-settable
`UpdateWorktreeInput = Partial<Omit<WorktreeContext, 'id' | 'isDefault'>>`, and `CreateWorktreeInput` does not get the field. `updateWorktree` sets `isDefault: original.isDefault` after the spread, the same way it pins `id`. This means a stray runtime key cannot change it. The MCP update handler copies every argument key it receives, but the zod schema has no `isDefault` field, so the key never reaches it.

### Patterns and Conventions
- The default name and the legacy match are each defined once, in `utils/defaultWorktree.ts`. No other module compares worktree names to `'default'`.
- User-facing text says "the default worktree" and quotes the worktree's current name where one is shown.

## Implementation Details

### API Contracts

`WorktreeContext` (stored, and returned by every worktree-returning CLI `--json` / MCP response):
```ts
/** True only for the worktree forward migration created. Not user-settable. */
isDefault?: boolean;
```

`RemoveWorktreeResult`, additive:
```ts
/** The default worktree, present whenever restoredRange or rangeNotRestored is. */
defaultWorktree?: { id: string; name: string };
```

MCP `worktree_init` and `worktree_remove` descriptions: replace "a \"default\" worktree" / "the 'default' worktree" with "the default worktree (`isDefault: true`)". The input schemas don't change.

CLI `cf worktree rm` with a renamed default (`main-line`):
```
Note: Its range went back to the default worktree 'main-line', now 100-299.
Note: The default worktree 'main-line' keeps its range 100-199: <reason>.
  To widen it by hand: cf worktree update main-line --range <start>-<end>
```

CLI `cf worktree list` shows a dim `(default)` after the default's name. The name column otherwise stays the same.

**Compatibility.**

| Surface | Change | Compatibility |
|---|---|---|
| CLI `--json`, MCP responses | New optional fields: `isDefault` on worktree objects, `defaultWorktree` on the remove result. | Additive. No existing field is renamed, removed or retyped. A consumer that ignores unknown keys is unaffected. |
| MCP tool descriptions | Text only. | No input-schema change. |
| `cf worktree list` table | The `(default)` tag, and stderr warnings while the migration is unsaved. | The table is human-readable output and is not a supported parse target. Scripts and agents should use `--json`, which carries the same information as a field. |
| `cf worktree rm` notes | They name the default's current name instead of the literal `'default'`. | Text only. |

### Database / Storage Schema
`projects.json`: an optional `isDefault` boolean on each element of `worktrees`. Older `cf` builds keep it through updates, because `updateWorktree` spreads the original. Worktrees an older build creates arrive without the field and are resolved by the next load migration under the rule above.

## Integration Points

### Provides to Other Slices
- `isDefaultWorktree` / `findDefaultWorktree` in `utils/defaultWorktree.ts`: the only way to identify the default. Future worktree work must use these, not the name.
- `isDefault` on the worktree objects returned by MCP and CLI JSON, for agents that need to know the default.
- `RemoveWorktreeResult.defaultWorktree`, and the migrate-on-first-load behavior of `FileProjectStore`.

No planned slice consumes these yet, so the frontmatter `interfaces` (slices that depend on this one) stays empty. The template defines that field as a list of slices, so contract names don't belong there. The contract changes are listed here, and their compatibility is stated under API Contracts.

### Consumes from Other Slices
- Slice 932's restore logic and result shape, which are extended here without changing their behavior.

## Success Criteria

### Functional Requirements
- A worktree created or renamed as `Default` (any case) after migration is never narrowed by `chopDefaultRange` or widened by `restoreDefaultRange`.
- Renaming the real default keeps both chop and restore working on it.
- `cf worktree init --name default` on a project that already has worktrees creates a worktree with `isDefault: false`.
- First read after upgrade: a stored worktree named `default` with no `isDefault` field reads as `true`, and all the project's other worktrees read as `false`. A read alone never writes `projects.json`. The next ordinary write saves those values for every project.
- After the marked default is removed, renaming another worktree to `default` does not make it the default, including across a process restart.
- Ambiguous legacy data, where the path check can't narrow several unmarked `default`-named candidates to one, marks every candidate `false`. It warns once per process until saved, naming every candidate by name and id along with the recovery step.
- When no candidate exists but a worktree is at the project path, all worktrees get `false`, and a warning says that worktree may be a renamed default.
- When no candidate exists and no worktree is at the project path, all worktrees get `false` and nothing is printed.
- With a read-only `projects.json`, read-only commands (`cf worktree list`, `cf check`, MCP `worktree_list`) work after upgrade and see migrated data. Commands that write fail as they do today.
- With two worktrees marked `isDefault: true`, add (without override), range-changing update, and remove fail with an error naming both by name and id. `cf worktree list` (table and `--json`), `worktree_list`, `worktree_get`, `cf check`, and updates that don't change a range still work.
- `isDefault` cannot be changed through `updateWorktree`, `cf worktree update`, or `worktree_update`.
- `cf worktree rm` prints the default's current name in its notes and manual-fix hint.

### Technical Requirements
- No code outside `utils/defaultWorktree.ts` compares a worktree name to `'default'`. Check: `grep -rn "'default'" packages/*/src` shows no worktree-name comparison.
- No module in `packages/core/src/storage/` imports from `packages/core/src/services/`.
- Unit tests for `markLegacyDefaultWorktree` cover these cases:
  - single legacy default;
  - case variant (`Default`);
  - already-marked project (absent becomes `false`);
  - no candidate with no worktree at the project path (silent);
  - no candidate with a worktree at the project path (warns);
  - ambiguous candidates narrowed by path;
  - still ambiguous (all `false`, warns with ids);
  - idempotence (a second run returns `changed: false` and no warnings).
- `FileProjectStore` tests:
  - A legacy `projects.json` fixture reads as migrated and is not written by `getAll()`.
  - An `update()` on one project saves the migrated fields for every project.
  - A process that calls `getAll()` repeatedly prints each warning once.
  - Migration warnings go to stderr, and nothing is written to stdout.
- Existing tests that seed a default by name and expect chop or restore are updated to seed `isDefault: true`. Add a test that a name-only `default` (with `isDefault: false`) is not chopped.
- `pnpm -r build` and the full test suite pass.

### Integration Requirements
- `cf check` worktree attribution (`buildAttributedViews`) and `propagationTargets` behave the same. They don't use the default name today.

### Verification Walkthrough

Run against the local build (`node packages/cli/dist/index.js`, aliased `cfl` below). The global `cf` is the published npm package. Use a scratch project so no real project's worktrees are changed.

1. **Legacy migration.** Back up `~/.config/context-forge/projects.json`. In a scratch project's entry, set `worktrees` by hand to a `default` worktree (range `100-799`, `worktreePath` = project path, no `isDefault`) and one sibling. Run `cfl worktree list --json`. Expected: the default shows `"isDefault": true` and the sibling `"isDefault": false`, while `projects.json` is unchanged (no `isDefault` fields, same modification time). The rename in step 2 is the first write, and afterwards `projects.json` contains both fields.
2. **Rename keeps the marker.** `cfl worktree update default --name main-line`. Then `cfl worktree init --name extra --range 300-399`. Expected: `main-line` is narrowed to `100-299`, and `cfl worktree list` shows `main-line (default)`.
3. **Restore uses the marker and real name.** `cfl worktree rm extra`. Expected: `Note: Its range went back to the default worktree 'main-line', now 100-799.`
4. **A label named `default` is inert.** `cfl worktree init --name Default --range 900-949`. Then `cfl worktree init --name probe --range 920-930`. Expected: `Default` keeps `900-949`, and the overlap is only reported as advisory. Before this slice, `Default` would have been chopped to `900-919`. `list --json` shows `Default` with `"isDefault": false`.
5. **Not user-settable.** Through MCP `worktree_update` with `{ "worktree": "Default", "isDefault": true }`, expect the field to be ignored (still `false` in `worktree_get`).
6. **Renamed-before-upgrade warning.** Restore the backup and repeat step 1's setup, but name the root-path worktree `main-line`. Run `cfl worktree list`. Expected: one stderr warning saying `main-line` may be a renamed default, with the recovery step and the `projects.json` path. Neither row is tagged. Run it again: the warning repeats, because nothing has written yet. Set `"isDefault": true` on `main-line` by hand. `list` then tags it and prints no warning.
7. **Duplicate marker fails only where it matters.** Hand-edit `projects.json` so two worktrees have `isDefault: true`. Expected:
   - `cfl worktree list` shows both rows tagged `(default)`.
   - `cfl worktree init --name x --range 950-959` fails with an error naming both worktrees by name and id, and nothing is written.

   Restore the backup afterwards.

## Implementation Notes

### Development Approach
1. Types: `isDefault`, the `UpdateWorktreeInput` omit, and `RemoveWorktreeResult.defaultWorktree`.
2. `utils/defaultWorktree.ts`: move the name constant and `isDefaultWorktree` here, add `findDefaultWorktree` and `markLegacyDefaultWorktree`, and write their unit tests first.
3. `WorktreeService`: set the flag at creation, add the duplicate check through `findDefaultWorktree`, pin `isDefault` in update, add `defaultWorktree` to the remove result.
4. `FileProjectStore`:
   - run the migration on the parsed array in `getAll()`;
   - print warnings to stderr, once per process (a module-level set of printed warnings);
   - add the fixture, save-on-write and warn-once tests.
5. CLI `rm`/`list` text, and MCP descriptions.
6. Sweep the tests that seed a name-only default and expect chop or restore (mainly `WorktreeService.test.ts`, `worktreeTools.test.ts`, `cli/tests/commands/worktree.test.ts`). Tests that build the default through `addWorktree` need no change.

### Special Considerations
- **No write on read.** The migration never writes on its own. The migrated values reach disk with the next `create`, `update` or `delete`, through `FileStorageService`, so the existing atomic write, backup and write guard apply. If that write fails, the command fails exactly as it does today, and the next read recomputes the same migration.
- **Corrupt or unparseable file.** The migration runs on what `getAll()` has already parsed, so the existing behavior applies unchanged: `FileStorageService` recovers from the backup, a non-array payload means there is nothing to migrate (and `getAll()` returns `[]`), and a parse error throws as it does today. This slice adds no new handling.
- **Concurrent processes.** `FileProjectStore` has no cross-process locking, and every `update()` today has a lost-update window. The migration adds no write and no window. Two processes reading the same legacy file compute the same result, because the migration is deterministic, and each may print the same warning once. Locking stays out of scope.
- **Cost.** The migration is one in-memory pass over the projects on each `getAll()`. Once saved, it only checks the fields. No measurable startup cost is expected, and the 900 architecture sets no latency targets for these paths.
- **Existing stdout writes in storage (out of scope).** Some code already in the storage layer uses `console.log`:
  - the legacy-location migration message (`FileProjectStore.ts`);
  - `Versioned backup created` (`backupService.ts`);
  - the config-path migration message (`storagePaths.ts`).

  Under the MCP stdio transport these would write to the protocol stream if they ever ran in the server process. This slice adds none and does not call them. This defect predates 934. It is tracked as GitHub #113, and this slice does not fix it.
- **Mixed `cf` versions.** The published global `cf` may be older than a local build. Data an older build writes stays valid: unknown fields are kept on update, and new unmarked worktrees are resolved at the next load. No downgrade path is needed.

## Design Review Resolution

Review `user/reviews/934-review.slice.stable-default-worktree-marker.md` (CONCERNS) is resolved in this document as follows:

| Finding | Resolution |
|---|---|
| F001 store → services dependency | Helpers moved to `utils/defaultWorktree.ts`. The dependency direction is stated, and injecting the migration was considered and rejected (Component Structure; Where the migration runs). |
| F002 write failure / concurrency | Write failure fails the command and the next access retries. The init promise is stored. Corrupt-file and cross-process behavior are spelled out (State Management; Special Considerations). |
| F003 ambiguous / no-candidate outcomes | Every absent value resolves in one pass, and unresolved candidates become `false`. Two targeted warnings carry a recovery step, and the no-default case stays silent (Migration rule). |
| F004 duplicate-marker error blocks remediation | The error is limited to chop and restore paths and names ids. Read and diagnostic paths keep working (More than one marked worktree…). |
| F005 scope | Tied to the architecture's "Pattern consolidation" scope item, and the `list` tag is justified. Whether the scope list needs an explicit defect-fix entry is left to the Project Manager (Overview). |
| F007 NFRs | A cost note was added (Special Considerations). |
| F006 (pass) | No action. |
| F008 `interfaces` | The field lists dependent slices, and none exist. The contract changes are listed under Provides to Other Slices. |

Re-review round 1 (CONCERNS), same review file:

| Finding | Resolution |
|---|---|
| Write-on-read changes store responsibilities | The store's added duty is stated, and the decision logic stays in the pure function. Warnings go to stderr via `console.warn`, never stdout, which is safe under MCP stdio and matches the MCP server's own logging. A test enforces it. The existing stdout writes in storage are flagged as a separate item (Where the migration runs; Special Considerations). |
| Migration heuristic relies on name matching | The name match is limited to the single bootstrap step, with the reason it is needed. The migration only adds a field and never guesses in the risky cases. A follow-up trigger for a marker-move command is recorded (Migration rule). |
| Contract changes not in `interfaces` | The field stays a list of slices per the template. A compatibility table now covers JSON, MCP and CLI surfaces, and states that the `list` table is not a supported parse target (API Contracts). |
| Notes (NFRs, traceability) | No action. The skipped F006 is now listed above. |

Re-review round 2 (CONCERNS), same review file:

| Finding | Resolution |
|---|---|
| F005 slice size vs. low-risk framing | Project Manager approved the slice as 900-plan maintenance work (20261007). The `(default)` tag and `defaultWorktree` result field stay in this slice (Overview). |
| F006 write-on-read breaks read-only commands | Replaced write-on-read with a read-time, in-memory migration in `getAll()`. The next ordinary write saves it. Read-only commands keep working, the write-failure path and init-promise change are gone, and the round-1 F002 resolution above is superseded (Data Flow; Why not write on read; Special Considerations). |
| F007 resolution tables in the design | No action. Project convention (see slice 932). |
| F008 storage stdout writes untracked | Filed as GitHub #113 (Special Considerations). |
| F001–F004 (pass) | No action. |
