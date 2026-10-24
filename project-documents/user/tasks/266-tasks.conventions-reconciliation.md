---
docType: tasks
slice: conventions-reconciliation
project: context-forge
lld: user/slices/266-slice.conventions-reconciliation.md
dependencies:
- 261
projectState: main after slices 260-265 (built and merged). 261's `RULE_FILE_PATHS`
  and `presentPaths` are package-private in `packages/core/src/detection/presentPaths.ts`
  and used by `adoptionResolver.ts`. The marker literals live in `packages/cli/src/commands/ideTargets.ts`,
  and `PREMANAGED_BACKUP_SUFFIX` lives in `packages/cli/src/ideInstall/paths.ts`.
  `compileClaudeRules` has no `trailing` parameter yet. No `ruleReconciliation/` module,
  `cf rules` command or `rule-resolutions.json` exists. Global `cf` is the published
  npm package, not the local build.
dateCreated: 20261024
dateUpdated: 20261024
status: complete
turns: 37
promptTokens: 1756049
cachedTokens: 1640942
cacheWriteTokens: 115065
completionTokens: 29734
durationSeconds: 200.4
costUsd: 0.922062
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

## Context Summary

- Slice 266 reconciles an adopted project's own rules with the guide's rules. cf inventories both sides, stores each PM decision as a resolution (`.context-forge/rule-resolutions.json`), and renders the resolutions into every composite managed block on each `setup-ide` run. The agent does the comparison through a guide prompt. cf never judges whether two rules conflict. The slice design (`user/slices/266-slice.conventions-reconciliation.md`) is the spec. D1-D8, API Contracts and Success Criteria are referenced below by name.
- Slice 261 has landed, so 266 edits shipped 261 code (`RULE_FILE_PATHS`, `renderAdoptionFacts` tests). That change is a task here, not a revision of 261's design.
- Excluded (design): any cf judgement of rule meaning, editing project-owned text, removing guide rule text, the prompt's wording (ai-project-guide owns it), MCP tools, a `cf next` recommendation, a "not a conflict" record (#125), a removal command (#126), and the #123 audience split. File an issue for anything else found rather than adding it.
- Local build: the global `cf` is the published package. Test local changes with `node packages/cli/dist/index.js` after `pnpm -r build`. Tests run per package with `pnpm --filter @context-forge/core test` and `pnpm --filter @context-forge/cli test`; root `pnpm lint` and `pnpm typecheck` cover everything.
- Conventions that apply to every task: markers, file name, section heading and version constant are each defined once (no scattered comparison values). No silent fallbacks: malformed input throws. Any try/catch re-raises or handles one named exception with a comment. New files stay under about 300 lines. Existing tests must keep passing unchanged unless a task says otherwise.
- Branch: `266-slice.conventions-reconciliation`, forked from the target (read it with `cf config get git.integration_branch`; empty means `main`). No merge or push task appears here. Phase 7 merges after code review.
- Next planned slice: none in this initiative consumes 266.

---

## Tasks

### 1. Branch setup

- [x] **1.1 Create the slice branch**
  - [x] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`; call its value (or `main` when empty) the target
  - [x] Confirm you are on the target, then `git checkout -b 266-slice.conventions-reconciliation {target}`. If the branch already exists, switch to it
  - [x] **Success:** `git branch --show-current` prints `266-slice.conventions-reconciliation`

---

### 2. Core: markers move to core

Goal (D7): the marker literals and backup suffix are defined once, in core, and the cli modules re-export them.

- [x] **2.1 Create `packages/core/src/ruleReconciliation/markers.ts`**
  - [x] Move the definitions of `MANAGED_BEGIN_MARKER`, `MANAGED_END_MARKER`, `GENERATED_MARKER` out of `packages/cli/src/commands/ideTargets.ts`, and `PREMANAGED_BACKUP_SUFFIX` out of `packages/cli/src/ideInstall/paths.ts`, into the new file. Keep the doc comments and exact string values
  - [x] Leave `MANAGED_MARKER` and `MANAGED_MARKER_END` (legacy forms) where they are
  - [x] Create `packages/core/src/ruleReconciliation/index.ts` exporting `markers.ts`, and add `export * from './ruleReconciliation/index.js';` to `packages/core/src/node.ts` next to the adoption export (the module reads the filesystem, so it belongs in `node.ts`, not `index.ts`)
  - [x] **Success:** each of the four literals is defined in exactly one file (`grep -rn "BEGIN:context-forge" packages/*/src` shows one definition)

- [x] **2.2 Re-export from the cli modules**
  - [x] In `ideTargets.ts`, replace the moved definitions with `export { MANAGED_BEGIN_MARKER, MANAGED_END_MARKER, GENERATED_MARKER } from '@context-forge/core/node';`. Keep `MANAGED_MARKERS`, which still uses them (import them for local use as well)
  - [x] In `paths.ts`, do the same for `PREMANAGED_BACKUP_SUFFIX`
  - [x] Existing importers (`managedSection.ts`, `manifest.ts`, `dryRun.ts`, `targets/copilot.ts`, `commands/setup-ide.ts`) keep their import paths unchanged
  - [x] **Success:** `pnpm -r build` and `pnpm typecheck` pass with no importer edits

- [x] **2.3 Verify and commit**
  - [x] Run `pnpm --filter @context-forge/cli test` and `pnpm --filter @context-forge/core test`
  - [x] **Success:** all existing tests pass unchanged; `pnpm lint` is clean
  - [x] Commit: `refactor: move managed marker literals to core`

---

### 3. Core: resolution schema and store

- [x] **3.1 Implement `ruleReconciliation/schema.ts`**
  - [x] Define `RULE_RESOLUTIONS_VERSION = 1`, `RULE_RESOLUTIONS_FILE = 'rule-resolutions.json'`, and `RULE_RESOLUTIONS_DIR = '.context-forge'` once each. Reuse the manifest directory name only by value; do not import from cli
  - [x] Define `RuleResolution` (`guideRule`, `projectSource`, `statement`), `RuleResolutionsFile` (`version`, `resolutions`), and `RuleResolutionsError` (typed error whose message names the file and the problem)
  - [x] Implement `validateRuleResolution(r)` and `validateRuleResolutionsFile(data, file)` enforcing D5: unknown `version`; non-object or missing fields; `statement` missing/empty, containing `\n` or `\r`, or containing any marker string from `markers.ts`; `guideRule` or `projectSource` containing a backtick
  - [x] **Success:** each D5 rejection throws `RuleResolutionsError` with a message naming the file and the offending field

- [x] **3.2 Test the schema** (`packages/core/tests/ruleReconciliation/schema.test.ts`)
  - [x] Cases: valid file; wrong version; non-JSON-object; missing statement; empty statement; statement with newline; statement containing each of the three marker strings; backtick in `guideRule`; backtick in `projectSource`; two records sharing a pair are both valid
  - [x] **Success:** tests pass; every D5 rule has a failing-input case

- [x] **3.3 Implement `ruleReconciliation/store.ts`**
  - [x] `readRuleResolutions(root)`: absent file returns an empty list; otherwise parse JSON and validate. A JSON parse failure throws `RuleResolutionsError` naming the file. Only ENOENT counts as absent; every other read error propagates
  - [x] `addRuleResolution(root, resolution)`: validate the record, read the current file (validating it too), append, write to a temp file in the same directory, then `rename` into place. Create `.context-forge/` when missing. Write and rename failures propagate as errors naming the file; no retry
  - [x] Output is two-space-indented JSON with a trailing newline, records in file order
  - [x] Export from `ruleReconciliation/index.ts`
  - [x] **Success:** reading an absent file returns `[]`; a malformed file throws before anything is written

- [x] **3.4 Test the store** (`packages/core/tests/ruleReconciliation/store.test.ts`, use a temp dir per test)
  - [x] Cases: absent file reads as empty; add creates `.context-forge/` and the file; add appends in order and keeps duplicates of a pair as separate records; add to a malformed file throws and leaves the file byte-identical; invalid record is rejected without touching the file; no temp file is left after a successful write; a read of unparseable JSON throws `RuleResolutionsError`
  - [x] **Success:** tests pass
  - [x] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: add rule resolution schema and store`

---

### 4. Core: rule-file list and managed-block range

- [x] **4.1 Export `RULE_FILE_PATHS` and add `.github/instructions`**
  - [x] In `packages/core/src/detection/presentPaths.ts`, add `.github/instructions` to `RULE_FILE_PATHS` (after `.github/copilot-instructions.md`) and update the header comment, which currently says the module is not re-exported
  - [x] In `packages/core/src/detection/index.ts`, export `RULE_FILE_PATHS` and `presentPaths`
  - [x] **Success:** `adoptionResolver.ts` still compiles and uses the same constant; `.github/instructions` is the only list change

- [x] **4.2 Update 261's tests**
  - [x] `packages/core/tests/detection/presentPaths.test.ts`: add a case where `.github/instructions` exists and appears in the result
  - [x] `packages/core/tests/adoption/adoptionFacts.test.ts`: add a case where `renderAdoptionFacts` lists `.github/instructions` in the `ruleFiles` bullet when the directory is present
  - [x] **Success:** the new cases pass and no existing case changed
  - [x] Commit: `feat: export rule file paths and add .github/instructions`

- [x] **4.3 Implement `managedBlockRange` in `ruleReconciliation/projectSources.ts`**
  - [x] Signature: takes the file's lines (an array of strings, as produced by cli's `toRecords`) and returns `{ beginLine, endLine }` (1-based, inclusive) or `'none'` or `'broken'`. Whole-line match on `MANAGED_BEGIN_MARKER` / `MANAGED_END_MARKER`, the same rule `managedState` uses today: no markers is `'none'`; exactly one BEGIN before exactly one END is a range; anything else is `'broken'`
  - [x] Core must not import cli's `lines.ts`. Callers split the text
  - [x] Export `managedBlockRange` from `ruleReconciliation/index.ts` so cli can import it from `@context-forge/core/node`
  - [x] **Success:** the function is pure, has no filesystem access, and is importable from `@context-forge/core/node`

- [x] **4.4 Make cli `managedState` call it**
  - [x] In `packages/cli/src/ideInstall/managedSection.ts`, replace the inline BEGIN/END index logic in `managedState` with a call to `managedBlockRange(lines)`. Keep the legacy-marker check (`'legacy'` vs `'unmanaged'`) in cli, applied only when the range is `'none'`
  - [x] **Success:** `managedState` returns the same five states for the same inputs; `managedState` no longer scans BEGIN/END itself; it calls `managedBlockRange`. (`replaceBlock` keeps its own walk; it only runs after `managedState` has returned `'managed'`, so the pair is already valid)

- [x] **4.5 Test `managedBlockRange` and confirm `managedState` is unchanged**
  - [x] New `packages/core/tests/ruleReconciliation/managedBlockRange.test.ts`: no markers; one valid pair with the expected 1-based lines; two BEGIN; two END; END before BEGIN; BEGIN only; END only; markers with surrounding text are not matched (whole-line)
  - [x] Run `pnpm --filter @context-forge/cli test`; `managedSection.test.ts` and `managedSections.test.ts` must pass unchanged
  - [x] **Success:** all pass
  - [x] Commit: `refactor: share managed block range scan between cli and core`

---

### 5. Core: project rule-source enumeration

- [x] **5.1 Implement `projectRuleSources(root, installedPaths)` in `projectSources.ts`** (D6)
  - [x] Candidates are `RULE_FILE_PATHS` filtered with `presentPaths`. Return a list of `{ path, kind: 'composite' | 'standalone', managedBlock? }`. Paths are checkout-relative with `/` separators
  - [x] Composites are `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`. Define that list once as a named constant, near `RULE_FILE_PATHS`. For a composite, read the file and set `managedBlock` to the `managedBlockRange` result: a `{ beginLine, endLine }` range, `'none'` when it has no block, or `'broken'` when the pair is unusable. Do not guess a range for `'broken'`
  - [x] Directory entries (`.claude/rules`, `.cursor/rules`, `.github/instructions`) expand to every file beneath them (recursive, sorted in plain code-unit order). Everything else is a standalone file
  - [x] Exclude: paths in `installedPaths` (checkout-relative); files containing `GENERATED_MARKER`; files ending in `PREMANAGED_BACKUP_SUFFIX`. Do not exclude a composite merely because it has a managed block: its project-owned part is the source
  - [x] Root only: no nested `CLAUDE.md`. A candidate that cannot be read throws an error naming the file (never skipped). ENOENT is "absent" and handled by `presentPaths`
  - [x] Export from `ruleReconciliation/index.ts`
  - [x] **Success:** deterministic output for a given tree; no file is read for meaning

- [x] **5.2 Test enumeration** (`packages/core/tests/ruleReconciliation/projectSources.test.ts`)
  - [x] Fixture uses the real layout: a CLAUDE.md with project text above a managed block, built by running the current `writeManagedSection`/`compileClaudeRules` output format (BEGIN line, content, END line). Add project text after the block in one case
  - [x] Cases: composite with a valid block reports the correct line range; composite with no block reports `'none'`; broken markers report `'broken'`; installed paths are excluded; a `.github/instructions/*.instructions.md` carrying the generated marker is excluded; a `*.pre-context-forge` backup is excluded; a hand-written `.cursor/rules/team-style.mdc` is included; directory expansion lists nested files; a nested `sub/CLAUDE.md` is ignored; an unreadable candidate throws naming the file
  - [x] **Success:** tests pass
  - [x] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: enumerate project rule sources in core`

---

### 6. CLI: guide rule entries

- [x] **6.1 Implement `packages/cli/src/ideInstall/guideRules.ts`** (D7, D1)
  - [x] `guideRuleEntries(guideDir, exclusions)`: list the markdown files in `guidePaths(guideDir).rules` (use `listMarkdownFiles`, `hasAlwaysApply`). Each entry has `rule` (basename), `path` (relative to the checkout, as `relativeToRoot` gives), `kind: 'alwaysApply' | 'scoped'`, and `excluded`
  - [x] Delivery is decided in one place, inside `guideRuleEntries`, when it sets each entry's `excluded`: an alwaysApply rule is never excluded and must NOT be passed to `exclusions.isExcluded` (that call records a match and would hide the "names an always-on rule and was ignored" warning); a scoped rule is excluded exactly when `exclusions.isExcluded(rule)` is true
  - [x] Export `delivered(entry: GuideRuleEntry): boolean`, which returns `!entry.excluded`. This is the one predicate #123 later extends. The inventory (7.1) reports `excluded`; the renderer (10.1) calls `delivered(entry)` on the entry matching a resolution's `guideRule`. Neither re-derives delivery
  - [x] Missing rules directory: throw a plain error naming the path (no empty fallback)
  - [x] **Success:** no code outside `guideRules.ts` consults `exclusions` to decide delivery

- [x] **6.2 Test guide rule entries** (`packages/cli/tests/ideInstall/guideRules.test.ts`, reuse the `fixture_guide` helpers in `harness.ts`)
  - [x] Cases: alwaysApply and scoped kinds; exclusion by pattern marks a scoped rule excluded; an exclusion pattern naming an alwaysApply rule leaves it delivered and does not record a match (so `warnUnmatched` still prints the ignored-pattern warning); missing rules directory throws
  - [x] **Success:** tests pass
  - [x] Commit: `feat: add guide rule entries with a single delivery predicate`

---

### 7. CLI: `cf rules inventory`

- [x] **7.1 Add an installed-path reader to `manifest.ts`**
  - [x] Export `readInstalledPaths(root)`: for every `.context-forge/*.manifest` in the checkout, return the paths it lists. A manifest line is `<cksum> <size> <checkout-relative path>` (for example `1890873339 3466 .claude/agents/task-checker.md`, as in this repo's `.context-forge/claude.manifest`); take the third field onward as the path, split on the first two spaces only. A missing `.context-forge/` directory returns an empty list; a line with fewer than three fields throws an error naming the manifest file
  - [x] **Success:** paths are checkout-relative with `/` separators, the form `projectRuleSources` expects

- [x] **7.2 Test the reader** (extend `packages/cli/tests/ideInstall/manifest.test.ts`)
  - [x] Cases: parses a manifest written by a real `setup-ide claude` run; merges several manifests; a path containing spaces survives; missing directory gives `[]`; a malformed line throws naming the file
  - [x] **Success:** tests pass
  - [x] Commit: `feat: read installed paths from manifests`

- [x] **7.3 Implement the shared inventory builder `packages/cli/src/commands/rulesInventory.ts`**
  - [x] `buildInventory(projectPath)` returns `{ guideRules, projectSources, resolutions }`. Guide dir is `path.join(projectPath, GUIDE_RELATIVE_PATH)`; call `ensureGuideReady` and fail with the existing "Guides are not installed" style `UserError` if absent
  - [x] `guideRules` from `guideRuleEntries` (exclusions from `rules.exclude` via `ConfigManager`, parsed with `parseRulesExclude`; export and reuse the existing `readRulesExclude` from `setup-ide.ts` rather than duplicating it). `projectSources` from `projectRuleSources(projectPath, readInstalledPaths(projectPath))`. `resolutions` from `readRuleResolutions(projectPath)`; a malformed file fails with the `RuleResolutionsError` message
  - [x] **Success:** read-only; used by both `inventory` and `resolve`

- [x] **7.4 Test the builder** (`packages/cli/tests/commands/rulesInventory.test.ts`; follow how `setup-ide.test.ts` builds a project and guide)
  - [x] Cases: lists delivered and excluded guide rules; a hand-written CLAUDE.md is a composite with the managed block range after a real `setup-ide claude` run; cf-installed `.claude/rules/*` files are absent; broken markers reported; existing resolutions echoed; malformed resolutions file fails naming the file; missing guide fails explicitly
  - [x] **Success:** tests pass
  - [x] Commit: `feat: add rules inventory builder`

- [x] **7.5 Add the `inventory` subcommand in `packages/cli/src/commands/rules.ts`** with `registerRulesCommand(program)`
  - [x] Project resolution follows `setup-ide`'s pattern (`FileProjectStore`, `resolveProjectId`, `withProjectOption`) with the same `UserError`s when the project or its path is missing
  - [x] Output is JSON only, in the shape under API Contracts, via `printJson`. `--json` is accepted for the documented spelling; plain invocation prints the same JSON
  - [x] Register in `packages/cli/src/index.ts` next to `registerSetupIdeCommand`
  - [x] **Success:** output keys are `guideRules`, `projectSources`, `resolutions`; the command writes nothing

- [x] **7.6 Test the subcommand** (`packages/cli/tests/commands/rules.test.ts`)
  - [x] Cases: `inventory --json` prints the three keys; plain `inventory` prints the same JSON; unknown project fails with a `UserError`
  - [x] **Success:** tests pass
  - [x] Commit: `feat: add cf rules inventory`

---

### 8. CLI: `cf rules resolve`

- [x] **8.1 Add the `resolve` subcommand to `rules.ts`**
  - [x] Arguments `<guideRule> <projectSource>` and required option `--statement <text>`; same `--project` option
  - [x] Validate in this order: `guideRule` is a name in the installed guide's rules, else `UserError` listing the valid names; `projectSource` is in the current inventory, else `UserError` listing the valid paths. Then `addRuleResolution` applies D5 validation and writes
  - [x] On success print exactly: `Recorded resolution <guideRule> vs <projectSource>. Run cf setup-ide <target> to apply.` (leave `<target>` literal, as in the design). It does not run `setup-ide`
  - [x] Use `buildInventory` from 7.3 for the valid names and paths (no duplicated logic)
  - [x] **Success:** a valid call appends one record; every rejection leaves the file unchanged

- [x] **8.2 Test `resolve`** (extend `rules.test.ts`)
  - [x] Cases: records a valid resolution and prints the confirmation line; unknown guide rule rejected with valid names listed; unknown source rejected with valid paths listed; missing `--statement`; multi-line statement; statement containing a marker; backtick in a name; a project source that is a composite is accepted; two resolutions for the same pair are both kept; write failure (make `.context-forge` a file) surfaces an error naming the file
  - [x] **Success:** tests pass
  - [x] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: add cf rules resolve`

---

### 9. ideInstall: `compileClaudeRules` gains `trailing`

- [x] **9.1 Add the parameter** in `packages/cli/src/ideInstall/rules.ts`
  - [x] `compileClaudeRules` takes a `trailing` string, appended to `content` after the rules and before `writeManagedSection`, exactly as `compileAlwaysOnRules` does. Update its one caller (`targets/claude.ts`) to pass `''` for now
  - [x] **Success:** output is byte-identical to before for `trailing = ''`

- [x] **9.2 Test it** (extend `packages/cli/tests/ideInstall/rules.test.ts`)
  - [x] Cases: empty `trailing` produces the same CLAUDE.md content as today; non-empty `trailing` lands inside the BEGIN/END pair, after the last rule
  - [x] **Success:** tests pass; existing snapshots unchanged
  - [x] Commit: `refactor: let compileClaudeRules append trailing sections`

---

### 10. ideInstall: render and warn

- [x] **10.1 Implement `packages/cli/src/ideInstall/resolutions.ts`** (D4, D5)
  - [x] Constants, defined once: the section heading `## Project Rule Resolutions` and the precedence sentence from the design's rendered example
  - [x] `classifyResolutions(resolutions, guideEntries, projectRoot)` returns `{ live, staleGuide, staleProject }`:
    - `staleGuide`: `guideRule` not among the guide entries
    - `staleProject`: `projectSource` not present under `projectRoot` (use core's `pathPresent`; non-ENOENT errors throw)
    - `live`: neither stale **and** `delivered(entry)` (6.1) is true for the entry matching `guideRule`. A not-delivered rule is neither rendered nor reported
  - [x] `renderResolutions(live)`: empty list returns `''` (no heading); otherwise the heading, the precedence sentence, a blank line, then one bullet per resolution in file order: `` - `<guideRule>` vs `<projectSource>`: <statement> ``. Ends with a newline
  - [x] `warnStaleResolutions(classification, out)`: on stderr via `out.statusErr('yellow', …)`, the two messages in D5 verbatim (guide side: "names a guide rule the guide no longer has"; project side: "names a project file that no longer exists"), each ending with the "re-run reconciliation or edit .context-forge/rule-resolutions.json" remedy
  - [x] **Success:** pure functions apart from `pathPresent`; no marker string can appear in output (already prevented by validation)

- [x] **10.2 Test render and classify** (`packages/cli/tests/ideInstall/resolutions.test.ts`)
  - [x] Cases: empty list renders `''`; output matches the design's example exactly for two records; file order kept; a duplicate pair renders two bullets; guide-stale and project-stale are classified and warn with the exact messages; an excluded scoped rule is dropped silently (no warning, no bullet); a `projectSource` that exists only under the `projectRoot` argument is live, and one missing there is stale
  - [x] **Success:** tests pass
  - [x] Commit: `feat: render rule resolutions and warn on stale identities`

---

### 11. ideInstall: wire into `setup-ide`

- [x] **11.1 Carry resolutions through the install**
  - [x] In `commands/setup-ide.ts` `installCheckout`, read `readRuleResolutions(root)` next to `readRulesExclude(root)` and pass it as a new `InstallOptions` field (`ruleResolutions`). A malformed file throws before `installIde` runs, so nothing is written (this is the fail-before-write requirement)
  - [x] In `installer.ts` `installIde`: after building `base`, call `guideRuleEntries`, `classifyResolutions` (with `projectRoot`), and store the `live` list on `InstallContext` (add a `resolutionsSection: string` field to `InstallBase`/`InstallContext`, rendered once). Call `warnStaleResolutions` once per run, next to `warnUnmatched`, so a target that writes two composites warns only once
  - [x] Classify only when `isDirectory(base.guide.rules)` is true. When it is not, skip classification (`resolutionsSection` is `''`): the target's own `requireRulesDir` then aborts the install with its existing error before anything is written, so no resolution is silently dropped
  - [x] **Success:** `ctx.resolutionsSection` is `''` when there is no file or no live resolution

- [x] **11.2 Test the wiring** (`packages/cli/tests/ideInstall/resolutions.install.test.ts`, using `harness.ts`)
  - [x] Cases: a valid resolution produces a non-empty `resolutionsSection` on the context; no file gives `''`; a stale resolution prints its warning once on stderr even for a target that writes two composites, and `installIde` still returns exit code 0 (the stale and excluded rules themselves are tested in 10.2); a malformed resolutions file fails the install and no file in the checkout changed
  - [x] **Success:** tests pass; existing ideInstall tests still pass
  - [x] Commit: `feat: carry rule resolutions through setup-ide`

- [x] **11.3 Emit into every composite**
  - [x] `targets/claude.ts`: pass `ctx.resolutionsSection` as `trailing` to `compileClaudeRules`
  - [x] `targets/agents.ts` `emitAgentsMd`: `trailing` is `index.text` followed by `ctx.resolutionsSection` (so it covers agents, copilot and cursor, all of which call `emitAgentsMd`)
  - [x] `targets/copilot.ts`: pass `ctx.resolutionsSection` as `trailing` for `.github/copilot-instructions.md`
  - [x] No other compiler or merge change; worktree installs and dry runs already go through `installCheckout`/`installTarget`, so they need no new code
  - [x] **Success:** with no resolutions file, `setup-ide` output for all four targets is byte-identical to before

- [x] **11.4a Test per-target rendering** (`packages/cli/tests/ideInstall/resolutions.render.test.ts`, using `harness.ts`)
  - [x] Cases for each composite: CLAUDE.md (claude), AGENTS.md (agents; section follows the scoped "Additional Rules" index), `.github/copilot-instructions.md` and AGENTS.md (copilot), AGENTS.md (cursor): the section is the last thing inside the BEGIN/END pair and text outside the block is untouched
  - [x] Re-running gives byte-identical files. Changing the body of a guide rule file while keeping its basename leaves the rendered section unchanged
  - [x] **Success:** tests pass
  - [x] Run `pnpm lint`, `pnpm typecheck`, and the new test file

- [x] **11.4b Test no-file regression, dry run and worktree** (`packages/cli/tests/ideInstall/resolutions.regression.test.ts`, using `harness.ts`)
  - [x] No-file regression: every target's output matches the existing snapshots byte for byte
  - [x] Dry run (`--dry-run`) previews the section and writes nothing; a worktree install renders that worktree's own resolutions file
  - [x] **Success:** tests pass and all pre-existing ideInstall tests/snapshots pass unchanged
  - [x] Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`; commit: `feat: render rule resolutions in setup-ide composites`

---

### 12. Documentation and guide contract

- [x] **12.1 Document `cf rules` in the CLI reference**
  - [x] In `packages/cli/README.md` Commands Reference, add `cf rules inventory --json` and `cf rules resolve <guideRule> <projectSource> --statement "<text>"` with one-line descriptions
  - [x] Add a short section describing `.context-forge/rule-resolutions.json` (schema from the design's Storage Schema, identity is the file pair, committed to git, removal is a hand edit, the "advisory precedence" limit from D8, and the stale-identity warnings)
  - [x] **Success:** a reader can run the Verification Walkthrough from the docs alone; no code beyond the two command lines and the JSON shape

- [x] **12.2 Update the root README**
  - [x] In the adoption section of `README.md`, add the reconciliation step after `setup-ide`: when rule files are present, fetch `cf prompt get conventions-reconciliation` (it comes from the guide release carrying that prompt; if the installed guide lacks it, the command fails with "No prompt found" and the PM runs `cf rules resolve` by hand)
  - [x] **Success:** the missing-prompt behaviour is stated, matching the design's Dependencies section

- [x] **12.3 Commit docs**
  - [x] Commit: `docs: document cf rules and rule resolutions`

---

### 13. Final verification

- [x] **13.1 Full checks**
  - [x] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  - [x] Check new file sizes: `wc -l` on every new source file is under about 300
  - [x] **Success:** all pass; any exceeded file size is split before moving on

- [x] **13.2 Run the Verification Walkthrough**
  - [x] In a scratch brownfield directory (outside the repo; create it new and empty) with a hand-written CLAUDE.md containing a rule that contradicts the guide, run walkthrough steps 1-6 with the local build (`node <repo>/packages/cli/dist/index.js`). Step 3 uses `cf rules resolve` by hand if the installed guide has no `conventions-reconciliation` prompt
  - [x] Confirm: baseline has no resolutions section; inventory lists the CLAUDE.md block range and omits cf-installed files; resolve prints the confirmation; `setup-ide claude --yes` renders the section; a second run is byte-identical (`cmp`); `setup-ide agents --yes` renders it in AGENTS.md; both stale-identity warnings appear with exit code 0 and the section returns after restoring the file
  - [x] **Success:** every expected result above is observed; record any deviation as an issue. A defect in this slice's own code is fixed here with a failing test first
  - [x] Nothing from the scratch directory is committed

- [x] **13.3 Update slice status and commit**
  - [x] Delegate the checklist update to the `task-checker` agent. Set this file's and the slice design's `status` per the process guide, and `dateUpdated: 20261024`
  - [x] Add the deferred items (a `cf next` reconcile recommendation, MCP tools, #125, #126) to the slice plan's Future Work if not already listed
  - [x] Commit on the slice branch: `docs: mark slice 266 tasks complete`
  - [x] **Success:** `git status` is clean on `266-slice.conventions-reconciliation`; the last task ends at this commit
