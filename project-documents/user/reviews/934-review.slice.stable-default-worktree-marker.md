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
reviewedSha: 7aa7717f632e81bdffcd7f90eab4e480487a10af
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 21.9
runId: run-20261007-p4-efda7554
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: pass
    category: architecture
    summary: "Dependency direction and layer boundaries are correct"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Architecture"
  - id: F002
    severity: pass
    category: scope
    summary: "Hard-coded value and label-as-structure anti-pattern is consolidated"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:17-21"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new I/O path are enumerated with explicit handling"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Special Considerations"
  - id: F004
    severity: pass
    category: nfr
    summary: "NFR handling"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:294"
  - id: F005
    severity: concern
    category: scope
    summary: "Slice size and risk exceed the architecture's \"low-risk maintenance\" framing"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:17-41"
  - id: F006
    severity: concern
    category: error-handling
    summary: "Write-on-read makes read-only commands fail in read-only environments"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:291"
  - id: F007
    severity: note
    category: documentation
    summary: "Design-review resolution tables embedded in the slice doc"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:303-325"
  - id: F008
    severity: note
    category: dependencies
    summary: "Out-of-scope stdout writes in storage are flagged but not tracked"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:295-300"
---

# Review: slice — slice 934

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Dependency direction and layer boundaries are correct

The design moves the default-worktree knowledge into `utils/defaultWorktree.ts`, which imports only from `types/`. That gives `storage → utils → types` and `services → utils, storage (interface)`. The rejected alternative, injecting the migration into the store, is argued sensibly. The design also takes the `WorktreeService.ts` size problem (482 lines) into account.

### [PASS] Hard-coded value and label-as-structure anti-pattern is consolidated

The slice fits the architecture's "Pattern consolidation and code quality improvements" and "Hard-coded values → configuration or constants" scope items. A grep-based technical requirement (line 237) keeps the name literal in one module. Success criteria are specific, which satisfies the "intentional, not open-ended" principle.

### [PASS] Failure modes for the new I/O path are enumerated with explicit handling

The migration is a new write-on-read I/O path. The slice covers each failure mode:
- A failed write rejects the load, and the init promise is cleared so the next access retries.
- A corrupt file follows the existing `FileStorageService` recovery.
- Concurrent in-process callers are closed off by storing the init promise.
- Cross-process races are acknowledged and bounded.
- Stdout and stderr are separated for MCP stdio.

Tests are specified for each of these. This is stronger than the criteria require.

### [PASS] NFR handling

The architecture states no latency or throughput targets. The slice says so and gives a cost note.

### [CONCERN] Slice size and risk exceed the architecture's "low-risk maintenance" framing

The 900 architecture sets `riskLevel: low`. Its principle is to group small items into themed slices. This slice goes further than a refactor:
- a persisted schema change
- a store-level data migration that rewrites user data on first read
- a new heuristic with three warning outcomes
- a changed `RemoveWorktreeResult` contract
- new CLI output (the `(default)` tag)
- MCP description changes

The architecture's scope list has no "defects in shipped code" entry, and the slice says so itself (line 21). That leaves the scope fit resting on a stretched reading of "pattern consolidation." The PM decision on scope is deferred, not made. Record it before implementation, either by adding the scope entry to the 900 architecture or by getting explicit PM sign-off on the slice document. Consider whether the `(default)` tag and the `defaultWorktree` result field could be split into a follow-up to shrink the blast radius. The doc's own justification is that the tag supports migration-warning recovery, so this is a judgment call.

### [CONCERN] Write-on-read makes read-only commands fail in read-only environments

If the migration write fails, `ensureInitialized()` rejects and the command fails. This applies to `cf worktree list`, `cf check` and MCP `worktree_list`, and to any other store access, including commands that never touch worktrees. In a read-only config directory, such as a locked-down CI image or a shared config, upgrading would break commands that worked before. The slice rejects the in-memory fallback for sound reasons (consumers acting on an unsaved default), but it does not address the regression for read-only consumers. State explicitly whether this breakage is accepted. Alternatively, scope the hard failure to mutating operations, with read paths proceeding on the in-memory migrated data plus a stderr warning. The same data feeds only advisory output on read paths, so the "act on an unsaved default" concern applies much less there.

### [NOTE] Design-review resolution tables embedded in the slice doc

Review-resolution history sits in the design document. It is useful for traceability, but it duplicates the content of the review file. It may be better kept only in the review artifact so the slice doc stays a forward-looking design.

### [NOTE] Out-of-scope stdout writes in storage are flagged but not tracked

The slice identifies existing `console.log` calls in the storage layer that could corrupt the MCP stdio stream, and defers them to the PM. This is the right call for scope. Make sure it becomes a tracked maintenance item, since it fits the "Anticipated Slices" themes (CLI/MCP pattern consistency).

### Run Digest

- Response length: 5248 chars
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
- Duration: 21.9 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
