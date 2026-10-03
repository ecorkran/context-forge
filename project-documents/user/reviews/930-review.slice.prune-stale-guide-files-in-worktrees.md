---
docType: review
layer: project
reviewType: slice
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
reviewedSha: 68dddd6bf45c73348ee24f70afeb4eb8cf8c7609
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 22.3
squadronVersion: 0.18.2
findings:
  - id: F001
    severity: pass
    category: scope-alignment
    summary: "Fits the maintenance charter and its principles"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Overview"
  - id: F002
    severity: concern
    category: testing
    summary: "\"No behavior changes without tests\" is met only partly for the existing propagation path"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Migration Plan"
  - id: F003
    severity: concern
    category: scope-creep
    summary: "Scope grows beyond a themed maintenance slice"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Technical Scope"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Failure modes for new I/O paths are mostly handled, but the cksum-reads and concurrent-writer cases are unaddressed"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Patterns and Conventions"
  - id: F005
    severity: concern
    category: dependency-boundaries
    summary: "Duplicated guide logic is a standing coupling with no drift detection"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#D1"
  - id: F006
    severity: note
    category: dependency-boundaries
    summary: "Dependency direction is correct after the leaf-module extraction"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Component Structure"
  - id: F007
    severity: note
    category: nfr
    summary: "No NFR applies to this path"
    location: "project-documents/user/architecture/900-arch.maintenance-and-refactoring.md"
---

# Review: slice — slice 930

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Fits the maintenance charter and its principles

The slice fixes a defect: worktrees accumulate dead guide files. That is cross-cutting maintenance, so it fits the charter. It has concrete success criteria (1–11) and a walkthrough, which meets "opportunistic but intentional". It also lists exclusions: root pruning, `.gitignore` writing, and the vendored guide tree. The extraction of `worktreePropagation.ts` and `installManifest.ts` also keeps `setup-ide.ts` under the size limit.

### [CONCERN] "No behavior changes without tests" is met only partly for the existing propagation path

The architecture requires test coverage that verifies preserved behavior before and after a change. The slice moves `propagateToWorktrees` and says existing tests must pass unmodified. It doesn't say these tests exist for the worktree filter (missing path, "default" worktree), the copy set, and the final count line. It also doesn't say they are checked first. The slice also changes a behavior: a declined overwrite prompt used to propagate and now doesn't. That change is covered by a new test. Add a step 0 to the development approach: confirm or add characterization tests for the current propagation behavior before moving the code.

### [CONCERN] Scope grows beyond a themed maintenance slice

The architecture asks for slices grouped by theme and warns against open-ended work. This slice includes a new feature: a manifest parser, a CRC implementation, a prune engine, a prompt sweep, and a descriptor change. It also includes a behavior fix for the declined prompt and an extraction refactor. Each part is justified, and the slice is bounded by GitHub #103. Still, the parent charter lists no feature-sized work like this. The slice should say explicitly why #103 belongs in the 900 maintenance initiative and not in a feature initiative. It should also say that the declined-prompt fix and the extraction are in scope only because pruning requires them. The "Review Resolution" section dismisses the thin-architecture finding by pointing to the slice plan, so this rationale is not in the slice doc itself.

### [CONCERN] Failure modes for new I/O paths are mostly handled, but the cksum-reads and concurrent-writer cases are unaddressed

Failure handling is good. Fail-fast behavior, partial-run state, temp-file-plus-rename for the manifest, and realpath containment are all specified. Two paths are still implicit:
- A TOCTOU race between `lstat`, the checksum read, and the delete if a user or tool edits the file during propagation. Say that this is accepted, or re-check the checksum immediately before the unlink.
- The temp file left behind if the process dies between write and rename. State whether a stray temp file in `.context-forge/` is ignored or cleaned on the next run, and give it a name that cannot be mistaken for a manifest.
There are no network or timeout paths, so those are not applicable.

### [CONCERN] Duplicated guide logic is a standing coupling with no drift detection

The slice duplicates the guide's prune rule, the `remove_empty_install_dirs` depth rule, the manifest format, the CRC, and the generated marker in cf. D1 accepts this and notes it in a module header. D2 rejects copying the legacy table for the same drift reason, so the two decisions are not consistent. The parse-time throw catches format changes, but not changes to the depth rule or marker literal. Consider a test that runs the vendored guide's `scripts/setup-ide` and compares its manifest output with cf's `cksum`. That would turn the CRC fixtures into a live contract check against the vendored guide version.

### [NOTE] Dependency direction is correct after the leaf-module extraction

Imports run one way only: `setup-ide.ts` → `worktreePropagation.ts` → `installManifest.ts` and `ideTargets.ts`. The descriptor-driven `generatedPromptDirs` avoids target-name checks. Re-exporting from `setup-ide.ts` keeps existing importers working. The one cost is that `ideTargets.ts` stops being a pure leaf of constants and becomes the home of the descriptor table.

### [NOTE] No NFR applies to this path

The architecture states no latency or throughput targets, so none need restating. Propagation reads one manifest and stats the stale paths per worktree. The cost is proportional to the number of worktrees and manifest entries, and nothing in the doc suggests a problem.

### Run Digest

- Response length: 5296 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 22.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
