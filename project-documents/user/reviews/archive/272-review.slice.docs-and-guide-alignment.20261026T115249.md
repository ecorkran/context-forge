---
docType: review
layer: project
reviewType: slice
slice: docs-and-guide-alignment
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/272-slice.docs-and-guide-alignment.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: 10b4a06f665833b5aee04665a3a16e5d9ed9a4b7
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 97262
cachedTokens: 8865
cacheWriteTokens: 88393
completionTokens: 4132
durationSeconds: 40.2
costUsd: 0.396518
costBasis: provider
runId: run-20261026-p4-feb3f704
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: concern
    category: architectural-alignment
    summary: "Docs and guide contract keep the concept as something the adoption prompt writes"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md:105, project-documents/user/slices/272-slice.docs-and-guide-alignment.md:129, project-documents/user/slices/272-slice.docs-and-guide-alignment.md:148"
  - id: F002
    severity: concern
    category: error-handling
    summary: "The `cf prompt get` warning is missing from the squadron contract and its failure modes are unstated"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md:118, project-documents/user/slices/272-slice.docs-and-guide-alignment.md:156"
  - id: F003
    severity: note
    category: scope
    summary: "D4 extends the plan entry, and the extension is justified"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md:157"
  - id: F004
    severity: note
    category: proportionality
    summary: "Quoting notice lines in the README adds a drift surface that can be cut"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md:133, project-documents/user/slices/272-slice.docs-and-guide-alignment.md:290"
  - id: F005
    severity: pass
    category: architectural-alignment
    summary: "Boundaries, dependency direction and guide-release coupling match the architecture"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Technical-Decisions"
---

# Review: slice — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Docs and guide contract keep the concept as something the adoption prompt writes

The architecture's Concept row says squadron's concept flow (363) writes `000-concept` during `sq onboard`. It adds that "the adoption prompt never drafts it; it starts from the confirmed concept". Flow step 5 agrees: the agent, driven by cf's prompt, writes only the derived architecture and the existing-state plan.

The slice conflicts with this in two places:
- The Data Flow says the "agent writes concept, derived arch, existing-state plan".
- D2 lists "concept" among the things an adoption writes.
- D3 says "Steps 1–3 (concept, derived architecture…, existing-state plan) … stay as they are". That would leave a guide prompt that drafts the concept.

This slice is where the architecture's guide-prompt contract gets fixed. Without a correction, the README misattributes concept authorship and the D3 contract preserves a step the architecture removed.
- Reword D2 and the Data Flow so squadron writes the concept.
- Add to D3's "must say" list that the prompt starts from the confirmed concept and does not draft it.
- Check D3's "stay as they are" against the actual Step 1 text of the guide prompt.

### [CONCERN] The `cf prompt get` warning is missing from the squadron contract and its failure modes are unstated

D4 adds a stderr warning to `cf prompt get`, a primitive that `sq onboard` consumes. D1's list of what `docs/ADOPTION-PRIMITIVES.md` covers for `cf prompt get` does not include it. The document is the squadron-facing contract, so squadron has no stated guarantee that stderr may carry a warning while stdout and exit code stay unchanged. Put that guarantee in the contract.

D4 also doesn't say what happens in these cases:
- no guide is installed;
- the version file is missing or unreadable;
- the project can't be resolved when only `--path` is given.

"As `cf build` does" is implicit. The slice should name the behavior for each case: warn, error, or skip. The architecture says a missing guide prompt is an error, never a fallback. The test criterion covers only "old" and "current".

### [NOTE] D4 extends the plan entry, and the extension is justified

The architecture's 272 line says "Guide minimum raised" and doesn't mention a warning in `cf prompt get`. The slice flags this as an extension and gives a concrete failure it prevents. Without the warning, a project on guide v0.22.7 hands `sq onboard` the old prompt. That prompt says the Adoption Facts section is missing and stops, and nothing points at the stale guide. It is small, reuses `checkGuideMinimum`, and leaves stdout and exit code alone, so it doesn't breach the rule that `cf build` is pure. I'd keep it, as long as the contract gap above is closed.

### [NOTE] Quoting notice lines in the README adds a drift surface that can be cut

D2 quotes `adoptionLines.ts` text in the README. The slice itself accepts that this goes stale silently, and it adds a success criterion to check it. The contract document already treats `notices` as opaque text. The README can describe the behavior (one line naming `sq onboard` and the opt-out) without quoting it. That removes the drift risk and one verification item.

### [PASS] Boundaries, dependency direction and guide-release coupling match the architecture

- **Squadron boundary:**
  - Squadron calls cf, and no part of the slice makes cf call squadron.
  - D5 removes the cf test code that wrote a squadron file name, which fits the rule that cf hard-codes none of squadron's file names.
  - The hand-offs to squadron and ai-project-guide are messages between agent sessions, not runtime coupling.
- **Guide release coupling:**
  - The architecture requires the cf release and the guide release to ship together. Special Considerations and the Development Approach handle this by making the version raise the last task.
  - `MIN_GUIDE_VERSION` is read from the release tag rather than assumed.
  - Slice completion is explicitly gated on that release.
- **Guide ownership:**
  - D3 follows the architecture's "guide owns content, cf owns logic" rule. cf specifies what the guide text must and must not say, and ai-project-guide writes the wording.
  - D3's "must not" list matches the architecture's three guide-prompt drops: the `cf build` steps, the raw-probe branching, and the squadron step list.

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
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 97262 / 8865 / 88393 / 4132 / not computed
- Duration: 40.2 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
