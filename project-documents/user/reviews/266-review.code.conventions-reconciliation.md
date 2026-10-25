---
docType: review
layer: project
reviewType: code
slice: conventions-reconciliation
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/266-slice.conventions-reconciliation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261024
dateUpdated: 20261024
reviewedSha: 80ef264992cf9798877e51b00a583650b3d5c79d
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
turns: 1
promptTokens: 70579
cachedTokens: 3232
cacheWriteTokens: 67345
completionTokens: 3804
durationSeconds: 30.5
costUsd: 0.313206
costBasis: provider
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: security
    summary: "Resolution validation doesn't cover every field that is rendered into the managed block"
    location: "packages/core/src/ruleReconciliation/schema.ts#validateRuleResolution"
  - id: F002
    severity: concern
    category: error-handling
    summary: "Fixed temp-file name in the atomic write"
    location: "packages/core/src/ruleReconciliation/store.ts#addRuleResolution"
  - id: F003
    severity: concern
    category: design
    summary: "Install-set knowledge is duplicated in core"
    location: "packages/core/src/detection/presentPaths.ts#COMPOSITE_RULE_FILES"
  - id: F004
    severity: concern
    category: structure
    summary: "Command module depends on another command module"
    location: "packages/cli/src/commands/rulesInventory.ts:15"
  - id: F005
    severity: note
    category: error-handling
    summary: "Silent skip in `classifyForInstall` when the rules directory is missing"
    location: "packages/cli/src/ideInstall/installer.ts#classifyForInstall"
  - id: F006
    severity: note
    category: testing
    summary: "Test fragility and type assertions"
    location: "packages/core/tests/ruleReconciliation/projectSources.test.ts"
  - id: F007
    severity: pass
    category: design
    summary: "Reconciliation design and test coverage"
    location: "packages/cli/src/ideInstall/resolutions.ts"
---

# Review: code — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Resolution validation doesn't cover every field that is rendered into the managed block

`statement` is checked for line breaks and for the BEGIN, END and generated markers. `guideRule` and `projectSource` are checked only for backticks, yet both are rendered on the same bullet line in `renderResolutions`. A hand-edited `rule-resolutions.json` can hold a newline or a marker in either field. That would split the bullet or inject a marker into the composite, which is the corruption the statement checks exist to prevent. `cf rules resolve` blocks this indirectly, because it only accepts names from the inventory, but `readRuleResolutions` and the install path trust the file as is. `classifyResolutions` also joins `projectSource` onto `projectRoot` without checking containment, so a value like `../x` is probed outside the checkout. Apply the same line-break and marker checks to all three fields, and reject absolute or `..` paths in `projectSource`.

### [CONCERN] Fixed temp-file name in the atomic write

The temp file is always `${file}.tmp`. Two concurrent `cf rules resolve` runs, for example from a worktree and the primary checkout, can write to the same temp file and clobber each other. If `renameSync` throws, the temp file is left behind, and the next run silently overwrites it. The read-modify-write is also not locked, so one of two concurrent appends can be lost. Use a unique temp name and remove the temp file on failure. At minimum, document that concurrent use is unsupported.

### [CONCERN] Install-set knowledge is duplicated in core

`COMPOSITE_RULE_FILES` hand-lists the files `setup-ide` writes a managed block into. The cli's `TARGETS` descriptors already define that set. If a target gains or loses a composite, the two lists drift apart. A drifted entry would make `projectRuleSources` misclassify a file as standalone and report no `managedBlock`. This conflicts with the "define a value once" rule. Derive one list from the other, or add a test that asserts the two lists match.

### [CONCERN] Command module depends on another command module

`rulesInventory.ts` imports `readRulesExclude` from `commands/setup-ide.ts`. That forces the export of a previously private helper and ties the inventory to a large command module. It is not a cycle today, but it cuts against the acyclic layering described in `ideTargets.ts`. Move `readRulesExclude` to a leaf module such as `ideInstall/exclusions.ts`.

### [NOTE] Silent skip in `classifyForInstall` when the rules directory is missing

The function returns `null` when `base.guide.rules` is not a directory. The doc comment says the target's `requireRulesDir` aborts the install later, so nothing is dropped. That holds only if every target calls `requireRulesDir` before writing. I checked `claude.ts` but did not check the others, so the guarantee depends on every target keeping that call.

### [NOTE] Test fragility and type assertions

- The `chmod 0o000` unreadable-file test passes vacuously when run as root, as in some CI containers.
- `setup-ide.test.ts` enumerates each re-exported core symbol by hand in its mock, so every new core re-export breaks it. Spreading `actual`, as `init.test.ts` now does, is sturdier.
- Several tests use `as` assertions: the `JSON.parse` casts in `rules.test.ts` and `error as RuleResolutionsError` after an `instanceof` check in `schema.test.ts`. The `as` cast after `instanceof` is redundant, and the `JSON.parse` casts are low-risk in tests.

### [PASS] Reconciliation design and test coverage

- **Marker consolidation:** The marker literals and the BEGIN/END range logic now live in one place in core, shared by `managedState` and `projectRuleSources`.
- **Install order:** Resolutions are read and validated before any write, and a test verifies that a malformed file leaves the checkout unchanged.
- **Stale handling:** Stale resolutions warn on stderr without changing the exit code.
- **Tests:** Coverage is thorough. It includes a real `setup-ide` manifest as a parser fixture, a byte-identical regression across all targets, dry-run and worktree cases, and error paths.

### Run Digest

- Response length: 4769 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 1
- Tokens — prompt / cached / cache write / completion / reasoning: 70579 / 3232 / 67345 / 3804 / not computed
- Duration: 30.5 s
- Cost: $0.31 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
