---
docType: tasks
slice: devlog-size-based-archiving
project: context-forge
lld: user/slices/936-slice.devlog-size-based-archiving.md
dependencies:
- 213
- 923
projectState: main at 0.19.25. DEVLOG.md has no size control; routed fixes (slice
  213) assume one written file per fix. Design reviewed (CONCERNS, resolved in the
  design).
dateCreated: 20261105
dateUpdated: 20261106
status: complete
turns: 30
promptTokens: 1064082
cachedTokens: 992799
cacheWriteTokens: 71249
completionTokens: 17428
durationSeconds: 120.9
costUsd: 0.558922
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-sonnet-5-5:
    rounds: 3
    costUsd: 0.5589223
    completionTokens: 17428
revision_number: 2
---

## Context Summary

- Slice 936 fixes GitHub #141. It adds a size-triggered rollover of `DEVLOG.md` into quarterly archives at `project-documents/user/archive/devlog/DEVLOG-YYYY-Qn.md`, through `cf devlog archive [--dry-run]` and a `devlog-size` rule in `cf check` / `workflow_check` whose `archive-devlog` fix runs under `--fix`.
- The design's decisions D1–D11, API Contracts and Success Criteria are the spec. Do not widen them: no section splitting, no new MCP tool, no guide edits, no DEVLOG pointer line, no CHANGELOG changes. There is no D7 in the design.
- Key files (new): `packages/core/src/devlog/{devlogSections,planDevlogArchive,archiveDevlog}.ts`, `packages/core/src/introspection/devlogSizeFinding.ts`, `packages/cli/src/commands/devlog.ts`. Key files (changed): `core/src/config/ConfigKeys.ts`, `core/src/node.ts`, `core/src/introspection/{ConsistencyChecker,routedFixes,fixOwnership,types,ProjectModelBuilder}.ts`, `cli/src/index.ts`, `README.md`.
- Tests: core under `packages/core/tests/` (`devlog/`, `introspection/`, `config/`), CLI under `packages/cli/tests/`. Pure parsing and planning tests use no filesystem. Parser fixtures must include excerpts of cf's real `DEVLOG.md` and squadron's archive format (project parser rule).
- Regression gate: `routedFixes.test.ts`, `fixOwnership.test.ts` and `mergeCheckResults.test.ts` must pass unmodified until Task 8, where only added tests may change them.
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published package.
- Target is `main` unless `cf config get git.integration_branch` says otherwise.
- The D10 guide-agent request (design Integration Requirements) is a post-release step by definition, so it is not a task here; Phase 6 ends at a commit. It is sent when the release ships.
- Next planned slice: none in the 900 plan.

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Read `cf config get git.integration_branch`; call its value (or `main` if empty) the target.
  - [x] Create `936-slice.devlog-size-based-archiving` from the target and switch to it.
  - [x] Success: `git branch --show-current` prints the slice branch.

- [x] **Task 1: Heading parser and quarter mapping** (effort: 3)
  - [x] Create `core/src/devlog/devlogSections.ts`. Export `parseDevlog(text)` returning the preamble and an ordered list of dated sections, each holding its exact source text, its date heading, and its `{year, quarter}`.
  - [x] Heading rules per D2: level-2 heading outside a code fence; `YYYYMMDD` or `YYYY-MM-DD` (first date in the heading wins; end of line or non-digit after it; trailing text ignored); or `YYYY-MM`. Month outside 1–12 or day outside 1–31 makes the heading undated. Quarter is ⌈month ÷ 3⌉.
  - [x] Section boundaries per D3: preamble is everything above the first dated heading; a section runs to the next dated heading; undated `##` headings below the first dated heading stay inside the section above. Section text is kept byte-for-byte, including CRLF.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 1T: Parser tests** (effort: 3)
  - [x] Create `core/tests/devlog/devlogSections.test.ts` with a fixture of excerpts from cf's real `DEVLOG.md` covering every D2 form: `## 20260331`, `## 2026-11-03`, `## 2025-11-18 (reconstructed from git)`, `## 2026-07-05 – 2026-07-06`, `## 2025-10 (summary)`, the out-of-order `## 2026-07-18` under `## 2026-07-17`, and separator lines.
  - [x] Add a squadron-format archive excerpt (preamble citing #141, newest-first sections).
  - [x] Cover: `## 2025-09 (summary)` maps to 2025 Q3; invalid month/day is undated; a `##` line inside a code fence is not a heading; a literal `## YYYYMMDD` template heading in the preamble stays preamble; an undated `##` below a dated one stays in the section above; no dated headings gives an empty section list; CRLF text is preserved; the file without a trailing newline parses.
  - [x] Success: all pass.

- [x] **Task 2: Archive planner** (effort: 3)
  - [x] Create `core/src/devlog/planDevlogArchive.ts` exporting a pure `planDevlogArchive(parsed, targetBytes)` returning kept text, moved sections grouped by quarter key (`YYYY-Qn`), and a `reason` field for the no-move cases.
  - [x] Positional cut per D4: walk from the top, keep sections while preamble plus kept bytes stay at or under `targetBytes`; the first section that would exceed it and everything below moves, even if a smaller later one would fit. Each moved section is grouped by its own heading's quarter; relative order within a quarter is preserved.
  - [x] Size is measured in bytes (UTF-8), not characters.
  - [x] The newest (first) section is always kept (D5). When nothing moves, return the reason: no dated headings (D3) or newest section alone exceeds the target (D5).
  - [x] Moved sections are written ending in a blank line (D6); other section text is unchanged.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 2T: Planner tests** (effort: 3)
  - [x] Create `core/tests/devlog/planDevlogArchive.test.ts`.
  - [x] Conservation test: for several generated and real-fixture inputs, every section's text appears exactly once across kept output and archives, apart from the D6 trailing whitespace.
  - [x] Cover: positional cut with a small section below a too-big one still moving; out-of-order heading filed by its own quarter; multibyte text counted in bytes; one huge section kept whole with the D5 reason; no dated headings with the D3 reason; CRLF file; no trailing newline not joining the next heading; kept size at or under target except under D5.
  - [x] Success: all pass.

Before committing, run format, lint, typecheck and the core devlog tests.

**Commit**: `feat(core): add DEVLOG section parser and archive planner`

- [x] **Task 3: Config keys** (effort: 2)
  - [x] In `core/src/config/ConfigKeys.ts` add `devlog.max_bytes` (default `200000`) and `devlog.target_bytes` (default `100000`), both `ConfigScope.Shared`, each with a `validate` that requires a positive integer, following the shape of `workflow.auto_fix`.
  - [x] Add the single owner of the pair rule (D1): `readDevlogLimits(config)` reads both values and calls a pure `assertDevlogLimits(max, target)`, which throws an error naming both keys when `target_bytes >= max_bytes`. No other task re-implements this comparison: `archiveDevlog` (Task 4) calls `assertDevlogLimits`, the CLI (Task 5) lets its error print, and the finding builder (Task 6) catches it and turns it into an `error` finding.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 3T: Config tests** (effort: 2)
  - [x] Add tests in `core/tests/config/` (extend the existing keys test file if one exists): defaults resolve; `0`, negative, fractional and non-numeric values are rejected; both keys are shared scope; the pair helper throws for `target >= max` and names both keys; equal values throw.
  - [x] Success: all pass, existing config tests unchanged.

- [x] **Task 4: Archive writer** (effort: 4)
  - [x] Create `core/src/devlog/archiveDevlog.ts` exporting `DEVLOG_FILE`, `DEVLOG_ARCHIVE_DIR` (`project-documents/user/archive/devlog`) and `archiveDevlog(options)`; export from `core/src/node.ts`. Options: checkout path, max and target bytes, project name, today's date (passed in, no inline clock), dry-run flag. Returns before/after sizes and per-archive section counts, or a no-op/reason result.
  - [x] Replace the hard-coded `'DEVLOG.md'` at `ProjectModelBuilder.ts:314` with `DEVLOG_FILE`.
  - [x] Order per D11: `stat` first; at or under the limit returns without reading. Then read DEVLOG.md and every existing target archive as strict UTF-8 (a decode or read failure stops before any write). Compute the whole plan in memory.
  - [x] New archive format per D6 (frontmatter `docType: devlog`, `project`, `dateCreated`, `dateUpdated`; title `# Development Log Archive: {YYYY} Q{n}`; the "Newest entries first" line). Existing archives get moved sections inserted before their first dated heading via the same parser (appended when it has none); their frontmatter and preamble are untouched.
  - [x] Idempotence per D11: a section whose exact text is already in its target archive is not written again, but is still cut from DEVLOG.md.
  - [x] Call `assertDevlogLimits` (Task 3) before anything else.
  - [x] Write archives first (create the directory as needed), then DEVLOG.md last. Missing DEVLOG.md names the expected path. Dry-run writes nothing.
  - [x] Concurrent-edit guard (D11): after the archive writes and immediately before the DEVLOG.md write, re-read DEVLOG.md and compare it with the text the plan was made from. If it changed, fail without writing it. Test seam: `archiveDevlog` options take an optional `beforeFinalWrite` callback, awaited after the archive writes and before the re-read; production code never sets it.
  - [x] Any failure after the first write (including a changed DEVLOG.md or a failed directory creation) throws an error naming the cause and every file already written, and saying to review them with `git diff`. No rollback.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 4T: Writer tests** (effort: 4)
  - [x] Create `core/tests/devlog/archiveDevlog.test.ts` using temp directories.
  - [x] Cover: at or under limit changes nothing and reads nothing; over limit creates new archives with valid frontmatter and moves sections, and DEVLOG.md ends at or under target; prepend into an existing squadron-format archive leaves its preamble and existing sections unchanged with moved sections directly above the old newest; archive with no dated heading gets an append; dry-run writes nothing; missing DEVLOG.md error; `target >= max` error; non-UTF-8 archive fails before any write with the path named and no files changed.
  - [x] Concurrent edit: change DEVLOG.md between the archive writes and the final write (edit the file from the `beforeFinalWrite` callback); assert the failure names the archives written and the new entry is intact. Then re-run and assert no section is duplicated and DEVLOG.md is at or under target.
  - [x] A write failure (for example a read-only archive directory) names the path, the cause and the files already written.
  - [x] Success: all pass.

Before committing, run format, lint, typecheck and the core tests.

**Commit**: `feat(core): add devlog archive writer and config keys`

- [x] **Task 5: `cf devlog archive` command** (effort: 3)
  - [x] Create `cli/src/commands/devlog.ts` exporting `registerDevlogCommand`, and register it in `cli/src/index.ts`. Wiring and output only; all logic stays in core.
  - [x] Resolve project and checkout path as `cf docs map` does (`resolveProjectWorktree` / `resolveProject`), accept `--project <id>` and `--dry-run`, read both config keys, and call `archiveDevlog`.
  - [x] Output per the API Contracts table: the before/after report with per-file section counts (`Would move` under `--dry-run`); the `Nothing to archive` line; the D3/D5 reasons. Errors exit 1 with the messages in the table. The command never commits.
  - [x] Success: `pnpm -r build` passes and `node packages/cli/dist/index.js devlog archive --help` lists both flags.

- [x] **Task 5T: Command tests** (effort: 3)
  - [x] Add CLI tests following the pattern of an existing command test (for example the docs command tests), against a temp project.
  - [x] Cover output and exit-code mapping only, since core behavior and error causes are tested in Task 4T: moved report, dry-run wording with no writes, within-limit message with exit 0, nothing-movable reason with exit 0, and one representative failure (missing DEVLOG.md) exiting 1 with the error text printed.
  - [x] Success: all pass.

Before committing, run format, lint, typecheck and the CLI tests.

**Commit**: `feat(cli): add cf devlog archive command`

- [x] **Task 6: `devlog-size` finding builder** (effort: 3)
  - [x] `types.ts` (D9): add `'archive-devlog'` to the `fixAction.type` union and to `FixLogEntry.action`; add optional `additionalPaths: string[]` to `fixAction` and `FixLogEntry`. This comes first because the finding below uses them.
  - [x] Create `core/src/introspection/devlogSizeFinding.ts` exporting a function that takes a view's checkout path and config values and returns zero or one `ConsistencyFinding`. It reuses `DEVLOG_FILE`, the parser and the planner.
  - [x] Behavior per the API Contracts finding table: `stat` first; missing DEVLOG.md or at/under limit returns nothing; over the limit parses and plans. `rule: 'devlog-size'`, absolute `location`, description `DEVLOG.md is {size} bytes, over devlog.max_bytes ({max})`.
  - [x] Plan moves sections: `warning`, `fixable`, suggestedFix names `cf check --fix` or `cf devlog archive`, with `fixAction` of type `archive-devlog`, `filePath` DEVLOG.md, `subjectIndex: null` (D8), detail `{ targetBytes, projectName }`, and `additionalPaths` listing each archive file the plan would write.
  - [x] Nothing movable: non-fixable `warning` whose suggestedFix is the D3 or D5 reason (D5 text says the newest section alone exceeds the limit and must be edited by hand).
  - [x] Catch the `assertDevlogLimits` error from Task 3 (do not re-compare the values) and report it as a non-fixable `error` finding. Likewise a non-ENOENT `stat` or read error, or an unreadable or non-UTF-8 existing archive: non-fixable `error` finding naming the path and cause.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 6T: Finding builder tests** (effort: 3)
  - [x] Create `core/tests/introspection/devlogSizeFinding.test.ts`.
  - [x] Cover: no file, at limit and under limit give no finding; over limit with movable sections gives a fixable warning with the exact description and `additionalPaths`; single huge section and no-dated-headings give the non-fixable warnings with the D5 and D3 reasons; invalid key pair gives an `error`; a non-ENOENT `stat` error (for example DEVLOG.md replaced by a directory path component that is a file) gives an `error` finding; non-UTF-8 archive gives an `error` naming it.
  - [x] Success: all pass.

- [x] **Task 7: Wire the rule into `ConsistencyChecker`** (effort: 2)
  - [x] Add the aggregate rule beside Rules 12 and 15 in `checkAll`, as a thin call to the Task 6 function, once per view. Like Rule 15, it returns nothing when the checker has no `ConfigManager`. `--slice N` does not run it.
  - [x] Add `devlog-size` to the rule-name list or enum wherever Rules 12 and 15 are registered, defining the string once.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 7T: Rule integration tests** (effort: 3)
  - [x] Extend the `ConsistencyChecker` tests: over-limit project yields one `devlog-size` finding; at/under limit is silent; no `ConfigManager` yields none; `checkAll` for a slice-scoped run does not include it.
  - [x] Add `mcp-server/tests/workflowCheckDevlog.test.ts`, modeled on `workflowCheckRouting.test.ts`: an over-limit project run through the `workflow_check` tool returns the `devlog-size` finding with `fixable` true and the `archive-devlog` fixAction (Success Criterion 7).
  - [x] Merge test in `mergeCheckResults.test.ts` additions only: two over-limit views at the same size collapse to one displayed finding, at different sizes show one each, and the routing plan is identical in both cases (D8). (routing-plan identity covered by routedFixes.multiPath.test.ts, not the merge test)
  - [x] Success: all pass; the pre-existing tests in these files are unmodified.

- [x] **Task 8: Multi-path fix support in routed fixes** (effort: 4)
  - [x] The `types.ts` additions for `archive-devlog` and `additionalPaths` already landed in Task 6.
  - [x] `routedFixes.ts`: add a companion to `fixRelPath` returning all of a finding's relative paths (`[filePath, ...additionalPaths]`; exactly `[filePath]` when `additionalPaths` is absent). `fixRelPath` itself stays.
  - [x] `gateByReadiness`: probe all paths, and defer the fix as `file-dirty` if any is dirty.
  - [x] `commitViewWrites`: commit every path in the log entry, and make the `COMMIT_FAILED` filter match a finding if any of its paths was written. Leave `restorePathsToHead`, owner resolution and the commit message unchanged (D9 scope boundary).
  - [x] `ConsistencyChecker.applyFixes`: handle `archive-devlog` by calling `archiveDevlog` with the finding's detail (`targetBytes`, `projectName`), `maxBytes` from `readDevlogLimits` on the checker's `ConfigManager` (Task 3), and today's date from the date source `applyFixes` already uses for its other fixes (passed in, no new clock), and record the log entry with `additionalPaths`. Errors flow into the existing `fixErrors`.
  - [x] Check `fixOwnership.ts` needs no change (`subjectIndex: null` resolves to the primary checkout via rule 3); change only if a type switch requires it.
  - [x] Success: `pnpm -r build` passes, and `routedFixes.test.ts`, `fixOwnership.test.ts`, `mergeCheckResults.test.ts` pass unmodified.

- [x] **Task 8T: Routed-fix tests** (effort: 4)
  - [x] Add tests in new files (for example `routedFixes.multiPath.test.ts`, `ConsistencyChecker.devlogFix.test.ts`) so the existing files stay unmodified.
  - [x] Multi-path readiness: a dirty existing archive file defers the fix as `file-dirty` and nothing is written; a clean tree proceeds.
  - [x] Single-path regression: a fix with no `additionalPaths` yields exactly `[filePath]` from the companion helper.
  - [x] Commit in a non-invoking primary checkout: DEVLOG.md and every archive land in one commit.
  - [x] A commit that fails through a pre-commit hook: the new archive files are removed and DEVLOG.md restored, reported as `commit-failed`.
  - [x] Two or more checkouts: `--fix` archives only in the primary; a worktree's finding is deferred `not-owner` and its suggestedFix names `cf devlog archive`.
  - [x] `workflow.auto_fix` path: with it on, a plain `cf check` archives above the limit without a prompt, and commits when the owning checkout is non-invoking. (covered by mcp-server/tests/workflowCheckDevlog.test.ts)
  - [x] `applyFixes` surfaces a writer failure (for example a concurrent edit) through `fixErrors`.
  - [x] Success: all pass.

There is no commit between Tasks 6 and 8: the finding is marked fixable in Task 6, so it is committed only together with the fix that resolves it. Before committing, run format, lint, typecheck and the core, CLI and `mcp-server` tests.

**Commit**: `feat(core): add devlog-size rule and archive-devlog fix`

- [x] **Task 9: README** (effort: 1)
  - [x] Document `cf devlog archive [--dry-run]`, both config keys with defaults, and the archive location in the README's command and config sections.
  - [x] State that `workflow.auto_fix` can archive and commit DEVLOG.md without a prompt.
  - [x] Success: the README names the command, `devlog.max_bytes`, `devlog.target_bytes`, and the auto_fix behavior.

**Commit**: `docs: document cf devlog archive and devlog config keys`

- [x] **Task 10: Verification walkthrough** (effort: 3)
  - [x] Run `pnpm -r build`, then the design's Verification Walkthrough steps 1–7 with the local build (`node packages/cli/dist/index.js`) against cf's real DEVLOG, restoring it afterward. Step 6 uses a scratch copy of squadron's DEVLOG and archives if a squadron checkout is present in the environment; otherwise use the squadron-format fixture from Task 1T and say so in the note. Note: no squadron checkout exists in this environment, so step 6 used the squadron-format fixture from Task 1T.
  - [x] Confirm the conservation counts in step 3 match, new archives pass `cf validate frontmatter`, and `git status --short` is clean of walkthrough changes at the end.
  - [x] Run the full format, lint, typecheck and all package test suites once.
  - [x] Success: every walkthrough expectation holds, and all suites pass. This task is the final gate and changes nothing, so it has no commit marker.
