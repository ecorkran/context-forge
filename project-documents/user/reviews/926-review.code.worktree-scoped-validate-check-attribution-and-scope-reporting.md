---
docType: review
layer: project
reviewType: code
slice: worktree-scoped-validate-check-attribution-and-scope-reporting
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/926-slice.worktree-scoped-validate-check-attribution-and-scope-reporting.md
aiModel: z-ai/glm-5.3-flash
status: complete
dateCreated: 20260922
dateUpdated: 20260922
reviewedSha: b7f892e600f527a1886408773f73f5b1852f6f87
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 45
findings:
  - id: F001
    severity: concern
    category: design
    summary: "View-building and attribution gating duplicated between CLI and MCP consumers"
    location: "packages/cli/src/commands/check.ts:227-238"
  - id: F002
    severity: concern
    category: testing
    summary: "\"Invoking checkout\" projectPath test is vacuous — mocks hardcode the asserted value"
    location: "packages/cli/tests/commands/check-worktree-attribution.test.ts:307-318"
  - id: F003
    severity: note
    category: documentation
    summary: "Stale JSDoc still describes silent skipping"
    location: "packages/core/src/schema/frontmatterFileValidator.ts:112-118"
  - id: F004
    severity: note
    category: error-handling
    summary: "`--project` invocation still validates the project root, not the caller's worktree"
    location: "packages/cli/src/commands/validate.ts#validateFrontmatterAction"
  - id: F005
    severity: note
    category: language
    summary: "Type assertion where a narrowing predicate would do"
    location: "packages/cli/src/commands/validate.ts:86"
  - id: F006
    severity: pass
    category: design
    summary: "Merge/attribution extraction with correct before-merge ordering"
    location: "packages/core/src/introspection/mergeCheckResults.ts:9-23"
  - id: F007
    severity: pass
    category: testing
    summary: "Single-checkout gating keyed on worktree count, with output pinned"
    location: "packages/cli/src/commands/check.ts:228-238"
  - id: F008
    severity: pass
    category: design
    summary: "Worktree path resolution centralized with separator-safe containment"
    location: "packages/core/src/utils/worktree-overlay.ts:29-59"
  - id: F009
    severity: pass
    category: correctness
    summary: "Whole-file managed-marker search with legacy + BEGIN marker support"
    location: "packages/cli/src/commands/setup-ide.ts:73-119"
  - id: F010
    severity: pass
    category: error-handling
    summary: "Per-path skip outcomes with additive JSON contract"
    location: "packages/core/src/schema/frontmatterFileValidator.ts#PathOutcome"
  - id: F011
    severity: pass
    category: correctness
    summary: "`rules.exclude` config key with consumer-aware validation"
    location: "packages/core/src/config/ConfigKeys.ts#rules.exclude"
---

# Review: code — slice 0

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3-flash

## Findings

### [CONCERN] View-building and attribution gating duplicated between CLI and MCP consumers

The slice correctly extracted `mergeCheckResults`/`attributeFindings` into `packages/core/src/introspection/mergeCheckResults.ts` (removing the old `TODO: Extract to @context-forge/core shared utility` in workflowTools.ts), but the logic that decides *when* to attribute was left duplicated: `const attributable = worktrees.length > 1` plus the `ProjectView` construction with the attributed/unattributed mapping appears nearly verbatim in `packages/cli/src/commands/check.ts:227-238` and `packages/mcp-server/src/tools/workflowTools.ts:255-265`, including parallel multi-line comments explaining the migrated-"default"-worktree subtlety. CLAUDE.md is explicit ("Do not duplicate logic. Respect DRY"), and this is exactly the kind of invariant (key on count, not array presence) that will drift if a future change touches only one consumer — the same failure mode the extraction was meant to prevent. A shared helper in core (e.g. `buildAttributedViews(project): { view, worktree }[]`) would collapse both call sites.

### [CONCERN] "Invoking checkout" projectPath test is vacuous — mocks hardcode the asserted value

The test `keeps the top-level projectPath meaning the invoking checkout (D6)` asserts `jsonFrom(stdoutWrite).projectPath` is `'/repo/main'`, but `resultWith()` hardcodes `projectPath: '/repo/main'` into **every** mock check result (line 79), so the assertion cannot fail regardless of what production code puts there. In production, `applyWorktreeOverlay` sets each view's `projectPath` to the worktree's `worktreePath` (packages/core/src/utils/worktree-overlay.ts:73), `ConsistencyChecker.checkAll` returns that path in its result, and `mergeCheckResults` takes `results[0].projectPath` (mergeCheckResults.ts:40) — so the top-level `projectPath` in real output is the *first registered worktree's* path, not the invoking checkout (running from beta yields alpha's path). The slice's own test-writing standard explicitly rejects tests that "pass against the unfixed code." I cannot verify D6's exact wording (the design doc is .md, excluded from scope), but the verifiable facts are: the test as written exercises nothing, and the implementation does not compute the property its title names. Either make the mocks return per-view paths (`/repo/wt-alpha`, `/repo/wt-beta`) and assert the intended top-level value, or rename/retitle the test to what mergeCheckResults actually guarantees.

### [NOTE] Stale JSDoc still describes silent skipping

The `validateFrontmatterFiles` doc comment still reads "everything else is silently skipped" (line 117), which is precisely the behavior this slice removed (#92/#96): skips are now reported via `PathOutcome`/`pathResults`. The `resolveExplicitPaths` doc above it was updated; this one was missed and now contradicts both the code and the new tests. Related nit: `validateFrontmatterFiles` mutates the provisional `Checked` outcome in place (`result.outcome = PathOutcome.SkippedNoFrontmatter`, ~line 155) — documented with a comment in `resolveExplicitPaths`, so acceptable, but a returned-fresh-array style would be cleaner.

### [NOTE] `--project` invocation still validates the project root, not the caller's worktree

The #88 fix derives `worktreeId` from `resolveProjectWorktree`, but in the explicit-flag path (`packages/cli/src/utils/project.ts`, step 1) `worktreeId` is only set when `--worktree` is passed — and `validate.ts` does not even register a `--worktree` option. So `cf validate frontmatter --project foo` run from inside wt-beta validates the project root, silently defeating #88 for that invocation shape. This matches pre-existing resolution semantics across commands (check/arch behave the same), so it is not a regression introduced here, but the fix's stated goal ("the worktree the caller is actually in") only holds for CWD-resolved invocation. Worth a follow-up or a documented limitation.

### [NOTE] Type assertion where a narrowing predicate would do

`SKIP_REASON[r.outcome as Exclude<PathOutcome, 'checked'>]` uses an `as` assertion (a code smell per the TypeScript rules) where the filter on the previous line could narrow with a type predicate: `.filter((r): r is PathResult & { outcome: Exclude<PathOutcome, 'checked'> } => r.outcome !== PathOutcome.Checked)`. The cast is currently safe, but it silently widens if a new skip outcome is added without a `SKIP_REASON` entry — a predicate plus the existing `Record` exhaustiveness typing would move that failure to compile time.

### [PASS] Merge/attribution extraction with correct before-merge ordering

`attributeFindings` attaches the structured `FindingWorktree` before `mergeCheckResults`, with the dedup-key-no-worktree rationale documented at the point where a future reader would be tempted to "fix" it. `FindingWorktree` is a structured type rather than text embedded in `description`, honoring the CLAUDE.md rule against user-visible labels as logical structure, and the MCP test explicitly covers the "location is not a path" case. Both the CLI and MCP consumers now share one implementation.

### [PASS] Single-checkout gating keyed on worktree count, with output pinned

`attributable = worktrees.length > 1` correctly handles the migrated project (exactly one "default" worktree whose path equals `projectPath`), which keying on array presence would have broken. The comment explains the count-vs-name reasoning, and both `packages/cli/tests/commands/check-worktree-attribution.test.ts` (migrated-default cases) and the byte-for-byte single-checkout JSON pin cover it — including the human-output `[default]` label case.

### [PASS] Worktree path resolution centralized with separator-safe containment

`resolveWorktreeForPath` replaces the ad-hoc candidate/sort logic in `findProjectByCwd` (packages/cli/src/utils/project.ts:44-57) and fixes the bare-string-prefix flaw (`/repo-old` no longer matches root `/repo`) with separator-aware `startsWith` checks and a trailing-separator normalizer. Tests cover nesting, the migrated-default tie (worktree preferred), pathless worktrees, and sibling-prefix decoys. `findProjectByCwd` reduces to a per-project longest-root fold with equivalent tie-breaking. One residual limitation, pre-existing and now centralized where it can be fixed once: roots and `process.cwd()` are compared as raw strings with no case/separator normalization, so Windows backslash CWDs against forward-slash stored roots would not match.

### [PASS] Whole-file managed-marker search with legacy + BEGIN marker support

The #98 fix searches the entire file instead of a 20-line window, supports both marker forms via a single `MANAGED_MARKERS` definition (the literals now appear in exactly one place, per the DRY rule), and matches the BEGIN marker as a substring while keeping the legacy marker exact-line. The inverted test documents why the old expectation was a deliberate behavior change rather than a test rewritten green, and the END-without-BEGIN negative case guards against over-matching.

### [PASS] Per-path skip outcomes with additive JSON contract

`PathOutcome` as a const-object union (no enum), `PathResult` carrying the verbatim input path plus resolved path, `documentRoot` naming the checkout, and `filesSkipped` distinguishing "checked nothing" from "skipped everything." The human output no longer prints a pass-shaped message when zero files were examined, and `validate.test.ts` pins the entire single-checkout JSON object so the external consumer's contract (`filesChecked`, `totalFindings`, `errors`, `warnings`, `findings`) cannot silently change shape. The mock migration to `importOriginal` in validate.test.ts was the necessary consequence of the new value import — handled correctly.

### [PASS] `rules.exclude` config key with consumer-aware validation

The validator rejects whitespace-padded and empty comma entries with actionable messages naming the offending pattern, justified by the consuming bash `case` literal match. The description names its consumer (cf stores/validates; the guide script acts), scope is Shared with the reasoning pinned in tests, and the `ConfigManager.list()` count test now derives from the registry instead of a hardcoded literal that would break on every key addition.

### Run Digest

- Response length: 9978 chars
- Response is newline-free: no
- Tool calls made: 45
- Tool calls failed: 0
- Stop reason: stop
- Reasoning characters: 33222
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 11
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 11
- Finding-shaped matches — surviving validation: 11
