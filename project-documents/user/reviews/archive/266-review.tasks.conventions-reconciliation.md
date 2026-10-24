---
docType: review
layer: project
reviewType: tasks
slice: conventions-reconciliation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/266-tasks.conventions-reconciliation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261024
dateUpdated: 20261024
reviewedSha: 2d961860eecba7a4c96c9cee0c8bffc6584185c6
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 196033
cachedTokens: 96707
cacheWriteTokens: 99320
completionTokens: 4531
durationSeconds: 39.7
costUsd: 0.453004
costBasis: provider
runId: run-20261024-p56-497422e8
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Core line splitting for `projectRuleSources` is unspecified, so reported line ranges can diverge from `managedState`"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:115-118"
  - id: F002
    severity: concern
    category: completeness
    summary: "Stale classification when both sides of one resolution are stale is undefined"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:235-240"
  - id: F003
    severity: concern
    category: sequencing
    summary: "Task 11.1 mixes the install wiring with a rendered-string field, and 11.2 commits before the emitters use it"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:252-261"
  - id: F004
    severity: note
    category: proportionality
    summary: "D5 rejection cases are tested at three layers"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:211-213"
  - id: F005
    severity: pass
    category: traceability
    summary: "Success-criteria coverage"
    location: "project-documents/user/slices/266-slice.conventions-reconciliation.md:277-298"
  - id: F006
    severity: pass
    category: sequencing
    summary: "Sequencing, task sizing and commit distribution"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
---

# Review: tasks — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Core line splitting for `projectRuleSources` is unspecified, so reported line ranges can diverge from `managedState`

Task 4.3 says core must not import cli's `lines.ts` and that "callers split the text". Task 5.1 has `projectRuleSources` (in core) read each composite and call `managedBlockRange(lines)`. So core needs its own splitter. The task never says what rule it follows.

The cli rule is real and specific. `toRecords` (`packages/cli/src/ideInstall/lines.ts:11`) splits on `\n` only, keeps `\r`, and drops one trailing empty record. The `managedState` markers are matched against those records. A second, subtly different split in core would give different line numbers, or a different `'none'`/`'broken'` result for CRLF files. Both the inventory's `beginLine`/`endLine` and the "same five states" claim in 4.4 depend on this.

Add a step to 4.3 or 5.1 that core splits on `\n` only, drops one trailing empty record, and does not normalise `\r`. Add a CRLF case and a trailing-newline case to 4.5 or 5.2. Alternatively, move the splitter into core and have cli re-export it, as is done for the markers.

### [CONCERN] Stale classification when both sides of one resolution are stale is undefined

Task 10.1 defines `staleGuide`, `staleProject` and `live` as three lists. It does not say what happens to a resolution whose `guideRule` and `projectSource` are both missing. It could appear in both lists, in only one, or warn twice.

D5 in the slice only describes the single-side cases. The 10.2 cases also only cover each side alone. Say which list(s) the record lands in and how many warnings it produces. Then add one both-stale case to 10.2. Without this, two implementers could produce different stderr output.

### [CONCERN] Task 11.1 mixes the install wiring with a rendered-string field, and 11.2 commits before the emitters use it

Tasks 11.1 and 11.2 add `resolutionsSection` to `InstallContext` and test that it is non-empty. The commit `feat: carry rule resolutions through setup-ide` lands before 11.3 makes any target consume it. Nothing is wrong at that commit, but it advertises a feature that still produces no output.

The other half of the stale-warning criterion, "does not render", is only observable after 11.3. The 11.2 text acknowledges this by deferring to 10.2. Either merge 11.1–11.4 into one commit group, or reword the 11.2 commit message to say it is plumbing only, for example `refactor: carry rule resolutions into install context`. The second option is cheaper.

### [NOTE] D5 rejection cases are tested at three layers

The marker, newline and backtick rejections are tested exhaustively in 3.2. They are tested again in 3.4 (invalid record leaves the file untouched) and in 8.2 (multi-line statement, marker, backtick, missing statement). The slice criteria require `resolve` to reject these, so 8.2 needs coverage. But `resolve` only delegates to `addRuleResolution`.

I'd keep one representative D5 rejection in 8.2, for example a marker and a backtick, plus the unknown-name cases that are cli-specific. The remaining D5 cases already have failing-input tests in 3.2. This is optional trimming and not a blocker.

### [PASS] Success-criteria coverage

Each functional and technical criterion maps to a task:
- **Inventory:** 5.x, 6.x and 7.x cover guide rules with exclusion state, project sources with exclusions, block ranges and broken markers.
- **`resolve` rejections:** 8.1 and 8.2.
- **Rendering and no-file byte identity:** 11.3 and 11.4.
- **Re-run identity and basename stability:** 11.4.
- **Stale warnings and malformed-file failure:** 10.2, 11.2 and 8.2.
- **Worktree and dry run:** 11.4.
- **261 Adoption Facts and the `.github/instructions` list entry:** 4.1 and 4.2.
- **`managedState` unchanged:** 4.4 and 4.5.
- **Docs:** 12.1 and 12.2.
- **Verification Walkthrough:** 13.2.

I found no scope creep. Even 13.3's Future Work edit is requested by the slice's Special Considerations. The slice states no NFR, so no load test or CI-wiring task is needed.

### [PASS] Sequencing, task sizing and commit distribution

Dependencies run in order with no cycles:
- Markers move to core (2) before the schema (3), which uses them.
- `managedBlockRange` (4.3) comes before `projectRuleSources` (5), which uses it.
- `guideRuleEntries` and `delivered` (6) come before the inventory builder (7.3) and the renderer (10).
- `trailing` (9) comes before the emitters (11.3).

Each implementation task is followed immediately by its tests, and there are about 12 commits spread across the file rather than batched at the end. The task count of 13 groups is proportionate to a slice with eight decisions and a refactor of shipped 261 code. Task 1 correctly forks the slice branch and excludes any merge or push step. No step waits on PM approval.

### Run Digest

- Response length: 5734 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 196033 / 96707 / 99320 / 4531 / not computed
- Duration: 39.7 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
