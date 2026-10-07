---
docType: review
layer: project
reviewType: code
slice: stable-default-worktree-marker
targetKind: slice
rulesSource: project
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/slices/934-slice.stable-default-worktree-marker.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20261007
dateUpdated: 20261007
reviewedSha: bf1f1f47494403fcc701d5368d8eb62b877136a5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 30
diffTruncated: false
turns: 20
promptTokens: 1345690
cachedTokens: 1167705
completionTokens: 2947
reasoningTokens: 0
durationSeconds: 76.0
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "Default-worktree identification moved from name to explicit marker"
    location: "packages/core/src/utils/defaultWorktree.ts:12"
  - id: F002
    severity: pass
    category: uncategorized
    summary: "Migration logic is pure and idempotent"
    location: "packages/core/src/utils/defaultWorktree.ts:62"
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Read-time migration wires cleanly through `FileProjectStore`"
    location: "packages/core/src/storage/FileProjectStore.ts:24"
  - id: F004
    severity: pass
    category: uncategorized
    summary: "`WorktreeService` migration sites updated consistently"
    location: "packages/core/src/services/WorktreeService.ts:177"
  - id: F005
    severity: pass
    category: uncategorized
    summary: "`removeWorktree` carries `defaultWorktree` ref with the current name"
    location: "packages/core/src/services/WorktreeService.ts:315"
  - id: F006
    severity: pass
    category: uncategorized
    summary: "CLI `cf worktree list` and `rm` use the new marker without renaming ties"
    location: "packages/cli/src/commands/worktree.ts:240"
  - id: F007
    severity: pass
    category: uncategorized
    summary: "MCP worktree tools strip stray `isDefault` from update input"
    location: "packages/mcp-server/src/tools/worktreeTools.ts:189"
  - id: F008
    severity: pass
    category: uncategorized
    summary: "Propagation is unaffected by the new marker"
    location: "packages/cli/src/commands/worktreePropagation.ts:189"
  - id: F009
    severity: pass
    category: uncategorized
    summary: "Comment updates align with the new contract"
    location: "packages/core/src/introspection/mergeCheckResults.ts:21"
  - id: F010
    severity: pass
    category: uncategorized
    summary: "Test coverage matches the slice's scope"
    location: "packages/core/tests/utils/defaultWorktree.test.ts"
---

# Review: code — slice 934

**Verdict:** PASS
**Model:** minimax/minimax-m3

## Findings

### [PASS] Default-worktree identification moved from name to explicit marker

The new `isDefaultWorktree` reads only `wt.isDefault === true`, never the name. This addresses the project rule against "user-accessible labels as logical structure." The constant `DEFAULT_WORKTREE_NAME` is retained only as a label for forward migration, with a clear comment that the migration is the only place that reads the name. The `findDefaultWorktree` helper centralizes lookup, supports an `excludeId`, and throws on duplicates with a clear remediation message. The two helpers cleanly separate concerns (predicate vs. lookup with validation).

### [PASS] Migration logic is pure and idempotent

`markLegacyDefaultWorktree` resolves absent `isDefault` values by name match, with project-path narrowing to disambiguate multiple candidates, and emits a clear recovery warning for ambiguous or "probably renamed" cases. It is non-mutating, idempotent, and short-circuits when nothing is absent. The `LegacyDefaultMigration` return shape separates `changed` and `warnings` cleanly, and the recovery sentence is factored to keep both warning paths identical.

### [PASS] Read-time migration wires cleanly through `FileProjectStore`

The migration is applied in `getAll`, which all other CRUD methods route through, so the marker is always present on data the service operates on. The `printedMigrationWarnings` module-scoped `Set` deduplicates warnings across reads within a process (necessary under MCP stdio where stderr must stay clean). The "in-memory only" comment correctly notes the migrated values land on disk on the next `update`/`create`/`delete`. A read-only `projects.json` test confirms the migration does not require write access.

### [PASS] `WorktreeService` migration sites updated consistently

`addWorktree` pins `isDefault: false` on every new worktree and `isDefault: true` on the forward-migrated default. `updateWorktree` re-asserts `isDefault: original.isDefault` after spreading `updates`, which correctly defends against a stray runtime key even if a caller bypasses the type. The chop and restore methods pass through `findDefaultWorktree`, which throws on duplicates. The "updating the default's own range does not chop it against itself" test confirms `excludeId` semantics are correct.

### [PASS] `removeWorktree` carries `defaultWorktree` ref with the current name

`restoreDefaultRange` snapshots `{ id, name }` on the worktree it found, so a renamed default is reported with the name the user actually sees today. The ref is included whenever `restoredRange` or `rangeNotRestored` is set, omitted otherwise (including `migrated: true` and no-default-found cases). The CLI's "The service sets defaultWorktree whenever it reports either outcome" guard is correct and converts a service contract violation into an explicit error rather than a silent bad message.

### [PASS] CLI `cf worktree list` and `rm` use the new marker without renaming ties

The list-table `(default)` tag is purely a presentation choice keyed off `isDefaultWorktree(wt)`, so renaming no longer tags the wrong worktree. The `rm` messaging now names the actual default worktree (e.g. `'main-line'`) rather than the hard-coded label `'default'`, and the manual-fix hint uses the same name. The "if no range outcome, no note" regression test covers the silent path.

### [PASS] MCP worktree tools strip stray `isDefault` from update input

The tool uses Zod's allow-everywhere shape and forwards any extra arg to `updateWorktree`. The service layer's pinning then drops it; a regression test (`ignores an extra isDefault argument`) locks the contract. The `worktree_rm` test confirms `defaultWorktree` is now surfaced on the result for both `restoredRange` and `rangeNotRestored` paths.

### [PASS] Propagation is unaffected by the new marker

`propagationTargets` still filters only on the root-path check, as required. A dedicated regression test (`propagationTargets ignores isDefault`) pins this so a future change to use `isDefault` as a filter signal would fail.

### [PASS] Comment updates align with the new contract

The rewritten comment correctly drops the "named `default`" framing in favor of "the default worktree" and updates the rationale ("keying on a worktree's name would use a user-visible label as logical structure"). `worktreePropagation.ts`'s comment and the MCP `worktree_init`/`worktree_rm` tool descriptions are similarly aligned.

### [PASS] Test coverage matches the slice's scope

The unit tests cover: predicate behavior, the duplicate-throws path with name+id in the message, `excludeId` semantics, all four migration branches (single candidate, name case-insensitive, project-path narrowing, ambiguous/renamed), idempotence, no-worktrees case, and input-non-mutation. `FileProjectStore` tests cover in-memory migration without on-disk write, persistence on next update, once-per-process warning dedup, stderr-only output, and read-only-file access. `WorktreeService` tests cover the stray-key defense and duplicate-marking throws for both `addWorktree` and `updateWorktree`/`removeWorktree`. CLI tests cover the `(default)` tag edge cases and the new messaging. MCP tests cover both the stray-arg filter and the new `defaultWorktree` field on both restore paths.

### Run Digest

- Response length: 6223 chars
- Response is newline-free: no
- Tool calls made: 30
- Tool calls failed: 2
- Stop reason: stop
- Output budget: 512000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 0
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 1345690 / 1167705 / 2947 / 0
- Duration: 76.0 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 10
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 10
- Finding-shaped matches — surviving validation: 10
