---
docType: review
layer: project
reviewType: code
slice: agent-skills-path-alignment-codex-copilot
targetKind: slice
rulesSource: project
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261002
dateUpdated: 20261002
reviewedSha: f7b9e6cf48ea1163fb44228fb25f326e91e3b435
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
durationSeconds: 18.8
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: note
    category: error-handling
    summary: "Legacy sweep is safe in the cases the code can reach"
    location: "packages/cli/src/commands/commandInstaller.ts#sweepLegacyGlobalDir"
  - id: F002
    severity: note
    category: design
    summary: "Sweep removes entries by bundled name only"
    location: "packages/cli/src/commands/commandInstaller.ts:229-244"
  - id: F003
    severity: note
    category: dry
    summary: "`.agents/skills` is defined in several places"
    location: "packages/cli/src/commands/setup-ide.ts:46"
  - id: F004
    severity: note
    category: typescript
    summary: "Existing `(err as Error)` assertion in the uninstall CLI handler"
    location: "packages/cli/src/commands/commandInstaller.ts:354"
  - id: F005
    severity: note
    category: testing
    summary: "Test cleanup is not exception-safe in one case"
    location: "packages/cli/tests/commands/commandInstaller.test.ts (uninstallCommandsAction \"--local leaves the legacy dir untouched\")"
  - id: F006
    severity: pass
    category: testing
    summary: "Tests cover scope, idempotence, and failure paths"
    location: "packages/cli/tests/commands/commandInstaller.test.ts"
  - id: F007
    severity: pass
    category: structure
    summary: "Refactor extracts the uninstall action cleanly"
    location: "packages/cli/src/commands/commandInstaller.ts:299-318"
---

# Review: code — slice 929

**Verdict:** PASS
**Model:** claude-sonnet-5-5

## Findings

### [NOTE] Legacy sweep is safe in the cases the code can reach

`sweepLegacyGlobalDir` returns early when the legacy dir is missing, and its `realpathSync` guard stops it deleting the freshly installed skills when `~/.codex/skills` is a symlink to `~/.agents/skills`. A dangling symlink makes `existsSync` return false, so `realpathSync` is never reached and cannot throw. Errors propagate without a swallowing catch, which matches the project's exception rules. The `existsSync(installDir)` check before `realpathSync` is needed.

### [NOTE] Sweep removes entries by bundled name only

The sweep deletes any entry in `~/.codex/skills` whose name matches a bundled cf skill. That includes a user-customized skill that kept the same name. The new test confirms that non-bundled entries such as `other-skill` and `cf-custom` survive. The doc comment documents the behavior, so I'm only noting it.

### [NOTE] `.agents/skills` is defined in several places

The `'.agents/skills'` literal now appears in `setup-ide.ts` `propagateDirs` and in `COMMAND_TARGETS.agents.localDir`. The CLAUDE.md rule is to define a value once and reference it everywhere. A shared constant would let the project-local install dir and the Copilot worktree propagation dir change together. This is low risk and not blocking.

### [NOTE] Existing `(err as Error)` assertion in the uninstall CLI handler

The catch block still uses `(err as Error).message`. The `as` assertion is a code smell under the TypeScript rules, and a non-Error throw would print `undefined`. The pattern predates this diff, but the handler was edited, so it is a cheap fix: `err instanceof Error ? err.message : String(err)`.

### [NOTE] Test cleanup is not exception-safe in one case

The `projectDir` temp dir is removed at the end of the test body, not in `afterEach` or a `finally`. A failed assertion leaks the directory. The home-stub tests clean up properly through `restoreHome`. Moving `projectDir` into the `beforeEach`/`afterEach` lifecycle would make this consistent.

### [PASS] Tests cover scope, idempotence, and failure paths

The new tests cover each case that matters for the new behavior:
- the default scope sweeps the legacy dir and prints one line per location
- `--local` and `--target` leave the legacy dir alone
- a symlinked legacy dir is not swept
- a failed install leaves the legacy skills in place
- the uninstall output has the right shape when only one of the two dirs holds skills, or neither does

The `os.homedir()` stub via `vi.hoisted` keeps the tests off the real home directory. The copilot propagation test in `setup-ide.test.ts` was updated to cover `.agents/skills`.

### [PASS] Refactor extracts the uninstall action cleanly

Moving the uninstall logic out of the commander action into the exported `uninstallCommandsAction` makes it testable and mirrors `installCommandsAction`. `isDefaultScope` and `sweepAndReportLegacy` keep the scope check and the reporting in one place each. The new functions have explicit return types and contain no `any`.

### Run Digest

- Response length: 3706 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 18.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
