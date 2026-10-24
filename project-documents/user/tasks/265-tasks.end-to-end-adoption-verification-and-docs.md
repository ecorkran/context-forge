---
docType: tasks
slice: end-to-end-adoption-verification-and-docs
project: context-forge
lld: user/slices/265-slice.end-to-end-adoption-verification-and-docs.md
dependencies:
- 260
- 261
- 262
- 263
- 264
projectState: main after slices 260-264 (built and merged; 264's code-review fixes
  are the latest commit). `adoptionNavigation.ts` defines the steps `concept`, `architecture`,
  `existing-state-plan`, `record-completion`, `register-plan` and `adopted`. Installed
  `sq` is 0.23.7 and `sq probe --json` prints `probe_version` 1 (surfaces `claude-code`,
  `codex`). `cloc` and `jq` are on PATH. No `user/analysis/260-analysis.*` exists
  yet. README.md has no adoption section. Global `cf` is 0.19.17 (the published package,
  not the local build).
dateCreated: 20261023
dateUpdated: 20261023
status: complete
turns: 37
promptTokens: 1469687
cachedTokens: 1388421
cacheWriteTokens: 81224
completionTokens: 21237
durationSeconds: 145.6
costUsd: 0.676481
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

## Context Summary

- Slice 265 proves slices 260-264 compose on real repositories. It runs adoption end to end three times (greenfield, CF-only brownfield, squadron brownfield), fixes the cf defects those runs expose, records the runs in one report, and documents the shipped flow. The slice design's D1-D8, Success Criteria and Verification Walkthrough are the spec.
- Scope limits (design Excluded): no new features, options or formats (file an issue instead); no guide-prompt or squadron changes (file issues there); no CHANGELOG or version bump; `MIN_GUIDE_VERSION` is not raised (D6); nothing from scratch repositories is committed.
- This is mostly run time and documentation. cf code changes occur only if a run exposes a defect (D5): test that fails for the reported reason, using the real input's format, then the fix, one commit per fix.
- Local build: the global `cf` is the published npm package. Use `node <repo>/packages/cli/dist/index.js` (written `cfl` below; shell aliases do not persist between tool calls, so write the full command). Scratch sessions must resolve `cf` to the same build (D2). Run `pnpm -r build` first.
- Run outcomes (D2): each live-run failure ends as *retry*, *BLOCKED* or *defect*. A missing external prerequisite gets a `BLOCKED:` line on that run's task and stops only that run. The slice stays `in_progress` until both brownfield runs pass.
- Run-report rules (D7): three parts per run (setup line, check rows, defect lines), one verbatim Adoption Facts section, home-directory paths written as `~`. No transcripts or artifact bodies.
- Scratch repositories live outside this repo (for example under `/tmp/cf-265/`). Unregister each with `cf project rm` after its run; delete scratch directories only after the report is written.
- Planning work (this file) commits to the target. Implementation is on branch `265-slice.end-to-end-adoption-verification-and-docs`.
- Next slices: 266 (conventions reconciliation), 267 (docs and ADR mapping).

## Tasks

- [x] **Task 0: Slice branch and baseline** (effort: 1)
  - [x] Read `cf config get git.integration_branch`; empty means the target is `main`. Verify you are on the target (or the expected slice branch).
  - [x] Create `265-slice.end-to-end-adoption-verification-and-docs` from the target if it does not exist, otherwise switch to it.
  - [x] Run `pnpm -r build`. In the repo root save baselines: `node packages/cli/dist/index.js next --json > /tmp/265-next-before.json`, `node packages/cli/dist/index.js next > /tmp/265-next-before.txt` and `node packages/cli/dist/index.js build --json 2>/dev/null > /tmp/265-build-before.json` (plain `cf build` prints no prompt to stdout; the prompt text is the JSON `context` field, read with `jq -r .context`).
  - [x] Success: `git branch --show-current` prints the branch name; all three baseline files exist and are non-empty.

- [x] **Task 1: Prerequisite check and report skeleton** (effort: 2)
  - [x] Confirm the six step values in `packages/core/src/introspection/adoptionNavigation.ts` match slice 264 D4 and D6 (`concept`, `architecture`, `existing-state-plan`, `record-completion`, `register-plan`, `adopted`). If the code differs or has an extra step, update the slice design's D4 text before any run and tell the PM; do not edit silently.
  - [x] Record versions: `node packages/cli/dist/index.js --version`; installed guide version (`cfl guides info`); `sq --version`; `sq probe --json | jq .probe_version`.
  - [x] Check the installed guide's `guide.ai-project.brownfield-adoption.md` for the retroactive Marker Specification (the 263 hand-off). If absent, run `cfl guides update` once and re-check. If still absent, add a `BLOCKED:` line (guide release with the retroactive-marker rule) under Tasks 5 and 6 and continue with the other tasks.
  - [x] Confirm the squadron prerequisites for Task 6: the probe's `surfaces` has a `claude-code` entry with `analysis_skill_installed` and `understand_plugin_installed` true. If not, add a `BLOCKED:` line under Task 6 naming what is missing.
  - [x] Create `project-documents/user/analysis/260-analysis.adoption-verification-runs.md` with frontmatter (`docType: analysis`, `topic: adoption-verification-runs`, `project`, dates, `status: in_progress`; follow `file-naming-conventions.md`) and one empty section per run (setup line, checks table with one row per D4 check for that path, defects list). Add a "Prerequisites" line with the versions recorded above.
  - [x] Success: `cfl check` reports no frontmatter errors for the new file; the skeleton lists every D4 check for each run.
  - [x] Commit: `docs: add adoption verification run report skeleton`

### Greenfield run (design D3, Development Approach step 2)

- [x] **Task 2: Create the greenfield scratch projects** (effort: 1)
  - [x] Create `/tmp/cf-265/greenfield`, generate a framework starter with its official scaffolder (for example `npm create vite@latest`), `git init`, make one commit. On clone or scaffolder failure, retry once, then pick another starter (D2 table).
  - [x] Before any cf command touches it, copy it: `cp -R /tmp/cf-265/greenfield /tmp/cf-265/greenfield-fresh`. The copy is for the `/cf:onboard` session in Task 3.
  - [x] Register the original: `cfl init` in `/tmp/cf-265/greenfield` (non-interactive flags as `cfl init --help` shows).
  - [x] Success: both directories have the git commit; only the original has `.context-forge.toml`; the starter's name and version are noted for the report.

- [x] **Task 3: Greenfield run and report** (effort: 2)
  - [x] Walkthrough step 1: in the scratch project, `cfl build --json 2>/dev/null | jq -r .context | grep -c '### Adoption Facts'` prints 0; `cfl config get adoption.state` shows an empty value with source default.
  - [x] Start Claude Code in `/tmp/cf-265/greenfield-fresh` (Task 2's copy), run `/cf:onboard`, and confirm: setup, hand-off to `cf build`, and the concept conversation's opening question. Stop after that opening turn (D3).
  - [x] Fill the greenfield section of the report: setup line (starter, version, `cf` version), rows for the D3 greenfield check plus the `/cf:onboard` hand-off and concept opener.
  - [x] If any check fails, follow Task 4's fix loop before continuing. Per D3, if a difference other than the three checks shows, compare against a build from before slice 261.
  - [x] Run `cfl project rm` for both scratch projects (the original and the one `/cf:onboard` registered; confirm exact usage with `--help`).
  - [x] Success: every greenfield row in the report is pass, or has a defect line with a disposition.
  - [x] Commit: `docs: record greenfield adoption verification run`

#### Task 4 (reference, not a checklist task): defect procedure

Tasks 3, 5 and 6 apply this once per defect a run exposes (D5). It has no checkboxes of its own; if a run finds no defects, nothing is done.
- Classify each defect: initiative cf code (fix here); constant tuning (needs run evidence plus a fixture test at the new boundary); decided-design change, new option, or format change (issue plus PM notice, no code); guide-prompt defect (issue in ai-project-guide, never worked around in cf); squadron defect (issue in squadron); cf defect outside 260-264 (issue, continue).
- For a cf fix: write the failing test first, in the existing test file for the affected module, using the real input's format (CLAUDE.md parser rule). Confirm it fails for the reported reason, then fix. Run format, lint, typecheck and the touched area's tests once each. One commit per fix: `fix: {summary}`.
- Re-run the affected checks of the run that exposed it and update the report row.
- Add a defect line to the report for every defect, whatever its disposition: the commit hash or issue link, plus the proving excerpt. Each defect has exactly one disposition.

### CF-only run (design D4, Development Approach step 3)

- [x] **Task 5: CF-only brownfield run** (effort: 4)
  - [x] Select the repository per D1: public, single package, well over 2000 non-blank source lines, a language other than TypeScript, with a README, a CI workflow and some history. Clone into `/tmp/cf-265/cf-only` with `--depth 1`. Record URL and commit.
  - [x] Make `cf` resolve to the local build in the session (`cf install-commands --local` plus a PATH entry or alias to `packages/cli/dist/index.js`) and hide `sq` from PATH. Record `cf --version` as the session sees it.
  - [x] Before the first build, `cfl next --json | jq '{recommendation, suggestedCommand}'` recommends `cf build` (D4 check 1).
  - [x] Start Claude Code in the clone, run `/cf:onboard`, and drive the session to the end per D2: answer as the PM from the repository's own prose, "unknown" otherwise; no manual artifact edits; a session that ends early resumes with `cf build`.
  - [x] As soon as the session's first `cf build` has run, and before the agent writes any artifact, save `cfl build --json 2>/dev/null | jq -r .context > /tmp/cf-265/cf-only-first-build.txt` from a second terminal with the same PATH. Task 5R copies the Adoption Facts section from this file.
  - [x] In a second terminal with the same PATH, at each step: `cfl next --json | jq '{recommendation, suggestedCommand}'`, `cfl config get adoption.state`, `cfl check`. Verify D4 checks 1-5 and the CF-only check (Adoption Facts says squadron unavailable; the agent attempts no squadron step).
  - [x] Handle each failure per the D2 table (retry, BLOCKED or defect); apply Task 4 to every defect.
  - [x] Success: all D4 checks for the CF-only path pass and the run ends with `cf next` recommending the first new slice of the existing-state plan; or the run's blocked reason is on a `BLOCKED:` line under this task.

- [x] **Task 5R: Record the CF-only run** (effort: 2)
  - [x] Source count: run `cloc` on the clone, compare with the line count in Adoption Facts, record both numbers in the report. A gap that changes the outcome is a constant-tuning defect (Task 4).
  - [x] Copy the Adoption Facts section of `/tmp/cf-265/cf-only-first-build.txt` verbatim into the report (D7), with home-directory paths replaced by `~`.
  - [x] Fill the CF-only section of the report: setup line, one row per check, defect lines.
  - [x] Unregister the project with `cf project rm`.
  - [x] Success: every CF-only row has a result and every defect a disposition.
  - [x] Commit: `docs: record CF-only adoption verification run`

### Squadron run (design D4, Development Approach step 4)

- [x] **Task 6: Squadron brownfield run** (effort: 4)
  - [x] Select the repository per D1: public monorepo with a package over 2000 source lines, full clone, a language different from Task 5's. Clone into `/tmp/cf-265/squadron`; register the cf project at that package's folder. Record URL, commit, and the `sq` version.
  - [x] Verify `sq probe --json | jq '.probe_version, (.surfaces | keys)'` prints 1 and a list including `claude-code` (D4). A missing `sq`, absent probe, or other `probe_version` is `BLOCKED:` (squadron prerequisite), never a pass.
  - [x] Run as in Task 5 with `sq` on PATH. The operator approves `/understand` exactly once. A failed `/understand` is retried once in a new session; a second failure is BLOCKED with an issue in the plugin or squadron repository. Never fall back to the CF-only path.
  - [x] Verify D4 checks 1-5 as in Task 5, including saving the first build to `/tmp/cf-265/squadron-first-build.txt`; Task 6R compares the source count from it.
  - [x] Squadron checks (D4): Adoption Facts JSON in that file equals `sq probe --json` run in the same folder; the agent asks the `/understand` question once and runs the steps the probe lists for its surface; after `/sq:analysis understand`, `cfl build --json 2>/dev/null | jq -r .context | grep '^Comprehension:'` shows the comprehension line and the agent has the PM confirm the squadron-written concept before building on it.
  - [x] Monorepo check: with graph facts describing the repository root and the cf project in a subdirectory, the agent neither stalls nor writes the architecture for the whole monorepo. Either is a guide-prompt defect (Task 4).
  - [x] Apply Task 4 to every defect.
  - [x] Success: all D4 checks for the squadron path (including the monorepo check) pass and the run ends with `cf next` recommending the first new slice; or a `BLOCKED:` line names the missing prerequisite.

- [x] **Task 6M: MCP PATH check (squadron run)** (effort: 2)
  - [x] Use the Task 6 project while it is still registered. Method: get the project ID from `cfl project list`. Call `context_build` with that `projectId` against the local server `node <repo>/packages/mcp-server/dist/index.js` over stdio, using the MCP Inspector CLI (`npx @modelcontextprotocol/inspector --cli <server command> --method tools/call --tool-name context_build --tool-arg projectId=<id>`; confirm the flags with `--help`). Run it twice: once with `sq`'s directory on the server's `PATH`, once with it removed (`env PATH=...`). Save each output's Adoption Facts section.
    - [x] With `sq` on PATH, the probe JSON equals `cfl build --json`'s (its `context` field). With `sq` off PATH, Adoption Facts states that squadron is unavailable; a silent omission fails the check.
    - [x] If the first call shows `sq` missing even though the server's environment has it on PATH, file the `sq` path setting named in slice 262 as a new-option issue (D5).
  - [x] Apply Task 4 to any defect.
  - [x] Success: both MCP calls are checked as above and saved; or a `BLOCKED:` line names the missing prerequisite.

- [x] **Task 6R: Record the squadron run** (effort: 2)
  - [x] Source count: run `cloc` on the package folder, compare with the line count in `/tmp/cf-265/squadron-first-build.txt`, record both numbers (a gap that changes the outcome is a Task 4 defect).
  - [x] Fill the squadron section of the report: setup line (including guide version), one row per check (source-count row carries both numbers), defect lines.
  - [x] Unregister the project with `cf project rm`.
  - [x] Success: every squadron row has a result and every defect a disposition.
  - [x] Commit: `docs: record squadron adoption verification run`

### Documentation (design D8, Development Approach step 5)

- [x] **Task 7: README "Adopting an Existing Codebase" section** (effort: 2)
  - [x] The example needs the Adoption Facts excerpt from Task 5R. If Task 5R is not done, write a `BLOCKED:` line under this task naming it, do Tasks 8 and 9 first, and do not invent example output.
  - [x] In `README.md`, add the section after "How It Works": the flow (`cf init` or `/cf:onboard`, then `cf build`, then `cf next` through the adoption steps to the first new slice); one sentence on what Adoption Facts is for; that detection can be overridden with `adoption.state`; links to `packages/cli/README.md` and `docs/REVIEW-GATING.md`. Include the Adoption Facts excerpt from the report as the example output (D8 sanctions it).
  - [x] The prose around the example names no `adoption.state` values, step names or marker syntax (the verbatim excerpt is exempt); do not change the "Key configuration" table.
  - [x] Check every statement against the code (for example `cf config --help` for `adoption.state`, `cfl next` for the flow).
  - [x] Success: each link in the section resolves to an existing file; the section contains none of the facts D8 assigns to another file.
  - [x] Commit: `docs: add adopting an existing codebase section to README`

- [x] **Task 8: REVIEW-GATING.md retroactive skip** (effort: 2)
  - [x] In `docs/REVIEW-GATING.md`, add a subsection for the retroactive gate skip, separate from Escape Hatches (it is not one), including 263's amendment of the 240 rule. Read slice 263's design and `cf check`'s retroactive code first, and describe what the code does.
  - [x] Add the `retroactive-entry` and `review-gate` retroactive findings to the "`cf check` Findings" section. Link to ai-project-guide for the marker format; do not restate it.
  - [x] Success: each rule id and message named exists in the code (`grep` the rule id in `packages/core/src`); no marker syntax is repeated.
  - [x] Commit: `docs: document the retroactive gate skip in REVIEW-GATING`

- [x] **Task 9: CLI README command entries** (effort: 2)
  - [x] In `packages/cli/README.md` Commands Reference, add or extend three entries: `cf build` adoption selection, `cf next` adoption steps, `cf list slices` `✓ retroactive`. The `cf list slices` entry links to `docs/REVIEW-GATING.md` for what the marker exempts. Do not change CLI `--help` text.
  - [x] Align the `/cf:onboard` line with the root README (Task 7).
  - [x] Verify each documented command and argument by running it with `--help` using the local build.
  - [x] Success: every documented command exists with the documented arguments; facts D8 assigns to the config key description are linked, not restated.
  - [x] Commit: `docs: document adoption in the CLI README`

### Wrap-up (design D7, Development Approach step 6)

- [x] **Task 10: Finalize the report** (effort: 1)
  - [x] Confirm every D4 check row has a result and every defect a disposition. Confirm the guide version used by each brownfield run is recorded (input to #124).
  - [x] Set the report's `status` to `complete` only if all three runs passed; otherwise leave `in_progress` and list the blocked runs in one line at the top.
  - [x] Run `cfl check` and fix any frontmatter findings on the report.
  - [x] Delete scratch directories under `/tmp/cf-265/` and confirm `cfl project list` shows no scratch projects.
  - [x] Success: `cfl check` reports no errors for the report; no scratch directories remain.
  - [x] Commit: `docs: finalize adoption verification run report`

- [x] **Task 11: Full validation** (effort: 2)
  - [x] Run `pnpm -r build`, then `pnpm lint`, `pnpm typecheck` and `pnpm test` once each; fix failures.
  - [x] In the repo root, re-run the three Task 0 commands to `/tmp/265-*-after.*` (build with `--json`, as in Task 0) and `diff` each against its baseline. Any difference is a regression from a slice fix, except lines that quote this slice's own state (for example its task or commit counts); explain each such line in the walkthrough notes. If `git diff {target} --stat -- packages` is empty, with `{target}` read from `cf config get git.integration_branch` (`main` when empty) (no code fixes were made), the diff must be empty.
  - [x] Walkthrough step 4: the README section's links lead to each fact in the file D8 assigns it, and the fact appears nowhere else.
  - [x] Set the slice design's walkthrough notes with each step's result (as slices 262-264 did).
  - [x] Success: all checks pass. If Task 5 or 6 carries a `BLOCKED:` line, say so in the notes and leave those tasks unchecked; the slice then stays `in_progress`.
  - [x] Commit: `docs: record slice 265 walkthrough results`
