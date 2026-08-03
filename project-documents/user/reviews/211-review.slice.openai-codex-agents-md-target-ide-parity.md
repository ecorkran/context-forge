---
docType: review
layer: project
reviewType: slice
slice: openai-codex-agents-md-target-ide-parity
project: context-forge
verdict: PASS
sourceDocument: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md
aiModel: minimax/minimax-m3
status: complete
dateCreated: 20260802
dateUpdated: 20260802
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "Cursor target delivery aligns with architecture's stated priority"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md
  - id: F002
    severity: pass
    category: uncategorized
    summary: "Public API signatures preserved per composability principle"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#interfaces
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Failure modes enumerated with explicit handling strategies"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#design-decisions
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Core/CLI boundary maintained via explicit design decision"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#design-decisions
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Detection-over-configuration principle supported by descriptor table"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#design-decisions
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Coupled upstream changes are clearly scoped"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#coupled-upstream-ai-project-guide
  - id: F007
    severity: note
    category: uncategorized
    summary: "OpenAI Codex target addition extends beyond architecture's explicit enumeration"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#overview
  - id: F008
    severity: note
    category: uncategorized
    summary: "Orthogonal cleanup bundled into slice scope"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#technical-scope
  - id: F009
    severity: note
    category: uncategorized
    summary: "Version-skew mitigation deferred to implementation task"
    location: project-documents/user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md#risks
---

# Review: slice — slice 211

**Verdict:** PASS
**Model:** minimax/minimax-m3

## Findings

### [PASS] Cursor target delivery aligns with architecture's stated priority

The architecture (200-arch.developer-onboarding.md) explicitly calls Cursor "the planned second target" (Technical Considerations) and lists "Cursor IDE support — `cf setup-ide cursor` and `--ide cursor` flag for `cf init`" as Future Work item #4. The slice delivers both surfaces (`cf setup-ide cursor` and the unchanged `cf init --ide cursor` path) plus the file layout AGENTS.md + .cursor/rules/ the architecture implies. This directly fulfills the architecture's stated intent.

### [PASS] Public API signatures preserved per composability principle

The architecture's Composability principle requires atomic operations to remain independently callable. The slice preserves all signatures: `setupIdeAction(projectPath, target, opts)`, `propagateToWorktrees(project, target)`, `embedReferencedFiles(...)`. `cf init --ide <target>` requires no init.ts code change beyond help text. The guide script's bash invocation shape is unchanged. This satisfies the composability boundary.

### [PASS] Failure modes enumerated with explicit handling strategies

Each new path/message type has an explicit handling strategy rather than TBD: (1) unresolvable target in `propagateToWorktrees` throws via Decision 4; (2) missing conventions file in `ContextEmbedder` emits a warning matching existing artifact-loop style (Decision 5); (3) Codex skills discovery failure has a documented `.codex/skills/` fallback gated by real-session verification (Decision 6); (4) unmanaged-file overwrite triggers prompt + `.bak` backup (Sequence step 6); (5) Cursor split migration removes stale always-on `.mdc` files deterministically (Migration section). None rely on "TBD" or implicit handling.

### [PASS] Core/CLI boundary maintained via explicit design decision

Decision 5 explicitly keeps `CONVENTIONS_FILES` separate from the `TARGETS` descriptor table. The slice itself flags this reasoning: the TARGETS table is a write-ownership map in the CLI package; CONVENTIONS_FILES is a read-priority list in core. Coupling them would force core to know about IDE targets just to answer "what are this project's conventions?" This is a deliberate and well-articulated boundary choice that avoids a hidden cross-layer dependency.

### [PASS] Detection-over-configuration principle supported by descriptor table

The architecture's first principle is "Detection over configuration." Decision 1 consolidates target knowledge currently scattered across five places (`VALID_TARGETS`, the `--help` string, the safety-check branch, the propagation branch, the hardcoded probe list in `isManagedCopilotFiles`) into a single `Record<Target, TargetDescriptor>` table. The TypeScript `Record` constraint makes the compiler reject a union member added without a descriptor — an architectural guard against the kind of drift that produced the current Codex gate failure. This is detection-driven extensibility in code form.

### [PASS] Coupled upstream changes are clearly scoped

The slice's upstream changes to `project-documents/ai-project-guide/scripts/setup-ide` are enumerated as a separate Technical Scope section with four contained edits (`setup_agents`, cursor branch split, `emit_agents_md` parameter, marker rename). The slice explicitly identifies the coupling as the highest inherited risk and pairs it with a verification walkthrough step (step 4) that demonstrates the migration behavior.

### [NOTE] OpenAI Codex target addition extends beyond architecture's explicit enumeration

The architecture's Future Work item #4 mentions Cursor as "Second priority after Claude Code" and "Further IDE targets (Windsurf, etc.) follow based on demand." OpenAI Codex is not explicitly enumerated, but the architecture also states "Additional IDEs can be added as `setup-ide` gains support for them" (Technical Considerations). The slice's Value section provides strong demand justification — specifically a latent defect on Squadron's `--embed` path that already ships to non-SDK profiles — making this a defensible scope extension consistent with the architecture's extensibility principle. Not blocking, but worth flagging that the architecture document itself was not amended to mention Codex before this slice shipped.

### [NOTE] Orthogonal cleanup bundled into slice scope

The slice deletes `buildAndPrint()` from `packages/cli/src/commands/build.ts`. This is orthogonal to IDE target parity but is justified as preventing the `--embed` fix from being duplicated. The deletion is well-scoped (exported, zero CF/Squadron callers, duplicate `--embed` branch). The slice would be slightly easier to review if the deletion were a separate commit, but its inclusion here is reasonable.

### [NOTE] Version-skew mitigation deferred to implementation task

The Risks section identifies "Coupled CF + ai-project-guide release" as the highest risk with a concrete failure scenario: `cf setup-ide cursor` against an older guides submodule produces the pre-split layout silently (no error). The mitigation is "the implementation task should confirm what `cf guide status` reports... and decide whether a minimum-version check belongs in this slice or is filed as follow-up." Risk identification is strong; the design-stage mitigation could be more concrete (e.g., decide now whether `setupIdeAction` should refuse to dispatch `cursor` when the installed guide's setup-ide predates the split). Acceptable as a follow-up, but the slice closes with this decision unmade.
