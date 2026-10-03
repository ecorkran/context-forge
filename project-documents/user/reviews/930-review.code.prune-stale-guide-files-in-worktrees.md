---
docType: review
layer: project
reviewType: code
slice: prune-stale-guide-files-in-worktrees
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261003
dateUpdated: 20261003
reviewedSha: b563342df8a862d0a8e393edde7caa37f8ef0fb5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
durationSeconds: 24.8
squadronVersion: 0.18.3
findings:
  - id: F001
    severity: concern
    category: typescript-typing
    summary: "Unnarrowed `as` assertions on caught errors"
    location: "packages/cli/src/commands/installManifest.ts:96-107"
  - id: F002
    severity: concern
    category: dry
    summary: "Test scaffolding duplicated across two test files"
    location: "packages/cli/tests/commands/worktreePropagation.test.ts:1-100"
  - id: F003
    severity: concern
    category: test-coverage
    summary: "Tests depend on the repo's committed manifest"
    location: "packages/cli/tests/commands/installManifest.test.ts:14-36"
  - id: F004
    severity: note
    category: magic-values
    summary: "Temp-file name literal repeated in source and tests"
    location: "packages/cli/src/commands/worktreePropagation.ts:158"
  - id: F005
    severity: note
    category: documentation
    summary: "Design-doc labels (D2, D4) in code comments"
    location: "packages/cli/src/commands/setup-ide.ts:188-191"
  - id: F006
    severity: note
    category: documentation
    summary: "`propagateToWorktrees` docstring omits pruning"
    location: "packages/cli/src/commands/worktreePropagation.ts:195-206"
  - id: F007
    severity: note
    category: security
    summary: "Pruning safety checks are thorough"
    location: "packages/cli/src/commands/worktreePropagation.ts:48-91"
---

# Review: code — slice 930

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Unnarrowed `as` assertions on caught errors

`readManifest` casts the caught value with `(err as NodeJS.ErrnoException).code` and `(err as Error).message`. Neither cast has a justifying comment, and the rules say to narrow `unknown` caught values (`err instanceof Error`). The second cast is the riskier one. `parseManifestLine` only throws `Error`, but nothing enforces that. Use `err instanceof Error && 'code' in err`, or a small `isErrnoException` guard. Narrow with `instanceof Error` before reading `.message`.

### [CONCERN] Test scaffolding duplicated across two test files

The `node:fs`, `readline` and `@context-forge/core/node` mock setup is copied nearly verbatim from `setup-ide.test.ts`. So are `readFileSyncOrMissingManifest`, the fixtures and `createProgram`. Two copies of the mock wiring will drift. Extract a shared test helper or fixture module. Also check that `setup-ide.test.ts` has no fixtures left unused after the propagation tests moved out.

### [CONCERN] Tests depend on the repo's committed manifest

The `cksum` test reads the repo's own `.context-forge/claude.manifest` and silently skips listed files that are missing on disk. The comment admits this already happens (`electron.md`). The test therefore depends on mutable repo state and checks less than it appears to. The `checked > 0` guard is weak. Pin a small fixture manifest with known `cksum` outputs. Keep the real-manifest test only as a parse smoke test.

### [NOTE] Temp-file name literal repeated in source and tests

`.${target}.manifest.tmp` is built inline in `copyManifest`. The same pattern is repeated in `worktreePropagation.test.ts` and `installManifest.test.ts`. Per the "define once" rule, expose a `manifestTempPath()` helper next to `manifestPath` in `installManifest.ts`.

### [NOTE] Design-doc labels (D2, D4) in code comments

Comments, constants and test names refer to "D2" and "D4", which only make sense with the slice design doc open. Spell out the behavior in the comment. Examples: "worktree has no manifest, so the root's pre-run snapshot is the baseline", and "guide predates the manifest".

### [NOTE] `propagateToWorktrees` docstring omits pruning

The docstring still describes copy-only behavior. The function now also prunes stale files, sweeps generated prompts, and carries the manifest. It also has a new `rootBaseline` parameter that is undocumented. Update the doc.

### [NOTE] Pruning safety checks are thorough

Deletion is guarded by lexical `..`/absolute-path checks, a realpath containment check, an `lstat` regular-file check, and a CRC and size match against the baseline. A declined overwrite prompt skips propagation (`setupIdeAction` now returns a boolean). ENOENT is the only swallowed error, and a comment explains why. Tests cover the containment, symlink and edited-file cases against real temp directories.

### Run Digest

- Response length: 3502 chars
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
- Duration: 24.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
