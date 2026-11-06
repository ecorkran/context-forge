---
docType: slice-design
slice: devlog-size-based-archiving
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies:
- 213
- 923
interfaces: []
dateCreated: 20261105
dateUpdated: 20261106
status: complete
turns: 23
promptTokens: 1649441
cachedTokens: 1507276
cacheWriteTokens: 142125
completionTokens: 41014
durationSeconds: 398.2
costUsd: 2.259231
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.2592301000000004
    completionTokens: 41014
revision_number: 2
---

# Slice Design: DEVLOG Size-Based Archiving

## Overview

Fixes GitHub #141. `DEVLOG.md` grows without bound. Squadron's reached 1.05 MB, and a pipeline agent editing it received a tool result larger than the Agent SDK's 1 MiB message buffer, which failed every item in a `slices-plan` run. A large DEVLOG also wastes context for any agent that reads it.

This slice adds a size-triggered rollover. When DEVLOG.md passes a limit, cf keeps the newest day sections up to a target size and moves the rest, cut from the bottom, into quarterly archives at `project-documents/user/archive/devlog/DEVLOG-YYYY-Qn.md`. Squadron already uses this layout after splitting its DEVLOG by hand. The surfaces are a `cf devlog archive` command and a `cf check` warning that `--fix` resolves.

**Scope fit.** The 900 plan holds maintenance items of this kind. This is a new command, one new check rule, and one new fix action on the existing routed-fix path, which must also learn to handle a fix that writes several files (D9). Patch release.

## Value

- **Agents and pipelines:** DEVLOG stays small enough to read and edit, so the buffer failure in #141 cannot recur through this file.
- **Every cf-managed project:** the fix needs no per-project scripting. `cf check` warns, and one command or `--fix` resolves it.
- **Squadron:** retires its hand-split process. Its existing archives are valid targets, so no migration is needed.

## Technical Scope

**Included**

- A section parser and a pure archive planner in core.
- An archive writer that creates or prepends to quarterly files.
- Two shared config keys for the size limit and the target size.
- `cf devlog archive [--dry-run]`.
- A `devlog-size` rule in `cf check` and MCP `workflow_check`, with an `archive-devlog` fix action.
- README updates.

**Excluded**

- CHANGELOG, which stays one file per the slice plan.
- Splitting a single day section, and any rewriting or reformatting of entries.
- A new MCP tool. `workflow_check` picks the rule up through the shared checker.
- Time-based rollover and archive compression.
- Editing guide files. The convention goes to the guide agent after this ships (D10).
- A pointer line in DEVLOG.md to the archives. Whether the guide template or cf provides it is deferred to #142.

## Dependencies

### Prerequisites

Both are complete, so nothing blocks this slice.

- Slice 213: routed fixes.
- Slice 923: the `devlog` frontmatter schema.

### Interfaces Required

- `ConsistencyChecker.checkAll` aggregate rules and `applyFixes` (`packages/core/src/introspection/ConsistencyChecker.ts`).
- The routed-fix path (`packages/core/src/introspection/routedFixes.ts`, `fixOwnership.ts`).
- `CONFIG_KEYS` and `ConfigManager` (`packages/core/src/config/`).
- `resolveProjectWorktree` and `resolveProject`, as used by `cf docs map` (`packages/cli/src/commands/docs.ts`).
- The `devlog` frontmatter schema (`packages/core/src/schema/frontmatterSchema.ts:142`), which requires `docType` and `dateCreated`.

## Architecture

### Component Structure

| Component | Location | Responsibility |
|---|---|---|
| `devlogSections` | `packages/core/src/devlog/` | Pure. Parse text into a preamble and dated sections. Map a date to its quarter. |
| `planDevlogArchive` | `packages/core/src/devlog/` | Pure. Given parsed sections and the target size, return kept text and moved sections grouped by quarter. |
| `archiveDevlog` | `packages/core/src/devlog/` | Read, plan and write. Exported from `@context-forge/core/node`. Holds the `DEVLOG_FILE` and `DEVLOG_ARCHIVE_DIR` constants. |
| `devlogSizeFinding` | `packages/core/src/introspection/` | Build the `devlog-size` finding. `ConsistencyChecker` stays a thin caller, since it is already 1,487 lines. |
| `registerDevlogCommand` | `packages/cli/src/commands/devlog.ts` | Command wiring and output only. |

`ProjectModelBuilder.ts:314` currently hard-codes `'DEVLOG.md'`. It switches to the shared constant.

### Data Flow

Command:

```
cf devlog archive
  → resolve project and checkout path
  → read devlog.max_bytes and devlog.target_bytes
  → stat DEVLOG.md; at or under the limit: report and stop
  → read and parse → planDevlogArchive
  → --dry-run: print the plan and stop
  → write archives → re-read DEVLOG.md; changed: fail (D11)
  → write DEVLOG.md → print the result
```

Check and fix:

```
cf check → checkAll → devlog-size rule, once per view
  over the limit → parse and plan
    plan moves sections → warning, fixable, archive-devlog fixAction
    nothing to move     → warning, not fixable
cf check --fix → planRoutedFixes → primary checkout owns the fix (D8)
  → applyFixes → archiveDevlog → commit if the checkout is non-invoking
```

### State Management

All state is in files. DEVLOG.md and the archives are the only things written. A run keeps no manifest or marker, so a second run has nothing to do unless the file has grown past the limit again.

## Technical Decisions

### D1 — Config keys and defaults

Status: decided

| Key | Default | Meaning |
|---|---|---|
| `devlog.max_bytes` | `200000` | `cf check` warns and archiving triggers when DEVLOG.md is larger than this. |
| `devlog.target_bytes` | `100000` | Archiving keeps the newest sections up to this size. |

- Both use `ConfigScope.Shared`, so a team agrees on one policy. Each must be a positive integer, enforced by its `validate` function.
- Units are bytes because the failure in #141 is a byte buffer.
- 200 KB is about a fifth of the buffer that failed. Today cf's DEVLOG is 186 KB and squadron's post-split file is 149 KB, so neither is flagged the day this ships. Squadron has added 4–10 KB per day section (Q4 and Q3 averages), so it would archive every few weeks.
- The gap between the two values prevents a warning from returning after the next entry.
- `target_bytes >= max_bytes` is invalid. `validate` sees one value at a time, so the pair is checked at use. `cf devlog archive` fails with an error naming both keys. `cf check` reports a non-fixable `error` finding instead, so a bad setting does not stop every other rule.
- No "0 disables" value is added. Nobody has asked for it, and raising the limit does the same job.

### D2 — What counts as a day section

Status: decided

A dated heading is a level-2 heading, outside a code fence, that matches one of two rules. In both, the date is followed by the end of the line or a non-digit, and any trailing text is ignored.

| Rule | Examples |
|---|---|
| Full date, `YYYYMMDD` (preferred) or `YYYY-MM-DD`. The first date in the heading is used. | `## 20260331`, `## 2026-11-03`, `## 2025-11-18 (reconstructed from git)`, `## 2026-07-05 – 2026-07-06` |
| Year and month, `YYYY-MM` | `## 2025-10 (summary)` |

- The slice plan names the two full-date forms. Trailing text and the year-month rule are needed because cf's own DEVLOG uses them, and rejecting them would misfile real content.
- A month outside 1–12 or a day outside 1–31 makes the heading undated.
- Parsing keeps every section's bytes as read, including CRLF.

### D3 — Content above the first dated heading, and undated sections

Status: decided

- Everything above the first dated heading is the **preamble**. It always stays in DEVLOG.md and counts toward the kept size. This covers frontmatter, the title, format notes, and any undated `##` section at the top, such as the guide template's literal `## YYYYMMDD`.
- A section runs from one dated heading to the next. An undated `##` heading below the first dated heading is part of the section above it and moves with that section. This loses nothing, requires no guess about a quarter, and keeps the text next to what it was written beside.
- A file with no dated headings has nothing to move. It gets the non-fixable warning from D5.

### D4 — The cut is positional; the archive file comes from the heading's date

Status: decided

- Walk sections from the top and add each to the kept set until the next one would take preamble plus kept sections above `target_bytes`. That section and everything below it moves, even if a smaller section lower down would have fit.
- Dates do not decide the cut, because real files are not strictly ordered. cf's DEVLOG has `## 2026-07-18` directly below `## 2026-07-17`, and `## 2025-01-16` above `## 2025-11-18`. Position needs no reordering, and the file's order is the author's.
- Each moved section goes to the quarter its own heading names, with Q = ⌈month ÷ 3⌉. An out-of-order heading is filed by what it says.

### D5 — A single day section larger than the target

Status: decided

- The newest section is always kept, even when it alone exceeds `target_bytes`. Sections are never split, because a split would need rules about where a day's notes can break, and the day's notes are the unit a reader expects.
- If DEVLOG.md is still over `max_bytes` after this, the warning stays and is non-fixable. Its text says the newest section alone exceeds the limit and must be edited by hand.
- So `--fix` converges: it either moves sections or, on the next run, has nothing to move and reports that.

### D6 — Archive file format

Status: decided

A new archive is written as:

```markdown
---
docType: devlog
project: {project name}
dateCreated: {today}
dateUpdated: {today}
---

# Development Log Archive: {YYYY} Q{n}

Archived from DEVLOG.md. Newest entries first.

{moved sections}
```

- For an existing archive, moved sections are inserted before its first dated heading, using the same parser, so its preamble can be any shape. Squadron's files, whose preamble cites #141, work unchanged. An archive with no dated heading gets them appended.
- Sections moved in one run keep their relative order.
- Every moved section is written ending in a blank line, so a section that ended the source file without a newline cannot join the next heading. Apart from this trailing whitespace, section text is unchanged.
- The frontmatter of an existing archive and of DEVLOG.md is not touched. The `devlog` schema does not require `dateUpdated`.

### D8 — Worktree routing: `--fix` belongs to the primary checkout

Status: decided

- The finding sets `fixAction.subjectIndex` to `null`. Existing `resolveFixOwner` rule 3 then assigns it to the primary checkout, and a worktree's copy is deferred as `not-owner`.
- Each checkout has its own DEVLOG.md, and each view runs the rule. If two checkouts archive independently, they create the same new archive files and conflict on merge. A single owner prevents that. A bottom cut on main and new entries at the top on a branch touch separate hunks, so branches merge cleanly.
- The `description` is `DEVLOG.md is {size} bytes, over devlog.max_bytes ({max})`. Slice 927's merge dedups on rule, root-normalized location and description, so two checkouts at the same size collapse to one displayed finding and different sizes show one finding each, attributed to its worktree. Both are intended: the same size reads as one problem, and different sizes are different files. Routing is unaffected either way, because `planRoutedFixes` works from each view's result before the merge.
- When a worktree alone is over the limit, the deferral stands and `suggestedFix` names `cf devlog archive`. That command writes to the checkout it runs in, as an explicit choice.
- With `workflow.auto_fix`, a plain `cf check` run can archive and commit in the primary checkout without prompting. That is acceptable: it happens only above the limit, and it loses no content.

### D9 — One fix now writes several files

Status: decided

The routed-fix path assumes one written file per fix. Archiving writes DEVLOG.md plus one file per quarter, so:

- `fixAction.type` and `FixLogEntry.action` gain `'archive-devlog'`.
- `fixAction` and `FixLogEntry` gain optional `additionalPaths: string[]`. `filePath` stays DEVLOG.md. `fixAction.detail` is `{ targetBytes, projectName }`.
- `fixRelPath` gets a companion returning all of a finding's paths. `gateByReadiness` defers the fix if any of them is dirty, so a commit never sweeps up someone's uncommitted archive edit.
- `commitViewWrites` commits every path in the log entry, and its `COMMIT_FAILED` filter matches any of them.
- `restorePathsToHead` needs no change. A failed commit happens after `git add`, and `git restore --source=HEAD --staged --worktree` removes a newly added file in that state (confirmed against git). If `git add` itself fails, restore errors on the untracked path and the run reports its existing "left written but uncommitted" error. Content is intact in that case.

Alternative rejected: confining the fix to the invoking checkout, by reporting it non-fixable elsewhere. It would add a special case to routing and make `--fix` behave differently from every other rule.

**Scope boundary.** Every existing fix action leaves `additionalPaths` absent, so its path list is exactly `[filePath]` and it behaves as it does today. Owner resolution, readiness probes, the commit message and `restorePathsToHead` do not change.

### D10 — Guide-side convention

Status: decided

cf owns the mechanism and the guide owns the convention. After release, send the guide agent this request, for `templates/devlog-format.md` and the DEVLOG section of the process guide:

- Older entries live in `project-documents/user/archive/devlog/DEVLOG-YYYY-Qn.md`, moved by cf when DEVLOG.md passes `devlog.max_bytes`.
- Do not edit or split archives by hand.
- Use `## YYYYMMDD` headings.
- Read an archive only when older history is needed.

### D11 — Write order and concurrent edits

Status: decided

- The whole plan is computed in memory first, after reading DEVLOG.md and every existing target archive. Those reads decode as strict UTF-8, because a lenient decode would corrupt the file when it is written back. A read or decode failure stops the run before anything is written.
- Archives are then written with plain writes, and DEVLOG.md last, so a section is never in neither place.
- An agent can add an entry to DEVLOG.md during a run, and replacing the file from the planned text would silently lose it. So immediately before the final write, the run re-reads DEVLOG.md and compares it with the text it planned from. The gap between that re-read and the write is accepted. Closing it would need file locking that other editors would not honor.
- **Any failure after the first write**, including a changed DEVLOG.md, stops the run. There is no rollback. The error names the cause and every file already written, and says to review them with `git diff`. DEVLOG.md keeps its moved sections unless its own write was the one that failed, and a failed write can leave that file partial. Git is the recovery in that case.
- **A re-run is harmless.** A section whose exact text is already in its target archive is not written again, and the run still cuts it from DEVLOG.md. So a retry finishes the job without duplicates, including through `workflow.auto_fix`. In a non-invoking checkout, the archives left uncommitted defer the fix as `file-dirty` until someone reviews them.
- Under `cf check --fix`, these errors reach the user through the existing `fixErrors` in `applyFixes`.

### Technology Choices

Node `fs/promises` only. No new dependencies.

### Patterns and Conventions

- Keep parsing and planning pure, and test them without a filesystem.
- Pass the date explicitly, matching `updateFrontmatterField`, with no inline clock.
- Check DEVLOG.md's size with `stat` first. Read and parse only when over the limit, so a normal `cf check` run adds one `stat` per checkout.
- Run the rule beside Rules 12 and 15 in `checkAll`, as an aggregate rule. `cf check --slice N` does not run it, which matches those rules.
- As with Rule 15, the rule returns no findings when the checker was built without a `ConfigManager`. Both real callers (`cf check`, `workflow_check`) pass one.

## Implementation Details

### API Contracts

**`cf devlog archive [--dry-run] [--project <id>]`**

| Situation | Output | Exit |
|---|---|---|
| Over the limit, sections moved | Before and after size, then per-file section counts | 0 |
| At or under the limit | `DEVLOG.md: {n} bytes, within devlog.max_bytes ({max}). Nothing to archive.` | 0 |
| Over the limit, nothing movable | Reason from D3 or D5 | 0 |
| No DEVLOG.md | Error naming the expected path | 1 |
| `target_bytes >= max_bytes` | Error naming both keys | 1 |
| DEVLOG.md or an existing archive unreadable or not UTF-8 | Error naming the path; no files changed | 1 |
| DEVLOG.md changed during the run (D11) | Error naming the archives already written; DEVLOG.md untouched; safe to run again | 1 |
| Creating the archive directory or writing any file fails | Error naming the path, the cause and the files already written (D11) | 1 |

`--dry-run` prints the same report with the moved counts, prefixed `Would move`, and writes nothing. The command never commits. Example:

```
DEVLOG.md: 1050112 → 98220 bytes (limit 200000, target 100000)
Moved 132 sections:
  project-documents/user/archive/devlog/DEVLOG-2026-Q3.md  66
  project-documents/user/archive/devlog/DEVLOG-2026-Q2.md  48
  project-documents/user/archive/devlog/DEVLOG-2026-Q1.md  18
```

**`cf check` finding**

| Field | Value |
|---|---|
| `rule` | `devlog-size` |
| `severity` | `warning`; `error` for the invalid pair in D1 or an I/O failure |
| `location` | Absolute path to DEVLOG.md |
| `description` | See D8 |
| `fixable` | True only when the plan moves at least one section |
| `suggestedFix` | `cf check --fix` or `cf devlog archive` when fixable; otherwise the D3 or D5 reason |

A missing DEVLOG.md produces no finding. Any other `stat` or read error, including an unreadable or non-UTF-8 archive, produces a non-fixable `error` finding naming the path and cause, so the other rules still run.

The `--json` output and `workflow_check` shape change only by the additive enum value and optional field in D9.

## Integration Points

### Provides to Other Slices

- `cf devlog archive`, and the archive layout as a stable convention for squadron and the guide.
- `additionalPaths` on fix actions, available to any future multi-file fix.

### Consumes from Other Slices

- Slice 213 routed fixes, including owner resolution and readiness gating.
- Slice 923's `devlog` frontmatter schema.

## Success Criteria

### Functional Requirements

1. Above `devlog.max_bytes`, `cf devlog archive` leaves preamble plus the newest sections at or under `devlog.target_bytes`, subject to the D5 exception. The rest moves to quarterly archives.
2. Each moved section lands in the quarter its own heading names. An archive's newest-moved section sits above everything the file already held.
3. All of cf's real heading forms in D2 parse, and `## 2025-09 (summary)` files to 2025 Q3. Undated sections and preamble follow D3. A `##` line inside a code fence is not a heading.
4. A run on squadron's current DEVLOG and archives prepends into the existing quarter files without changing their preamble or existing sections.
5. New archives pass `cf validate frontmatter`.
6. At or under the limit, the command changes nothing and exits 0. `--dry-run` never writes.
7. `cf check` warns above the limit and is silent at or under it. `cf check --fix` resolves a fixable finding, and the same findings appear from `workflow_check`. With `workflow.auto_fix` on, a plain `cf check` archives above the limit without a prompt, and commits when the owning checkout is non-invoking.
8. A day section larger than the target stays whole. If it alone is over the limit, the warning is non-fixable and says why.
9. With two or more checkouts, `--fix` archives only in the primary checkout. A worktree's finding is deferred `not-owner`. When the primary is non-invoking, its DEVLOG.md and archive files land in one commit, and a dirty archive file defers the fix as `file-dirty`. This holds whether the merge collapses the checkouts' findings or not (D8).
10. If DEVLOG.md changes during a run, the run fails naming the files already written, and the new entry is intact. Running again finishes the archive with no duplicated section. Each failure row in API Contracts behaves as stated.

### Technical Requirements

- Conservation test: for any input, every section's text appears exactly once across kept output and archives, apart from the trailing whitespace in D6.
- Parser fixtures include excerpts from cf's real DEVLOG.md (all D2 forms, the out-of-order sections, separators) and squadron's archive format, per the project's parser rule.
- Unit tests cover planner edge cases: no dated headings, one huge section, a CRLF file, no trailing newline.
- A writer test changes DEVLOG.md between the archive writes and the final write, then re-runs and asserts no section is duplicated. A second covers a non-UTF-8 archive.
- A rule test covers a non-ENOENT `stat` error producing an `error` finding.
- A merge test runs two over-limit views at the same size and at different sizes, and asserts the D8 finding counts and the same routing plan in both cases.
- Regression: the existing `routedFixes.test.ts`, `fixOwnership.test.ts` and `mergeCheckResults.test.ts` (`packages/core/tests/introspection/`) pass unmodified, which shows single-path fixes are unchanged.
- Routed-fix tests cover multi-path readiness and a commit that fails through a pre-commit hook and restores the new archive files.
- Format, lint, typecheck and the core, CLI and MCP tests pass.
- README lists the command and both config keys, and says that `workflow.auto_fix` can archive and commit DEVLOG.md without a prompt.
- A test covers the `workflow.auto_fix` path for this rule.

### Integration Requirements

- Squadron can drop its manual process with no file moves.
- The D10 request goes to the guide agent after release.

### Verification Walkthrough

`cf` here means the local build, `node packages/cli/dist/index.js`, since the global binary is the published version. The command and keys do not exist until this slice is implemented. cf's real DEVLOG is the fixture, and it is restored afterward.

1. **Trigger on real data.**
   ```bash
   cf config set devlog.max_bytes 150000
   cf config set devlog.target_bytes 75000
   cf check            # expect a devlog-size warning, fixable
   cf devlog archive --dry-run
   git status --short  # expect only ` M .context-forge.toml` (the two keys); no DEVLOG.md change, no archive files
   ```
   Verified output: `cf check` lists `⚠ DEVLOG.md is 185733 bytes, over devlog.max_bytes (150000)` with `→ Run cf check --fix, or cf devlog archive`. The dry run prints `DEVLOG.md: 185733 → 72367 bytes (limit 150000, target 75000)` and `Would move 42 sections:` with six archive lines (2026-Q3 1, 2026-Q2 4, 2026-Q1 32, 2025-Q1 1, 2025-Q4 3, 2025-Q3 1). Section counts depend on the DEVLOG at the time.
2. **Archive.**
   ```bash
   cf devlog archive
   wc -c DEVLOG.md     # expect at or under 75000 (verified: 72367)
   ls project-documents/user/archive/devlog/
   ```
   Expect a `DEVLOG-2025-Q1.md` holding `## 2025-01-16`, a `DEVLOG-2025-Q3.md` holding `## 2025-09 (summary)`, and a `DEVLOG-2025-Q4.md` with `## 2025-11-18 (reconstructed from git)` above `## 2025-11-17 (reconstructed from git)` and `## 2025-10 (summary)`. Verified: six files, 2025-Q1, 2025-Q3, 2025-Q4, 2026-Q1, 2026-Q2, 2026-Q3.
3. **Nothing lost.**
   ```bash
   git diff --stat -- DEVLOG.md
   cat project-documents/user/archive/devlog/*.md DEVLOG.md | grep -c '^## [0-9]'
   git show HEAD:DEVLOG.md | grep -c '^## [0-9]'
   ```
   The two counts match (verified: 80 and 80).
4. **Clean after archiving.**
   ```bash
   cf validate frontmatter project-documents/user/archive/devlog/*.md   # exit 0
   cf check            # no devlog-size finding
   cf devlog archive   # "DEVLOG.md: 72367 bytes, within devlog.max_bytes (150000). Nothing to archive.", exit 0
   ```
   Verified: `cf validate frontmatter` reports `No inconsistencies found (6 files checked)`; `cf check` prints no `devlog-size` line.
5. **Restore, then repeat through `--fix`.**
   ```bash
   git restore DEVLOG.md && rm -r project-documents/user/archive/devlog
   cf check --fix --yes   # --yes skips the prompt
   wc -c DEVLOG.md        # expect 72367
   ```
   Verified: the output shows `→ Fixed: 185733 bytes → 72367 bytes in .../DEVLOG.md` and six archive files exist. `--fix` also applies any unrelated fixable findings in this repo (slice status, plan status); revert those with `git restore` if you don't want them.
6. **Squadron's layout, on a scratch copy.** Copy squadron's `DEVLOG.md` and `project-documents/user/archive/devlog/` into a scratch project registered with `cf init`. Lower the limit below its size and run `cf devlog archive`. Moved sections sit directly above the existing newest section in the existing quarter file, and the preamble is unchanged. Caveat: no squadron checkout was available when this was verified, so this property is covered by the squadron-format fixture in `packages/core/tests/devlog/archiveDevlog.test.ts` ("prepends into a squadron-format archive"). Run it on a real squadron copy when one is at hand.
7. **Clean up.**
   ```bash
   git restore DEVLOG.md .context-forge.toml && rm -r project-documents/user/archive/devlog
   git status --short  # expect no changes from this walkthrough
   # (or `cf config unset devlog.max_bytes` / `devlog.target_bytes` instead of restoring .context-forge.toml)
   ```

## Implementation Notes

### Development Approach

1. Parser and planner with fixtures from the real files, including the conservation test.
2. `archiveDevlog` writer and config keys.
3. `cf devlog archive`.
4. `devlog-size` rule and finding.
5. Fix action and the multi-path changes to routed fixes.
6. README, then the walkthrough.

Effort: 3/5. The slice plan's 2/5 predates the routed-fix changes in D9.

### Special Considerations

- The kept size is approximate by up to one section below the target, by design. A cut never overshoots except under D5.
- cf's own DEVLOG will cross the default limit soon after this ships, so its first real archive run is likely within a few releases.
