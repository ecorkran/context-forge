---
docType: review
layer: project
reviewType: code
slice: review-gate-provenance-and-exemption-visibility
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/928-slice.review-gate-provenance-and-exemption-visibility.md
aiModel: z-ai/glm-5.3-flash
status: complete
dateCreated: 20261001
dateUpdated: 20261001
reviewedSha: 74d0375bd2c91a6875e77cf6a4e49f415c641fb1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 25
diffTruncated: false
turns: 13
promptTokens: 877519
cachedTokens: 669056
completionTokens: 101869
reasoningTokens: 99049
durationSeconds: 995.6
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "buildWeakClearFindings bypasses the class's safe-parse convention and re-reads files the gate already parsed"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:719-730"
  - id: F002
    severity: note
    category: error-handling
    summary: "askConfirmation never resolves when stdin ends without an answer, and setup-ide.ts still carries the pre-refactor duplicate"
    location: "packages/cli/src/utils/confirm.ts:4-12"
  - id: F003
    severity: note
    category: logic
    summary: "Weak-clear info findings are structurally unreachable for the code review gate in ruleReviewGate"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:672-696"
  - id: F004
    severity: pass
    category: types
    summary: "GateResult discriminated union, type guard, and single-source exemption tokens are idiomatic and exhaustively consumed"
    location: "packages/core/src/introspection/reviewGate.ts:183-230"
  - id: F005
    severity: pass
    category: testing
    summary: "Tests were written with the change and cover the decision matrix, not just the happy path"
    location: "packages/core/tests/introspection/reviewGate.provenance.test.ts:1-156"
---

# Review: code — slice 928

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3-flash

## Findings

### [CONCERN] buildWeakClearFindings bypasses the class's safe-parse convention and re-reads files the gate already parsed

`buildWeakClearFindings` calls `this.introspector.parseFrontmatter(location)` unprotected, then `describeWeakEvidence(frontmatter.data)`. Two issues:

1. **Convention inconsistency.** This class deliberately wraps every injected-introspector I/O call in a `safe*` helper (`safeParseFrontmatter`, `safeParseTaskFile`, `safeParseSlicePlan`) and documents why in `safeEvaluateGate` (packages/core/src/introspection/ConsistencyChecker.ts:589-595): a throw must degrade to one error finding, not abort the whole check/checkAll run. `buildWeakClearFindings` runs inside that exact pipeline (via `ruleReviewGate` → `checkSlice` → `check`) but calls the raw interface method. The production `ArtifactIntrospector.parseFrontmatter` delegates to the never-throwing `frontmatterParser`, so nothing fails today — but `IArtifactIntrospector` is a DI contract, and a throwing implementation (or a future refactor of the real one) aborts the run with no test to catch it, since no test exercises a throwing introspector here.
2. **Duplicate I/O and a degraded description.** `evaluateReviewGate` already parsed each review part's frontmatter to classify provenance (packages/core/src/introspection/reviewGate.ts:308-318); the checker then re-reads each weak part to rebuild the description it could have been given. If the re-parse yields empty data (file moved, or a returning introspector), `describeWeakEvidence({})` returns `''` and the finding reads `cleared on weak provenance ()` — empty parens in user-facing text.

Carrying the per-part weak-evidence descriptions (or the parsed frontmatter) on `GateClearance` would fix both at once; at minimum, wrap the parse in try/catch consistent with the class's own `safe*` pattern and handle the empty-description case.

### [NOTE] askConfirmation never resolves when stdin ends without an answer, and setup-ide.ts still carries the pre-refactor duplicate

The promise resolves only from `rl.question`'s callback. When stdin hits EOF/Ctrl-D, readline emits `close` and the pending callback is never invoked, so the CLI hangs instead of treating EOF as "not confirmed." This behavior predates the slice (it was check.ts's inline copy), and the new `--set-review-none` call site guards it with the `process.stdin.isTTY` check (packages/cli/src/commands/check.ts:138-140) — but the older `--fix` prompt path (packages/cli/src/commands/check.ts:261) has no such guard, so `cf check --fix` with an empty piped stdin still hangs. Handling `rl.on('close', () => resolve(false))` in the shared helper would fix both sites in one place. Relatedly, Task 15 removed the check.ts duplicate, but `setup-ide.ts:62` still defines an identical private `askConfirmation` that could now import the shared util — pre-existing and out of this slice's scope, but it is now the only remaining copy.

### [NOTE] Weak-clear info findings are structurally unreachable for the code review gate in ruleReviewGate

The `preAdvance` boundary guard requires `planEntry?.isChecked` (line 678), while weak-clear reporting requires `inFlight = planEntry !== null && !planEntry.isChecked` (line 669). These are contradictory, so the `else if (result?.status === 'clears' && inFlight)` branch (line 693) can never fire during the `preAdvance` iteration — code-review weak passes are never surfaced by `cf check`, only slice/tasks ones. This matches TD-5's "incomplete plan entries only" rule and the docs (docs/REVIEW-GATING.md:97 says "plan entry unchecked"), so it is not a bug — but the interaction is non-obvious: a maintainer who loosens the `preAdvance` guard to match the navigator's task-completion-driven evaluation would silently enable code-review weak-clear findings without an explicit decision. A comment on the guard or the branch noting the intended exclusion would prevent that.

### [PASS] GateResult discriminated union, type guard, and single-source exemption tokens are idiomatic and exhaustively consumed

`GateResult` is a proper discriminated union on `status`; `isBlockingGate` narrows to `GateEvaluation` so both callers (`WorkflowNavigator`, `ConsistencyChecker`) get compiler-checked access to `reviewType`/`rationale`/`artifactPath` with no `as` assertions. `EXEMPT_REASON` uses the `as const` object pattern preferred over enums, and both `EXEMPT_NOTE` and the reason strings exist in exactly one place (verified: no other hits in `packages/*/src`). The `UnknownPolicy` → `StandInPolicy` rename left no stale references, and `evaluateExemption` is pure (frontmatter passed in), letting `WorkflowNavigator.reviewNoneExemption` reuse it for the no-gate mid-implementation stage. The type-only re-export through the browser-safe barrel (packages/core/src/introspection/index.ts:23) is correctly commented, and the types.ts → reviewGate dependency is `import type` only, so no runtime cycle is introduced.

### [PASS] Tests were written with the change and cover the decision matrix, not just the happy path

The provenance suite walks each TD-3 table row (absent/stated/derived/unrecognized/recovery variants), both stand-in policies against both thresholds, split-review per-part classification, and `resolveGateConfig` validation naming the key — plus one fixture parsed through the real `parseFrontmatter` using squadron's actual frontmatter layout, per the project's "test fixtures must use the production format" rule. The exemption-visibility tests cover gating on/off, no-config, grandfathering, and the normal-slice negative case; the CLI tests cover the full confirmation matrix (non-TTY, `--json` without `--yes`, decline, confirm, `--yes` prose, `--json --yes` with no prose) and correctly save/restore `process.stdin.isTTY`. All eight gate-enabled test fixtures declare the new `review_weak_pass_as` key, so none silently depends on it (the stub config throws on unstubbed keys, which would have caught an omission).

### Run Digest

- Response length: 7098 chars
- Response is newline-free: no
- Tool calls made: 25
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 128000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 423716
- Effort: backend default
- Turns: 13
- Tokens — prompt / cached / completion / reasoning: 877519 / 669056 / 101869 / 99049
- Duration: 995.6 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5
