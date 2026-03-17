---
slice: onboarding-skill
project: context-forge
lld: user/slices/204-slice.onboarding-skill.md
dependencies: [201-project-create-mcp-tool, 202-smart-cf-init, 203-enhanced-cf-next]
projectState: Slices 201-203 complete. project_create MCP tool, smart cf init, and enhanced cf next all implemented and tested. Existing slash commands (7 files) installed via commandInstaller.ts. No onboarding skill exists yet.
dateCreated: 20260315
dateUpdated: 20260315
status: complete
---

## Context Summary
- Working on slice 204: Onboarding Skill — final slice in the 200-band developer onboarding initiative
- All prerequisite infrastructure is in place: `project_create` MCP tool (201), smart `cf init` (202), enhanced `cf next` first-run guidance (203)
- This slice adds a markdown skill file (`onboard.md`) that teaches AI agents to guide users through project setup and into Phase 1 concept discussion
- Delivered via `cf install-commands` alongside existing slash commands
- No runtime code changes — one new markdown file plus one-line registration
- No next planned slice in this initiative (204 completes the 200-band)

---

## Section 1: Create the Onboarding Skill File

- [x] **1.1 Create `packages/cli/commands/cf/onboard.md`**
  - Create the skill file following the pattern established by existing slash commands in the same directory
  - The skill file must contain:
    1. YAML frontmatter with `description`, `argument-hint`, and `allowed-tools`
    2. A purpose paragraph explaining this is a multi-step onboarding guide
    3. Steps 1-5 as described in the slice design's "Skill Content Draft" section
    4. A Notes section with fallback and edge case guidance
  - Use the slice design draft (LLD section "Skill Content Draft") as the starting point, refining wording for clarity
  - Key frontmatter values:
    - `description`: One-line summary for command palette (e.g., "Guide a user through Context Forge project setup and into their first phase of work")
    - `argument-hint`: `[project-name]`
    - `allowed-tools`: Must include `Bash(cf:*)` plus specific MCP tools: `mcp__context-forge__project_list`, `mcp__context-forge__project_create`, `mcp__context-forge__project_get`, `mcp__context-forge__guide_status`, `mcp__context-forge__guide_install`, `mcp__context-forge__context_build`, `mcp__context-forge__workflow_next`
  - Each step must include both MCP tool call instructions and CLI fallback
  - Step 2 (Create project) CLI fallback should note that `cf init` handles guides + IDE setup, so the agent can skip to Step 4 if using the CLI path
  - Step 4 (Transition) must instruct the agent to use the returned context prompt as working context
  - Notes section must cover: MCP failure fallback, later-phase edge case (suggest `cf next`), conversational tone guidance
  - [x] File exists at `packages/cli/commands/cf/onboard.md`
  - [x] YAML frontmatter parses correctly (valid YAML between `---` delimiters)
  - [x] `description` field is present and concise
  - [x] `allowed-tools` includes both `Bash(cf:*)` and all 7 MCP tool references
  - [x] All 5 steps are present with MCP primary and CLI fallback paths
  - [x] Notes section covers failure fallback and later-phase edge case

- [x] **1.2 Verify skill file format matches existing commands**
  - Compare `onboard.md` against an existing command file (e.g., `build.md` or `next.md`) to confirm:
    1. Frontmatter structure matches (same YAML keys)
    2. File starts with `---\n` (required by the command file format test)
    3. Contains `description:` and `allowed-tools:` (checked by existing tests)
  - [x] Frontmatter has same structure as other command files
  - [x] File starts with `---\n` delimiter

**Commit:** `feat(cli): add onboarding skill (onboard.md) for AI-guided project setup`

---

## Section 2: Register in Command Installer

- [x] **2.1 Add `'onboard.md'` to `MANAGED_FILES` in `commandInstaller.ts`**
  - File: `packages/cli/src/commands/commandInstaller.ts`
  - Add `'onboard.md'` to the `MANAGED_FILES` array
  - This ensures `uninstallCommands` knows to remove it (install already copies all `.md` files from the source directory)
  - [x] `MANAGED_FILES` array contains `'onboard.md'`

- [x] **2.2 Verify existing commandInstaller tests pass**
  - Run `npx vitest run packages/cli/tests/commands/commandInstaller.test.ts`
  - The existing tests are data-driven from the source directory (`getExpectedFiles()` reads all `.md` files from `packages/cli/commands/cf/`), so adding `onboard.md` automatically extends coverage:
    - "copies all command files on fresh install" — will now include `onboard.md`
    - "file contents match source files" — will verify `onboard.md` content matches
    - "all command files have valid YAML frontmatter with required fields" — will validate `onboard.md` frontmatter
    - Uninstall tests verify managed files are removed
  - [x] All existing `commandInstaller.test.ts` tests pass
  - [x] Test output shows 8 command files processed (was 7, now includes `onboard.md`)

**Commit:** `feat(cli): register onboard.md in MANAGED_FILES for install/uninstall`

---

## Section 3: Verify MCP Tool References

- [x] **3.1 Cross-check MCP tool names against current server**
  - Verify each MCP tool name referenced in the skill matches the actual registered tool name in the MCP server
  - Tools to verify: `project_list`, `project_create`, `project_get`, `guide_status`, `guide_install`, `context_build`, `workflow_next`
  - Check against tool registrations in `packages/mcp-server/src/tools/` (projectTools.ts, guideTools.ts, contextTools.ts, workflowTools.ts)
  - Verify the `allowed-tools` frontmatter uses the correct `mcp__context-forge__` prefix format
  - [x] All 7 MCP tool names match actual registered tool names
  - [x] `allowed-tools` prefix format is correct (`mcp__context-forge__<tool_name>`)

- [x] **3.2 Cross-check CLI command references**
  - Verify each CLI command referenced in fallback paths exists and works:
    - `cf project list` — verify this subcommand exists
    - `cf init <name>` — verify accepts positional name argument
    - `cf guides status` / `cf guides install` — verify subcommands exist
    - `cf build` — verify works on a project in Phase 1
    - `cf next` — verify works on a fresh project
  - This is a documentation-level check (reading code), not a full integration test
  - [x] All CLI commands referenced in the skill are valid and exist

**Commit:** (no separate commit — verification only, folded into next commit if corrections needed)

---

## Section 4: Build and Full Test Pass

- [x] **4.1 Run full CLI package tests**
  - Run `npx vitest run` from `packages/cli/`
  - All tests must pass, including the commandInstaller tests which now cover `onboard.md`
  - [x] All CLI tests pass

- [x] **4.2 Run full project build**
  - Run `npm run build` from project root
  - Build must succeed with no errors
  - [x] Build completes successfully

- [x] **4.3 Smoke test: install commands and verify onboard.md**
  - Run `cf install-commands` from a project directory
  - Verify `~/.claude/commands/cf/onboard.md` exists and contains the expected content
  - Verify existing commands still present (spot check `status.md`, `build.md`)
  - [x] `onboard.md` installed to `~/.claude/commands/cf/`
  - [x] Existing commands still present after install

**Commit:** `test: verify onboarding skill installation and full test pass`

---

## Section 5: Verification Walkthrough

Follow the verification walkthrough from the slice design. Update the walkthrough in the slice design with actual results.

- [x] **5.1 Walkthrough step 1: Install the skill**
  - Run `cf install-commands` — confirm output lists `onboard.md`
  - Run `ls ~/.claude/commands/cf/onboard.md` — confirm file exists
  - [x] Skill file installed successfully

- [x] **5.2 Walkthrough step 5: Uninstall**
  - Run `cf uninstall-commands`
  - Verify `~/.claude/commands/cf/onboard.md` no longer exists
  - Re-run `cf install-commands` to restore for subsequent manual testing
  - [x] Uninstall removes the skill file
  - [x] Re-install restores it

- [x] **5.3 Update slice design verification walkthrough**
  - Update the Verification Walkthrough section of `user/slices/204-slice.onboarding-skill.md` with actual commands run and their output
  - Note any caveats or deviations from the expected behavior
  - [x] Walkthrough updated with actual results

**Commit:** `docs: update 204 slice design verification walkthrough with actual results`

---

## Section 6: Wrap-Up

- [x] **6.1 Update slice plan**
  - Check off slice 204 in `user/architecture/200-slices.developer-onboarding.md`
  - [x] Slice 204 entry marked `[x]` in slice plan

- [x] **6.2 Update slice design status**
  - Set `status: complete` in `user/slices/204-slice.onboarding-skill.md` frontmatter
  - [x] Status is `complete`

- [x] **6.3 Update task file status**
  - Set `status: complete` in this file's frontmatter
  - [x] Status is `complete`

- [x] **6.4 Write DEVLOG entry**
  - Append entry to `DEVLOG.md` with:
    - Slice 204 completion summary
    - List of commits with hashes
    - Note that this completes the 200-band developer onboarding initiative
  - [x] DEVLOG entry written

**Commit:** `docs: complete slice 204 onboarding skill`
