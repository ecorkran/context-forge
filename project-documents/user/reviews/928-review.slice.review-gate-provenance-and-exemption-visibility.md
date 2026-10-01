---
docType: review
layer: project
reviewType: slice
slice: review-gate-provenance-and-exemption-visibility
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20260930
dateUpdated: 20260930
reviewedSha: 80d32b3f22722c62bee0faee3d090269fc8f06ee
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 35
turns: 17
promptTokens: 955828
cachedTokens: 854016
completionTokens: 88166
reasoningTokens: 82637
durationSeconds: 595.0
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: concern
    category: hidden-dependency
    summary: "Provenance contract is consumed without an owning reference, and drift silently disables the policy"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:221"
  - id: F002
    severity: concern
    category: design
    summary: "The exemption collapses the typed `exempt` reason into a free-text note duplicated across two layers"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:152-153"
  - id: F003
    severity: concern
    category: error-handling
    summary: "A weak-evidence PASS stays invisible at the default config, and unknown provenance degrades permissively without any signal"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:132-143"
  - id: F004
    severity: note
    category: design
    summary: "The cited motivating failure mode is invisible in the terminal state it was observed in"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:156"
  - id: F005
    severity: note
    category: dry
    summary: "`askConfirmation` is used as a shared interface while `check.ts` already carries a private duplicate"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:63"
  - id: F006
    severity: note
    category: design
    summary: "The `weakPassAs` type-reuse question is left as \"rename if that reads badly\""
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:202"
  - id: F007
    severity: pass
    category: alignment
    summary: "Contract change is internal-only and preserves the required `NextAction` shape"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:210"
  - id: F008
    severity: pass
    category: nfr
    summary: "No parent NFR applies to the paths this slice touches"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md#Success Criteria"
  - id: F009
    severity: pass
    category: error-handling
    summary: "New interactive I/O path has enumerated failure modes with explicit handling"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:166-172"
  - id: F010
    severity: pass
    category: testing
    summary: "Refactor-first sequencing satisfies the no-behavior-change-without-tests principle"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:286"
  - id: F011
    severity: pass
    category: alignment
    summary: "Dependency direction and integration points match the consuming slices"
    location: "project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md:60-63"
---

# Review: slice — slice 928

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Provenance contract is consumed without an owning reference, and drift silently disables the policy

The slice adds CF-side semantics for two frontmatter fields — `verdictSource` and `recoveryTurn` — and describes them as "Squadron's frontmatter contract," citing `squadron/src/squadron/review/persistence.py` (a file outside this repo; I could not verify it). `240-arch.review-aware-workflow-gating.md:48` is explicit that this schema "is owned by Squadron slice 300", that CF reads `verdict` and (when present) `score`, carries `criteria`/`provenance` as opaque fields, and that "CF must not extend or reinterpret this schema unilaterally." Nothing in this slice names the owning squadron slice/version for `verdictSource`/`recoveryTurn`, or notes that the 240 contract needs an amendment to cover them — so the gate's new behavior rests on a contract reference the architecture does not (yet) acknowledge. Compounding this, the stated failure handling for the key disappearing is: "If squadron renames or drops a key, affected artifacts fall back to 'no signal' (absent), which is today's behavior." A project that set `workflow.review_weak_pass_as: concerns` would then silently revert to accepting a derived PASS — a silent fallback that disables a project's declared policy, which cuts against the "Fail-fast on configuration errors" stance in `240-arch:56` and CLAUDE.md's no-silent-fallback rule. Recommend: name the owning squadron artifact/version for the two keys, and state how policy drift becomes visible (e.g. a `cf check` info finding when the configured policy is set but no artifact carries any provenance field anywhere).

### [CONCERN] The exemption collapses the typed `exempt` reason into a free-text note duplicated across two layers

TD-1 deliberately introduces a typed `GateResult` variant (`{status:'exempt', reason: ExemptReason}`) so callers cannot mix up "clears" and "exempt", and line 243 forbids string literals for exempt reasons outside their definitions. TD-5 then carries that information to consumers as `SliceStatus.gateNote?: string` holding the English sentence `review gate skipped: slice declares review: none`, and `enrich()` appends ` (review gate skipped: slice declares review: none)` to `rationale` when `gateNote` is set — read literally, the same sentence is written in two places, one of which is miles from the `ExemptReason` definition the doc says is the single source. More importantly, the machine-readable surface degrades exactly where `240-arch:44` ("First-class status representation … runners can act on them without parsing recommendation strings") says not to: an exempt active slice falls through to the ordinary `needs-tasks`/`in-implementation`/`complete` status, and a downstream runner distinguishes "gate waived" from "gate cleared" only by string-matching a rationale appendix. Recommend putting the typed reason on `SliceStatus` (e.g. alongside or inside `gateInfo`) and deriving both the `rationale` suffix and the `cf check` finding text from the one definition, with no literal text outside it.

### [CONCERN] A weak-evidence PASS stays invisible at the default config, and unknown provenance degrades permissively without any signal

The slice exists because the gate "trusts every PASS the same way" (Overview) and because `review: none` exemptions were invisible. Half of that problem gets a visibility mechanism (the `info` finding for exemptions) and half does not: nothing in `cf check` or `cf next` reports that a PASS cleared on weak provenance unless a PM has already set `workflow.review_weak_pass_as` to a blocking value. The "Value" section (line 27) claims readers now "see when a slice's reviews are waived" — true — but the #89/#105 condition (a rebuilt or recovered PASS clearing a slice) is undetectable at defaults, so the failure mode the PM would want to see reported is precisely the one that requires advance configuration to become visible. TD-3 makes this sharper: the parent plan directed that "absent, unknown, or malformed values must degrade like an unknown verdict" (which under the default `review_unknown_as: fail` would block); the design reclassifies unrecognized values as "weak," so `verdictSource: garbage` clears silently at the default `'pass'`. The doc justifies the *absent* case well (line 142) but never states that the malformed case is now solved more leniently with no signal, nor does the Scope/"Excluded" list mention it. Recommend either an info-level finding (or rationale note) whenever a PASS clears on weak provenance, or an explicit, documented statement of the tradeoff.

### [NOTE] The cited motivating failure mode is invisible in the terminal state it was observed in

TD-5 emits the exemption finding "at most one … per slice, and only when `planEntry` exists and `!planEntry.isChecked`", and "nothing is emitted for complete exempt slices." The parent plan specifies the incomplete-entry rule, so this follows it — but the harm described (slices 924 and 925 "went unreviewed without anyone noticing") occurred on slices whose plan entries are now checked (`[x]`), i.e. after the exemption stopped being reported. The mitigation is temporal: the finding must be seen while the slice is still incomplete. Worth stating that tradeoff explicitly in the design so a later reader does not assume complete exempt slices are covered by the new visibility.

### [NOTE] `askConfirmation` is used as a shared interface while `check.ts` already carries a private duplicate

"Interfaces Required" lists `askConfirmation` (`packages/cli/src/utils/confirm.ts`), but `packages/cli/src/commands/check.ts:38-45` defines its own identical local `askConfirmation`, and TD-6 says the new prompt "copies the `cf worktree rm` pattern" (which imports from `utils/confirm.ts`). Since this is a maintenance slice in an initiative whose scope includes "pattern consolidation … dead code removal" (`900-arch.maintenance-and-refactoring.md:17-18`), the design should say whether the local copy is deleted in favor of the shared helper; otherwise the slice adds a third call site onto a duplicated helper.

### [NOTE] The `weakPassAs` type-reuse question is left as "rename if that reads badly"

`ResolvedGate` gains `weakPassAs: UnknownPolicy`, reusing a type whose meaning is "how to treat an unreadable verdict" for a distinct policy ("how to treat a readable-but-weak PASS") that only happens to share a token set; the design defers the naming decision to implementation ("If that reads badly, rename the type to `StandInPolicy` and alias the old name"). Given the same document's rule that comparison values are "defined once and referenced everywhere" (line 188), the name and whether the token set is shared or separate should be settled here — a rename-or-alias decision is cheap now and awkward mid-refactor.

### [PASS] Contract change is internal-only and preserves the required `NextAction` shape

`evaluateReviewGate`/`GateEvaluation` are not part of a public export surface (`packages/core/src/introspection/index.ts`, `packages/core/src/node.ts` do not re-export `reviewGate`), so widening the return to `GateResult | null` does not break an external consumer, and the design explicitly leaves `GateEvaluation`'s shape and `NextAction` untouched while getting MCP parity for free (`workflow_next` reuses `getNext`; no MCP schema change). That matches `240-arch` ("the gate must not change the `NextAction` return type") and its "Inherited by both surfaces" goal.

### [PASS] No parent NFR applies to the paths this slice touches

`900-arch.maintenance-and-refactoring.md` states no latency, throughput, or other quantitative NFR, and `240-arch.review-aware-workflow-gating.md`'s nearest requirement is qualitative determinism ("the same routing decision for the same inputs every time"). The slice satisfies that: `classifyEvidence` is specified as a pure helper over already-parsed frontmatter with no new I/O, and the only added I/O-adjacent behavior is the interactive prompt (covered below). There is therefore no NFR to restate in this slice.

### [PASS] New interactive I/O path has enumerated failure modes with explicit handling

The one genuinely new I/O path — the `--set-review-none` stdin prompt — is the best-specified part of the document: non-TTY without `--yes` throws a `UserError` rather than relying on `readline` (explicitly naming the "never resolves" hang as the reason), `--json` without `--yes` is an error so a JSON caller cannot hang on a prompt, decline writes nothing, and criterion 12 asserts a non-zero exit with no write. No failure mode here is left implicit or "TBD." (The residual — a TTY that closes between prompt and answer — is not addressed, but it matches the existing `cf worktree rm` pattern and is out of proportion to flag at CONCERN.)

### [PASS] Refactor-first sequencing satisfies the no-behavior-change-without-tests principle

The implementation approach introduces `GateResult` first with "clears and exempt behave exactly like today's `null`", keeps existing tests green and commits before adding provenance or visibility, and criterion 1 runs the whole existing gate suite against unchanged defaults. That is a direct match for `900-arch.maintenance-and-refactoring.md:22` ("Refactoring slices must have test coverage verifying preserved behavior before and after the change") and the "no new blocking by default" constraint in the parent slice-plan entry, and it is paired with a credible mitigation for the one acknowledged technical risk (contract change landing in a separate commit).

### [PASS] Dependency direction and integration points match the consuming slices

The design keeps gate logic in `packages/core/src/introspection/reviewGate.ts` (pure/policy) with the CLI confined to `packages/cli/src/commands/check.ts`, so core gains no dependency on the CLI; the interfaces it declares as required (`detectDocuments` → `review`/`reviewParts`, `parseFrontmatter` returning `Record<string,string>`, `SlicePlanEntry.indexSource`) are all present as described (`packages/core/src/introspection/types.ts:112-114`, `:236`), and the per-part `#106` loop it builds on exists at `packages/core/src/introspection/reviewGate.ts:225-241`. The #67 rider (`ruleDuplicateIndex` wording plus explicit-index preference in `checkSlice`) is also accurately scoped to the existing `indexSource` distinction already used at `ConsistencyChecker.ts:110`, and the parser itself is correctly left unchanged (`slicePlanParser.ts:83-96`).

### Run Digest

- Response length: 12853 chars
- Response is newline-free: no
- Tool calls made: 35
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 351865
- Effort: backend default
- Turns: 17
- Tokens — prompt / cached / completion / reasoning: 955828 / 854016 / 88166 / 82637
- Duration: 595.0 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 11
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 11
- Finding-shaped matches — surviving validation: 11
