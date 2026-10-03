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
reviewedSha: 4451807a2dd3aef8c9077015a81352e3c7cef010
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 26.1
squadronVersion: 0.18.2
findings:
  - id: F001
    severity: note
    category: scope
    summary: "Parent architecture is thin; slice fits the maintenance charter by a loose reading"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Overview"
  - id: F002
    severity: concern
    category: dependency-direction
    summary: "Propagation extraction risks a circular module dependency"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Component Structure"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Failure modes for the new delete and read paths are only partially specified"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Patterns and Conventions"
  - id: F004
    severity: concern
    category: failure-modes
    summary: "Manifest carry-over and snapshot ordering depend on an unstated script-failure behavior"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Data Flow"
  - id: F005
    severity: pass
    category: integration
    summary: "Layering, dependency direction, and integration points are consistent"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Integration Points"
  - id: F006
    severity: pass
    category: error-handling
    summary: "Interface contracts and error posture are explicit"
    location: "project-documents/user/slices/930-slice.prune-stale-guide-files-in-worktrees.md#Interfaces Required"
---

# Review: slice — slice 930

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [NOTE] Parent architecture is thin; slice fits the maintenance charter by a loose reading

The 900 architecture lists themes such as pattern consolidation, dead-code removal, and developer experience. It names no worktree or setup-ide work. This slice fixes a defect (GitHub #103): stale guide files accumulate in worktrees. It also adds a new capability, manifest parsing and a CRC implementation. The work is bounded and has explicit exclusions, so I don't see scope creep. The architecture doc has no anchor for it, though, and the "Anticipated Slices" list could be updated. The principle "No behavior changes without tests" is met by the Technical Requirements, which require tests for each behavior change.

### [CONCERN] Propagation extraction risks a circular module dependency

`worktreePropagation.ts` needs `TARGETS`, `TargetDescriptor` (including the new `generatedPromptDirs`), and `GENERATED_MARKER`. All of these stay in `setup-ide.ts`. `setup-ide.ts` in turn calls `propagateToWorktrees` and, per the Migration Plan, may re-export it. That is a two-way import. The slice says the extraction keeps `setup-ide.ts` under the size limit, but it never states the dependency direction. Pick one of two fixes:
- Move the descriptors and markers into a leaf module that both files import.
- Have `setup-ide.ts` pass the descriptor into `propagateToWorktrees` as a parameter.

The second option fits the "program to interfaces" guideline. The doc should state which one it uses.

### [CONCERN] Failure modes for the new delete and read paths are only partially specified

The slice does cover some failure handling: malformed manifest lines throw a `UserError`, filesystem errors propagate, and path escapes are skipped with a warning. It leaves these cases open:
- **Mid-loop abort.** A throw in worktree N (a malformed worktree manifest, an `EACCES` on delete or read) aborts the loop. Later worktrees are neither copied nor pruned, and worktree N keeps a stale manifest. The slice doesn't say whether this is intended or whether the loop continues and reports per worktree.
- **Re-run recovery.** After a partial failure, the next run uses the new root manifest as `rootBaseline`. A worktree that had no manifest of its own then loses its D2 baseline, so the files dropped in the failed run are never pruned. This undercuts D2's guarantee. State the behavior, or say the root manifest is written only after success.
- **Symlinks.** The containment check "resolves" paths but doesn't say whether it uses realpath. A symlinked install directory inside a worktree could redirect a deletion outside it. Say whether symlinks are followed or skipped.
- **Unreadable stale file.** The checksum read of a candidate file can fail (permissions, or the path is a directory). The slice doesn't say whether that is a keep-and-warn or a throw.

Because the slice deletes user-visible files, each of these should have an explicit strategy.

### [CONCERN] Manifest carry-over and snapshot ordering depend on an unstated script-failure behavior

`rootBaseline` is read before the guide script runs. If the script fails or is interrupted, the root manifest may be missing or half-updated. The Data Flow doesn't say whether propagation is skipped when the script exits non-zero. If it still runs, a stale or partial `newRoot` could cause a wrong prune decision or a partial manifest copy. Say that propagation, including the manifest copy, runs only after a successful script exit. Also state that the manifest copy is atomic enough (write to a temp file, then rename), or accept that it isn't.

### [PASS] Layering, dependency direction, and integration points are consistent

- The slice keeps the guide as the owner of root pruning, and the cf-side rule matches the guide's own bar (CRC and size match, depth-3 empty-directory rule).
- It rejects regenerating per worktree (D1) with concrete reasons.
- It reuses the 929 descriptor table and avoids a second copy of the legacy table.
- cf never writes a manifest at the root.
- Marker literals stay centralized, and the prompt sweep is descriptor-driven rather than keyed on a target name. Both match the project's no-scattered-values rule.

### [PASS] Interface contracts and error posture are explicit

- The manifest format is documented.
- The missing manifest (`null`) is distinguished from the empty manifest (`[]`).
- A guide format change makes the parser throw rather than silently mis-prune.
- The parser is lenient about whitespace but strict about unreadable lines, which fits the project's parsing guidance.
- Tests use fixtures from real manifest data.
- Old guides degrade to copy-only with a single notice.
- No NFRs are stated in the parent architecture for this path, so none need restating.

### Run Digest

- Response length: 5571 chars
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
- Duration: 26.1 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
