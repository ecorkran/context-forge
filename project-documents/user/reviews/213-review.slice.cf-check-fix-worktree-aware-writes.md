---
docType: review
layer: project
reviewType: slice
slice: cf-check-fix-worktree-aware-writes
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md
aiModel: claude-opus-5-5
status: complete
dateCreated: 20261004
dateUpdated: 20261004
reviewedSha: 2de942f75f1e14594da368bccf1a3f8021134bcb
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
durationSeconds: 57.5
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: scope
    summary: "Slice scope falls outside the parent architecture's goals"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md"
  - id: F002
    severity: concern
    category: error-handling
    summary: "Readiness is checked at plan time but not re-checked before writing (TOCTOU across the CLI prompt)"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:104-120"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Commits into another checkout run that checkout's git hooks, with no timeout or failure strategy"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md#d5--readiness-guards-before-touching-another-checkout"
  - id: F004
    severity: concern
    category: integration
    summary: "`commitPathsIfChanged` contract is underspecified for the data `CheckoutCommit` needs"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:222"
  - id: F005
    severity: concern
    category: under-specification
    summary: "How \"invoking checkout\" is determined is undefined for the CLI and for unregistered worktrees"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:104"
  - id: F006
    severity: concern
    category: error-handling
    summary: "A registered worktree whose path is missing or not a checkout is not covered"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:285-288"
  - id: F007
    severity: note
    category: integration
    summary: "`workflow.auto_fix` widens the commit blast radius"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:392"
  - id: F008
    severity: note
    category: documentation
    summary: "Decision numbering is out of order"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:176"
  - id: F009
    severity: pass
    category: design
    summary: "Ownership by fix subject and structured `subjectIndex`"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md#d1--ownership-is-per-fix-subject-not-per-file"
  - id: F010
    severity: pass
    category: design
    summary: "Deferral enum, CLI/MCP parity, and single-checkout no-op"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md#d6--deferral-reasons-are-an-enum"
  - id: F011
    severity: pass
    category: nfr
    summary: "No NFRs inherited from the parent architecture"
    location: "project-documents/user/architecture/200-arch.developer-onboarding.md"
---

# Review: slice — slice 213

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [CONCERN] Slice scope falls outside the parent architecture's goals

The 200-arch covers developer onboarding: smart `cf init`, `project_create`, the onboarding skill and first-run `cf next` (200-arch.developer-onboarding.md, Design Goals and Anticipated Slices). Nothing in it deals with consistency-checker fix semantics, worktree ownership, or committing into other checkouts. The slice plan does list 213 in the 200 band (200-slices.developer-onboarding.md:260), so the slice is not making up its own scope. Even so, none of its decisions can be traced back to a stated architectural goal or principle. The real context is 160-arch (the consistency checker) and 180-arch (worktrees). The slice's own Dependencies list 207/926/927, not any 200-arch component.

It also adds something the 200-arch doesn't anticipate: automated commits on another checkout's branch. That cuts against the 200-arch principle "Never destructive — if unsure, ask or skip" (200-arch:84). For an unattended path, the closest the slice comes to "asking" is the CLI y/N prompt.

Recommendation: rehome 213 under a worktree/maintenance band, or add a short section to the 200-arch (or 180-arch) that sanctions cross-checkout writes. This doesn't block the design, but reviewers have no architectural anchor to check it against.

### [CONCERN] Readiness is checked at plan time but not re-checked before writing (TOCTOU across the CLI prompt)

`checkoutReadiness` runs inside `planRoutedFixes`. The CLI then prints the plan and waits on a y/N prompt for as long as the user takes. Only after that does `applyFixPlan` write and commit. If, in the meantime, someone in the target checkout starts editing the target file, starts a merge/rebase, or detaches HEAD, the D5 guards no longer apply:
- `git add -A -- <path>` plus `git commit -- <path>` would commit the user's in-progress edit together with the fix.

That is exactly the "mix their edit and ours" outcome D5 is there to prevent (line 212). `applyFixPlan` should re-run `checkoutReadiness` for each non-invoking checkout just before writing, and defer with the same reasons if the state has changed. Add a success criterion for it.

### [CONCERN] Commits into another checkout run that checkout's git hooks, with no timeout or failure strategy

`commitPathIfChanged` runs a plain `git commit -m … -- <path>` (gitExec.ts:149). It has no `--no-verify` and passes no `timeoutMs`, and `gitExec`'s timeout is opt-in. In another person's or agent's checkout, pre-commit, commit-msg or husky/lint-staged hooks can:
- **hang** (an interactive hook, or a slow lint)
- **reject the commit**
- **modify the staged file**

The design names `index.lock` as a commit failure (line 214). It does not cover hang or timeout, and it doesn't say whether hooks should run. Enumerate this path's failure modes explicitly:
- Decide whether hooks run, using `--no-verify` or not, with the reason.
- Bound each git call with a `timeoutMs` constant.
- Say what happens on timeout: report in `fixErrors` with the written-but-uncommitted files, as for other commit failures.

### [CONCERN] `commitPathsIfChanged` contract is underspecified for the data `CheckoutCommit` needs

`CheckoutCommit` needs a `sha` and `files` (line 245), but the existing helper returns `boolean`. It also returns `false` silently when `isGitRepo` fails (gitExec.ts:143), which would leave writes uncommitted with no report: the "surprise dirty state" the slice is meant to remove. Specify:
- the new helper's return type (the sha, or `null` when there was nothing to commit)
- that "not a git repo" is an explicit readiness failure (a `DeferReason`), not a silent no-op
- that the single-path wrapper keeps its existing boolean contract for `cf guide update`

### [CONCERN] How "invoking checkout" is determined is undefined for the CLI and for unregistered worktrees

`planRoutedFixes(…, invokingPath)` decides which checkout gets commits, but the CLI derivation of `invokingPath` isn't stated (cwd? the git toplevel? the view's `projectPath`?). The match semantics aren't stated either (realpath, trailing slash). If `cf check --fix` runs from a git worktree that isn't registered, no view matches. Every view, including the primary, would then be treated as non-invoking and get an automatic commit. The project's own rules treat an unregistered worktree as a STOP condition.

The MCP choice (`project.projectPath` is always the invoking checkout, line 276) also means an agent in worktree B that calls `workflow_check {fix:true}` gets B's fixes committed rather than left as a visible diff. Define the resolution, the normalization, and an explicit error or deferral when no view matches.

### [CONCERN] A registered worktree whose path is missing or not a checkout is not covered

The design covers a worktree with no `worktreePath`, but not one that is registered with a path that was removed (`git worktree remove`/`prune` without `cf worktree rm`), or one that isn't a git checkout. `checkoutReadiness` should report this as an explicit `DeferReason`, or the design should state that view construction already excludes such views.

### [NOTE] `workflow.auto_fix` widens the commit blast radius

With `auto_fix=true`, any plain `cf check` (and MCP `workflow_check` without `fix`) can commit into other checkouts without a prompt. The design acknowledges this in the README note. It's worth stating in Success Criteria #11 that the auto_fix path skips the preview, so reviewers of the tests know it is deliberate.

### [NOTE] Decision numbering is out of order

D7 comes between D4 and D5. Cross-references such as "927 D5" vs. "213 D5" are easy to confuse, so moving D7 after D6 would help readers.

### [PASS] Ownership by fix subject and structured `subjectIndex`

D1 and D2 are clear and follow project rules:
- No parsing of user-visible labels: the index is a structured field set by each rule.
- The unclaimed-document rule (unclaimed goes to the primary checkout) is stated as an explicit rule, not a fallback.
- Overlap returns `null` and the fix is deferred explicitly.
- A required `number | null` key, plus a coverage test, guards against silent misrouting.

### [PASS] Deferral enum, CLI/MCP parity, and single-checkout no-op

- `DeferReason` is defined once and display strings are keyed by it.
- Both consumers call the same two core functions, and MCP drops `fixAll`, which closes the divergence 927 noted.
- Single-checkout behavior is byte-identical, and JSON changes are additive.
- The relationship to 927 and the external consumer (Squadron) are documented explicitly.

### [PASS] No NFRs inherited from the parent architecture

The 200-arch's only NFR (`npm install` to useful output in under two minutes, and a lightweight `cf next` hot path) doesn't apply to the `--fix` path, so the slice doesn't need to restate it.

### Run Digest

- Response length: 8620 chars
- Response is newline-free: no
- Tool calls made: 6
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 57.5 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 11
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 11
- Finding-shaped matches — surviving validation: 11
