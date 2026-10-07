---
docType: review
layer: project
reviewType: code
slice: restore-default-worktree-range-on-sibling-removal
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/932-slice.restore-default-worktree-range-on-sibling-removal.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261007
dateUpdated: 20261007
reviewedSha: 459f41c3ed24b8f142ec6e8ebb16a19d227c5bfd
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
durationSeconds: 17.4
squadronVersion: 0.20.1
findings:
  - id: F001
    severity: concern
    category: documentation
    summary: "Orphaned doc comment on `hasWorkflowFields`"
    location: "packages/core/src/services/WorktreeService.ts:20-45"
  - id: F002
    severity: concern
    category: design
    summary: "Default worktree is identified by its user-editable name"
    location: "packages/core/src/services/WorktreeService.ts:25-27"
  - id: F003
    severity: concern
    category: type-design
    summary: "Result type is an anonymous inline shape with a loose invariant"
    location: "packages/core/src/services/WorktreeService.ts:276-284"
  - id: F004
    severity: note
    category: testing
    summary: "Tests use string literals and a non-null assertion"
    location: "packages/cli/tests/commands/worktree.test.ts:437"
  - id: F005
    severity: pass
    category: correctness
    summary: "Restore logic and atomicity"
    location: "packages/core/src/services/WorktreeService.ts:305-355"
---

# Review: code — slice 932

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Orphaned doc comment on `hasWorkflowFields`

The new helpers were inserted between the existing `/** Check if a project has any non-empty workflow fields worth migrating. */` comment and the function it describes. That comment now sits directly above the `DEFAULT_WORKTREE_NAME` doc comment, so two JSDoc blocks are stacked. `hasWorkflowFields` is left with no doc. Move the helpers, constants and `RangeRestoreOutcome` type above that comment, or move the comment back down to `hasWorkflowFields`.

### [CONCERN] Default worktree is identified by its user-editable name

`isDefaultWorktree` matches `wt.name.toLowerCase() === 'default'`. Project rules say never to use user-accessible labels as logical structure. The chop logic already did this. This change spreads it into the removal path and gives the string a constant, which centralizes the value but doesn't remove the fragility. If a user creates or renames a worktree to "Default" (the tests confirm case-insensitive matching), `removeWorktree` will silently grow that worktree's range. A stable marker would be safer, such as an `isDefault` flag or a dedicated ID set at forward migration. At minimum, record this as known debt.

### [CONCERN] Result type is an anonymous inline shape with a loose invariant

`removeWorktree` returns an inline object with two optional fields, `restoredRange` and `rangeNotRestored`. The type allows both to be set at once, and it allows the reverse-migration case to carry either one. The method already builds this from the `RangeRestoreOutcome` discriminated union, but flattens it into optionals. The CLI, MCP server and tests all depend on that shape. Consider a named exported `RemoveWorktreeResult` interface, or exposing the `RangeRestoreOutcome` union, as the rules prefer for variants. The tuple types `[number, number]` are also repeated throughout. A `IndexRange` alias, possibly `readonly`, would help.

### [NOTE] Tests use string literals and a non-null assertion

The CLI and MCP tests use literals such as `'not-adjacent'` and `'would-overlap'`, not the `RangeRestoreSkipReason` constant the service tests use. If the mocks are loosely typed, a rename of a reason value would not fail these tests. `WorktreeService.test.ts` also uses `!` in the `defaultRange()` helper, which would throw an unhelpful error if the default were missing. Both are minor.

### [PASS] Restore logic and atomicity

The removal and the range change go out in a single `store.update`. The default is replaced in `remaining` without mutating stored objects, and a test checks this. Overlap detection is shared through `rangesOverlap`, which removes duplicated logic. Skip reasons are reported explicitly, not silently. The CLI's `Record<RangeRestoreSkipReason, string>` map forces exhaustive handling. Test coverage is thorough, covering round-trip, adjacency in both directions, an emptied default, override, non-adjacent, overlap, case-insensitive matching and reverse migration.

### Run Digest

- Response length: 3424 chars
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
- Duration: 17.4 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
