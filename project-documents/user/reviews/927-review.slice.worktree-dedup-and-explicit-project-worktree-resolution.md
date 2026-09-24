---
docType: review
layer: project
reviewType: slice
slice: worktree-dedup-and-explicit-project-worktree-resolution
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md
aiModel: z-ai/glm-5.3
status: complete
dateCreated: 20260924
dateUpdated: 20260924
reviewedSha: 66e9020220ad9d913deb4aea83a2108a36965ecf
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 34
findings:
  - id: F001
    severity: concern
    category: design-accuracy
    summary: "Rider's premise misstates current code; its acceptance criterion is already satisfied today"
    location: "project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md#d4-unknown-worktree-is-an-error"
  - id: F002
    severity: concern
    category: error-handling
    summary: "#100's dedup collapse silently drops fixActions in `cf check --fix`; fix-path semantics are unaddressed"
    location: "project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md#100-dedup-key-normalization"
  - id: F003
    severity: note
    category: behavior-compatibility
    summary: "Migrated single-worktree projects gain a worktreeId from `--project` at the project root; byte-identical invariant is asserted only for `cf check`"
    location: "project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md#101-explicit-project-resolution"
  - id: F004
    severity: pass
    category: alignment
    summary: "Scope, layering, and integration points align with the architecture and slice plan"
    location: "project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md"
---

# Review: slice — slice 927

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3

## Findings

### [CONCERN] Rider's premise misstates current code; its acceptance criterion is already satisfied today

D4 states "A misspelled worktree name currently falls back to the project root without saying so… Today only `cf status` passes `opts.worktree`." That is not what the code does. `cf status` calls `resolveProjectWorktree({ project: opts.project }, store)` (`packages/cli/src/commands/status.ts:29`) — it does **not** pass `worktree` — and then resolves the worktree itself via `findWorktreeByNameOrId` with its own `UserError` on a miss (`status.ts:102-106`). A grep across `packages/cli/src` confirms no production call site passes `worktree` into the resolver; the silent-ignore branch at `packages/cli/src/utils/project.ts:109-111` is unreachable from any CLI command today. Consequences: (a) the Overview's "Rider — an unknown `--worktree` name is silently ignored" describes a defect users cannot currently hit; (b) the functional criterion "`cf status --project <name> --worktree <bogus>` exits non-zero with a `UserError`" is vacuous — it passes on unmodified code via status.ts's own check, so it cannot detect a regression or verify the new resolver branch end-to-end (status.ts's check always fires first, so the resolver's new error is dead for the only command with the flag). The hardening itself is correct and aligned with the no-silent-fallback rule, and the planned resolver unit test does exercise the branch — but the design's current-behavior claim should be corrected and the criterion replaced with one that distinguishes the resolver's error path (or dropped as already-covered behavior).

### [CONCERN] #100's dedup collapse silently drops fixActions in `cf check --fix`; fix-path semantics are unaddressed

The design claims "The only visible change is fewer duplicate findings (and correspondingly lower counts), which is the fix" and confines its compatibility argument to `--json` shape. But the CLI applies fixes to the **merged** result: both the single-slice path (`result = fixMode ? await checker.applyFixes(merged) : merged`) and the all-slices fix path (`applyFixes(dryRun)` where `dryRun = mergeCheckResults(...)`) in `packages/cli/src/commands/check.ts` run `applyFixes` after dedup. Today, two worktrees cut from the same base with the same fixable state (the common case — both checkouts inherit the same unchecked plan entry / stale frontmatter) each contribute a finding whose `fixAction.filePath` points at that checkout's physical file, and both files get written. After root-normalized dedup, only the first-seen finding survives, so only one checkout's file is fixed while the other's stale state disappears entirely from output and counts — no warning, no remaining finding. Notably, MCP's `workflow_check` does not share this flaw (it runs `checker.fixAll(view)` per view *before* the merge, `packages/mcp-server/src/tools/workflowTools.ts:279`), so the slice would introduce a CLI/MCP asymmetry on the fix path even though both share the merge. The Success Criteria contain no `--fix` requirement. The design needs an explicit decision: apply fixes pre-merge per view (matching MCP), or document first-checkout-wins as intended semantics with a test pinning it.

### [NOTE] Migrated single-worktree projects gain a worktreeId from `--project` at the project root; byte-identical invariant is asserted only for `cf check`

In a migrated project the `default` worktree's `worktreePath` equals `projectPath`, and `resolveWorktreeForPath` prefers a worktree over the project root on a tie (`packages/core/src/utils/worktree-overlay.ts` sort). So `--project foo` run from foo's own root — which users read as "the project root," not "a worktree" — will now resolve a `worktreeId`. This matches what the no-flag path already does (bare `cf status` from that directory already prints the `Worktree:` line), so it is consistent with D3's stated intent, but it changes `cf status --project` output/JSON (new `Worktree:` line, new `worktree` object in `--json`) and routes worktree-scoped `cf set`/`cf unset` writes through the worktree context for single-worktree projects. The Success Criteria's byte-identical requirement is scoped to `cf check` only; the #101 criteria never enumerate the migrated-single-worktree case. Recommend pinning it explicitly (e.g., a criterion for `cf status --json --project <name>` in a migrated project) so the behavior is intended rather than accidental.

### [PASS] Scope, layering, and integration points align with the architecture and slice plan

The slice matches 900-slices entry 27 exactly (issues #100/#101, the rider, the 20260924 PM decision recorded as D3, dependency 926). The architecture's three principles are satisfied: themed grouping (worktree-surface defects left over from 926, sharing the resolution surface), test coverage required for every behavior change (unit tests for both modified functions plus a real-shape #100 fixture), and concrete success criteria rather than open-ended cleanup. Dependency directions are correct and no boundaries are crossed: #100 lands in core's `mergeCheckResults`, which both `cf check` and MCP's `workflow_check` already consume, preserving 926's one-merge invariant; #101 reuses core's `resolveWorktreeForPath` from the CLI layer exactly as `findProjectByCwd` already does; the MCP exclusion is sound (MCP's own `resolveProjectId` explicit branch does id/name lookup only, and the server process's CWD is genuinely unrelated to the caller's checkout). The design's code citations check out against the source: the current key is `rule|location|description` (`mergeCheckResults.ts`), `location: projectPath` at ConsistencyChecker.ts:1063/1072, and the personal-scope rule's description embedding `sharedPath` at ConsistencyChecker.ts:1107-1108 — confirming D2 is required, not speculative. No new data flows or message types are introduced, so no new failure-mode enumeration (hang/timeout/disconnect) is owed, and the parent architecture states no NFRs, so there is nothing to restate.

### Run Digest

- Response length: 7294 chars
- Response is newline-free: no
- Tool calls made: 34
- Tool calls failed: 0
- Stop reason: stop
- Reasoning characters: 65125
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 4
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 4
- Finding-shaped matches — surviving validation: 4
