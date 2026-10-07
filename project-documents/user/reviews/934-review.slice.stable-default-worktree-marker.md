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
reviewedSha: 0924c7e2f39fd8f8607b2f042aaf5b1e2da3451f
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 17.7
runId: run-20261007-p4-efda7554
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: pass
    category: scope-alignment
    summary: "Fixes a project-rule violation that fits the stated scope"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Overview"
  - id: F002
    severity: pass
    category: layering
    summary: "Dependency direction is correct and enforceable"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Component Structure"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new I/O path are enumerated"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Special Considerations"
  - id: F004
    severity: concern
    category: architectural-boundaries
    summary: "Write-on-read migration changes the store's responsibilities"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Where the migration runs: the store, not the service"
  - id: F005
    severity: concern
    category: design-consistency
    summary: "Migration heuristic relies on name matching, which the slice itself calls an anti-pattern"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Migration rule (`markLegacyDefaultWorktree`)"
  - id: F006
    severity: concern
    category: integration-points
    summary: "Public contract changes are not carried in the `interfaces` field"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md:7"
  - id: F007
    severity: note
    category: nfr
    summary: "No NFRs apply, and the slice says so"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Special Considerations"
  - id: F008
    severity: note
    category: process
    summary: "Design review resolution table is traceable"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Design Review Resolution"
---

# Review: slice — slice 934

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Fixes a project-rule violation that fits the stated scope

The slice replaces name-based matching of the default worktree with a stored flag. This follows the project rule against user-accessible labels as logical structure. It fits the "Pattern consolidation and code quality improvements" scope item. The slice has acceptance criteria and a walkthrough, so it meets the "not open-ended" principle. It also records that the architecture has no explicit "defect fix" scope entry and leaves that question to the Project Manager, which is the right call.

### [PASS] Dependency direction is correct and enforceable

The shared logic lives in a new `utils/defaultWorktree.ts` that imports only from `types/`. This keeps `storage → utils → types` and `services → utils`, with no `storage → services` import. The slice also considers and rejects injecting the migration into the store, with reasons. It adds a testable technical requirement that `storage/` never imports from `services/`.

### [PASS] Failure modes for the new I/O path are enumerated

The load-time migration is the one new I/O path. The slice covers write failure (the command fails and the init promise clears so the next access retries), corrupt or unparseable files, concurrent in-process calls (stored init promise), and cross-process races (deterministic, idempotent result, no locking, explicitly out of scope). Ambiguous and no-candidate migration outcomes each have a defined result and warning. Each of these has a test requirement. The duplicate-marker error is limited to the range-changing paths, and the diagnostic paths keep working.

### [CONCERN] Write-on-read migration changes the store's responsibilities

`FileProjectStore.ensureInitialized()` now reads, applies a domain migration, writes, and prints warnings to stderr. The store already does legacy-location migration, so this has precedent. Printing to stderr from a storage layer is a new kind of side effect, though. It also reaches MCP server processes, where stderr use may not be appropriate. The slice does not say how warnings behave under the MCP server (stdio transport) or whether a logger abstraction exists. State the output channel for non-CLI consumers, or route warnings through whatever existing logging mechanism the store uses.

### [CONCERN] Migration heuristic relies on name matching, which the slice itself calls an anti-pattern

The one-time migration identifies the legacy default by name (`default`, case-insensitive) and then by `worktreePath == projectPath`. This is a defensible bootstrap, and the slice confines it to one function. It is still a best-effort guess at user intent, and the migration is irreversible once written, because all absent values become explicit `false`. The slice covers the ambiguous cases with warnings and a hand-edit recovery. It also excludes any command to move the marker, so recovery for misclassified data depends on hand-editing JSON. This is acceptable for a low-risk initiative. Consider recording a trigger for the follow-up recovery command, for example how many warnings users hit.

### [CONCERN] Public contract changes are not carried in the `interfaces` field

`interfaces: []` is justified in the document, since no planned slice consumes the new contracts. But the slice changes externally visible contracts: `isDefault` on every `--json` and MCP worktree response, `RemoveWorktreeResult.defaultWorktree`, and the CLI `list` output. MCP tool descriptions change as well. Downstream agents and scripts that parse `list` table output could be affected by the added `(default)` tag. The slice calls these additive but gives no compatibility statement for table-output consumers. Add a line on whether table output is a supported parse target.

### [NOTE] No NFRs apply, and the slice says so

The 900 architecture sets no latency or throughput targets. The slice notes this and adds a cost estimate: one in-memory pass, at most one write per legacy file. No restatement is required.

### [NOTE] Design review resolution table is traceable

Each prior finding maps to a section of the document that addresses it. The finding IDs skip F006, which may be intentional.

### Run Digest

- Response length: 5276 chars
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
- Duration: 17.7 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
