---
docType: review
layer: project
reviewType: slice
slice: detection-and-adoption-state
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/261-slice.detection-and-adoption-state.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 49e205c272189fd7d19be126b9ecd0609e005bfa
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 216558
cachedTokens: 135311
cacheWriteTokens: 81241
completionTokens: 2971
durationSeconds: 26.1
costUsd: 0.368946
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Outcome order, boundaries and fail-fast guide rule match the architecture"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#Technical Decisions"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Overweight: the full report and its facts are built before any consumer needs them"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D5 — Detection report contents"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Resolver has too many layers and options for the single decision it makes"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D7 — Build integration through an injected resolver"
  - id: F004
    severity: concern
    category: error-handling
    summary: "State-write failure and concurrent-build behavior are not specified"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D9 — Missing guide profile or prompt fails the build"
  - id: F005
    severity: concern
    category: nfr
    summary: "No performance target for the new work on the build path"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D2 — Source walk rules"
  - id: F006
    severity: note
    category: design-risk
    summary: "`adoption.state` doubles as the user override and the persisted state"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md#D3 — `adoption.state` is both the persisted state and the override"
  - id: F007
    severity: note
    category: traceability
    summary: "Parent link and slice-plan alignment"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:5"
---

# Review: slice — slice 261

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Outcome order, boundaries and fail-fast guide rule match the architecture

The outcome order of state, then already planned, then code signals matches the architecture. The concept alone does not count as planned. The brownfield prompt is appended as a section outside the template. `detection/` holds facts and `adoption/` holds policy. A missing profile or prompt raises `AdoptionPromptMissingError` and never falls back to the concept prompt. Core does not read rule files or docs for meaning. The override works in both directions through one key. The monorepo scope is handled, and CI at the repository root is delegated to 260's `recognizeCi`.

### [CONCERN] Overweight: the full report and its facts are built before any consumer needs them

The only decision-making signal is source volume (D1). The slice also builds `projectDocs.ts` (readme, doc dirs, ADR dirs), `ruleFiles.ts`, `history.ts` (which spawns git), and the renderer's "none found" listing of each. These facts do reach the Adoption Facts section, which the guide prompt requires, so some of them are needed. But the following are only needed by later slices, or have no consumer yet:
- `findDocDirs`, `findAdrDirs`, `ADR_DIRS` and `findRuleFiles` are justified in "Provides to Other Slices" as shared lists for 266 and 267. Those two slices are "Later" and are not in the core goal. Their lists can be created when they need them.
- Markdown file counts per doc and ADR directory are not used by anything in this slice.
- `resolveAdoption` is described as "for 262–264". 262 and 264 are separate slices. The resolver can be extracted when they arrive.

Cut or defer: the markdown counts, and the 266 and 267 list exports (keep only what the Adoption Facts section renders). Decide whether the guide prompt actually requires docs, ADR and rule-file facts. If it does, say which facts it requires and keep only those.

### [CONCERN] Resolver has too many layers and options for the single decision it makes

The design has two resolver layers: `resolveAdoption` (read-only) and `createAdoptionResolver({ stateWrites })`. It also adds a required `adoptionStateWrites: 'persist' | 'read-only'` option on `createContextPipeline` and `generateContext`. Existing callers are updated to pass it, the `AdoptionSelection` union is new, and `EnhancedContextData.adoptionFacts` is new. `template_preview` needs a no-write path, so one flag is justified. The two-resolver split is the part to question: `createAdoptionResolver` is mostly `resolveAdoption` plus a write, a profile check and a render. The design also duplicates the outcome-to-selection mapping in the Data Flow, D4 and the renderer's exhaustive switch. Consider folding the `resolveAdoption` and resolver layers until a second consumer (262 or 264) exists, or state which of the two files holds the selection rule.

### [CONCERN] State-write failure and concurrent-build behavior are not specified

This is a new I/O path: the build now writes `.context-forge.toml`. D9 says only that "a failed state write [is] rethrown the same way". The following cases are left open:
- Whether a failed write leaves the build with no prompt, or aborts after detection but before output. The write happens before prompt assembly in the Data Flow, so a write failure blocks the whole build, including on read-only checkouts.
- Two builds racing to write `in_progress`. Both write the same value, so this is probably harmless, but the design should say so.
- A parse failure of an existing malformed `.context-forge.toml` in `readAdoptionState`. That is `ConfigManager`'s behavior, but this slice makes it newly fatal for Phase 0 builds.
- `readHistory` failure modes other than "unknown": git hanging, or a very large repo making `rev-list --count` slow. There is no timeout or cap.

State the handling for each in one line, such as an explicit error naming the override, or a git timeout. The existing stub-versus-rethrow behavior in `generateContextFromProject` should also be confirmed for the Phase 0 path.

### [CONCERN] No performance target for the new work on the build path

D2 says the walk cost is "bounded by the threshold, not by repo size". That holds only when the code reaches 2000 lines. A repo with few source lines and a very large tree of non-source files, or large directories outside `EXCLUDED_DIRS`, walks entirely and synchronously. The walk blocks the event loop in the MCP server, and the design has no entry or file-count cap and no time bound. The architecture states no NFR for this path, so this is not a violation. The slice still adds a synchronous walk to a hot path (every Phase 0 `context_build`) and should either state a target or a cap, or explain why the walk is acceptable. One idea: re-detect only while the state is unset, which the design already does, and cap the entries visited.

### [NOTE] `adoption.state` doubles as the user override and the persisted state

Setting `declined` to override loses the information that detection had said brownfield. A user who later unsets the key sees detection run again, which is intended. The transitions table says `in_progress` to `declined` is an override, but an auto-written `in_progress` followed by a manual `declined` is indistinguishable from a user's first choice. This is acceptable given the choice not to add a second key. The one thing to confirm is that 264 and 263 treat `declined` as "fresh project", as D3 says. That meaning is stated only here and not in the architecture, which lists no `declined` state. It extends the architecture's "user override exists in both directions", which is fine.

### [NOTE] Parent link and slice-plan alignment

The `parent` field points to the slice plan. The success criteria in the slice plan are all covered: each outcome, scaffold-only, shallow clones, monorepo, override both ways, persistence and resume, the named error, and CLI/MCP parity. No assigned scope is dropped. The effort is 3/5, and the scope above is somewhat larger than that implies. The proportionality cuts above would bring it back in line.

### Run Digest

- Response length: 7253 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 216558 / 135311 / 81241 / 2971 / not computed
- Duration: 26.1 s
- Cost: $0.37 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
