---
docType: review
layer: project
reviewType: code
slice: collapse-adoption-state
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/269-slice.collapse-adoption-state.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 9b72029bf7107a0cf92c02b70f43d816786475f5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
turns: 1
promptTokens: 71489
cachedTokens: 3232
cacheWriteTokens: 68255
completionTokens: 2011
durationSeconds: 18.1
costUsd: 0.29897
costBasis: provider
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: concern
    category: duplication
    summary: "Opt-out command text is duplicated instead of defined once"
    location: "packages/core/src/adoption/adoptionLines.ts:7-20"
  - id: F002
    severity: concern
    category: code-quality
    summary: "Unreachable branch used only to narrow a type"
    location: "packages/core/src/adoption/adoptionLines.ts:46-47"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Inconsistent failure policy: walk errors are advisory, planning-fact errors still block `cf next`"
    location: "packages/core/src/adoption/adoptionLines.ts:34-52"
  - id: F004
    severity: note
    category: performance
    summary: "Source walk runs on every `cf next` for unplanned projects"
    location: "packages/core/src/adoption/adoptionLines.ts:49"
  - id: F005
    severity: note
    category: typescript
    summary: "Type assertions in tests"
    location: "packages/cli/tests/commands/next.adoption.test.ts:81"
  - id: F006
    severity: pass
    category: testing
    summary: "Test coverage accompanies the change"
    location: "packages/core/tests/adoption/planningFacts.test.ts"
---

# Review: code — slice 269

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Opt-out command text is duplicated instead of defined once

`cf config set adoption.state declined` is written out three times in `adoptionLines.ts`: `BROWNFIELD_LINE`, `INCOMPLETE_ADOPTION_LINE` and `inconclusiveDetectionLine`. `OVERRIDE_REMEDY` in `contracts.ts:15` writes it a fourth time. The `ADOPTION_OPT_OUT` constant already exists, but none of these strings use it. If the key or value changes, four places need editing, which breaks the project's "define a comparison value once" rule. Build the command from `ADOPTION_OPT_OUT` in one exported constant and reuse it. The `sq onboard` wording is also repeated across the two lines.

### [CONCERN] Unreachable branch used only to narrow a type

`if (stage.kind === 'opted-out') return ...` can never run, because the opt-out already returned above. The comment admits it exists only to narrow the type. This is dead code with an unneeded return value. Deriving `stage` from `decideStage` could return a narrowed type instead. Alternatively, finish the check with an exhaustive `never` switch, as the deleted code did.

### [CONCERN] Inconsistent failure policy: walk errors are advisory, planning-fact errors still block `cf next`

The comment says the warning "must not block cf next", and a failed source walk becomes the inconclusive line. But `readPlanningFacts` can throw `AdoptionError` for non-ENOENT `readdir` failures (per its own doc comment). That error propagates uncaught, so an unreadable planning directory aborts `cf next` through the advisory path. Either handle both consistently or document why only the walk is softened. I did not inspect `findPlanningArtifacts` beyond the diff.

### [NOTE] Source walk runs on every `cf next` for unplanned projects

`measureSourceVolume` can visit up to `MAX_WALK_ENTRIES` (20,000) entries each time `cf next` or `workflow_next` runs on an unplanned, non-opted-out project. The cap bounds the cost, but it is paid on every call, and the cap-hit test needs a 60s timeout. Consider whether the result should be cached or the cost documented.

### [NOTE] Type assertions in tests

`JSON.parse(printed) as NextAction` and `(failure as Error)` are assertions without a justifying comment. The TypeScript rule asks for a comment on each. These are low risk in tests, but a small type guard would remove them.

### [PASS] Test coverage accompanies the change

New logic has direct tests: stage decision, the opt-out reader (including legacy and out-of-enum values), nav lines, and planning-facts parsing. The parsing tests use both compact and guide-layout frontmatter, and cover absent, malformed and unreadable files, as the parsing rules require. The `adoption.state` check shows legacy values do not change consistency findings. Tests sit in the centralized `tests/` directories, and fixtures use temp directories that are cleaned up.

### Run Digest

- Response length: 3378 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 1
- Tokens — prompt / cached / cache write / completion / reasoning: 71489 / 3232 / 68255 / 2011 / not computed
- Duration: 18.1 s
- Cost: $0.30 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
