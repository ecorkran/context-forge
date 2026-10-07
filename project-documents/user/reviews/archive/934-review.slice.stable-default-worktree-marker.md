---
docType: review
layer: project
reviewType: slice
slice: stable-default-worktree-marker
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/934-slice.stable-default-worktree-marker.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261007
dateUpdated: 20261007
reviewedSha: 8ca9d131a286318fc84c5da90926bd5ecd414952
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 33.1
runId: run-20261007-p4-efda7554
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: concern
    category: architecture-boundaries
    summary: "Store layer depends on a services-layer module"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Component Structure"
  - id: F002
    severity: concern
    category: error-handling
    summary: "Migration write failures and concurrent migrators are not specified"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Special Considerations"
  - id: F003
    severity: concern
    category: under-specification
    summary: "Ambiguous and no-candidate legacy outcomes are inconsistent and can silently strand a project with no default"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Migration rule (`markLegacyDefaultWorktree`)"
  - id: F004
    severity: concern
    category: failure-modes
    summary: "Hard error on duplicate markers blocks the remediation path"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#More than one marked worktree is rejected"
  - id: F005
    severity: concern
    category: scope
    summary: "Scope sits at the edge of the maintenance architecture"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Overview"
  - id: F006
    severity: pass
    category: architecture-alignment
    summary: "Principles alignment: tests, constants, and explicit failure"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Success Criteria"
  - id: F007
    severity: note
    category: nfr
    summary: "NFRs"
    location: "project-documents/user/architecture/900-arch.maintenance-and-refactoring.md"
  - id: F008
    severity: note
    category: documentation
    summary: "Frontmatter `interfaces` is empty despite contract changes"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:7"
---

# Review: slice — slice 934

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Store layer depends on a services-layer module

`FileProjectStore.ensureInitialized()` calls `markLegacyDefaultWorktree`, which lives in `services/defaultWorktree.ts`. The table at lines 59-66 and the "Where the migration runs" decision both say so. Services already depend on `IProjectStore`, so a store import from `services/` points the dependency the wrong way and risks a cycle. The slice should put the pure domain helpers somewhere both layers may import (for example next to `types/`, or a neutral `domain/` module). Alternatively, the store could take the migration as an injected function. The "Program to interfaces" guidance favors the injected option.

### [CONCERN] Migration write failures and concurrent migrators are not specified

This slice adds a write on first read to a path that was read-only before. The doc covers atomic write, backup and the write guard, but it does not say what happens in these cases:
- The write fails (read-only config dir, permissions, disk full). Should the load fail, or continue with in-memory migrated data? If it continues, the migration reruns on every load, so any warning repeats.
- The CLI and an MCP server process both load a legacy file at the same moment. Both migrate and both write. This is probably harmless because the migration is idempotent, but the doc should say that, and say whether the second writer can overwrite a concurrent mutation made between its read and its write.
- `projects.json` is corrupt or unparseable on this new path.

Each of these should get an explicit handling strategy. They should not be left implicit.

### [CONCERN] Ambiguous and no-candidate legacy outcomes are inconsistent and can silently strand a project with no default

- The rule says "nothing is marked" when ambiguous, then says "Every other absent value becomes `false`." It does not say whether the ambiguous candidates become `false` or stay absent.
  - If they become `false`, the project permanently has no default, and only a hand edit fixes it.
  - If they stay absent, the migration reruns on every load, re-warns, and rewrites nothing, so "the file is written once" and "warns once" in the Success Criteria can't both hold.
- The no-candidate case (a user renamed their default before upgrading) is silent. The warning is only for ambiguous cases. That user quietly loses chop and restore, and nothing tells them why.
- The doc should pick one behavior. It should also warn in the no-candidate case when the project has more than one worktree, and say how a user recovers. Because "no command to move the default marker" is excluded, the only recovery is editing `projects.json` by hand.

### [CONCERN] Hard error on duplicate markers blocks the remediation path

`findDefaultWorktree` throws, which stops add, update and remove for that project. The error message points to a hand edit of `projects.json`. Failing explicitly fits the project rules, but the doc should confirm that read-only paths (`list`, `get`, `cf check` attribution) still work. A user needs them to see which worktrees are marked. It should also say whether the message names ids as well as names, so the user can find the right entries when the names are ambiguous.

### [CONCERN] Scope sits at the edge of the maintenance architecture

Architecture 900 scopes the initiative to pattern consolidation, constants, dead-code removal, test gaps, dependency updates and developer-experience improvements. It also says to "slice by theme, not by urgency" and to avoid one-slice-per-fix. This slice is a single-issue defect fix that adds:
- a persisted schema field;
- a store-load data migration;
- a new public field on CLI JSON and MCP responses;
- a new `RemoveWorktreeResult` property;
- CLI output changes.

The "Scope fit" paragraph argues by precedent from slices 926-932 and does not tie the work to an architecture-listed theme. The "Visible default" value and the `list` tagging go slightly past the fix. I recommend one of these:
- Record that the architecture's scope list needs a "defect fixes in shipped code" entry.
- Fold this slice into a themed worktree-hardening group.
- Trim the visibility extras.

### [PASS] Principles alignment: tests, constants, and explicit failure

This satisfies "no behavior changes without tests". It lists unit tests for each branch of the migration, a store fixture test for the migrate-once behavior, a regression test that a name-only `default` is not chopped, and a full build and test pass. It centralizes the default-name knowledge in one module and fails explicitly on ambiguity. It avoids silent guessing, since nothing is marked when the data is ambiguous. The decision to use a flag and not a reserved ID is well reasoned.

### [NOTE] NFRs

The parent architecture states no latency or throughput targets for these paths, so nothing needs restating. The migration does add one extra file write on first load. Since the doc says migration runs once per process, a sentence noting that no measurable startup cost is expected would be enough.

### [NOTE] Frontmatter `interfaces` is empty despite contract changes

`interfaces: []` is stated, yet the slice changes the `WorktreeContext` and `RemoveWorktreeResult` contracts and `FileProjectStore` load behavior. The body's "Provides to Other Slices" lists these. Consider listing them in the frontmatter too, so they can be traced.

### Run Digest

- Response length: 6833 chars
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
- Duration: 33.1 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
