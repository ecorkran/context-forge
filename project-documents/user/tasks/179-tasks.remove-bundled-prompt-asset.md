---
slice: remove-bundled-prompt-asset
project: context-forge
lld: user/slices/179-slice.remove-bundled-prompt-asset.md
dependencies: [172-guide-management]
projectState: Slice 189 complete. Bundled prompt asset exists at packages/core/assets/prompt.ai-project.system.md with fallback in CoreServiceFactory.resolvePromptFilePath(). default_project config key defined in ConfigKeys.ts, used as step 3 in CLI resolveProjectWorktree() and step 2 in MCP resolveProjectId(). CLI already emits deprecation warning for default_project. 1118 tests passing (656 core + 290 CLI + 172 MCP). Build clean.
dateCreated: 20260318
dateUpdated: 20260318
status: not_started
---

## Context Summary
- Working on slice 179: Remove Bundled Prompt Asset
- Two removals in one slice: (1) bundled prompt fallback file + resolution path, (2) `default_project` config key + all resolution paths
- `cf init` installs guides automatically; no legitimate use case for bundled fallback
- `default_project` is already deprecated with CLI warning; no known active users
- After this slice, resolution chains simplify: prompt requires installed guide, project requires `--project` flag or CWD match
- Refer to slice design for full migration plan and file change list

---

## Section 1: Remove Bundled Prompt Asset and Update CoreServiceFactory

- [ ] **1.1 Delete the bundled prompt asset file**
  - Delete `packages/core/assets/prompt.ai-project.system.md`
  - [ ] File no longer exists at that path
  - [ ] `git status` shows the deletion

- [ ] **1.2 Update `CoreServiceFactory.resolvePromptFilePath()`**
  - File: `packages/core/src/services/CoreServiceFactory.ts`
  - Remove the `BUNDLED_PROMPT_PATH` constant and its `path.join(...)` / `fileURLToPath(...)` computation
  - Change `resolvePromptFilePath(projectPath?: string)` to `resolvePromptFilePath(projectPath: string)` (required parameter)
  - Remove the fallback `return BUNDLED_PROMPT_PATH` at the end of the function
  - When no guide file exists at the project-local path, throw an `Error` with message: `No prompt file found at ${projectLocalPath}. Run 'cf guide install' to set up the AI project guide.`
  - Remove the `fileURLToPath` import if no longer used elsewhere in the file
  - [ ] `projectPath` is required (not optional)
  - [ ] Missing guide throws with actionable error message
  - [ ] No references to `BUNDLED_PROMPT_PATH` remain in the file
  - [ ] TypeScript compiles with no errors (`npx tsc --noEmit` from `packages/core`)

- [ ] **1.3 Update `CoreServiceFactory` tests**
  - File: `packages/core/tests/services/CoreServiceFactory.test.ts`
  - Re-read the file before modifying — it may have changed since the slice design was written
  - Remove or update any test that expects bundled fallback behavior
  - Add a test: calling `resolvePromptFilePath` with a `projectPath` that has no guide installed throws with message containing "cf guide install"
  - Update any test that calls `resolvePromptFilePath()` without arguments — it now requires `projectPath`
  - [ ] No test references bundled prompt fallback
  - [ ] New test verifies throw on missing guide
  - [ ] All core tests pass (`npx vitest run` from `packages/core`)

**Commit:** `refactor(core): remove bundled prompt asset and fallback path`

---

## Section 2: Update MCP Prompt Tools

- [ ] **2.1 Update `resolvePromptFileForTools` helper**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - Re-read the file before modifying
  - The current helper catches errors from `resolveProjectId` and falls back to `resolvePromptFilePath()` (no args = bundled)
  - Change: remove the try/catch fallback. Let errors propagate. If no project is resolved, throw with guidance message
  - The function should: resolve project ID → get project from store → if project has `projectPath`, call `resolvePromptFilePath(projectPath)` → else throw
  - [ ] No fallback to bundled prompt
  - [ ] Errors propagate with actionable messages

- [ ] **2.2 Update `prompt_list` error handling**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - In the `prompt_list` tool handler, ensure errors from `resolvePromptFileForTools` are caught and returned as a user-friendly error result (not an unhandled throw)
  - Error message should mention `cf guide install` or passing a `projectId`
  - [ ] `prompt_list` returns error text when no project/guide available
  - [ ] Error message includes guidance

- [ ] **2.3 Update `prompt_get` error handling**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - Same pattern as 2.2: catch errors from `resolvePromptFileForTools`, return user-friendly error
  - [ ] `prompt_get` returns error text when no project/guide available

- [ ] **2.4 Update MCP context tools tests**
  - File: `packages/mcp-server/tests/contextTools.test.ts`
  - Re-read the file before modifying
  - Remove `default_project fallback (context tools)` describe block and its tests
  - Remove or update the `resolvePromptFilePath` mock if it returns a bundled path
  - Add test: `prompt_list` without project returns error mentioning "guide install"
  - Add test: `prompt_get` without project returns error mentioning "guide install"
  - [ ] No tests reference bundled prompt fallback
  - [ ] New tests verify error behavior for prompt tools
  - [ ] All MCP tests pass (`npx vitest run` from `packages/mcp-server`)

**Commit:** `refactor(mcp): remove bundled prompt fallback from prompt tools`

---

## Section 3: Remove `default_project` Config Key

- [ ] **3.1 Remove `default_project` from `ConfigKeys.ts`**
  - File: `packages/core/src/config/ConfigKeys.ts`
  - Re-read the file before modifying
  - Remove the `default_project` entry from `CONFIG_KEYS`
  - [ ] `default_project` key no longer exists in `CONFIG_KEYS`
  - [ ] TypeScript compiles with no errors

- [ ] **3.2 Update `ConfigManager` tests**
  - File: `packages/core/tests/config/ConfigManager.test.ts`
  - Re-read the file before modifying
  - Any test that uses `default_project` as the test key should be updated to use a different existing key (e.g., `guide.source` or `guide.git_strategy`)
  - [ ] No test references `default_project`
  - [ ] All core tests pass

**Commit:** `refactor(core): remove default_project config key`

---

## Section 4: Update CLI Project Resolution

- [ ] **4.1 Remove step 3 from `resolveProjectWorktree()`**
  - File: `packages/cli/src/utils/project.ts`
  - Re-read the file before modifying
  - Remove the "Step 3: default_project config" block (the `ConfigManager` instantiation, `cm.get('default_project')`, the stale-project error, and the deprecation warning)
  - Update the function's JSDoc comment to reflect the simplified chain (3 steps, not 4)
  - The step 4 error ("No project specified...") becomes step 3 — no content change needed, just renumber the comment
  - [ ] No `default_project` reference in `resolveProjectWorktree()`
  - [ ] JSDoc accurately describes the resolution chain
  - [ ] `ConfigManager` import can be removed if no longer used in this file

- [ ] **4.2 Remove `default_project` active marker from `cf project list`**
  - File: `packages/cli/src/commands/project.ts`
  - Re-read the file before modifying
  - Find the code that reads `default_project` config to determine which project gets a `*` prefix in `cf project list` output
  - Remove that logic. If the active marker is still desired, base it on CWD match instead (or remove the marker entirely — check what makes sense in context)
  - [ ] No `default_project` reference in `project.ts`
  - [ ] `cf project list` still works (verify output format)

- [ ] **4.3 Update CLI help text**
  - File: `packages/cli/src/index.ts`
  - Re-read the file before modifying
  - Update the `.addHelpText` string that mentions `default_project config`
  - Replace with text about CWD-based resolution: e.g., "overrides CWD-based project detection"
  - [ ] No `default_project` reference in help text

- [ ] **4.4 Update CLI project resolution tests**
  - File: `packages/cli/tests/utils/project.test.ts`
  - Re-read the file before modifying
  - Remove tests for: `resolves via default_project config`, `emits deprecation warning`, `throws UserError when default_project is stale`
  - Verify remaining tests cover the simplified chain (flag → CWD → error)
  - [ ] No tests reference `default_project`
  - [ ] All CLI tests pass (`npx vitest run` from `packages/cli`)

- [ ] **4.5 Update CLI `project.test.ts` and `config.test.ts`**
  - Files: `packages/cli/tests/commands/project.test.ts`, `packages/cli/tests/commands/config.test.ts`
  - Re-read both files before modifying
  - `project.test.ts`: remove active marker test that uses `default_project`
  - `config.test.ts`: update any test that uses `default_project` as example key to use `guide.source` or similar
  - [ ] No tests reference `default_project`
  - [ ] All CLI tests pass

**Commit:** `refactor(cli): remove default_project resolution path and references`

---

## Section 5: Update MCP Project Resolution

- [ ] **5.1 Simplify `resolveProjectId()`**
  - File: `packages/mcp-server/src/tools/resolveProjectId.ts`
  - Re-read the file before modifying
  - Remove step 2 (the `ConfigManager` instantiation and `default_project` lookup)
  - Update error message to: `No project ID provided. Either pass a projectId argument, or ensure the MCP client is running from a registered project directory.\n  Use project_list to see available projects.\n  Use project_create to register a new project.`
  - Remove the `ConfigManager` import
  - Update the JSDoc to reflect 2-step chain
  - [ ] Function has two paths: explicit ID → return, else → throw
  - [ ] No `ConfigManager` or `default_project` reference
  - [ ] Error message includes actionable guidance

- [ ] **5.2 Update `resolveProjectId` tests**
  - File: `packages/mcp-server/tests/resolveProjectId.test.ts`
  - Re-read the file before modifying
  - Remove test: `returns configured default_project when explicit ID omitted`
  - Update test: `throws descriptive error when neither explicit ID nor default_project configured` — simplify to just "throws when no explicit ID provided", update expected error message
  - Remove any test that mocks `ConfigManager.get('default_project')`
  - [ ] No tests reference `default_project`
  - [ ] All MCP tests pass

- [ ] **5.3 Update MCP tool description strings**
  - Files (re-read each before modifying):
    - `packages/mcp-server/src/tools/projectTools.ts`
    - `packages/mcp-server/src/tools/worktreeTools.ts`
    - `packages/mcp-server/src/tools/workflowTools.ts`
    - `packages/mcp-server/src/tools/stateTools.ts`
    - `packages/mcp-server/src/tools/guideTools.ts`
    - `packages/mcp-server/src/tools/introspectionTools.ts`
    - `packages/mcp-server/src/tools/configTools.ts`
    - `packages/mcp-server/src/tools/contextTools.ts`
  - Replace all `.describe()` strings that say `Omit to use default_project config.` with `Omit to resolve from CWD.` (or similar — match the tool's context)
  - In `configTools.ts`, update example strings that use `default_project` as a key example — replace with `guide.source` or similar
  - In `contextTools.ts`, update `prompt_list` and `prompt_get` descriptions that mention bundled prompts or `default_project`
  - [ ] No `.describe()` string references `default_project`
  - [ ] No description mentions bundled prompts as a fallback

- [ ] **5.4 Update remaining MCP test files**
  - Files (re-read each before modifying):
    - `packages/mcp-server/tests/projectTools.test.ts`
    - `packages/mcp-server/tests/stateTools.test.ts`
    - `packages/mcp-server/tests/workflowTools.test.ts`
    - `packages/mcp-server/tests/configTools.test.ts`
  - Remove `default_project fallback` describe blocks and their tests
  - Update any test that uses `default_project` as an example config key
  - [ ] No MCP test references `default_project`
  - [ ] All MCP tests pass

**Commit:** `refactor(mcp): remove default_project resolution path and update tool descriptions`

---

## Section 6: Build, Test, and Verify

- [ ] **6.1 Full build verification**
  - Run `npm run build` from project root
  - [ ] Build completes with no errors

- [ ] **6.2 Full test suite**
  - Run `npx vitest run` from `packages/core`, `packages/cli`, `packages/mcp-server`
  - [ ] All core tests pass
  - [ ] All CLI tests pass
  - [ ] All MCP tests pass

- [ ] **6.3 Grep verification — no stale references**
  - Search entire codebase for: `BUNDLED_PROMPT_PATH`, `default_project`, `bundled prompt` (in source files, not docs/historical)
  - `default_project` may appear in DEVLOG historical entries — that's fine
  - `bundled prompt` may appear in historical docs — that's fine
  - No source code (`.ts` files) should reference either
  - [ ] No stale references in source code

**Commit:** (no separate commit — verification only)

---

## Section 7: Documentation Cleanup and Wrap-Up

- [ ] **7.1 Clean documentation references**
  - Search `project-documents/user/` for "sync bundled asset" or "sync bundled prompt" references that describe ongoing obligations (not historical entries)
  - Update or remove as appropriate — historical DEVLOG entries and completed slice designs should be left as-is
  - [ ] No active documentation describes bundled asset sync as an ongoing requirement

- [ ] **7.2 Update slice plan**
  - Check off slice 179 in `user/architecture/160-slices.project-workflow-system.md`
  - [ ] Slice 179 entry marked `[x]`

- [ ] **7.3 Update slice design status**
  - Set `status: complete` in `user/slices/179-slice.remove-bundled-prompt-asset.md` frontmatter
  - [ ] Status is `complete`

- [ ] **7.4 Update task file status**
  - Set `status: complete` in this file's frontmatter
  - [ ] Status is `complete`

- [ ] **7.5 Write DEVLOG entry**
  - Append entry to `DEVLOG.md` with slice 179 completion summary and commit hashes
  - [ ] DEVLOG entry written

**Commit:** `docs: complete slice 179 remove bundled prompt asset`

---

## Section 8: Verification Walkthrough

Follow the verification walkthrough from the slice design. Update with actual results.

- [ ] **8.1 Normal build — no regression**
  - Run `cf build --phase architecture` from `~/source/repos/manta/context-forge`
  - Verify output is identical to pre-slice behavior
  - [ ] Build output unchanged

- [ ] **8.2 Build without guides — clear error**
  - Create a temporary project with no guides, run `cf build`
  - Verify error message contains "No prompt file found" and "cf guide install"
  - [ ] Error message is clear and actionable
  - Clean up temporary project after verification

- [ ] **8.3 Config key removed**
  - Run `cf config get` — verify `default_project` is not listed
  - Run `cf config set default_project foo` — verify error about unknown key
  - [ ] Config key fully removed

- [ ] **8.4 No bundled asset**
  - Verify `packages/core/assets/prompt.ai-project.system.md` does not exist
  - [ ] File confirmed absent

- [ ] **8.5 Update slice design verification walkthrough**
  - Update the Verification Walkthrough section of the slice design with actual results
  - [ ] Walkthrough updated with actual commands and output

**Commit:** `docs: update 179 slice design verification walkthrough with actual results`
