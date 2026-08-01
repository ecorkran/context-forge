---
docType: review
layer: project
reviewType: slice
slice: band-warning-respects-worktree-indexrange
project: context-forge
verdict: PASS
sourceDocument: project-documents/user/slices/919-slice.band-warning-respects-worktree-indexrange.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260801
dateUpdated: 20260801
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "Scope fit: developer-experience improvement on a primary CLI surface"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#overview
  - id: F002
    severity: pass
    category: uncategorized
    summary: "Adheres to \"Slice by theme, not by urgency\""
    location: 919-slice.band-warning-respects-worktree-indexrange.md#technical-scope
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Adheres to \"No behavior changes without tests\""
    location: 919-slice.band-warning-respects-worktree-indexrange.md#testing-strategy
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Adheres to \"Opportunistic but intentional\""
    location: 919-slice.band-warning-respects-worktree-indexrange.md#success-criteria
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Cross-cutting layering correction (consolidation, not just a bug fix)"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#decision-3
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Resolves a layering inversion in core"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#decision-4
  - id: F007
    severity: pass
    category: uncategorized
    summary: "Dependency direction is correct on every move"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#architecture
  - id: F008
    severity: pass
    category: uncategorized
    summary: "Integration points match existing call sites without churn"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#decision-4
  - id: F009
    severity: pass
    category: uncategorized
    summary: "No new I/O paths; failure-mode enumeration requirement does not apply"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#technical-scope
  - id: F010
    severity: note
    category: uncategorized
    summary: "Backward-compatible parameter type widening is an API-shape change worth recording"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#decision-4
  - id: F011
    severity: note
    category: uncategorized
    summary: "Two unrelated \"ResolvedProject\" symbols exist; the slice flags but does not unify them"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#decision-4
  - id: F012
    severity: note
    category: uncategorized
    summary: "Pre-existing electron test failure explicitly out of scope"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#success-criteria
  - id: F013
    severity: note
    category: uncategorized
    summary: "External PR (#49) is acknowledged and explicitly superseded"
    location: 919-slice.band-warning-respects-worktree-indexrange.md#relationship-to-pr-49
---

# Review: slice — slice 919

**Verdict:** PASS
**Model:** minimax/minimax-m3

## Findings

### [PASS] Scope fit: developer-experience improvement on a primary CLI surface

The architecture's Scope section explicitly includes "Developer experience improvements (error messages, CLI help text, etc.)." `cf next` is the tool's primary guidance surface and the band warning is the dominant noise in its warning channel — restoring signal-to-noise directly serves that scope item. The "Value" section makes this connection explicit rather than treating the slice as ad-hoc.

### [PASS] Adheres to "Slice by theme, not by urgency"

The slice is tightly themed around a single failure mode (band warning vs. worktree range) and includes an explicit "Explicitly excluded" list that actively prevents scope creep into adjacent work (`cf status`/`cf check`, the `cf set slice` warning, the dotted sub-index suggestion from the issue reporter). This is the exact discipline the architecture prescribes.

### [PASS] Adheres to "No behavior changes without tests"

Six test cases are enumerated against the existing `makeProject()` helper, covering every branch of Decision 1 (active-worktree tier, union tier, rangeOverride suppression, legacy hundred-block fallback) plus message-content assertions. Success criterion 9 also gates on `pnpm -r test` for core/cli/mcp-server.

### [PASS] Adheres to "Opportunistic but intentional"

Ten numbered success criteria split into functional and technical categories, each independently verifiable. The verification walkthrough gives a reproducible six-step procedure (with Phase 4 placeholder for in-place refinement at Phase 6, following the slice-918 precedent). Matches the architecture's intent that maintenance slices have clear success criteria, not open-ended cleanup.

### [PASS] Cross-cutting layering correction (consolidation, not just a bug fix)

Decision 3 moves three range helpers from `packages/cli/src/utils/worktree-overlay.ts` into `packages/core/src/utils/worktree-overlay.ts`, replacing a duplicated containment predicate that the DRY rule would otherwise have to introduce. The CLI module is reduced to a re-export shim, mirroring its existing pattern for `applyWorktreeOverlay` so no call site changes. This is textbook "Pattern consolidation and code quality improvements" from the architecture's Scope.

### [PASS] Resolves a layering inversion in core

Decision 4 identifies that `introspection/` (lower layer) would otherwise import `ResolvedProject` from `services/` (higher layer), and fixes it by moving the interface declaration to `packages/core/src/types/project.ts`. The relocation keeps types free of service-layer imports and matches the architecture's code-quality intent. Backward compatibility is preserved via re-export from `projectResolver.ts`.

### [PASS] Dependency direction is correct on every move

The data-flow diagram shows the correct direction: CLI and MCP call `resolveProject()` (services layer) which produces a `ResolvedProject` that `WorkflowNavigator.getNext()` (introspection layer) then consumes. No upward references are introduced; both moves (helpers CLI → core, interface services → types) point strictly downward in the layering.

### [PASS] Integration points match existing call sites without churn

Both `cf next` (`next.ts:20`) and `workflow_next` (`workflowTools.ts:194`) already receive a `ResolvedProject` from `resolveProject()`. Because `resolvedWorktree` is optional, widening `getNext`'s parameter from `ProjectData` to `ResolvedProject` is assignability-compatible — no caller or test needs to change. The slice calls this out explicitly and the slice plan frontmatter `dependencies: []` / `interfaces: []` are accurate (no external contract changes).

### [PASS] No new I/O paths; failure-mode enumeration requirement does not apply

The slice introduces no new I/O paths, transports, or message protocols. The existing data accesses (`project.fileArch`, `project.fileSlice`, `project.worktrees`, `slice.index`) are unchanged; only conditional logic for warning emission is added. The parent architecture does not state I/O-bound NFRs in this document, so there are no NFRs to restate. The `Failure modes` criterion in the review rubric is therefore not triggered for this slice.

### [NOTE] Backward-compatible parameter type widening is an API-shape change worth recording

Although `ProjectData` remains assignable to `ResolvedProject` and no caller changes, `getNext`'s declared parameter type does change. Worth a one-line note in the slice's interfaces section (or simply a follow-up entry in the maintenance initiative) so consumers tracking the public core API surface see the widening even though the call sites are stable. Not an alignment issue with the parent architecture — just visibility.

### [NOTE] Two unrelated "ResolvedProject" symbols exist; the slice flags but does not unify them

`packages/cli/src/utils/project.ts` declares its own local `ResolvedProject` (`{ id, source }`) that is unrelated to the one being moved. The slice correctly notes "do not merge the two." Worth keeping on a radar so a future maintenance slice doesn't conflate them when consolidating CLI utility modules, but not in scope here.

### [NOTE] Pre-existing electron test failure explicitly out of scope

Criterion 9 acknowledges `packages/electron/TemplateProcessor.test.ts` as a known pre-existing failure and instructs the implementer to confirm it is unchanged. This is appropriate scope discipline per the architecture's "intentional" principle, and matches the slice's own "Explicitly excluded" list.

### [NOTE] External PR (#49) is acknowledged and explicitly superseded

The slice doc records the contributor's diagnosis as the origin of the three-tier contract, names the three points of supersession (active-worktree preference, single-source helper, hyphen range rendering), and plans an acknowledgement commit. This is good engineering hygiene and aligns with the architecture's "themed, intentional" framing.
