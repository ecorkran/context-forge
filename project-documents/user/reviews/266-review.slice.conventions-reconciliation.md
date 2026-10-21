---
docType: review
layer: project
reviewType: slice
slice: conventions-reconciliation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/266-slice.conventions-reconciliation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 4ed01995a00b13b778722535de1d0943dc2cf722
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 96019
cachedTokens: 11266
cacheWriteTokens: 84749
completionTokens: 4132
durationSeconds: 36.3
costUsd: 0.382182
costBasis: provider
runId: run-20261021-slices-plan-c34863dc
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Judgement/fact split and identity keying match the architecture"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Technical Decisions"
  - id: F002
    severity: concern
    category: layer-boundaries
    summary: "Rule-source enumeration is placed in cli, though the arch says core enumerates"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D7 — The format lives in core, inventory and rendering in cli"
  - id: F003
    severity: concern
    category: hidden-dependency
    summary: "Dependency on 261 is labelled \"sequencing only\" but is a code and contract dependency"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md:65"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Stale-identity handling covers only the guide side of the pair"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#D5 — Stale identities warn and malformed files fail"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Design is heavier than the slice needs; name what to cut"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md"
  - id: F006
    severity: note
    category: scope
    summary: "Copilot composite is scope beyond the arch, and is justified"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md:48"
  - id: F007
    severity: note
    category: alignment
    summary: "Precedence is advisory, which only partly meets \"doesn't re-introduce\""
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#Risk Assessment"
  - id: F008
    severity: pass
    category: error-handling
    summary: "I/O failure modes are enumerated"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md#State Management"
---

# Review: slice — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Judgement/fact split and identity keying match the architecture

The comparison of two rules is left to the guide prompt, and cf only inventories, stores and renders (Overview, Data Flow). D2 keys resolutions by `guideRule` plus `projectSource`, never by heading text. This matches the arch's "Facts in core, judgement in the prompt" and "keyed by rule file identity". D4 leaves the output byte-identical when no resolutions exist, and project text is never rewritten. That matches "Additive and reversible". D1 handles the #123 sequencing by isolating the audience question in a single `delivered()` predicate.

### [CONCERN] Rule-source enumeration is placed in cli, though the arch says core enumerates

The arch says "Core enumerates rule sources and applies stored resolutions deterministically inside `setup-ide`" and "One detection, many consumers". D7 puts only the persisted format in core. `ruleInventory.ts` (guide rules, project sources, managed-block ranges) lives in `packages/cli/src/ideInstall/`. The design defers MCP parity, so the enumeration cannot be reused by a second surface without a later move. The reason given, that the inventory needs manifests and the marker constants, explains the placement but does not reconcile it with the arch wording. Either state in D7 that this is a deliberate deviation from the arch's "core enumerates" and say how a later MCP surface would reach the inventory, or split the pure parts (marker-range scan, candidate expansion) into core. The slice also reaches into core for `RULE_FILE_PATHS`, so the boundary is already mixed.

### [CONCERN] Dependency on 261 is labelled "sequencing only" but is a code and contract dependency

Dependencies calls 261 "sequencing only". The same bullet, and D6, say 266 consumes 261's `RULE_FILE_PATHS`, promotes it to a core export, and adds `.github/instructions`. That changes what 261's Adoption Facts report, which is an interface 261 owns and the brownfield prompt consumes. The design does not say what happens if 261 has already shipped its rule-file list. It also does not say whether the Adoption Facts change needs a guide-prompt update or 261 test updates. Move this into Interfaces Required, name 261's list as a modified interface, and state the effect on 261's tests and facts output.

### [CONCERN] Stale-identity handling covers only the guide side of the pair

D2 makes the file pair the identity, but D5 and `warnStaleResolutions` check only that `guideRule` still exists in the guide. If `projectSource` is later renamed or deleted, the resolution keeps rendering a precedence statement over a file that no longer exists. The statement also stays in agent context with no warning. This matches the arch goal that the user sees disagreements. The reverse failure goes unseen: a resolution that no longer applies. Add a warning (still exit 0, and still rendering or not, per a stated choice) when `projectSource` is absent from the checkout. Add it to the walkthrough and tests.

### [CONCERN] Design is heavier than the slice needs; name what to cut

The slice delivers one persisted file, two commands, and one rendered section. The document carries more than that:
- Binary-file handling (latin1) for rule candidates (State Management), a case the slice does not have since rule sources are text.
- The #123 constraint text and "post to issue" guidance (D1), plus a Future Work list and the `dismissed` discussion in D3. These restate or defer other work and belong in issues #123, #125 and #126 and the slice plan.
- A nine-step walkthrough where steps 5–9 repeat what the unit tests in Technical Requirements already assert (stale warning, malformed file, marker injection).
- The Release-coupling and Tracking bullets in Dependencies, which restate arch Dependencies content.
- The `decision` enum (`project` / `guide`). It only selects the label in "(project rule applies)", while `statement` already carries the full meaning. Consider dropping it unless a consumer needs it as structured data.
Cutting these loses no requirement the slice plan assigns to 266.

### [NOTE] Copilot composite is scope beyond the arch, and is justified

The arch frames the problem as CLAUDE.md and AGENTS.md composition. The design adds `.github/copilot-instructions.md`, since `compileAlwaysOnRules` writes the same rules there, and it records the cost as one more render test. This is acceptable. The arch's Anticipated Slices entry for reconciliation could be updated to name it.

### [NOTE] Precedence is advisory, which only partly meets "doesn't re-introduce"

The arch wording is that re-running `setup-ide` shouldn't re-introduce conflicts. The design keeps the contradicting guide text and adds a precedence statement beside it. The risk section acknowledges this and names per-rule suppression as the fallback. This is acceptable given the "Surface conflicts" goal, but the arch should note that "resolved" means "annotated".

### [PASS] I/O failure modes are enumerated

Write or rename failure, unreadable candidates, a malformed file, concurrent writes, and a resolution recorded but not applied each have an explicit strategy. Missing guide prompts and an older installed guide are handled too. The arch states no NFR on this path, so none needs restating.

### Run Digest

- Response length: 6702 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 96019 / 11266 / 84749 / 4132 / not computed
- Duration: 36.3 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
