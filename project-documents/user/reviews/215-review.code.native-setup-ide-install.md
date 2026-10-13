---
docType: review
layer: project
reviewType: code
slice: native-setup-ide-install
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/215-slice.native-setup-ide-install.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261013
dateUpdated: 20261013
reviewedSha: 57a6b15471eba847144578583046e34b3e5e5ccf
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
diffTruncated: true
durationSeconds: 37.3
squadronVersion: 0.21.6
findings:
  - id: F001
    severity: concern
    category: security
    summary: "Install writes follow symlinks at the destination, with containment checked only for deletion"
    location: "packages/cli/src/ideInstall/manifest.ts#InstallManifest.installFile"
  - id: F002
    severity: concern
    category: error-handling
    summary: "Manifest is no longer written atomically"
    location: "packages/cli/src/ideInstall/manifest.ts#InstallManifest.finish"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Silent fallback for the Copilot instruction `name`"
    location: "packages/cli/src/ideInstall/targets/copilot.ts#instructionFile"
  - id: F004
    severity: concern
    category: correctness
    summary: "Unescaped dynamic field name in a RegExp"
    location: "packages/cli/src/ideInstall/frontmatter.ts#getFrontmatterField"
  - id: F005
    severity: concern
    category: dry
    summary: "Install flags are duplicated across call sites"
    location: "packages/cli/src/commands/setup-ide.ts:157-195"
  - id: F006
    severity: note
    category: structure
    summary: "Large function in the managed-section merge"
    location: "packages/cli/src/ideInstall/managedSection.ts#writeManagedSection"
  - id: F007
    severity: note
    category: typing
    summary: "Non-null assertion carried into the new worktree loop"
    location: "packages/cli/src/commands/setup-ide.ts#installWorktrees"
  - id: F008
    severity: note
    category: testing
    summary: "Test coverage and structure are strong"
    location: "packages/cli/tests/ideInstall"
---

# Review: code — slice 215

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5
**Diff:** truncated: 256000 of 434583 characters reached the model

## Findings

### [CONCERN] Install writes follow symlinks at the destination, with containment checked only for deletion

`installFile` calls `fs.writeFileSync(dest, content)` after `isFile(dest)`, and `isFile` follows symlinks. A symlinked destination such as `.claude/rules/x.md`, or a symlinked install directory, makes the write land outside the project. This happens when the content differs and the previous manifest allows the overwrite. `escapesTargetRoot` guards only the stale-delete path in `finish()`. The old prune code also treated symlinks as non-regular and kept them. Now `finish()` uses `isFile` (symlink-following) and will remove a symlink whose target bytes match a manifest entry. Run the same lexical and realpath containment check on write, and use `lstat` to refuse symlink destinations.

### [CONCERN] Manifest is no longer written atomically

The removed `copyManifest` staged the manifest in a temp file and renamed it, so it was never left truncated. `finish()` now calls `fs.writeFileSync(this.oldManifest, …)` directly. A crash or ENOSPC mid-write leaves a truncated manifest. The next run then treats the missing entries as not guide-owned and skips or keeps files. `managedSection.ts` already uses temp-plus-rename, so apply the same pattern here.

### [CONCERN] Silent fallback for the Copilot instruction `name`

`getFrontmatterField(text, 'name') || stem` silently substitutes the file stem when `name:` is missing. Project rules say never to use silent fallback values. If the fallback is intended behavior ported from bash, document it with a comment and a test. Otherwise surface a warning, as `frontmatterWarning` does for cursor.

### [CONCERN] Unescaped dynamic field name in a RegExp

`new RegExp(`^${field}:[ ]*`)` interpolates `field` without escaping. Current callers pass constants (`name`, `description`), so it is safe today. It is a latent bug for any future caller, and `escapeRegExp` already exists in `exclusions.ts`. Share it or restrict the parameter's type.

### [CONCERN] Install flags are duplicated across call sites

`{ dryRun: opts.dryRun ?? false, writeLint: opts.writeLint ?? false }` is built once in `setupIdeAction` and again in the command action for `installWorktrees`. `SetupIdeRun` already carries `guideDir`, so it could carry the `InstallFlags` as well. That keeps the root install and the worktree installs from drifting.

### [NOTE] Large function in the managed-section merge

`writeManagedSection` is about 55 lines, slightly over the ~50-line guideline. Extracting the per-state merge (the `switch`) would bring it under the limit.

### [NOTE] Non-null assertion carried into the new worktree loop

`wt.worktreePath!` is kept from the old code. `propagationTargets` already filters on `worktreePath`, but it returns `WorktreeContext[]`, so the type does not reflect that. Narrowing the return type would remove the assertion.

### [NOTE] Test coverage and structure are strong

The port comes with snapshot-driven tests for each module: frontmatter, managed sections, lint, flags, installer error boundary and dry-run sandbox cleanup. The `setup-ide` command tests now mock the installer and pin the arguments passed, the worktree loop, and the rule that a non-failure exception propagates. One gap: I could not confirm that the removed "reads the repo's real claude manifest" real-input parser test has an equivalent. The truncated part of `manifest.test.ts` may cover it.

### Run Digest

- Response length: 4659 chars
- Response is newline-free: no
- Tool calls made: 1
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 37.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
