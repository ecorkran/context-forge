---
docType: tasks
slice: permissiveness-setting
project: context-forge
lld: project-documents/user/slices/246-slice.permissiveness-setting.md
dependencies:
- 245
projectState: 'Slice 245 (workflow.decision_gate_enabled) is merged. ai-project-guide#46
  is closed; guide v0.21.9 is installed in this repo and ships rules/permissiveness/cautious.md
  and autonomous.md. Nothing in Context Forge reads a permissiveness setting yet (issue
  #122).'
dateCreated: 20261019
dateUpdated: 20261019
status: not_started
turns: 27
promptTokens: 1583234
cachedTokens: 1506518
cacheWriteTokens: 76664
completionTokens: 20256
durationSeconds: 225.8
costUsd: 1.320225
usageRounds: 1
pricedRounds: 1
---

# Tasks: Permissiveness Setting (Slice 246)

## Context Summary

- Working on slice 246, `permissiveness-setting` (issue #122). Design: `user/slices/246-slice.permissiveness-setting.md`. Decisions D1–D7 there are the spec; tasks cite them rather than repeating them.
- New config key `workflow.permissiveness` (`cautious` | `standard` | `autonomous`, default `standard`). On every `cf build` / MCP `context_build`, a new resolver reads the key for the checkout. When the phase applies (Phase 4, 5 or 6) and the level is not `standard`, it loads `<guide>/project-guides/rules/permissiveness/<level>.md`, strips the frontmatter, and the template engine renders the body as its own section right after the instruction prompt.
- `standard` adds nothing (D4). A missing, unreadable, or empty fragment in an applicable phase fails the build (D6). cf never enforces `BLOCKED:` (D7). `cf setup-ide` does not change (D3); a test pins that it ignores the `permissiveness/` subdirectory (D2).
- Prerequisite is satisfied: the guide request (ai-project-guide#46) shipped in v0.21.9, and this repo's installed guide is already v0.21.9 (commit `bb1e06b9`). The design's note that the installed guide is v0.21.6 is out of date. Implementation Notes steps 1 and 7 are therefore already done; Task 8 confirms the record.
- Verified code anchors (as of 20261019):
  - `packages/core/src/config/ConfigKeys.ts`: `CONFIG_KEYS` (:19). `workflow.decision_gate_enabled` (:77) and the enum-typed `workflow.review_threshold` (:84) are the models. `ConfigManager.ts:101` already rejects a non-enum string with `must be one of [...]`; no new validator code is needed.
  - `packages/core/src/schema/projectSchema.ts`: `SLICE_DESIGN_PHASE` (:36), `TASK_BREAKDOWN_PHASE` (:39), `IMPLEMENTATION_PHASE` (:42). Values are the display strings, e.g. `Phase 5: Task Breakdown`.
  - `packages/core/src/services/integrationBranchResolver.ts`: the pattern to copy (exported const typed by a resolver type declared in `ContextIntegrator.ts:20`).
  - `packages/core/src/services/CoreServiceFactory.ts`: `resolvePromptFilePath` (:19) throws when the guide is missing; `createContextPipeline` (:39) builds the `ContextIntegrator` with positional resolver arguments (:51).
  - `packages/core/src/services/ContextIntegrator.ts`: constructor (:62), `generateWithTemplateEngine` (~:100) computes `checkoutPath` and calls the two existing resolvers (:117–:127). `mapProjectToEnhancedContext` sets `instruction: project.instruction || 'implementation'` (:163).
  - `packages/core/src/services/ContextTemplateEngine.ts`: `buildTemplate` (:72). The instruction section has `order: 3`, additional notes `order: 4`. `processSection` (:180) omits the title line when `title` is `''`.
  - `packages/core/src/types/context.ts`: `ContextData` (:6) holds `integrationBranch` / `targetBranch` (:33).
  - `packages/core/src/services/constants.ts`: `PROMPT_FILE_RELATIVE_PATH` = `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`.
  - `packages/cli/src/ideInstall/fsChecks.ts`: `listMarkdownFiles` (:37). `packages/cli/src/ideInstall/paths.ts`: `guidePaths().rules` (:21). Tests: `packages/cli/tests/ideInstall/rules.test.ts` (`listMarkdownFiles` :58, `compileAlwaysOnRules` :103).
  - Existing tests to extend: `packages/core/tests/config/ConfigKeys.test.ts`, `packages/core/tests/services/{integrationBranchResolver,ContextIntegrator,ContextTemplateEngine,CoreServiceFactory}.test.ts`, `packages/cli/tests/integration/build.integration.test.ts`, `packages/mcp-server/tests/integration/mcpIntegration.test.ts` (real core, no mocks). Core fixture guide: `packages/core/tests/fixtures/test-project/`.
  - `README.md` "Key configuration" table (~:382).
- Note on `instruction` values: the fixture projects use the short name `implementation`, and `mapProjectToEnhancedContext` defaults an unset instruction to it. Under D5 that is **not** a phase string, so the section is omitted. Tests that expect the section must set `instruction` to a schema phase constant.
- Use the local build for manual checks: `node packages/cli/dist/index.js`. The global `cf` is the published npm build.
- Verification commands: `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @context-forge/core test`, `pnpm --filter @context-forge/cli test`, `pnpm --filter @context-forge/mcp test`.

---

## Task 0: Pre-flight

- [ ] Read the target: `node packages/cli/dist/index.js config get git.integration_branch`. Empty means the target is `main`.
- [ ] Confirm a clean working tree (`git status --short`).
- [ ] Create the slice branch from the target: `git checkout -b 246-slice.permissiveness-setting {target}`. If the branch already exists, switch to it instead.
- [ ] Run `pnpm -r build` and `pnpm --filter @context-forge/core test` once, to record a green baseline.
  - [ ] Success: you are on `246-slice.permissiveness-setting` and the baseline build and tests pass. If the baseline fails, stop and report it. Do not fix unrelated failures in this slice.
- **Effort:** 1/5

---

## Task 1: Config key and level constants, with tests (D1)

- [ ] In `packages/core/src/config/ConfigKeys.ts`, export two constants above `CONFIG_KEYS`:
  - [ ] `PERMISSIVENESS_LEVELS = ['cautious', 'standard', 'autonomous'] as const`, plus a `PermissivenessLevel` type derived from it.
  - [ ] `STANDARD_PERMISSIVENESS: PermissivenessLevel`, taken from the array (not re-typed as a literal). It is both the default and the one level with no fragment (D4).
- [ ] Add `workflow.permissiveness` next to `workflow.decision_gate_enabled`: `type: 'string'`, `default: STANDARD_PERMISSIVENESS`, `enum: [...PERMISSIVENESS_LEVELS]`, `scope: ConfigScope.Shared`. Description: how readily AI work waits on the PM; `cf build` adds the guide's `rules/permissiveness/<level>.md` in Phases 4–6; `standard` adds nothing.
- [ ] Export `PERMISSIVENESS_LEVELS`, `STANDARD_PERMISSIVENESS`, and `PermissivenessLevel` from the same entry point that exports the other `ConfigKeys` symbols.
- [ ] Tests in `packages/core/tests/config/ConfigKeys.test.ts`:
  - [ ] The key is a shared string, its default is `standard`, and its `enum` equals `PERMISSIVENESS_LEVELS`.
  - [ ] With a real `ConfigManager` on a temp dir: each of the three levels is accepted by `set`; `bogus` is rejected and the error message contains every level name (loop over `PERMISSIVENESS_LEVELS`; do not type the names again).
  - [ ] Success: `pnpm typecheck` and `pnpm --filter @context-forge/core test -- ConfigKeys` pass, and `grep -rn "'autonomous'" packages/core/src` matches only `ConfigKeys.ts`.
- [ ] Commit: `feat(core): add workflow.permissiveness config key`
- **Effort:** 1/5

---

## Task 2: Fragment fixtures

- [ ] Create `packages/core/tests/fixtures/permissiveness/` and copy into it, byte for byte, the installed guide files `project-documents/ai-project-guide/project-guides/rules/permissiveness/cautious.md` and `autonomous.md` (v0.21.9). These are the real-shape fixtures the design requires.
- [ ] Add a one-line `README.md` in that directory: "Verbatim copies of ai-project-guide v0.21.9 rules/permissiveness fragments. Refresh when the guide changes the format."
  - [ ] Success: `diff` between each fixture and its installed source prints nothing.
- [ ] Commit: `test(core): add permissiveness fragment fixtures`
- **Effort:** 1/5

---

## Task 3: `permissivenessResolver.ts`, with tests (D4, D5, D6)

- [ ] In `packages/core/src/services/ContextIntegrator.ts`, next to `IntegrationBranchResolver` (:20), declare `export type PermissivenessResolver = (checkoutPath: string, instruction: string) => Promise<string>;`.
- [ ] Create `packages/core/src/services/permissivenessResolver.ts` (Node only), modeled on `integrationBranchResolver.ts`. Module constants, each defined once:
  - [ ] `PERMISSIVENESS_PHASES`: a `ReadonlySet<string>` of `SLICE_DESIGN_PHASE`, `TASK_BREAKDOWN_PHASE`, `IMPLEMENTATION_PHASE` imported from `schema/projectSchema.ts` (D5). Export it for tests.
  - [ ] `PERMISSIVENESS_FRAGMENT_DIR`: `rules/permissiveness`, relative to the guide's `project-guides` directory.
- [ ] Export `resolvePermissivenessForPrompt: PermissivenessResolver`. Order of checks:
  1. If `instruction` is not in `PERMISSIVENESS_PHASES`, return `''` without reading config or the guide (D5, D6 last bullet).
  2. Read `workflow.permissiveness` with `new ConfigManager(checkoutPath).get(...)`. A read error propagates. If the value is not a string, throw, as the integration-branch resolver does.
  3. If the level is `STANDARD_PERMISSIVENESS`, return `''` (D4).
  4. Locate the guide with `resolvePromptFilePath(checkoutPath)` (its error propagates). The fragment path is `path.join(path.dirname(promptPath), PERMISSIVENESS_FRAGMENT_DIR, `${level}.md`)`.
  5. Missing file: throw an error that names the level and the expected path, says the installed guide may predate this feature, and says to run `cf guides update`.
  6. Read failure for any other reason: throw an error carrying the path and the underlying message (use `{ cause }`).
  7. Strip frontmatter (below). If the remaining body is empty or whitespace-only, throw an error naming the path and saying the fragment has no body.
  8. Return the trimmed body.
- [ ] Add one small private function `stripLeadingFrontmatter(text)`. It drops a leading `---` block only when the first line is `---`, and ends at the next line that is `---`. Accept `\n` and `\r\n` and trailing whitespace on both delimiter lines. A file with no frontmatter is returned unchanged. An opening `---` with no closing line is treated as all frontmatter (empty body, so step 7 fails it).
- [ ] Keep the file under ~120 lines. No fallback to `standard` anywhere.
- [ ] Tests in new `packages/core/tests/services/permissivenessResolver.test.ts`. Build a temp checkout per test: copy the core fixture guide's `prompt.ai-project.system.md` into the guide path, copy the Task 2 fixtures into `rules/permissiveness/` as a test needs them, and set the level with a real `ConfigManager`.
  - [ ] `it.each` over `PERMISSIVENESS_PHASES`: `autonomous` and `cautious` each return the fixture body. The result starts with `### Permissiveness: <level>` and contains no `---` or `name:` line.
  - [ ] Non-applicable phases (`ARCHITECTURE_PHASE` and `Phase 0: Concept` via `PHASE_MAP['0']`): `''` for `autonomous`, even with **no guide** in the checkout. That proves step 1 short-circuits.
  - [ ] A custom instruction string, and `implementation` (the integrator's default for an unset instruction): `''`.
  - [ ] Key unset and key `standard` in an applicable phase: `''`, even with no fragment files present.
  - [ ] D6 failures, each `rejects.toThrow` with a message check: no guide installed (the `resolvePromptFilePath` error); fragment file missing (message has the level, the path, and `cf guides update`); unreadable file (a directory named `autonomous.md` is a portable way to force a read error); empty file; whitespace-only file; frontmatter-only file.
  - [ ] Frontmatter stripping: the real fixture with `\r\n` line endings, and a delimiter line with trailing spaces, both give the same body as the `\n` fixture.
  - [ ] Worktree: two temp checkouts with different levels each get their own fragment.
  - [ ] Success: `pnpm typecheck`, `pnpm lint`, and `pnpm --filter @context-forge/core test -- permissivenessResolver` pass.
- [ ] Commit: `feat(core): add permissiveness fragment resolver`
- **Effort:** 3/5

---

## Task 4: Integrator and engine wiring, with tests

- [ ] `packages/core/src/types/context.ts`: add `permissivenessFragment?: string` to `ContextData`, after `targetBranch`, with a one-line doc comment ("Guide fragment for workflow.permissiveness; empty or undefined when none applies.").
- [ ] `ContextIntegrator.ts`:
  - [ ] Add a sixth constructor parameter `resolvePermissivenessFn: PermissivenessResolver | null = null`, stored like `resolveIntegrationBranchFn`, with a matching `@param` line.
  - [ ] In `generateWithTemplateEngine`, after the integration-branch block: when the function and `checkoutPath` are set, `enhancedData.permissivenessFragment = await this.resolvePermissivenessFn(checkoutPath, enhancedData.instruction)`. Use `enhancedData.instruction`, the same value that selects the instruction prompt (D5). Errors propagate.
  - [ ] Update the comment above the lookups ("Both lookups…") so it covers all three.
- [ ] `ContextTemplateEngine.buildTemplate`: after the instruction section, push a section only when `data.permissivenessFragment?.trim()` is non-empty: `key: 'permissiveness'`, `title: ''` (the fragment carries its own heading), `content: data.permissivenessFragment`, `conditional: false`, `order: 3.5`. Comment it `// 3.5. Permissiveness fragment (conditional, slice 246)`.
- [ ] Tests:
  - [ ] `ContextIntegrator.test.ts`, next to the integration-branch tests (~:277): the resolver gets the worktree path when a worktree is selected and the project path otherwise, and gets the instruction value; its return value lands on `permissivenessFragment`; a rejecting resolver rejects `generateContextFromProject`; with no resolver injected the field stays `undefined`.
  - [ ] `ContextTemplateEngine.test.ts`: with a fragment, the output contains it once, after `### Instruction Prompt` and before `## Additional Instructions`; with `''`, `'   '` or `undefined`, the output equals the output for the same data without the field.
  - [ ] Success: `pnpm typecheck` and `pnpm --filter @context-forge/core test -- ContextIntegrator ContextTemplateEngine` pass, and existing tests in both files pass unmodified.
- [ ] Commit: `feat(core): render permissiveness fragment after instruction prompt`
- **Effort:** 2/5

---

## Task 5: Pipeline wiring and pipeline test

- [ ] `CoreServiceFactory.ts`: import `resolvePermissivenessForPrompt` and pass it as the sixth argument to `new ContextIntegrator(...)`. This one change covers `cf build` and `context_build`.
- [ ] Tests in `packages/core/tests/services/CoreServiceFactory.test.ts`, each on a temp copy of `fixtures/test-project` with the Task 2 fixtures in `rules/permissiveness/`:
  - [ ] `autonomous`, `instruction: TASK_BREAKDOWN_PHASE`: the output contains the fragment body, positioned after the instruction prompt text and before the next section.
  - [ ] Same project, `instruction: ARCHITECTURE_PHASE`: no `### Permissiveness:` heading.
  - [ ] Byte-identical default: for each phase in `PERMISSIVENESS_PHASES`, the output with the key unset equals the output with `standard` set, and both equal the output of a `ContextIntegrator` built by hand with the same arguments minus the permissiveness resolver.
  - [ ] Level change: set `autonomous`, build; set `cautious`, build again with the same pipeline. The second output has the cautious heading and not the autonomous one.
  - [ ] Missing fragment: `cautious` with no `cautious.md`, in an applicable phase, rejects with the D6 message.
  - [ ] Success: `pnpm --filter @context-forge/core test` passes in full.
- [ ] Commit: `feat(core): wire permissiveness resolver into context pipeline`
- **Effort:** 2/5

---

## Task 6: CLI and MCP smoke tests

- [ ] `packages/cli/tests/integration/build.integration.test.ts`: one test on a temp copy of the MCP integration fixture project, with the `autonomous` fixture added at `rules/permissiveness/` and the key set to `autonomous`. Override `instruction` to `IMPLEMENTATION_PHASE` and assert the output contains `### Permissiveness: autonomous`.
- [ ] `packages/mcp-server/tests/integration/mcpIntegration.test.ts`: one `context_build` test on the same kind of temp copy, asserting the same heading in the tool result. If the fixture registry makes a temp copy impractical, add the fragment and config to a per-test temp copy of the registry the file already uses. Do not modify the shared fixture on disk.
- [ ] No parity matrix: both share `createContextPipeline` (design, Technical Requirements).
  - [ ] Success: `pnpm --filter @context-forge/cli test` and `pnpm --filter @context-forge/mcp test` pass, and `git status` shows no changes under any `tests/fixtures/` directory except `packages/core/tests/fixtures/permissiveness/`.
- [ ] Commit: `test: add cf build and context_build permissiveness smoke tests`
- **Effort:** 2/5

---

## Task 7: setup-ide ignores the `permissiveness/` subdirectory (D2)

- [ ] In `packages/cli/tests/ideInstall/rules.test.ts`, add one test. In a temp rules directory, put `general.md` (with `alwaysApply: true` frontmatter, like the existing fixtures) and `permissiveness/autonomous.md` (the Task 2 fixture).
  - [ ] `listMarkdownFiles(rulesDir)` returns only `general.md`.
  - [ ] `compileAlwaysOnRules` output does not contain `Permissiveness: autonomous`.
- [ ] No source change in `packages/cli/src`. If the test fails, stop and report it: it means setup-ide would install the fragments, which contradicts D2.
  - [ ] Success: `pnpm --filter @context-forge/cli test -- rules` passes, and every existing setup-ide test (including `realGuide.test.ts` and the snapshots) passes unmodified.
- [ ] Commit: `test(cli): pin that setup-ide ignores rules subdirectories`
- **Effort:** 1/5

---

## Task 8: Documentation

- [ ] `README.md` "Key configuration" table (~:386, after `workflow.decision_gate_enabled`): add `workflow.permissiveness | shared | How readily AI work waits on the PM: cautious, standard (default) or autonomous. Applied by cf build in Phases 4–6.`
- [ ] `README.md`: below the table, add a short **Permissiveness** subsection:
  - [ ] the three levels and what each means (D1), and that `standard` adds nothing;
  - [ ] that `cf build` / `context_build` add the fragment after the instruction prompt in Phases 4, 5 and 6 only, and that a change applies at the next build with no `cf setup-ide`;
  - [ ] the fragment path convention `project-guides/rules/permissiveness/<level>.md`, owned by ai-project-guide (v0.21.9 or later);
  - [ ] that a missing fragment fails the build and `cf guides update` fixes it;
  - [ ] that cf does not read or enforce `BLOCKED:` lines (D7), and that sessions outside `cf build` / `/cf:build` do not get the setting (D3).
- [ ] Slice design `Dependencies` section: confirm it records ai-project-guide#46 and v0.21.9 and that the installed guide is v0.21.9 (corrected 20261019). No edit needed unless the guide version changed since.
- [ ] `CHANGELOG.md` `[Unreleased]`: one line for `workflow.permissiveness` (#122).
  - [ ] Success: every key, level, path, and command name in the docs matches the code. Cross-check with `grep -rn "permissiveness" packages/*/src`.
- [ ] Commit: `docs: document workflow.permissiveness`
- **Effort:** 1/5

---

## Task 9: CI check and walkthrough

- [ ] Run the CI sequence from `.github/workflows/ci.yml`, in its order: `pnpm install --frozen-lockfile`, `pnpm -r build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Every step passes.
- [ ] Run the design's **Verification Walkthrough** steps 1–6 in this repo with `node packages/cli/dist/index.js`, saving outputs in the session scratchpad, not the repo:
  - [ ] Step 1: set phase 4 and save the `build` output; `config get workflow.permissiveness` prints `standard`.
  - [ ] Step 2: the installed guide already has `autonomous.md`; no test fragment is needed. Set `autonomous` and rebuild; the fragment follows the instruction prompt. Call `context_build` through the MCP server (or the `mcpIntegration` test harness) and confirm the same section.
  - [ ] Step 3: set phase 2 and rebuild; no `### Permissiveness:` heading.
  - [ ] Step 4: move the installed `rules/permissiveness/cautious.md` aside, set `cautious`, set phase 4 and build; the build fails naming the missing path. Move the file back.
  - [ ] Step 5: `config set workflow.permissiveness bogus` is rejected and lists the three levels.
  - [ ] Step 6: set `standard`, rebuild, and `diff` against step 1; no difference.
  - [ ] Finish with `config unset workflow.permissiveness` and restore the phase to what it was before step 1.
  - [ ] Success: every step gives the expected result, and `git status` shows no stray config, guide, or project-state changes.
- [ ] Commit any corrections with the matching semantic prefix. If there is nothing to commit, note that in the task-checker update.
- **Effort:** 1/5
