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
  `sq` is 0.24.5 and has no `onboard` command; squadron 440 is on squadron's `440-slice.sq-onboard`
  branch and the PM has said it will be released before the run. No `user/analysis/260-analysis.real-adoption-run.md`
  exists yet.
dateCreated: 20261027
dateUpdated: 20261027
status: not_started
turns: 15
promptTokens: 686652
cachedTokens: 633802
cacheWriteTokens: 52824
completionTokens: 10948
durationSeconds: 126.4
costUsd: 0.768704
usageRounds: 1
pricedRounds: 1
usageByModel:
  claude-opus-5-5:
    rounds: 1
    costUsd: 0.7687037000000001
    completionTokens: 10948
---

## Context Summary

- Slice 273 is the 260 initiative's exit criterion: one real adoption, driven through `/sq:onboard` with the PM answering live, continued to the first new slice design on the derived architecture. The slice design is the spec. Tasks name its decisions (D1-D8) and pass checks (D5 1-10) and do not restate them. Scope limits are the design's Excluded list.
- **Slice preconditions** (a missing one at run time is a `BLOCKED:` line on the task that needs it): the PM is live for Tasks 3-7 and names the repository at the start of Task 3 (D1); squadron 440 is released (`sq onboard` exists; design Prerequisites); the understand-anything plugin and squadron's analysis pack are installed for Claude Code.
- **Who does what in the run.** The operator is the agent executing this file. The PM starts each Claude Code session in `<root>` in their own terminal (with `~/cf273-bin` first on PATH), answers in it, and ends it when the operator asks (D3). The operator runs every shell check from its own shell in `<root>`, with the same PATH. The PM copies to the operator any evidence that shows only inside the session: the `sq onboard register` output, the resumed session's first `sq onboard` report, the tail of the `sq onboard prompt` output, and where `/sq:onboard` and `/cf:*` resolved from.
- Local build: the global `cf` is the published npm package. In this repo use `node packages/cli/dist/index.js` (written `cfl` below; aliases do not persist between tool calls). In `<root>`, `cf` is the Task 1 shim, which runs the same build (D2).
- The repo has no formatter and no `format` script. Where the design says "format", `pnpm lint` is the check.
- The registered project stays registered (D1); do not run `cf project rm` on it. Nothing is committed in `<root>`.
- Planning work (this file) commits to the target. Implementation is on branch `273-slice.real-adoption-run-via-sq-onboard`.
- Next slice: 274, which consumes the report's Notes for 274.

## Tasks

### Setup (design Implementation Notes steps 1-2)

- [ ] **Task 0: Slice branch and baseline** (effort: 1)
  - [ ] Read `cf config get git.integration_branch`; empty means the target is `main`. Create `273-slice.real-adoption-run-via-sq-onboard` from the target if it does not exist, otherwise switch to it.
  - [ ] Run `pnpm -r build`. In the repo root save baselines: `cfl next --json > /tmp/273-next-before.json`, `cfl next > /tmp/273-next-before.txt`, `cfl build --json 2>/dev/null | jq -r .context > /tmp/273-build-before.txt`.
  - [ ] Success: `git branch --show-current` prints the branch name; all three baseline files are non-empty.

- [ ] **Task 1: Prerequisites, shim and squadron note** (effort: 2)
  - [ ] Record `cfl --version`, `git rev-parse --short HEAD`, `sq --version` and squadron's commit (from `pip show squadron-ai` or the install source).
  - [ ] Confirm `cfl guides info` shows a guide at least `MIN_GUIDE_VERSION` (0.22.8, in `packages/core/src`); if older, run `cfl guides update` once and re-check.
  - [ ] Run `sq onboard --help` and `sq onboard register|decline|prompt --help`. If any is missing, add `BLOCKED: squadron 440 not installed` under Task 3 and stop before Task 3.
  - [ ] Create the shim as Verification Walkthrough step 1 shows; with `~/cf273-bin` first on PATH, `cf --version` matches `cfl --version`.
  - [ ] Note whether `~/.claude/commands/cf/` exists (D2); do not delete it.
  - [ ] Find squadron's peer with `ListAgents` and send one note that this run also serves 440's live criterion (D8), per CLAUDE.md "Agent Communication". Do not wait for a reply.
  - [ ] Success: versions, shim result and command-directory note are recorded for the report; the note is sent, or "no squadron peer listed" is recorded; or a `BLOCKED:` line names what is missing.

- [ ] **Task 2: Report skeleton** (effort: 1)
  - [ ] Create `project-documents/user/analysis/260-analysis.real-adoption-run.md` (`docType: analysis`, `topic: real-adoption-run`, `status: in_progress`; frontmatter per `file-naming-conventions.md`) with D7's parts: Setup (filled from Task 1), Checks (one row per D5 check, results empty), Defects, Notes for 274. Do not edit 265's report.
  - [ ] Success: `cfl check` reports no frontmatter error for the file; the table has ten rows.
  - [ ] Commit: `docs: add real adoption run report skeleton`

#### Defect procedure (reference, not a checklist task)

Tasks 3-7 apply design D6 once per defect the run exposes:
- For a cf fix: write the failing test first in the affected module's existing test file, using the real input's format, and confirm it fails for the reported reason. Fix, run lint, typecheck and the touched area's tests once each, then `pnpm -r build` so the shim picks it up. One commit per fix: `fix: {summary}`.
- Everything else is filed per D6 (issue in the owning repository, or a cf issue plus a note to the PM). A cf ↔ squadron contract mismatch is owned by the side that differs from `docs/ADOPTION-PRIMITIVES.md`.
- A run stopped by a squadron or guide defect gets a `BLOCKED:` line with the issue link under the current task. cf never drives adoption itself.
- Resume from the step that stopped (steps are computed from files, 440 D1) and re-check the affected rows. Add one Defects line per defect: disposition plus proving excerpt.

### The run (design Verification Walkthrough steps 2-6)

Each run task ends by filling its check rows and committing the report: `docs: record real adoption run checks {n-m}`.

- [ ] **Task 3: Before the run, check 1** (effort: 2)
  - [ ] The PM names the repository and checkout. Confirm D1's constraints and record what D7's Setup asks for (approved name, language, commit).
  - [ ] Run Walkthrough step 2 and verify check 1. Also run `sq onboard --path <root> --json` and record its plugin and analysis-pack checks for `claude-code`; a missing one is a `BLOCKED:` line naming it.
  - [ ] Success: row 1 is pass or has a defect line, or a `BLOCKED:` line explains why the run cannot start; report committed.

- [ ] **Task 4: First session, checks 2-3** (effort: 3)
  - [ ] The PM starts the session and runs `/sq:onboard` (D2). The operator never answers for the PM and makes no manual edits (D2 hands-off rule).
  - [ ] Verify check 2 from the register output the PM copies. After registration, record where `/sq:onboard` and `/cf:*` resolved from, and `cf config get workflow.review_enabled` (value and source).
  - [ ] Verify check 3, then ask the PM to end the session once the concept is confirmed (D3).
  - [ ] Success: rows 2-3 are pass or have defect lines; the session ended after the concept step; report committed.

- [ ] **Task 5: Resume and adopt, checks 4-7** (effort: 4)
  - [ ] The PM starts a new session and runs `/sq:onboard`. Verify check 4 from the session's first `sq onboard` report and check 5 from the prompt tail, both copied by the PM.
  - [ ] If the session stops after the architecture, record `cf detect --json | jq .outcome` (check 7's in-between observation; not forced).
  - [ ] After the PM approves architecture and plan, verify checks 6 and 7 with the commands in Walkthrough step 4.
  - [ ] Success: rows 4-7 are pass or have defect lines; report committed.

- [ ] **Task 6: Past the hand-off, check 8** (effort: 2)
  - [ ] Run `cf next --json | jq '{recommendation, suggestedCommand}'` in `<root>`. If it gates on the derived architecture, run the review it names, per D4 (never `review: none`, never a frontmatter edit). Record whether the gate appeared.
  - [ ] Verify check 8.
  - [ ] Success: row 8 is pass or has a defect line; report committed.

- [ ] **Task 7: First new slice design, checks 9-10** (effort: 3)
  - [ ] In the session, follow cf's Phase 4 path for the slice Task 6 named (D4: `cf set slice`, then `cf build`). The agent writes the design with the PM.
  - [ ] Verify check 9: `cf build --json 2>/dev/null | jq -r .context` names the derived architecture and slice plan files, and `cf validate design <design-path>` exits 0.
  - [ ] Verify check 10 with `git -C <root> status --short`.
  - [ ] Success: rows 9-10 are pass or have defect lines; report committed.

### Wrap-up (design Implementation Notes steps 4-5)

- [ ] **Task 8: Finalize the report** (effort: 2)
  - [ ] Every row has a result and every defect one disposition ("no cf defects" if none). Setup has every D7 field, including the guide version (#124) and whether the review gate fired (#132).
  - [ ] Write Notes for 274 as D7 describes. Check the private-repository rules (D1, D7).
  - [ ] Set `status: complete` only if all ten checks pass; otherwise leave `in_progress` with one line at the top naming the failing or blocked checks. Run `cfl check` and fix findings on the report.
  - [ ] Send squadron's peer the result (D8): setup, rows 1-8 and any squadron issue links. If no peer was listed in Task 1, skip this.
  - [ ] Success: `cfl check` reports no error for the report.
  - [ ] Commit: `docs: finalize real adoption run report`

- [ ] **Task 9: Full validation** (effort: 2)
  - [ ] Run `pnpm -r build`, then `pnpm lint`, `pnpm typecheck` and `pnpm test` once each; fix failures.
  - [ ] In this repo's root, re-run the Task 0 commands writing `/tmp/273-*-after.*`, and `diff` each pair. The only allowed differences are lines that quote this slice's own task state (for example remaining-task counts); any other difference is a regression from a fix.
  - [ ] In the slice design, add a `**Walkthrough results (slice 273 implementation, {YYYYMMDD}).**` paragraph after the Verification Walkthrough steps, as slice 265's design does: one numbered line per walkthrough step with its result, then one `Baseline diff:` line stating each allowed difference.
  - [ ] Remove `~/cf273-bin`. Leave the adopted project registered.
  - [ ] Success: build, lint, typecheck and tests pass; the diffs show only allowed differences. If any run task carries a `BLOCKED:` line, the results paragraph says so, that task stays unchecked and the slice stays `in_progress`.
  - [ ] Commit: `docs: record slice 273 walkthrough results`
