---
docType: tasks
slice: real-adoption-run-via-sq-onboard
project: context-forge
lld: user/slices/273-slice.real-adoption-run-via-sq-onboard.md
dependencies:
- 263
- 267
- 268
- 269
- 271
- 272
projectState: main at 0.19.20 (slices 268-272 merged; `cf detect`, `cf init --json`,
  `cf prompt get brownfield-adoption --path --comprehension` and `MIN_GUIDE_VERSION`
  0.22.8 shipped). Slice 273 design committed. Local build prints 0.19.20. Installed
  `sq` is 0.24.5 and has no `onboard` command; squadron 440 is on squadron's
  `440-slice.sq-onboard` branch and the PM has said it will be released before the
  run. No `user/analysis/260-analysis.real-adoption-run.md` exists yet.
dateCreated: 20261027
dateUpdated: 20261027
status: not_started
---

## Context Summary

- Slice 273 is the 260 initiative's exit criterion: one real adoption on a repository the PM names, driven through `/sq:onboard` in Claude Code with the PM answering live, continued past squadron's hand-off to the first new slice design on the derived architecture. The slice design's D1-D8, Success Criteria and Verification Walkthrough are the spec; tasks reference them rather than restate them.
- **Slice preconditions** (not tasks; a missing one at run time is a `BLOCKED:` line on the task that needs it):
  - The PM is available live for the whole run (Tasks 5-9) and names the repository at the start of Task 5, within D1's constraints.
  - Squadron 440 is released (`sq onboard` exists). A branch install is acceptable only if the PM changes the release plan (design Prerequisites).
  - The understand-anything plugin and squadron's analysis pack are installed for Claude Code.
- Scope limits (design Excluded): no new cf features, options or formats (file an issue); no squadron or guide changes (file issues there); no Codex or MCP surface; no second repository; no README or reference-doc edits unless a doc is wrong (a D6 defect); nothing is committed in the adopted repository; no CHANGELOG or version bump.
- cf code changes happen only if the run exposes a defect, per the defect procedure below (design D6).
- Local build: the global `cf` is the published npm package. In this repo use `node packages/cli/dist/index.js` (written `cfl` below; write the full command, aliases do not persist between tool calls). In the adopted repository, `cf` resolves through the PATH shim from Task 2, which runs the same local build (D2).
- The project registered by the run stays registered unless the PM asks for removal (D1, State Management). Do not run `cf project rm` on it.
- Report rules (D7): Setup, Checks (one row per D5 check), Defects, Notes for 274. No transcripts, artifact bodies or PM answers. For a private repository, use only the name the PM approves and excerpt only cf or squadron output. Home-directory paths written as `~`.
- Planning work (this file) commits to the target. Implementation is on branch `273-slice.real-adoption-run-via-sq-onboard`.
- Next slice: 274 (comprehension doc in later phases), which consumes the report's Notes for 274.

## Tasks

### Setup (design Implementation Notes step 1)

- [ ] **Task 0: Slice branch and baseline** (effort: 1)
  - [ ] Read `cf config get git.integration_branch`; empty means the target is `main`. Verify you are on the target or the expected slice branch.
  - [ ] Create `273-slice.real-adoption-run-via-sq-onboard` from the target if it does not exist, otherwise switch to it.
  - [ ] Run `pnpm -r build`. In the repo root save baselines: `cfl next --json > /tmp/273-next-before.json`, `cfl next > /tmp/273-next-before.txt`, and `cfl build --json 2>/dev/null > /tmp/273-build-before.json`.
  - [ ] Success: `git branch --show-current` prints the branch name; all three baseline files exist and are non-empty.

- [ ] **Task 1: Prerequisite check** (effort: 2)
  - [ ] Record `cfl --version` and `git rev-parse --short HEAD` (the branch commit).
  - [ ] Confirm the guide the adopted project will install is at least v0.22.8: compare `cfl guides info` (this repo) with `MIN_GUIDE_VERSION` in `packages/core/src`. If the installable guide is older, run `cfl guides update` once and re-check.
  - [ ] Record `sq --version` and squadron's commit (from `pip show squadron-ai` or the install source, whichever names it). Run `sq onboard --help`; if the command is missing, add `BLOCKED: squadron 440 not installed (sq onboard missing)` under Task 5 and stop the run tasks (Tasks 5-10).
  - [ ] Run `sq onboard register --help`, `sq onboard decline --help` and `sq onboard prompt --help`; each must exist (440 D1). A missing one is a squadron `BLOCKED:` line under Task 5.
  - [ ] The plugin and analysis-pack checks are made by `sq onboard --json` itself (440 D2, D10); Task 5 reads them from its first report. Do not install anything by hand here beyond what squadron's docs prescribe.
  - [ ] Success: every version above is noted for the report, or a `BLOCKED:` line names what is missing.

- [ ] **Task 2: PATH shim and command resolution** (effort: 1)
  - [ ] Create the shim exactly as Verification Walkthrough step 1 shows (`~/cf273-bin/cf` running `node <context-forge>/packages/cli/dist/index.js "$@"`), with `<context-forge>` the absolute path of this repo.
  - [ ] With `~/cf273-bin` first on PATH, `cf --version` prints the same version as `cfl --version`.
  - [ ] Check whether `~/.claude/commands/cf/` exists (machine-level commands, D2). Note the result; do not delete it. Project-level commands come from `cf init` during registration (Task 6) or `cf install-commands --local`.
  - [ ] Success: the shim runs the local build; the machine-level commands' presence is noted for the report's Setup part.

- [ ] **Task 3: Tell squadron's session** (effort: 1)
  - [ ] Find squadron's peer with `ListAgents` and send one short note: this run will also serve 440's live criterion (D8), and the report will carry the setup and check rows it needs. Follow CLAUDE.md "Agent Communication".
  - [ ] If no squadron peer is listed, note that in the report's Setup part and continue.
  - [ ] Success: the note is sent and acknowledged, or the absence of a peer is noted.

- [ ] **Task 4: Report skeleton** (effort: 1)
  - [ ] Create `project-documents/user/analysis/260-analysis.real-adoption-run.md` with frontmatter (`docType: analysis`, `topic: real-adoption-run`, `project`, dates, `status: in_progress`; follow `file-naming-conventions.md`).
  - [ ] Add the four parts from D7: Setup (fields listed in D7, filled from Tasks 1-2 where known), Checks (a table with one row per D5 check 1-10, result column empty), Defects (empty list), Notes for 274 (empty list).
  - [ ] Do not edit `260-analysis.adoption-verification-runs.md` (265's report).
  - [ ] Success: `cfl check` reports no frontmatter error for the new file; the table has ten check rows.
  - [ ] Commit: `docs: add real adoption run report skeleton`

#### Defect procedure (reference, not a checklist task)

Tasks 5-10 apply this once per defect the run exposes (design D6, which applies 265 D5's rules). If the run finds none, nothing is done.
- Classify each defect: adoption cf code as it stands after the rework (261, 263, 264, 266, 267, 268, 269, 271, 272): fix here. Constant tuning: only with run evidence, plus a test at the new boundary. Design change, new option or format: issue plus a note to the PM, no code. Guide-prompt defect, including a repeated agent misbehavior: issue in ai-project-guide, never worked around in cf. Squadron defect: issue in squadron. cf defect outside that scope: issue, continue.
- A cf ↔ squadron contract mismatch: compare both sides with `docs/ADOPTION-PRIMITIVES.md`; the side that differs owns the fix.
- For a cf fix: write the failing test first in the existing test file for the affected module, using the real input's format. Confirm it fails for the reported reason, then fix. Run lint, typecheck and the touched area's tests once each. Run `pnpm -r build` so the shim picks up the fix. One commit per fix: `fix: {summary}`.
- A run that stops on a squadron or guide defect: file the issue, add a `BLOCKED:` line with the issue link under the current task, and stop. cf never drives adoption itself (PM 20261025).
- Resume the run from the step it stopped on (steps are computed from files, 440 D1). Re-check the affected D5 rows.
- Add one Defects line to the report for every defect: disposition (commit hash or issue link) and the proving excerpt.

### The run (design Verification Walkthrough steps 2-6)

- [ ] **Task 5: Before the run, check 1** (effort: 2)
  - [ ] The PM names the repository and the checkout to use. Confirm D1's constraints: a primary git checkout (not a worktree), not context-forge, squadron or ai-project-guide. Record the name the PM approves for the report (URL and commit only if public), the language, and `git rev-parse --short HEAD`.
  - [ ] Run Walkthrough step 2 in `<root>` with the shim on PATH: `git status --short` is empty; `cf detect --path <root> --json | jq .outcome` is `"brownfield"` or `"adoption-incomplete"`; save `cf project list --json` to `/tmp/cf273-proj.json` and confirm `<root>` is not in it.
  - [ ] Run `sq onboard --path <root> --json` once. Afterwards `git status --short` is still empty and `cf project list --json` diffs clean against the saved file. From its report, record the plugin and analysis-pack checks for the `claude-code` surface; a missing one is a `BLOCKED:` line naming it.
  - [ ] Fill check row 1.
  - [ ] Success: check 1 is pass or has a defect line; or a `BLOCKED:` line explains why the run cannot start.

- [ ] **Task 6: First session, checks 2-3** (effort: 3)
  - [ ] Start an interactive Claude Code session in `<root>` with `~/cf273-bin` first on PATH and run `/sq:onboard` (D2). Record where `/sq:onboard` resolved from.
  - [ ] The PM answers every question (adopt, graph build, concept confirmation). The operator never answers for the PM and makes no manual file or config edits (D2 hands-off rule).
  - [ ] Check 2: the `sq onboard register` output shows every `cf init` step `ok` or `skipped` and `registration: created`. Retry a guide install that failed for network reasons once; it is not a defect.
  - [ ] After registration, record where `/cf:*` commands resolve from (project-level under `<root>/.claude/commands/` versus `~/.claude/commands/cf/`), and the `workflow.review_enabled` value and source (`cf config get workflow.review_enabled` in `<root>`).
  - [ ] Check 3: after the concept step, `cf detect --json | jq .artifacts.concept` names the file squadron's concept flow wrote, and `sq onboard` moves to `adopt`.
  - [ ] Once the PM confirms the concept, end the session (D3). Interrupt nothing else on purpose; note any other session end in the report.
  - [ ] Fill check rows 2-3 and the Setup fields recorded above.
  - [ ] Success: checks 2-3 are pass or have defect lines, and the session has ended after the concept step.

- [ ] **Task 7: Resume and adopt, checks 4-7** (effort: 4)
  - [ ] Check 4: start a new session in `<root>` with the same PATH and run `/sq:onboard`. Its first `sq onboard` report says `adopt`, and no earlier step repeats.
  - [ ] Check 5: in the session's tool output for `sq onboard prompt`, the prompt ends with `## Adoption Inputs` naming the newest comprehension doc and the concept, with architecture and plan `none`.
  - [ ] The PM answers intent unknowns, code/doc contradictions, the plan's next work and the rules-reconciliation offer. Declining the offer is fine. If the session stops after the architecture is written, run `cf detect --json | jq .outcome` and note whether it was `adoption-incomplete` (check 7, observed only, not forced).
  - [ ] Check 6, after the PM approves architecture and plan:
    1. The session ran `cf docs map`; `050-docs-map.{project}.md` exists and the architecture links it.
    2. The architecture's frontmatter has `provenance: derived`.
    3. `cf list slices --json | jq '.entries[] | {index, retroactive, status}'` shows `retroactive: true` on the recorded entries and at least one unbuilt entry the PM supplied.
    4. `cf check` reports no error for the retroactive entries.
    5. Where the PM said an intent was unknown, the artifacts say "unknown".
  - [ ] Check 7: `cf detect --json | jq .outcome` is `"already-planned"`, and `sq onboard` hands off to `cf next`.
  - [ ] Fill check rows 4-7.
  - [ ] Success: checks 4-7 are pass or have defect lines.

- [ ] **Task 8: Past the hand-off, check 8** (effort: 3)
  - [ ] In `<root>`, run `cf next --json | jq '{recommendation, suggestedCommand}'`.
  - [ ] If it gates on reviewing the derived architecture (D4), run the review it names (`sq review` is available). Never set `review: none`, never edit frontmatter to clear the gate. Record whether the gate appeared and the `workflow.review_enabled` source. A gate that still blocks after a passing review is a defect.
  - [ ] Check 8: `cf next` recommends the first unbuilt entry of the existing-state plan, never a retroactive entry and never Phase 0-3.
  - [ ] Fill check row 8.
  - [ ] Success: check 8 is pass or has a defect line.

- [ ] **Task 9: First new slice design, check 9** (effort: 3)
  - [ ] Follow cf's Phase 4 path for the slice Task 8 named: `cf set slice <slice>` (and any other setting `cf next`'s suggested command names), then `cf build`, in the session.
  - [ ] Check 9, part 1: `cf build --json 2>/dev/null | jq -r .context` names the derived architecture file and the slice plan file as inputs.
  - [ ] The agent writes the slice design from the template with the PM, who decides its open points. Its frontmatter `dependencies` and Dependencies section name retroactive slices where the new work builds on them.
  - [ ] Check 9, part 2: `cf validate design <design-path>` exits 0. The slice design's own review, task breakdown and implementation are out of scope.
  - [ ] Fill check row 9.
  - [ ] Success: check 9 is pass or has a defect line.

- [ ] **Task 10: No stray writes, check 10** (effort: 1)
  - [ ] Run `git -C <root> status --short`. Every path is one of: cf setup, adoption artifacts, the slice design, squadron's analysis files, the review file (if a review ran). Anything else is a defect for the side that wrote it.
  - [ ] Commit nothing in `<root>`; keeping or discarding the result is the PM's call.
  - [ ] Fill check row 10.
  - [ ] Success: check 10 is pass or has a defect line.
  - [ ] Commit: `docs: record real adoption run checks`

### Wrap-up (design Implementation Notes steps 4-5)

- [ ] **Task 11: Finalize the report** (effort: 2)
  - [ ] Confirm every check row has a result and every defect exactly one disposition. If there were no cf defects, the Defects part says "no cf defects".
  - [ ] Complete Setup with every D7 field, including the guide version used (input to #124) and whether the review gate fired (input to #132).
  - [ ] Write Notes for 274: what the slice design session lacked that the comprehension doc or docs map held, as observed in Task 9. No proposals.
  - [ ] Check the private-repository rules (D1, D7): no code, artifact bodies or PM answers; only the approved name.
  - [ ] Set `status: complete` only if all ten checks pass; otherwise leave `in_progress` with one line at the top naming the failing or blocked checks.
  - [ ] Run `cfl check` and fix any finding on the report.
  - [ ] Send squadron's session the result: the setup and check 1-8 rows, the resume result, and any squadron issue links (D8). Closing 440 is squadron's call.
  - [ ] Success: `cfl check` reports no error for the report; squadron's session has the result, or its absence is noted.
  - [ ] Commit: `docs: finalize real adoption run report`

- [ ] **Task 12: Full validation** (effort: 2)
  - [ ] Run `pnpm -r build`, then `pnpm lint`, `pnpm typecheck` and `pnpm test` once each; fix failures.
  - [ ] In this repo's root, re-run the three Task 0 commands to `/tmp/273-*-after.*` and `diff` each against its baseline. Any difference is a regression from a fix, except lines quoting this slice's own state (for example task counts); explain each such line in the walkthrough notes. If `git diff {target} --stat -- packages` is empty (no fixes), the diffs must be empty apart from those lines.
  - [ ] Record each Verification Walkthrough step's result in the slice design's walkthrough notes, refining the draft steps with what the run showed.
  - [ ] Remove `~/cf273-bin` once the run is complete. Leave the adopted project registered.
  - [ ] Success: all checks pass. If any run task carries a `BLOCKED:` line, say so in the notes and leave that task unchecked; the slice stays `in_progress`.
  - [ ] Commit: `docs: record slice 273 walkthrough results`
