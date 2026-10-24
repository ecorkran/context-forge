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
status: not_started
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

- [ ] **1.1 Create the slice branch**
  - [ ] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`; call its value (or `main` when empty) the target
  - [ ] Confirm you are on the target, then `git checkout -b 266-slice.conventions-reconciliation {target}`. If the branch already exists, switch to it
  - [ ] **Success:** `git branch --show-current` prints `266-slice.conventions-reconciliation`

---

### 2. Core: markers move to core

Goal (D7): the marker literals and backup suffix are defined once, in core, and the cli modules re-export them.

- [ ] **2.1 Create `packages/core/src/ruleReconciliation/markers.ts`**
  - [ ] Move the definitions of `MANAGED_BEGIN_MARKER`, `MANAGED_END_MARKER`, `GENERATED_MARKER` out of `packages/cli/src/commands/ideTargets.ts`, and `PREMANAGED_BACKUP_SUFFIX` out of `packages/cli/src/ideInstall/paths.ts`, into the new file. Keep the doc comments and exact string values
  - [ ] Leave `MANAGED_MARKER` and `MANAGED_MARKER_END` (legacy forms) where they are
  - [ ] Create `packages/core/src/ruleReconciliation/index.ts` exporting `markers.ts`, and add `export * from './ruleReconciliation/index.js';` to `packages/core/src/node.ts` next to the adoption export (the module reads the filesystem, so it belongs in `node.ts`, not `index.ts`)
  - [ ] **Success:** each of the four literals is defined in exactly one file (`grep -rn "BEGIN:context-forge" packages/*/src` shows one definition)

- [ ] **2.2 Re-export from the cli modules**
  - [ ] In `ideTargets.ts`, replace the moved definitions with `export { MANAGED_BEGIN_MARKER, MANAGED_END_MARKER, GENERATED_MARKER } from '@context-forge/core/node';`. Keep `MANAGED_MARKERS`, which still uses them (import them for local use as well)
  - [ ] In `paths.ts`, do the same for `PREMANAGED_BACKUP_SUFFIX`
  - [ ] Existing importers (`managedSection.ts`, `manifest.ts`, `dryRun.ts`, `targets/copilot.ts`, `commands/setup-ide.ts`) keep their import paths unchanged
  - [ ] **Success:** `pnpm -r build` and `pnpm typecheck` pass with no importer edits

- [ ] **2.3 Verify and commit**
  - [ ] Run `pnpm --filter @context-forge/cli test` and `pnpm --filter @context-forge/core test`
  - [ ] **Success:** all existing tests pass unchanged; `pnpm lint` is clean
  - [ ] Commit: `refactor: move managed marker literals to core`

---

### 3. Core: resolution schema and store

- [ ] **3.1 Implement `ruleReconciliation/schema.ts`**
  - [ ] Define `RULE_RESOLUTIONS_VERSION = 1`, `RULE_RESOLUTIONS_FILE = 'rule-resolutions.json'`, and `RULE_RESOLUTIONS_DIR = '.context-forge'` once each. Reuse the manifest directory name only by value; do not import from cli
  - [ ] Define `RuleResolution` (`guideRule`, `projectSource`, `statement`), `RuleResolutionsFile` (`version`, `resolutions`), and `RuleResolutionsError` (typed error whose message names the file and the problem)
  - [ ] Implement `validateRuleResolution(r)` and `validateRuleResolutionsFile(data, file)` enforcing D5: unknown `version`; non-object or missing fields; `statement` missing/empty, containing `\n` or `\r`, or containing any marker string from `markers.ts`; `guideRule` or `projectSource` containing a backtick
  - [ ] **Success:** each D5 rejection throws `RuleResolutionsError` with a message naming the file and the offending field

- [ ] **3.2 Test the schema** (`packages/core/tests/ruleReconciliation/schema.test.ts`)
  - [ ] Cases: valid file; wrong version; non-JSON-object; missing statement; empty statement; statement with newline; statement containing each of the three marker strings; backtick in `guideRule`; backtick in `projectSource`; two records sharing a pair are both valid
  - [ ] **Success:** tests pass; every D5 rule has a failing-input case

- [ ] **3.3 Implement `ruleReconciliation/store.ts`**
  - [ ] `readRuleResolutions(root)`: absent file returns an empty list; otherwise parse JSON and validate. A JSON parse failure throws `RuleResolutionsError` naming the file. Only ENOENT counts as absent; every other read error propagates
  - [ ] `addRuleResolution(root, resolution)`: validate the record, read the current file (validating it too), append, write to a temp file in the same directory, then `rename` into place. Create `.context-forge/` when missing. Write and rename failures propagate as errors naming the file; no retry
  - [ ] Output is two-space-indented JSON with a trailing newline, records in file order
  - [ ] Export from `ruleReconciliation/index.ts`
  - [ ] **Success:** reading an absent file returns `[]`; a malformed file throws before anything is written

- [ ] **3.4 Test the store** (`packages/core/tests/ruleReconciliation/store.test.ts`, use a temp dir per test)
  - [ ] Cases: absent file reads as empty; add creates `.context-forge/` and the file; add appends in order and keeps duplicates of a pair as separate records; add to a malformed file throws and leaves the file byte-identical; invalid record is rejected without touching the file; no temp file is left after a successful write; a read of unparseable JSON throws `RuleResolutionsError`
  - [ ] **Success:** tests pass
  - [ ] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: add rule resolution schema and store`

---

### 4. Core: rule-file list and managed-block range

- [ ] **4.1 Export `RULE_FILE_PATHS` and add `.github/instructions`**
  - [ ] In `packages/core/src/detection/presentPaths.ts`, add `.github/instructions` to `RULE_FILE_PATHS` (after `.github/copilot-instructions.md`) and update the header comment, which currently says the module is not re-exported
  - [ ] In `packages/core/src/detection/index.ts`, export `RULE_FILE_PATHS` and `presentPaths`
  - [ ] **Success:** `adoptionResolver.ts` still compiles and uses the same constant; `.github/instructions` is the only list change

- [ ] **4.2 Update 261's tests**
  - [ ] `packages/core/tests/detection/presentPaths.test.ts`: add a case where `.github/instructions` exists and appears in the result
  - [ ] `packages/core/tests/adoption/adoptionFacts.test.ts`: add a case where `renderAdoptionFacts` lists `.github/instructions` in the `ruleFiles` bullet when the directory is present
  - [ ] **Success:** the new cases pass and no existing case changed
  - [ ] Commit: `feat: export rule file paths and add .github/instructions`

- [ ] **4.3 Implement `managedBlockRange` in `ruleReconciliation/projectSources.ts`**
  - [ ] Signature: takes the file's lines (an array of strings, as produced by cli's `toRecords`) and returns `{ beginLine, endLine }` (1-based, inclusive) or `'none'` or `'broken'`. Whole-line match on `MANAGED_BEGIN_MARKER` / `MANAGED_END_MARKER`, the same rule `managedState` uses today: no markers is `'none'`; exactly one BEGIN before exactly one END is a range; anything else is `'broken'`
  - [ ] Core must not import cli's `lines.ts`. Callers split the text
  - [ ] Export `managedBlockRange` from `ruleReconciliation/index.ts` so cli can import it from `@context-forge/core/node`
  - [ ] **Success:** the function is pure, has no filesystem access, and is importable from `@context-forge/core/node`

- [ ] **4.4 Make cli `managedState` call it**
  - [ ] In `packages/cli/src/ideInstall/managedSection.ts`, replace the inline BEGIN/END index logic in `managedState` with a call to `managedBlockRange(lines)`. Keep the legacy-marker check (`'legacy'` vs `'unmanaged'`) in cli, applied only when the range is `'none'`
  - [ ] **Success:** `managedState` returns the same five states for the same inputs; `managedState` no longer scans BEGIN/END itself; it calls `managedBlockRange`. (`replaceBlock` keeps its own walk; it only runs after `managedState` has returned `'managed'`, so the pair is already valid)

- [ ] **4.5 Test `managedBlockRange` and confirm `managedState` is unchanged**
  - [ ] New `packages/core/tests/ruleReconciliation/managedBlockRange.test.ts`: no markers; one valid pair with the expected 1-based lines; two BEGIN; two END; END before BEGIN; BEGIN only; END only; markers with surrounding text are not matched (whole-line)
  - [ ] Run `pnpm --filter @context-forge/cli test`; `managedSection.test.ts` and `managedSections.test.ts` must pass unchanged
  - [ ] **Success:** all pass
  - [ ] Commit: `refactor: share managed block range scan between cli and core`

---

### 5. Core: project rule-source enumeration

- [ ] **5.1 Implement `projectRuleSources(root, installedPaths)` in `projectSources.ts`** (D6)
  - [ ] Candidates are `RULE_FILE_PATHS` filtered with `presentPaths`. Return a list of `{ path, kind: 'composite' | 'standalone', managedBlock? }`. Paths are checkout-relative with `/` separators
  - [ ] Composites are `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`. Define that list once as a named constant, near `RULE_FILE_PATHS`. For a composite, read the file and set `managedBlock` to the `managedBlockRange` result: a `{ beginLine, endLine }` range, `'none'` when it has no block, or `'broken'` when the pair is unusable. Do not guess a range for `'broken'`
  - [ ] Directory entries (`.claude/rules`, `.cursor/rules`, `.github/instructions`) expand to every file beneath them (recursive, sorted in plain code-unit order). Everything else is a standalone file
  - [ ] Exclude: paths in `installedPaths` (checkout-relative); files containing `GENERATED_MARKER`; files ending in `PREMANAGED_BACKUP_SUFFIX`. Do not exclude a composite merely because it has a managed block: its project-owned part is the source
  - [ ] Root only: no nested `CLAUDE.md`. A candidate that cannot be read throws an error naming the file (never skipped). ENOENT is "absent" and handled by `presentPaths`
  - [ ] Export from `ruleReconciliation/index.ts`
  - [ ] **Success:** deterministic output for a given tree; no file is read for meaning

- [ ] **5.2 Test enumeration** (`packages/core/tests/ruleReconciliation/projectSources.test.ts`)
  - [ ] Fixture uses the real layout: a CLAUDE.md with project text above a managed block, built by running the current `writeManagedSection`/`compileClaudeRules` output format (BEGIN line, content, END line). Add project text after the block in one case
  - [ ] Cases: composite with a valid block reports the correct line range; composite with no block reports `'none'`; broken markers report `'broken'`; installed paths are excluded; a `.github/instructions/*.instructions.md` carrying the generated marker is excluded; a `*.pre-context-forge` backup is excluded; a hand-written `.cursor/rules/team-style.mdc` is included; directory expansion lists nested files; a nested `sub/CLAUDE.md` is ignored; an unreadable candidate throws naming the file
  - [ ] **Success:** tests pass
  - [ ] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: enumerate project rule sources in core`

---

### 6. CLI: guide rule entries

- [ ] **6.1 Implement `packages/cli/src/ideInstall/guideRules.ts`** (D7, D1)
  - [ ] `guideRuleEntries(guideDir, exclusions)`: list the markdown files in `guidePaths(guideDir).rules` (use `listMarkdownFiles`, `hasAlwaysApply`). Each entry has `rule` (basename), `path` (relative to the checkout, as `relativeToRoot` gives), `kind: 'alwaysApply' | 'scoped'`, and `excluded`
  - [ ] Delivery is decided in one place, inside `guideRuleEntries`, when it sets each entry's `excluded`: an alwaysApply rule is never excluded and must NOT be passed to `exclusions.isExcluded` (that call records a match and would hide the "names an always-on rule and was ignored" warning); a scoped rule is excluded exactly when `exclusions.isExcluded(rule)` is true
  - [ ] Export `delivered(entry: GuideRuleEntry): boolean`, which returns `!entry.excluded`. This is the one predicate #123 later extends. The inventory (7.1) reports `excluded`; the renderer (10.1) calls `delivered(entry)` on the entry matching a resolution's `guideRule`. Neither re-derives delivery
  - [ ] Missing rules directory: throw a plain error naming the path (no empty fallback)
  - [ ] **Success:** no code outside `guideRules.ts` consults `exclusions` to decide delivery

- [ ] **6.2 Test guide rule entries** (`packages/cli/tests/ideInstall/guideRules.test.ts`, reuse the `fixture_guide` helpers in `harness.ts`)
  - [ ] Cases: alwaysApply and scoped kinds; exclusion by pattern marks a scoped rule excluded; an exclusion pattern naming an alwaysApply rule leaves it delivered and does not record a match (so `warnUnmatched` still prints the ignored-pattern warning); missing rules directory throws
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: add guide rule entries with a single delivery predicate`

---

### 7. CLI: `cf rules inventory`

- [ ] **7.1 Add an installed-path reader to `manifest.ts`**
  - [ ] Export `readInstalledPaths(root)`: for every `.context-forge/*.manifest` in the checkout, return the paths it lists. A manifest line is `<cksum> <size> <checkout-relative path>` (for example `1890873339 3466 .claude/agents/task-checker.md`, as in this repo's `.context-forge/claude.manifest`); take the third field onward as the path, split on the first two spaces only. A missing `.context-forge/` directory returns an empty list; a line with fewer than three fields throws an error naming the manifest file
  - [ ] **Success:** paths are checkout-relative with `/` separators, the form `projectRuleSources` expects

- [ ] **7.2 Test the reader** (extend `packages/cli/tests/ideInstall/manifest.test.ts`)
  - [ ] Cases: parses a manifest written by a real `setup-ide claude` run; merges several manifests; a path containing spaces survives; missing directory gives `[]`; a malformed line throws naming the file
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: read installed paths from manifests`

- [ ] **7.3 Implement the shared inventory builder `packages/cli/src/commands/rulesInventory.ts`**
  - [ ] `buildInventory(projectPath)` returns `{ guideRules, projectSources, resolutions }`. Guide dir is `path.join(projectPath, GUIDE_RELATIVE_PATH)`; call `ensureGuideReady` and fail with the existing "Guides are not installed" style `UserError` if absent
  - [ ] `guideRules` from `guideRuleEntries` (exclusions from `rules.exclude` via `ConfigManager`, parsed with `parseRulesExclude`; export and reuse the existing `readRulesExclude` from `setup-ide.ts` rather than duplicating it). `projectSources` from `projectRuleSources(projectPath, readInstalledPaths(projectPath))`. `resolutions` from `readRuleResolutions(projectPath)`; a malformed file fails with the `RuleResolutionsError` message
  - [ ] **Success:** read-only; used by both `inventory` and `resolve`

- [ ] **7.4 Test the builder** (`packages/cli/tests/commands/rulesInventory.test.ts`; follow how `setup-ide.test.ts` builds a project and guide)
  - [ ] Cases: lists delivered and excluded guide rules; a hand-written CLAUDE.md is a composite with the managed block range after a real `setup-ide claude` run; cf-installed `.claude/rules/*` files are absent; broken markers reported; existing resolutions echoed; malformed resolutions file fails naming the file; missing guide fails explicitly
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: add rules inventory builder`

- [ ] **7.5 Add the `inventory` subcommand in `packages/cli/src/commands/rules.ts`** with `registerRulesCommand(program)`
  - [ ] Project resolution follows `setup-ide`'s pattern (`FileProjectStore`, `resolveProjectId`, `withProjectOption`) with the same `UserError`s when the project or its path is missing
  - [ ] Output is JSON only, in the shape under API Contracts, via `printJson`. `--json` is accepted for the documented spelling; plain invocation prints the same JSON
  - [ ] Register in `packages/cli/src/index.ts` next to `registerSetupIdeCommand`
  - [ ] **Success:** output keys are `guideRules`, `projectSources`, `resolutions`; the command writes nothing

- [ ] **7.6 Test the subcommand** (`packages/cli/tests/commands/rules.test.ts`)
  - [ ] Cases: `inventory --json` prints the three keys; plain `inventory` prints the same JSON; unknown project fails with a `UserError`
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: add cf rules inventory`

---

### 8. CLI: `cf rules resolve`

- [ ] **8.1 Add the `resolve` subcommand to `rules.ts`**
  - [ ] Arguments `<guideRule> <projectSource>` and required option `--statement <text>`; same `--project` option
  - [ ] Validate in this order: `guideRule` is a name in the installed guide's rules, else `UserError` listing the valid names; `projectSource` is in the current inventory, else `UserError` listing the valid paths. Then `addRuleResolution` applies D5 validation and writes
  - [ ] On success print exactly: `Recorded resolution <guideRule> vs <projectSource>. Run cf setup-ide <target> to apply.` (leave `<target>` literal, as in the design). It does not run `setup-ide`
  - [ ] Use `buildInventory` from 7.3 for the valid names and paths (no duplicated logic)
  - [ ] **Success:** a valid call appends one record; every rejection leaves the file unchanged

- [ ] **8.2 Test `resolve`** (extend `rules.test.ts`)
  - [ ] Cases: records a valid resolution and prints the confirmation line; unknown guide rule rejected with valid names listed; unknown source rejected with valid paths listed; missing `--statement`; multi-line statement; statement containing a marker; backtick in a name; a project source that is a composite is accepted; two resolutions for the same pair are both kept; write failure (make `.context-forge` a file) surfaces an error naming the file
  - [ ] **Success:** tests pass
  - [ ] Run `pnpm lint` and `pnpm typecheck`; commit: `feat: add cf rules resolve`

---

### 9. ideInstall: `compileClaudeRules` gains `trailing`

- [ ] **9.1 Add the parameter** in `packages/cli/src/ideInstall/rules.ts`
  - [ ] `compileClaudeRules` takes a `trailing` string, appended to `content` after the rules and before `writeManagedSection`, exactly as `compileAlwaysOnRules` does. Update its one caller (`targets/claude.ts`) to pass `''` for now
  - [ ] **Success:** output is byte-identical to before for `trailing = ''`

- [ ] **9.2 Test it** (extend `packages/cli/tests/ideInstall/rules.test.ts`)
  - [ ] Cases: empty `trailing` produces the same CLAUDE.md content as today; non-empty `trailing` lands inside the BEGIN/END pair, after the last rule
  - [ ] **Success:** tests pass; existing snapshots unchanged
  - [ ] Commit: `refactor: let compileClaudeRules append trailing sections`

---

### 10. ideInstall: render and warn

- [ ] **10.1 Implement `packages/cli/src/ideInstall/resolutions.ts`** (D4, D5)
  - [ ] Constants, defined once: the section heading `## Project Rule Resolutions` and the precedence sentence from the design's rendered example
  - [ ] `classifyResolutions(resolutions, guideEntries, projectRoot)` returns `{ live, staleGuide, staleProject }`:
    - `staleGuide`: `guideRule` not among the guide entries
    - `staleProject`: `projectSource` not present under `projectRoot` (use core's `pathPresent`; non-ENOENT errors throw)
    - `live`: neither stale **and** `delivered(entry)` (6.1) is true for the entry matching `guideRule`. A not-delivered rule is neither rendered nor reported
  - [ ] `renderResolutions(live)`: empty list returns `''` (no heading); otherwise the heading, the precedence sentence, a blank line, then one bullet per resolution in file order: `` - `<guideRule>` vs `<projectSource>`: <statement> ``. Ends with a newline
  - [ ] `warnStaleResolutions(classification, out)`: on stderr via `out.statusErr('yellow', …)`, the two messages in D5 verbatim (guide side: "names a guide rule the guide no longer has"; project side: "names a project file that no longer exists"), each ending with the "re-run reconciliation or edit .context-forge/rule-resolutions.json" remedy
  - [ ] **Success:** pure functions apart from `pathPresent`; no marker string can appear in output (already prevented by validation)

- [ ] **10.2 Test render and classify** (`packages/cli/tests/ideInstall/resolutions.test.ts`)
  - [ ] Cases: empty list renders `''`; output matches the design's example exactly for two records; file order kept; a duplicate pair renders two bullets; guide-stale and project-stale are classified and warn with the exact messages; an excluded scoped rule is dropped silently (no warning, no bullet); a `projectSource` that exists only under the `projectRoot` argument is live, and one missing there is stale
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: render rule resolutions and warn on stale identities`

---

### 11. ideInstall: wire into `setup-ide`

- [ ] **11.1 Carry resolutions through the install**
  - [ ] In `commands/setup-ide.ts` `installCheckout`, read `readRuleResolutions(root)` next to `readRulesExclude(root)` and pass it as a new `InstallOptions` field (`ruleResolutions`). A malformed file throws before `installIde` runs, so nothing is written (this is the fail-before-write requirement)
  - [ ] In `installer.ts` `installIde`: after building `base`, call `guideRuleEntries`, `classifyResolutions` (with `projectRoot`), and store the `live` list on `InstallContext` (add a `resolutionsSection: string` field to `InstallBase`/`InstallContext`, rendered once). Call `warnStaleResolutions` once per run, next to `warnUnmatched`, so a target that writes two composites warns only once
  - [ ] Classify only when `isDirectory(base.guide.rules)` is true. When it is not, skip classification (`resolutionsSection` is `''`): the target's own `requireRulesDir` then aborts the install with its existing error before anything is written, so no resolution is silently dropped
  - [ ] **Success:** `ctx.resolutionsSection` is `''` when there is no file or no live resolution

- [ ] **11.2 Test the wiring** (`packages/cli/tests/ideInstall/resolutions.install.test.ts`, using `harness.ts`)
  - [ ] Cases: a valid resolution produces a non-empty `resolutionsSection` on the context; no file gives `''`; a stale resolution prints its warning once on stderr even for a target that writes two composites, and `installIde` still returns exit code 0 (the stale and excluded rules themselves are tested in 10.2); a malformed resolutions file fails the install and no file in the checkout changed
  - [ ] **Success:** tests pass; existing ideInstall tests still pass
  - [ ] Commit: `feat: carry rule resolutions through setup-ide`

- [ ] **11.3 Emit into every composite**
  - [ ] `targets/claude.ts`: pass `ctx.resolutionsSection` as `trailing` to `compileClaudeRules`
  - [ ] `targets/agents.ts` `emitAgentsMd`: `trailing` is `index.text` followed by `ctx.resolutionsSection` (so it covers agents, copilot and cursor, all of which call `emitAgentsMd`)
  - [ ] `targets/copilot.ts`: pass `ctx.resolutionsSection` as `trailing` for `.github/copilot-instructions.md`
  - [ ] No other compiler or merge change; worktree installs and dry runs already go through `installCheckout`/`installTarget`, so they need no new code
  - [ ] **Success:** with no resolutions file, `setup-ide` output for all four targets is byte-identical to before

- [ ] **11.4a Test per-target rendering** (`packages/cli/tests/ideInstall/resolutions.render.test.ts`, using `harness.ts`)
  - [ ] Cases for each composite: CLAUDE.md (claude), AGENTS.md (agents; section follows the scoped "Additional Rules" index), `.github/copilot-instructions.md` and AGENTS.md (copilot), AGENTS.md (cursor): the section is the last thing inside the BEGIN/END pair and text outside the block is untouched
  - [ ] Re-running gives byte-identical files. Changing the body of a guide rule file while keeping its basename leaves the rendered section unchanged
  - [ ] **Success:** tests pass
  - [ ] Run `pnpm lint`, `pnpm typecheck`, and the new test file

- [ ] **11.4b Test no-file regression, dry run and worktree** (`packages/cli/tests/ideInstall/resolutions.regression.test.ts`, using `harness.ts`)
  - [ ] No-file regression: every target's output matches the existing snapshots byte for byte
  - [ ] Dry run (`--dry-run`) previews the section and writes nothing; a worktree install renders that worktree's own resolutions file
  - [ ] **Success:** tests pass and all pre-existing ideInstall tests/snapshots pass unchanged
  - [ ] Run `pnpm lint`, `pnpm typecheck`, and `pnpm test`; commit: `feat: render rule resolutions in setup-ide composites`

---

### 12. Documentation and guide contract

- [ ] **12.1 Document `cf rules` in the CLI reference**
  - [ ] In `packages/cli/README.md` Commands Reference, add `cf rules inventory --json` and `cf rules resolve <guideRule> <projectSource> --statement "<text>"` with one-line descriptions
  - [ ] Add a short section describing `.context-forge/rule-resolutions.json` (schema from the design's Storage Schema, identity is the file pair, committed to git, removal is a hand edit, the "advisory precedence" limit from D8, and the stale-identity warnings)
  - [ ] **Success:** a reader can run the Verification Walkthrough from the docs alone; no code beyond the two command lines and the JSON shape

- [ ] **12.2 Update the root README**
  - [ ] In the adoption section of `README.md`, add the reconciliation step after `setup-ide`: when rule files are present, fetch `cf prompt get conventions-reconciliation` (it comes from the guide release carrying that prompt; if the installed guide lacks it, the command fails with "No prompt found" and the PM runs `cf rules resolve` by hand)
  - [ ] **Success:** the missing-prompt behaviour is stated, matching the design's Dependencies section

- [ ] **12.3 Commit docs**
  - [ ] Commit: `docs: document cf rules and rule resolutions`

---

### 13. Final verification

- [ ] **13.1 Full checks**
  - [ ] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  - [ ] Check new file sizes: `wc -l` on every new source file is under about 300
  - [ ] **Success:** all pass; any exceeded file size is split before moving on

- [ ] **13.2 Run the Verification Walkthrough**
  - [ ] In a scratch brownfield directory (outside the repo; create it new and empty) with a hand-written CLAUDE.md containing a rule that contradicts the guide, run walkthrough steps 1-6 with the local build (`node <repo>/packages/cli/dist/index.js`). Step 3 uses `cf rules resolve` by hand if the installed guide has no `conventions-reconciliation` prompt
  - [ ] Confirm: baseline has no resolutions section; inventory lists the CLAUDE.md block range and omits cf-installed files; resolve prints the confirmation; `setup-ide claude --yes` renders the section; a second run is byte-identical (`cmp`); `setup-ide agents --yes` renders it in AGENTS.md; both stale-identity warnings appear with exit code 0 and the section returns after restoring the file
  - [ ] **Success:** every expected result above is observed; record any deviation as an issue. A defect in this slice's own code is fixed here with a failing test first
  - [ ] Nothing from the scratch directory is committed

- [ ] **13.3 Update slice status and commit**
  - [ ] Delegate the checklist update to the `task-checker` agent. Set this file's and the slice design's `status` per the process guide, and `dateUpdated: 20261024`
  - [ ] Add the deferred items (a `cf next` reconcile recommendation, MCP tools, #125, #126) to the slice plan's Future Work if not already listed
  - [ ] Commit on the slice branch: `docs: mark slice 266 tasks complete`
  - [ ] **Success:** `git status` is clean on `266-slice.conventions-reconciliation`; the last task ends at this commit
