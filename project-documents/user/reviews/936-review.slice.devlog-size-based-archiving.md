---
docType: review
layer: project
reviewType: slice
slice: devlog-size-based-archiving
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/936-slice.devlog-size-based-archiving.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261105
dateUpdated: 20261105
reviewedSha: 5d466e210028159402cc021271a861a29ba302f5
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 8
effort: high
turns: 9
promptTokens: 432894
cachedTokens: 329559
cacheWriteTokens: 103321
completionTokens: 6406
durationSeconds: 54.8
costUsd: 0.511097
costBasis: provider
runId: run-20261106-p4-48a253c6
squadronVersion: 0.24.22
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Alignment with the 900 maintenance initiative"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#Overview"
  - id: F002
    severity: pass
    category: architecture-boundaries
    summary: "Layering and dependency direction"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#Component-Structure"
  - id: F003
    severity: pass
    category: integration
    summary: "Routed-fix extension is grounded in the existing code"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#D9"
  - id: F004
    severity: concern
    category: proportionality
    summary: "D11's undo machinery is heavier than the slice needs"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#D11"
  - id: F005
    severity: concern
    category: scope
    summary: "Heading-form table and section-handling rules go beyond the plan's two forms"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#D2"
  - id: F006
    severity: concern
    category: scope
    summary: "`auto_fix` can archive and commit without a prompt"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#D8"
  - id: F007
    severity: note
    category: documentation
    summary: "Wording and bookkeeping"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#D8"
  - id: F008
    severity: pass
    category: error-handling
    summary: "Failure modes and NFRs"
    location: "project-documents/user/slices/936-slice.devlog-size-based-archiving.md#API-Contracts"
---

# Review: slice — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Alignment with the 900 maintenance initiative

The 900 architecture covers developer-experience and maintenance work, and the plan lists 936 as item 36. The design states its scope fit explicitly (Overview, "Scope fit"). It also meets the architecture's principle of clear success criteria, with 10 functional requirements and a verification walkthrough. Hard-coded values are centralised: `DEVLOG_FILE` and `DEVLOG_ARCHIVE_DIR` constants replace the literal at `ProjectModelBuilder.ts:314`, which I confirmed exists, and the sizes live in `CONFIG_KEYS`.

### [PASS] Layering and dependency direction

Parsing and planning are pure, I/O sits in `archiveDevlog`, and the CLI only wires commands and prints output. The finding builder is kept out of the 1,487-line `ConsistencyChecker`. The slice adds no new MCP tool, so `workflow_check` inherits the rule through the shared checker. The prerequisites it depends on (213 and 923) are complete.

### [PASS] Routed-fix extension is grounded in the existing code

I checked D9 against `routedFixes.ts`. `fixRelPath` (line 59), `gateByReadiness` (lines 109–138) and `commitViewWrites` (lines 226–256) all assume one path per fix, as the design says. The `additionalPaths` change is additive, and the "absent means `[filePath]`" boundary keeps existing fixes unchanged. The regression tests on the existing routed-fix suites back that up. Worktree routing through `subjectIndex: null` also matches `routeView` (lines 152–163).

### [CONCERN] D11's undo machinery is heavier than the slice needs

D11 combines five mechanisms for one local file write:
- strict UTF-8 reads of every target archive;
- an in-memory snapshot of every touched file;
- a re-read and compare of DEVLOG.md before the final write;
- an undo that restores each file and deletes created archives;
- a second error path for when the undo itself fails.

Together these produce four writer tests (changed file, forced write failure, failing undo, non-UTF-8 archive) and two API-contract rows. The design's own accepted race gap shows the undo can only partly protect against concurrent edits.

The slice has no need for the heaviest option. The plan asks for archiving by size. Files in a cf project are normally under git, and the design already tells the user to "compare with `git diff`" when the undo fails.

Cuts to consider:
- Keep the plan-in-memory step, the strict decode, the archives-first, DEVLOG-last order, and the pre-final-write re-read and compare.
- Make any failure after the first write report which files changed and point to `git diff`, instead of attempting a rollback.
- If a retry-safety guarantee is still wanted, a cheaper route is to make a re-run harmless: skip a section already present at the top of its target archive.

Either route drops the undo-failure branch and two of the four writer tests. If the PM wants full rollback, the design should say why git recovery is insufficient. Success Criterion 10 would then need rewording to match whichever option is chosen.

### [CONCERN] Heading-form table and section-handling rules go beyond the plan's two forms

The plan names two forms, `## YYYYMMDD` and `## YYYY-MM-DD`. D2 lists five. The date-with-trailing-text and date-range rows are the same rule as `YYYY-MM-DD` (a date followed by a non-digit, first date used). They are one parser rule, not two forms, and the table should say so. The `YYYY-MM` form is a real additional rule. The design justifies it as appearing in cf's own DEVLOG, and that is a reasonable cost. But it also commits the slice to month-validity checks and to Q-mapping for a heading with no day. Keep it only if the walkthrough's `## 2025-09 (summary)` expectation stays as a deliberate success criterion. Collapse the table to two rules (full date with any trailing text, and year-month) so the effort and test surface read accurately.

### [CONCERN] `auto_fix` can archive and commit without a prompt

The last bullet of D8 accepts that `workflow.auto_fix` lets a plain `cf check` archive and commit in the primary checkout without a prompt. The plan only says `--fix` resolves the warning. The design reasons that the action loses no content and happens only above the limit. That is acceptable, but it is a user-visible behaviour change: a read-looking command now moves history across files and creates a commit. It should be stated in Success Criteria (or in the README text the slice adds), not only in a decision note. Without that, nothing in the success criteria or tests covers the auto-fix path for this rule.

### [NOTE] Wording and bookkeeping

- D8 says "the finding sets `subjectIndex: null`". In the code, `subjectIndex` is a field on `fixAction`, as `resolveFixOwner(project, finding.fixAction!.subjectIndex, views)` shows. The text should say `fixAction.subjectIndex`.
- The slice plan entry still reads Effort 2/5 and "Dependencies: none". The design records 3/5 and lists 213 and 923. Update the plan entry so the two documents agree.
- D7 ("no pointer line") records a decision to do nothing. It could be a single sentence in Excluded.

### [PASS] Failure modes and NFRs

Each new I/O path has a named failure row: a missing file, unreadable or non-UTF-8 input, a concurrent change, a failed write, a failed undo, a bad `target_bytes >= max_bytes` pair, and a non-ENOENT `stat` error in `cf check`. Each has stated handling and an exit code or finding severity. In the `--fix` path, errors surface through `fixErrors`, and a failed commit is covered by the D9 restore analysis. The 900 architecture states no NFRs, so none need restating. The design's `stat`-first check keeps the cost of a normal `cf check` to one `stat` per checkout.

### Run Digest

- Response length: 7226 chars
- Response is newline-free: no
- Tool calls made: 8
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: high
- Turns: 9
- Tokens — prompt / cached / cache write / completion / reasoning: 432894 / 329559 / 103321 / 6406 / not computed
- Duration: 54.8 s
- Cost: $0.51 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

## Resolution

- [PASS] Alignment with the 900 maintenance initiative: no change needed.
- [PASS] Layering and dependency direction: no change needed.
- [PASS] Routed-fix extension is grounded in the existing code: no change needed.
- [CONCERN] D11's undo machinery is heavier than the slice needs: changed. Removed the snapshot, undo and undo-failure path; a failure now names the files written and points to `git diff`, and a re-run skips sections already in their archive. Updated Criterion 10, the API Contracts rows and the writer tests.
- [CONCERN] Heading-form table goes beyond the plan's two forms: changed. D2 is now two rules (full date with trailing text, year-month). Year-month stays, and Criterion 3 now names the `## 2025-09 (summary)` case.
- [CONCERN] `auto_fix` can archive and commit without a prompt: changed. Stated it in Criterion 7, and added a README requirement and a test.
- [NOTE] Wording and bookkeeping: changed. D8 now says `fixAction.subjectIndex`, the plan entry now reads Effort 3/5 and Dependencies 213, 923, and D7 is now one sentence under Excluded, still naming #142.
- [PASS] Failure modes and NFRs: no change needed for the finding itself; the failure rows were updated by the D11 change above.
