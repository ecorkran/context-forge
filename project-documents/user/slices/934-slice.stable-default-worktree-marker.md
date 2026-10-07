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

This slice records which worktree is the default in a stored boolean, `isDefault`, and matches on that instead of the name. Forward migration sets it when it creates the default. Data stored before this change gets the field once, when the store loads. After that, names are labels only.

**Scope fit.** Same kind of item as 926–932: a defect in shipped worktree code that closes a GitHub issue. Patch release.

## Value

- **Correctness.** Range narrowing and restore only ever touch the worktree that forward migration created. Renaming it, or naming another worktree `default`, has no effect on ranges.
- **Visible default.** `isDefault` is part of every worktree object that the CLI (`--json`) and the MCP tools return, so agents and users can see which worktree is the default instead of guessing it from the name.
- **Correct manual-fix hint.** `cf worktree rm` currently prints `cf worktree update default --range …`. That command fails once the default has been renamed. The hint now uses the default's actual name.

## Technical Scope

**Included**
- `isDefault?: boolean` on `WorktreeContext`. Forward migration writes `true`. `addWorktree` writes `false` on every worktree it creates.
- A one-time load migration in `FileProjectStore` that fills in `isDefault` on stored worktrees that don't have the field.
- `isDefaultWorktree()` reads the flag. The name constant stays only as the label forward migration gives the default and as the legacy match used by the load migration.
- More than one marked worktree is a hard error wherever the default is looked up.
- `isDefault` cannot be set through create or update inputs (types and runtime).
- `RemoveWorktreeResult` gains `defaultWorktree: { id, name }` whenever it reports `restoredRange` or `rangeNotRestored`. CLI `rm` messages use that name.
- `cf worktree list` table tags the default row. MCP tool descriptions refer to the default as `isDefault: true` instead of the name `'default'`.
- Test updates in core, CLI and MCP that seed a default by name and expect chop or restore.

**Excluded**
- Any command to move the default marker to a different worktree. None exists today, and nothing needs one.
- Enforcing unique worktree names (`getWorktreeByName` still returns the first case-insensitive match). That is a separate concern.
- Changes to the chop or restore range rules themselves (slice 932 behavior stays the same).

## Dependencies

### Prerequisites
- Slice 932 (merged): `restoreDefaultRange()`, `RemoveWorktreeResult`, and the shared `isDefaultWorktree` / `EMPTY_RANGE` helpers this slice changes.

### Interfaces Required
- `IProjectStore` / `FileProjectStore` (`packages/core/src/storage/`): the load path (`ensureInitialized`) where the migration runs.
- `WorktreeService` add, update and remove methods, and `chopDefaultRange()` / `restoreDefaultRange()`.

## Architecture

### Component Structure

| Component | Change |
|---|---|
| `types/worktree.ts` | `WorktreeContext.isDefault?: boolean`. `UpdateWorktreeInput` omits `isDefault`. `RemoveWorktreeResult.defaultWorktree?`. |
| `services/defaultWorktree.ts` (new) | Holds the default-worktree knowledge in one place: `DEFAULT_WORKTREE_NAME`, `isDefaultWorktree(wt)`, `findDefaultWorktree(worktrees)` (throws on more than one), and `markLegacyDefaultWorktree(project)` (the migration, a pure function). This also moves code out of the 482-line `WorktreeService.ts`. |
| `services/WorktreeService.ts` | Sets the flag at creation. Chop and restore use `findDefaultWorktree`. Update keeps `isDefault` the same way it keeps `id`. |
| `storage/FileProjectStore.ts` | `ensureInitialized()` runs the migration over all projects and writes once if anything changed. |
| `cli/commands/worktree.ts` | `rm` notes and hint use `defaultWorktree.name`. `list` tags the default row. |
| `mcp-server/tools/worktreeTools.ts` | Description text only. The flag already comes through on the returned worktree objects. |

### Data Flow

1. **Load.** The first store access in a process calls `ensureInitialized()`. That runs the legacy-location step (unchanged), then reads `projects.json` and runs `markLegacyDefaultWorktree` on each project. If any project changed, it writes the file once. Every consumer reads the migrated data, including callers that read `project.worktrees` directly from the store (`cf worktree list --json`, `buildAttributedViews`).
2. **Create.** Forward migration builds the default with `isDefault: true`. The new worktree, and any worktree appended later, gets `isDefault: false`.
3. **Chop / restore.** `findDefaultWorktree(worktrees)` returns the single worktree with `isDefault === true`, or none. It throws if more than one is marked. The range logic after that is unchanged.
4. **Remove.** When the restore runs, the result carries the default's `{ id, name }`. The CLI prints that name.

### State Management

Each worktree now stores one more field. The three values mean:

| Stored value | Meaning |
|---|---|
| `true` | This is the default (created by forward migration, or marked by the load migration). |
| `false` | Not the default. Written by `addWorktree` and by the load migration. |
| absent | Written before 934 (or by an older `cf` binary). Only the load migration interprets it, and it replaces it with `true` or `false`. |

An absent field is how the code knows a migration is pending, so no project-level stamp is needed. After the migration, no worktree has an absent value, so a later rename to `default` never triggers it again.

## Technical Decisions

### Marker shape: flag, not a dedicated ID
A flag is chosen. A reserved ID (e.g. `wt_default`) would mean rewriting the ID of every existing default worktree. IDs are opaque, other code may hold references to them, and `updateWorktree` treats them as immutable. A flag adds one optional field and leaves IDs alone.

### Explicit `false` on non-defaults
The load migration has to run exactly once. Otherwise, after the real default is removed, a worktree a user later names `default` would be marked again, which is the bug this slice fixes. Writing `false` explicitly lets "absent" mean "written before this change", so no separate stamp field is needed. The cost is one boolean on each new worktree, set in a single place (`addWorktree`).

### Migration rule (`markLegacyDefaultWorktree`)
For each project with worktrees, if any worktree has `isDefault` absent:
- If some worktree already has `isDefault === true`, every absent value becomes `false`.
- Otherwise, the candidates are the worktrees with an absent value whose name is `default` (case-insensitive), the shape forward migration has always written:
  - one candidate: it gets `true`;
  - more than one: keep only the candidates whose `worktreePath` equals `project.projectPath` (forward migration always sets that). If exactly one is left, it gets `true`;
  - still ambiguous, or no candidates: nothing is marked. Ambiguous cases write one `console.warn` naming the project and the candidates. With no default, chop and restore do nothing, so no worktree's range is changed by a guess.
- Every other absent value becomes `false`.

The function is pure and idempotent (it returns whether it changed anything). It runs after `getAll()`'s parse and before any consumer sees the data.

### Where the migration runs: the store, not the service
In `WorktreeService`, the migration would only be persisted by mutations, and raw store readers would see unmigrated data. The CLI `list` and the attribution views both read `project.worktrees` directly. `FileProjectStore.ensureInitialized()` already does one-time migration work, so the new step runs there, once per process. The domain rule stays in `services/defaultWorktree.ts`, and the store only calls it.

### Rename and `cf worktree init --name default`
Names are labels only. Renaming the default leaves `isDefault` unchanged. `init --name default` (CLI or MCP) creates an ordinary worktree with `isDefault: false`. The CLI still resolves `default` by name like any other name.

### More than one marked worktree is rejected
Only forward migration (when no worktrees exist) and the load migration (at most one per project) write `true`, and neither the create nor the update input can carry it. So two marked worktrees can only come from editing `projects.json` by hand. `findDefaultWorktree` throws: `Project has more than one default worktree (<names/ids>); set isDefault to true on only one in projects.json.` This stops add, update and remove for that project until it is fixed. That is explicit failure instead of narrowing a guessed worktree.

### `isDefault` is not user-settable
`UpdateWorktreeInput = Partial<Omit<WorktreeContext, 'id' | 'isDefault'>>`, and `CreateWorktreeInput` does not get the field. `updateWorktree` sets `isDefault: original.isDefault` after the spread, the same way it pins `id`. This means a stray runtime key cannot change it. The MCP update handler copies every argument key it receives, but the zod schema has no `isDefault` field, so the key never reaches it.

### Patterns and Conventions
- The default name and the legacy match are each defined once, in `services/defaultWorktree.ts`. No other module compares worktree names to `'default'`.
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

### Database / Storage Schema
`projects.json`: an optional `isDefault` boolean on each element of `worktrees`. Older `cf` builds keep it through updates, because `updateWorktree` spreads the original. Worktrees an older build creates arrive without the field and are resolved by the next load migration under the rule above.

## Integration Points

### Provides to Other Slices
- `isDefaultWorktree` / `findDefaultWorktree`: the only way to identify the default. Future worktree work must use these, not the name.
- `isDefault` on the worktree objects returned by MCP and CLI JSON, for agents that need to know the default.

### Consumes from Other Slices
- Slice 932's restore logic and result shape, which are extended here without changing their behavior.

## Success Criteria

### Functional Requirements
- A worktree created or renamed as `Default` (any case) after migration is never narrowed by `chopDefaultRange` or widened by `restoreDefaultRange`.
- Renaming the real default keeps both chop and restore working on it.
- `cf worktree init --name default` on a project that already has worktrees creates a worktree with `isDefault: false`.
- First load after upgrade: a stored worktree named `default` with no `isDefault` field gets `true`, and all the project's other worktrees get `false`. The file is written once, and later loads don't write.
- After the marked default is removed, renaming another worktree to `default` does not make it the default, including across a process restart.
- Ambiguous legacy data (several unmarked `default`-named candidates that the path check cannot narrow to one) marks none and warns once.
- Two worktrees with `isDefault: true` make add, update and remove fail with the error naming both.
- `isDefault` cannot be changed through `updateWorktree`, `cf worktree update`, or `worktree_update`.
- `cf worktree rm` prints the default's current name in its notes and manual-fix hint.

### Technical Requirements
- No code outside `services/defaultWorktree.ts` compares a worktree name to `'default'`. Check: `grep -rn "'default'" packages/*/src` shows no worktree-name comparison.
- Unit tests for `markLegacyDefaultWorktree` cover: single legacy default; case variant (`Default`); already-marked project (absent becomes `false`); no candidate; ambiguous candidates narrowed by path; still ambiguous (none marked, warn); idempotence (second run returns no change).
- `FileProjectStore` test: legacy `projects.json` fixture migrates on first access and is not rewritten on the second.
- Existing tests that seed a default by name and expect chop or restore are updated to seed `isDefault: true`. Add a test that a name-only `default` (with `isDefault: false`) is not chopped.
- `pnpm -r build` and the full test suite pass.

### Integration Requirements
- `cf check` worktree attribution (`buildAttributedViews`) and `propagationTargets` behave the same. They don't use the default name today.

### Verification Walkthrough

Run against the local build (`node packages/cli/dist/index.js`, aliased `cfl` below). The global `cf` is the published npm package. Use a scratch project so no real project's worktrees are changed.

1. **Legacy migration.** Back up `~/.config/context-forge/projects.json`. In a scratch project's entry, set `worktrees` by hand to a `default` worktree (range `100-799`, `worktreePath` = project path, no `isDefault`) and one sibling. Run `cfl worktree list --json`. Expected: the default shows `"isDefault": true`, the sibling `"isDefault": false`, and `projects.json` now contains both fields. Run it again and confirm the file's modification time doesn't change.
2. **Rename keeps the marker.** `cfl worktree update default --name main-line`. Then `cfl worktree init --name extra --range 300-399`. Expected: `main-line` is narrowed to `100-299`, and `cfl worktree list` shows `main-line (default)`.
3. **Restore uses the marker and real name.** `cfl worktree rm extra`. Expected: `Note: Its range went back to the default worktree 'main-line', now 100-799.`
4. **A label named `default` is inert.** `cfl worktree init --name Default --range 900-949`. Then `cfl worktree init --name probe --range 920-930`. Expected: `Default` keeps `900-949`, and the overlap is only reported as advisory. Before this slice, `Default` would have been chopped to `900-919`. `list --json` shows `Default` with `"isDefault": false`.
5. **Not user-settable.** Through MCP `worktree_update` with `{ "worktree": "Default", "isDefault": true }`, expect the field to be ignored (still `false` in `worktree_get`).
6. **Duplicate marker fails loudly.** Hand-edit `projects.json` so two worktrees have `isDefault: true`. Run `cfl worktree init --name x --range 950-959`. Expected: an error naming both worktrees, and nothing written. Restore the backup afterwards.

## Implementation Notes

### Development Approach
1. Types: `isDefault`, the `UpdateWorktreeInput` omit, and `RemoveWorktreeResult.defaultWorktree`.
2. `services/defaultWorktree.ts`: move the name constant and `isDefaultWorktree` here, add `findDefaultWorktree` and `markLegacyDefaultWorktree`, and write their unit tests first.
3. `WorktreeService`: set the flag at creation, add the duplicate check through `findDefaultWorktree`, pin `isDefault` in update, add `defaultWorktree` to the remove result.
4. `FileProjectStore.ensureInitialized()`: run the migration and write once, with a fixture test.
5. CLI `rm`/`list` text, and MCP descriptions.
6. Sweep the tests that seed a name-only default and expect chop or restore (mainly `WorktreeService.test.ts`, `worktreeTools.test.ts`, `cli/tests/commands/worktree.test.ts`). Tests that build the default through `addWorktree` need no change.

### Special Considerations
- **Write on first read.** The migration rewrites `projects.json` the first time a process touches the store. That goes through `FileStorageService`, so the existing atomic write, backup and write guard apply. The write guard never trips, because the number of projects stays the same.
- **Mixed `cf` versions.** The published global `cf` may be older than a local build. Data an older build writes stays valid: unknown fields are kept on update, and new unmarked worktrees are resolved at the next load. No downgrade path is needed.
