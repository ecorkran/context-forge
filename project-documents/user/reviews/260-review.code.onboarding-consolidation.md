---
docType: review
layer: project
reviewType: code
slice: onboarding-consolidation
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/260-slice.onboarding-consolidation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: fa6600fce4f5a63933c077d49fcdb34bfa457a76
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
turns: 1
promptTokens: 55074
cachedTokens: 3232
cacheWriteTokens: 51840
completionTokens: 2015
durationSeconds: 17.0
costUsd: 0.231742
costBasis: provider
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: design
    summary: "ENOENT check duplicated instead of shared"
    location: "packages/core/src/detection/ciDetection.ts:43"
  - id: F002
    severity: note
    category: typescript
    summary: "Type assertions on caught errors"
    location: "packages/core/src/introspection/setupCiOffer.ts:38"
  - id: F003
    severity: note
    category: readability
    summary: "Obscure comma expression in test"
    location: "packages/core/tests/detection/ciDetection.test.ts:34"
  - id: F004
    severity: note
    category: design
    summary: "getNext mutates the result of computeNext"
    location: "packages/core/src/introspection/WorkflowNavigator.ts:181"
  - id: F005
    severity: pass
    category: error-handling
    summary: "Offer, detection and guide-minimum logic"
    location: "packages/core/src/detection/pathPresent.ts"
---

# Review: code — slice 260

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] ENOENT check duplicated instead of shared

`listYamlFiles` repeats the check `(error as NodeJS.ErrnoException).code === 'ENOENT'`. `pathPresent.ts` already has this as a private `isEnoent` helper. `pathPresent.ts` describes itself as the "shared missing-file rule for detection checks", and this is the same rule written twice. This breaks the DRY rule in the project conventions. Export `isEnoent` from `pathPresent.ts` and use it here. `setupCiOffer.ts` also has its own `isFsError` with another `as` cast, which could sit with it.

### [NOTE] Type assertions on caught errors

The TypeScript rules treat `as` as a code smell and want a documented reason. `isFsError` casts to `{ code?: unknown }`, and `ciDetection.ts` and `pathPresent.ts` cast to `NodeJS.ErrnoException`. All three are narrow and sit at an error boundary. A single shared type guard, from the consolidation suggested above, would remove the casts and need only one explanatory comment.

### [NOTE] Obscure comma expression in test

`recognizeCi((touch(dir, ...), dir))` uses a comma operator to sequence setup and call. Two separate statements would be easier to read.

### [NOTE] getNext mutates the result of computeNext

`getNext` writes `offers` and `warnings` onto the object `computeNext` returns. This is safe only if `computeNext` always builds a fresh object. I didn't confirm that in every branch of the file, because only the hunk was in the diff. If any branch returns a shared constant, the offer would leak across calls. Spreading into a new object would remove the risk.

### [PASS] Offer, detection and guide-minimum logic

- **Missing paths:** `pathPresent` treats only ENOENT as "not present" and rethrows everything else. This follows the "no silent fallbacks" rule.
- **Offer evaluation:** `evaluateSetupCiOffer` turns fs errors into a visible warning and propagates non-fs errors and non-boolean config values.
- **Guide minimum:** `checkGuideMinimum` writes its warning to stderr (CLI) or a second content item (MCP), so the prompt itself is unchanged.
- **Recipe rendering:** the onboarding recipe now has a single source with drift tests against the committed assets. The recipe text also avoids the example-name hallucination trap.
- **Tests:** coverage is strong. It includes symlink loops, ENOTDIR, unreadable ancestors, gate-blocked results and CLI/MCP pass-through.

### Run Digest

- Response length: 2810 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 55074 / 3232 / 51840 / 2015 / not computed
- Duration: 17.0 s
- Cost: $0.23 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
