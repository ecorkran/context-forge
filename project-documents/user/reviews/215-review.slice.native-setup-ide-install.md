---
docType: review
layer: project
reviewType: slice
slice: native-setup-ide-install
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/215-slice.native-setup-ide-install.md
aiModel: claude-opus-5-5
aiProfile: sdk
status: complete
dateCreated: 20261012
dateUpdated: 20261012
reviewedSha: 2ff962a844d34978b4f7a5aa3316002914e6967d
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
durationSeconds: 55.5
squadronVersion: 0.21.5
findings:
  - id: F001
    severity: pass
    category: architecture
    summary: "Aligns with the docs-only guide boundary and keeps commands composable"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md#overview"
  - id: F002
    severity: pass
    category: scope
    summary: "Scope matches the slice plan entry"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md#technical-scope"
  - id: F003
    severity: pass
    category: dependencies
    summary: "Code lives in `cli`, not `core`"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md#technology-choices"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Failure handling for filesystem I/O is unspecified"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:132-135"
  - id: F005
    severity: concern
    category: error-handling
    summary: "Dry-run sandbox cleanup is not specified"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:97"
  - id: F006
    severity: concern
    category: verification
    summary: "The main parity check can't be reproduced as written"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:262-271"
  - id: F007
    severity: concern
    category: integration
    summary: "Config scope for `rules.exclude` in the worktree loop is ambiguous"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:94"
  - id: F008
    severity: note
    category: compatibility
    summary: "Byte-identical claim is effectively macOS-only"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:285"
  - id: F009
    severity: note
    category: dependencies
    summary: "Input document is outside this repo and possibly outside the installed guide"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:65"
  - id: F010
    severity: note
    category: proportionality
    summary: "Two snapshot-update triggers"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:123"
---

# Review: slice — slice 215

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [PASS] Aligns with the docs-only guide boundary and keeps commands composable

The architecture document (`200-arch.developer-onboarding.md`) says cf owns executable tooling and the guide owns content, and that 215 ports `setup-ide`. The slice reads rules, agents, skills and lint material from the installed guide at run time and does not hard-code any of it. `cf setup-ide` stays callable on its own, and `cf init --ide` still composes it through `setupIdeAction`. That keeps the "Composability preserved" principle. The release coupling (guide removes the scripts only after the cf release; old cf with a new guide breaks; PM accepted) repeats the architecture's own rule.

### [PASS] Scope matches the slice plan entry

The plan entry left two choices to the design: vitest vs. pytest, and whether to fix #38/#40. The design decides both and gives reasons. The scaffolding the plan lists for removal is all removed: `--capabilities`, the flag text search, the `.bak` path, `guideScript.ts` and the copy-and-prune fallback. The exclusions (no new targets, no command-surface changes, guide-side deletion left to the guide session) keep the work from growing. A 10-module layout is reasonable for porting about 2,000 lines of bash.

### [PASS] Code lives in `cli`, not `core`

Every consumer is a CLI command, and the architecture keeps the MCP server to atomic tools with no setup-ide tool. So placing the code in `packages/cli/src/ideInstall/` follows the dependency direction. The design also says when it would move to `core`.

### [CONCERN] Failure handling for filesystem I/O is unspecified

The error policy has two cases: `InstallAbort` returns exit 1, and any other exception is treated as a bug and propagates. That moves process-level failures in from the bash side. Ordinary environment failures (`EACCES`, `ENOSPC`, a failed rename in `managedSection.ts`) would then be reported as bugs. The design leaves three cases open:
- **Partial writes:** an exception mid-target leaves some files written and `.context-forge/<target>.manifest` not updated. The next run's ownership check will see those files as unowned or edited. The design doesn't say whether that is acceptable or how it recovers.
- **Worktree loop:** line 103 says the loop records failed worktrees and keeps going. It doesn't say whether a non-`InstallAbort` exception in one worktree is recorded or ends the whole loop.
- **Missing guide source directories:** for a guide older than v0.19, or one with `project-guides/rules` absent, line 182 says "no probing is needed". It doesn't say whether the installer then fails explicitly or quietly installs nothing. The project's no-silent-fallback rule requires an explicit failure.

Add a short failure-mode table covering filesystem errors, partial installs, missing source directories and per-worktree exceptions, with the handling for each.

### [CONCERN] Dry-run sandbox cleanup is not specified

Dry run uses `fs.mkdtempSync` and `fs.cpSync`, then runs a full install in the sandbox. The design never says the sandbox is removed, either on success or when the install throws (`InstallAbort` or anything else). Without a `finally` that removes it, every failed dry run leaves a copy of the project's install paths in the system temp directory. Say that cleanup happens in `finally`, and say what happens if cleanup itself fails.

### [CONCERN] The main parity check can't be reproduced as written

Risk is rated High because of byte-level drift on content the fixtures don't cover. The main mitigation is walkthrough step 4, but its cf half is only a comment: "the vitest parity helper calls installIde on $B". That helper is not among the modules or test files, and its name, location and invocation are not given. The bash side also disappears once the guide release removes the script, so this check only works during implementation.

Two fixes are needed:
- Name the helper and the exact command so a reviewer can rerun step 4.
- Say what `test_real_guide` asserts after the script is gone (line 169). If it compares snapshots, every guide content update will break it. If it only runs the install, that should be stated.

### [CONCERN] Config scope for `rules.exclude` in the worktree loop is ambiguous

The dependencies section says `rules.exclude` is read "for the checkout being installed". The data flow says it is read once, from "the checkout's config", before `installIde` is called. cf config is stored per checkout directory (it is already used that way for `git.integration_branch`). So it is unclear whether the worktree loop re-reads `rules.exclude` for each worktree root or reuses the main checkout's value. The two give different files when a worktree overrides the key. State which one, and add a check to walkthrough step 5.

### [NOTE] Byte-identical claim is effectively macOS-only

The design says cf output now always matches macOS, even where Linux bash output differed. On Linux, existing installs written by bash will get a one-time rewrite, like the #38/#40 fixes. The success criteria (line 233) list only #38/#40 as expected differences. Consider adding "Linux-specific bash output" to that list so the criterion matches the risk statement.

### [NOTE] Input document is outside this repo and possibly outside the installed guide

The findings doc is cited by guide commit `26908c1`. A tarball-installed guide may not include `project-documents/user/analysis/`. Implementers need to know where to read it, for example from the guide repository at that commit.

### [NOTE] Two snapshot-update triggers

The harness writes snapshots when either `UPDATE_SNAPSHOTS` is set or vitest is in update mode. One trigger, vitest's `-u`, is enough, and removing the env var takes away a second path to remember. This is minor.

### Run Digest

- Response length: 7432 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 55.5 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 10
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 10
- Finding-shaped matches — surviving validation: 10
