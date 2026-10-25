---
docType: review
layer: project
reviewType: code
slice: agent-scoped-rule-marker
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/935-slice.agent-scoped-rule-marker.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: efe12e3642e665bd81bd8f32e6ceec5ebd1f6af3
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
turns: 1
promptTokens: 85428
cachedTokens: 0
cacheWriteTokens: 85426
completionTokens: 2933
durationSeconds: 25.8
costUsd: 0.373866
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Unknown-value warning says \"ignored\" but the rule can silently drop out of every output"
    location: "packages/cli/src/ideInstall/ruleAudience.ts:122-124"
  - id: F002
    severity: concern
    category: correctness
    summary: "Frontmatter parser is stricter than the project's lenient-parsing rule"
    location: "packages/cli/src/ideInstall/ruleAudience.ts:36-47"
  - id: F003
    severity: concern
    category: design
    summary: "Composite audiences are enumerated by hand in several places instead of derived from one definition"
    location: "packages/cli/src/ideInstall/installer.ts:88-92"
  - id: F004
    severity: note
    category: dry
    summary: "Skip-by-audience block is copy-pasted in three targets"
    location: "packages/cli/src/ideInstall/targets/claude.ts:27-31"
  - id: F005
    severity: note
    category: design
    summary: "Marker file is read and parsed up to three times per install"
    location: "packages/cli/src/ideInstall/installer.ts:131-132"
  - id: F006
    severity: note
    category: testing
    summary: "Test hygiene nits"
    location: "packages/cli/tests/commands/rulesInventory.test.ts:58"
  - id: F007
    severity: pass
    category: design
    summary: "Audience model, rendering and install coverage"
    location: "packages/cli/src/ideInstall/ruleAudience.ts"
---

# Review: code — slice 935

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Unknown-value warning says "ignored" but the rule can silently drop out of every output

`audienceProblemMessage` ends an unknown value's warning with "— ignored". For `agents: [gemini]`, the unknown value is dropped, `known` is `[]`, and `reachesAudience` and `deliveredTo` return false for every audience. The rule then reaches no output. The valueless-key message does say "rule reaches no output", so the two messages are inconsistent. A typo such as `agents: [claud]` therefore removes the rule from every output. The user would read the warning as saying the typo had no effect. Say in the message that the rule is dropped when no known value remains. Alternatively, fail explicitly, as the project's "never silent fallback" principle prefers.

### [CONCERN] Frontmatter parser is stricter than the project's lenient-parsing rule

`parseValues` strips brackets only when the trimmed value both starts with `[` and ends with `]`. `agents: [claude] # only claude` fails that check, so the whole string is split on commas. The result is a bogus unknown value `[claude] # only claude`, plus a warning. Trailing YAML comments are common format variations, and the project rules say a parser must handle them. `AGENTS_KEY` also requires the key at column 0 and in exact lowercase. The tests cover quotes, spacing, case-folding and block lists, but not trailing comments. Add handling for trailing comments and a test for it.

### [CONCERN] Composite audiences are enumerated by hand in several places instead of derived from one definition

`COMPOSITE_AUDIENCES` in `resolutions.ts` is the single list of composite audiences. `classifyForInstall` still makes three hand-written `renderResolutions` calls, one per audience. `installIde` hard-codes the empty `{ claude: '', agents: '', copilot: '' }`. The project rule says a value used in lookups should be defined once. Adding a composite audience would mean editing at least three places. The type only catches the missing key, not the missing render call. Build both objects from `COMPOSITE_AUDIENCES`, for example with `Object.fromEntries`, or add a small `renderAll` helper that lives next to the list.

### [NOTE] Skip-by-audience block is copy-pasted in three targets

The same five-line pattern appears in `claude.ts`, `copilot.ts` and `cursor.ts`:
- compute `audienceSkipMessage`
- check for null
- print it in yellow
- `continue`

The excluded-rule check just above it repeats the same shape. A shared helper such as `skipReason(ctx, text, filename, audience)` would remove the duplication. The `agents.ts` index path uses `reachesAudience` directly. That is fine, but it means the "skipped" semantics live in two shapes.

### [NOTE] Marker file is read and parsed up to three times per install

`guideRuleEntries` parses each rule's `agents:` marker. `warnAudienceProblems` (via `unknownAudienceValues`) re-reads and re-parses every rule file. Each target parses it again through `reachesAudience` and `audienceSkipMessage`. The cost is trivial, but the warning could reuse the entries from `guideRuleEntries` if they kept the full `AudienceList`. That would also give one source of truth for what the marker says.

### [NOTE] Test hygiene nits

- The final assertion in the new inventory test (`JSON.parse(JSON.stringify(...)).find(...)`) is hard to read. A separate `JSON.stringify` check, or a comment saying it guards the serialised `null`, would make it clearer.
- `resolutions.test.ts` is missing a blank line before the new `it(...)`.
- I could not see a `classifyResolutions` test showing that a resolution on a rule marked for none of the composite audiences lands in no list. The updated doc comment claims this behaviour, so a test would back it up.

### [PASS] Audience model, rendering and install coverage

`RULE_AUDIENCE` is defined once as an `as const` object with derived union types, with no `any` and no enums. The `deliveredTo` and `reachesAudience` predicates are the single decision points. Per-audience resolution rendering keeps resolutions out of blocks where the rule is absent. The new install tests cover:
- every target
- pruning when a rule becomes marked
- the manifest "Kept" path
- warning de-duplication
- clean-guide silence

The new tests sit in the centralized `tests/` directory and use per-test temporary directories.

### Run Digest

- Response length: 4906 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 85428 / 0 / 85426 / 2933 / not computed
- Duration: 25.8 s
- Cost: $0.37 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
