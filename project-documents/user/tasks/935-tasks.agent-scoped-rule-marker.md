---
docType: tasks
slice: agent-scoped-rule-marker
project: context-forge
lld: user/slices/935-slice.agent-scoped-rule-marker.md
dependencies: [266]
projectState: main at 0.19.18 plus the #133 fix and the guide v0.22.6 minimum (unreleased). setup-ide compiles every alwaysApply rule into every composite block and copies every scoped rule to every target. Design reviewed (CONCERNS, resolved in the design; re-review PASS).
dateCreated: 20261025
dateUpdated: 20261025
status: not_started
---

## Context Summary

- Slice 935 fixes GitHub #123, cf half. A guide rule's frontmatter `agents: [...]` limits which outputs it reaches. Audiences are per output file: `claude`, `agents`, `copilot`, `cursor`.
- The design's Parsing, Unknown audience values, State Management and Success Criteria sections are the spec. Do not widen them: no block-list parsing, no per-target audience, no skills filtering.
- Key files: new `packages/cli/src/ideInstall/ruleAudience.ts`, plus `ideInstall/rules.ts`, `ideInstall/targets/{claude,agents,cursor,copilot}.ts`, `ideInstall/exclusions.ts` (skip-message helper), `ideInstall/guideRules.ts`, `ideInstall/resolutions.ts`, `ideInstall/context.ts`, and `ideInstall/installer.ts`.
- Tests live in `packages/cli/tests/ideInstall/`. Existing snapshot tests (`snapshots/`, `realGuide.test.ts`) must pass unchanged, because the real guide has no marked rules.
- Use the local build (`node packages/cli/dist/index.js`). The global `cf` is the published package.
- Target is `main` (`git.integration_branch` is empty).

## Tasks

- [ ] **Task 0: Slice branch** (effort: 1)
  - [ ] Confirm `cf config get git.integration_branch` is empty.
  - [ ] `git checkout -b 935-slice.agent-scoped-rule-marker main`.
  - [ ] Success: `git branch --show-current` prints the slice branch.

- [ ] **Task 1: Audience parser** (effort: 2)
  - [ ] Create `ideInstall/ruleAudience.ts` with `RULE_AUDIENCE`, `RuleAudience`, `CompositeAudience` (`claude | agents | copilot`), `AudienceList`, `ruleAudiences(text)`, `reachesAudience(text, audience)` and `unknownAudienceValues(rulesDir)`, as in the design's Component Structure.
  - [ ] Parse per the design's Parsing section: inline list with lenient spacing and quotes, bare scalar, values trimmed and lowercased. A valueless `agents:` is reported as an unknown entry with the "write it inline" message and yields no known audiences. The key is read from the opening fence up to the closing fence or end of file. Reuse `FENCE` and `toRecords` from the frontmatter helpers. `getFrontmatterField` itself cannot be reused, because it returns `''` both when the key is absent and when it has no value, and the design treats those two cases differently.
  - [ ] `reachesAudience` returns true when the key is absent, and otherwise only when `known` includes the audience.
  - [ ] Success: `pnpm -r build` passes.

- [ ] **Task 1T: Parser tests** (effort: 2)
  - [ ] Create `tests/ideInstall/ruleAudience.test.ts`.
  - [ ] Cover: absent key (null), `[claude]`, `[ "claude", 'cursor' ]`, `agents: Claude` (scalar, case-folded), `[]` (no audiences), a valueless `agents:` followed by `  - claude` (no known audiences plus the inline message), an unknown value next to a known one, a key outside the frontmatter (ignored), unclosed frontmatter, and no frontmatter.
  - [ ] `reachesAudience` for each audience on a marked rule and an unmarked rule.
  - [ ] `unknownAudienceValues` over a temp rules directory: reports each unknown value with its rule filename, and reports nothing for a clean directory.
  - [ ] Success: all pass.

- [ ] **Task 1C: Commit**: `feat(cli): add rule audience marker parser`

- [ ] **Task 2: Filter the composite compilers** (effort: 2)
  - [ ] `rules.ts`: `alwaysOnRules(rulesDir, audience)` filters on `reachesAudience`. `compileClaudeRules` passes `RULE_AUDIENCE.Claude`. `AlwaysOnOptions` gains a required `audience`.
  - [ ] `targets/agents.ts` `emitAgentsMd` passes `RULE_AUDIENCE.Agents`. `targets/copilot.ts` passes `RULE_AUDIENCE.Copilot` for copilot-instructions.md.
  - [ ] Closing counts report only the rules written.
  - [ ] Tests: Task 3T asserts the composite block contents for every target. Tasks 2 and 3 share the Task 3C commit, so no commit lands without its tests.
  - [ ] Success: build passes, and existing snapshot tests pass unchanged.

- [ ] **Task 3: Filter the scoped paths** (effort: 2)
  - [ ] `exclusions.ts`: add `audienceSkippedMessage(filename, known)` → `⊘ Skipped <file> (agents: <comma list>)`, next to `excludedMessage`.
  - [ ] `targets/claude.ts` `copyClaudeModularRules` (`claude`), `targets/cursor.ts` `copyCursorRules` (`cursor`), and `targets/copilot.ts` `emitCopilotInstructionFiles` (`copilot`): skip unreached rules after the alwaysApply check and print the skip line in yellow.
  - [ ] `targets/agents.ts` `scopedRuleIndex`: leave out rules that do not reach `agents`, silently, as it does for excluded rules.
  - [ ] Success: build passes, and existing snapshot tests pass unchanged.

- [ ] **Task 3T: Delivery tests** (effort: 3)
  - [ ] Add a fixture rules directory (under `tests/ideInstall/fixture_data/` or built in a temp dir, following the existing harness pattern) with one alwaysApply rule marked `[claude]`, one scoped rule marked `[claude]`, and one unmarked rule of each kind.
  - [ ] For the claude, agents, copilot and cursor targets, assert the design's first two Functional Requirements: block contents per composite, scoped files present or absent, scoped index contents, and the skip line for each copier that skips.
  - [ ] Manifest prune: run cursor and copilot installs with the scoped rule unmarked, mark it, and run them again. The previously written `.mdc` and `.instructions.md` files are removed when unedited, and kept with the manifest's existing warning when edited.
  - [ ] Success: all pass.

- [ ] **Task 3C: Commit**: `feat(cli): honor the agents rule marker in setup-ide`

- [ ] **Task 4: Per-audience resolutions and inventory field** (effort: 3)
  - [ ] `guideRules.ts`: add `agents: RuleAudience[] | null` to `GuideRuleEntry`, using `ruleAudiences` (known values only). Replace `delivered(entry)` with `deliveredTo(entry, audience)` and update its doc comment.
  - [ ] `resolutions.ts`: `classifyResolutions`: `live` holds resolutions whose rule is delivered to at least one composite audience. Stale lists are unchanged. `renderResolutions(live, entries, audience)` keeps only the resolutions delivered to `audience`.
  - [ ] `context.ts` and `installer.ts`: `resolutionsSection` becomes `resolutionSections: Readonly<Record<CompositeAudience, string>>`, with every entry defaulting to `''`, and `classifyForInstall` renders each one.
  - [ ] Targets read their section: claude reads `claude`, `emitAgentsMd` reads `agents`, and copilot-instructions.md reads `copilot`.
  - [ ] Update every existing caller and test of `delivered`, `renderResolutions` and `resolutionsSection`.
  - [ ] Success: build and the existing resolutions tests pass, with signatures updated.

- [ ] **Task 4T: Resolution and inventory tests** (effort: 2)
  - [ ] A resolution on a `[claude]` rule renders in CLAUDE.md's block, and not in AGENTS.md's or copilot-instructions.md's.
  - [ ] A resolution on an unmarked rule still renders in every block.
  - [ ] `cf rules inventory --json` (`tests/commands/` rules inventory test) shows `"agents": ["claude"]` for a marked rule and `"agents": null` for an unmarked one.
  - [ ] Success: all pass.

- [ ] **Task 4C: Commit**: `feat(cli): render rule resolutions per audience and report rule audiences`

- [ ] **Task 5: Unknown-value warning** (effort: 1)
  - [ ] `installer.ts`: before the target runs, and only when the rules directory exists, call `unknownAudienceValues` and print each value with `out.statusErr('yellow', …)` in the design's format: `⚠️  <rule>: unknown agents value '<value>' (known: <list>) — ignored`. Build `<list>` from `Object.values(RULE_AUDIENCE)` and never hardcode it. The valueless-key case uses its own inline message.
  - [ ] Test: one warning per unknown value per install, the valueless `agents:` warning with its inline message, exit code 0, and no warning for a clean guide.
  - [ ] Success: tests pass.

- [ ] **Task 5C: Commit**: `feat(cli): warn on unknown agents marker values`

- [ ] **Task 6: Docs** (effort: 1)
  - [ ] README: a short "Agent-scoped rules" note in the setup-ide section covering the marker, the four audiences, that a missing key means all audiences, and the Cursor always-on edge from the design.
  - [ ] `packages/cli/README.md`: note the `agents` field in `cf rules inventory --json`.
  - [ ] CHANGELOG `## [Unreleased]`: one entry under `### Added`, user-facing, citing #123.
  - [ ] Success: docs read correctly against the implemented behavior.

- [ ] **Task 6C: Commit**: `docs: document the agents rule marker`

- [ ] **Task 7: Verification** (effort: 2)
  - [ ] `pnpm -r build`, `pnpm -r typecheck`, lint (`npx eslint .` from the repo root), and `pnpm -r test`. All pass.
  - [ ] Run the design's Verification Walkthrough in a scratchpad copy, using the local build. Record the results in the slice design's Verification Walkthrough section.
  - [ ] Success: every walkthrough step matches. Commit as `docs: record slice 935 walkthrough`.

## Task Review Resolution

Review `935-review.tasks.agent-scoped-rule-marker.md` (claude-sonnet-5-5, CONCERNS):

- **Hardcoded known-audience list:** Task 5 now builds the list from `RULE_AUDIENCE`.
- **Valueless-key warning untested:** added to the Task 5 test.
- **Task 2 without tests:** Tasks 2 and 3 share one commit, and Task 3T covers the composite blocks. This is now stated in Task 2.
- **Reusing the frontmatter helpers (note):** Task 1 reuses `FENCE` and `toRecords`, and says why `getFrontmatterField` cannot be reused.
