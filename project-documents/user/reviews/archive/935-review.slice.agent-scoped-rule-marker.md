---
docType: review
layer: project
reviewType: slice
slice: agent-scoped-rule-marker
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/935-slice.agent-scoped-rule-marker.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 675fd57e95a98656453f007ac7c333fda93c53e5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 227473
cachedTokens: 222667
cacheWriteTokens: 4798
completionTokens: 2504
durationSeconds: 25.0
costUsd: 0.067246
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: scope
    summary: "Scope and plan alignment"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#Overview"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Parser accepts more forms than the guide signed off on"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#Parsing"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Per-audience resolution sections are heavier than needed"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#State-Management"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Once-per-run warning is under-specified for repeated and multi-target runs"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#Data-Flow"
  - id: F005
    severity: concern
    category: integration
    summary: "Rules are read twice per run with no shared source of truth"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#Component-Structure"
  - id: F006
    severity: note
    category: edge-case
    summary: "Always-on rule for Cursor-only installs is documented, not guarded"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md#Audience-is-per-output-file-not-per-target"
  - id: F007
    severity: note
    category: error-handling
    summary: "NFRs and I/O failure modes"
    location: "project-documents/user/slices/935-slice.agent-scoped-rule-marker.md"
---

# Review: slice — slice 935

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Scope and plan alignment

The slice implements every item in plan entry 935. Those are per-output audiences, skip reporting, manifest pruning, per-audience `delivered`, the inventory field, and decisions on the parse, unknown values and field shape. The guide-side work is excluded. It is themed maintenance and setup-ide parity work, which matches the 900 architecture's scope and its "clear success criteria" principle. Dependency 266 points the right way, and the "Provides" and "Consumes" sections are consistent with it.

### [CONCERN] Parser accepts more forms than the guide signed off on

The overview says the guide signed off on `agents: [claude]`, "written inline and never as a block list". The design still builds a scalar form and a block-list form, quoting, case folding and an empty-list "park a rule" semantic. The CLAUDE.md lenient-parsing principle justifies tolerating spacing and quoting variations on the inline form. Nothing in the slice plan or the guide's contract requires the block-list form, and the scalar form is only a possible typo. Block-list parsing also costs a second code path and extra tests. The design should do one of two things. It can cut the parser to the inline list plus a bare scalar and name the block form as deferred. Or it can state which concrete requirement needs the block form. Deliberately adding the empty-list "park a rule" case is also unused behavior.

### [CONCERN] Per-audience resolution sections are heavier than needed

`InstallContext.resolutionsSection: string` becomes a `Record<RuleAudience, string>` with a permanently empty `cursor` entry. `classifyResolutions` and `renderResolutions` also change signature. The only requirement behind this is that a resolution on a `[claude]` rule renders in CLAUDE.md only. Three composite blocks exist, so the record needs only the audiences that have blocks. Keeping a `cursor` key that is always `''` is an abstraction nothing uses. Narrow the record to the three composite audiences, or use a type that excludes `cursor`, so the permanent empty entry goes away.

### [CONCERN] Once-per-run warning is under-specified for repeated and multi-target runs

Step 1 says `installIde` warns once per unknown value, but the design does not say whether this holds when several targets run in one invocation. It also does not say what happens if a rule file is unreadable or has an unclosed frontmatter block while `unknownAudienceValues` scans the directory. The parser tests mention "missing or unclosed frontmatter", but the scan's failure behavior is not stated. `CLAUDE.md` forbids silent fallbacks, so the design should say what the scan does with an unreadable file: fail explicitly or skip with a named message.

### [CONCERN] Rules are read twice per run with no shared source of truth

Audience is parsed independently at each of seven call sites, plus the directory scan for warnings and the inventory (`GuideRuleEntry.agents`). The design rejects a cache because the directory is small, which is a reasonable performance call. The correctness risk is that eight readers each re-derive the audience from raw text. The design could cut that by having the rule-entry list (`guideRuleEntries`) carry the parsed audiences once and having the compilers and copiers consume it. That would also remove the separate `unknownAudienceValues` scan and the duplicate `reachesAudience(text, …)` entry point. At minimum, the design should explain why call sites cannot consume `GuideRuleEntry`.

### [NOTE] Always-on rule for Cursor-only installs is documented, not guarded

An always-on rule marked `[cursor]` alone reaches no file. The design accepts this and documents it in the README. The decision is explicit and low-risk given the marker's real use, so no change is requested.

### [NOTE] NFRs and I/O failure modes

The 900 architecture states no NFRs for this path, so none needs restating. The slice adds no network or message I/O. Its only new I/O is reading rule files that setup-ide already reads, and the missing-directory case is covered by the existing `requireRulesDir` abort.

### Run Digest

- Response length: 5199 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 227473 / 222667 / 4798 / 2504 / not computed
- Duration: 25.0 s
- Cost: $0.07 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
