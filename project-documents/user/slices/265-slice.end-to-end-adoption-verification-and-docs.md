---
docType: slice-design
slice: end-to-end-adoption-verification-and-docs
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 260
- 261
- 262
- 263
- 264
interfaces: []
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
turns: 23
promptTokens: 1857972
cachedTokens: 1738677
cacheWriteTokens: 119253
completionTokens: 22377
durationSeconds: 230.6
costUsd: 1.668508
usageRounds: 1
pricedRounds: 1
---

# Slice Design: end-to-end-adoption-verification-and-docs

## Overview

Slices 260–264 each test their own part against fixtures. Nothing yet shows that the parts compose on a real repository: that a live agent, given the brownfield prompt cf builds, writes a concept, a derived architecture and an existing-state slice plan, and that cf then records adoption as complete and points `cf next` at new work.

This slice runs adoption end to end three times:

1. **CF-only run:** a real codebase with `sq` unavailable.
2. **Squadron run:** a real codebase with squadron's probe installed, on a surface the probe lists.
3. **Greenfield regression run:** a scaffold-only project, which must still get the concept prompt with no adoption.

It fixes the defects those runs expose in the initiative's code, records each run in one short analysis document, and documents the shipped flow, linking to one source per fact rather than restating it (D8).

Several earlier designs left checks for this slice. They are collected in D4 so none is lost:
- 261: whether `BROWNFIELD_MIN_SOURCE_LINES`, `SOURCE_EXTENSIONS` and `EXCLUDED_DIRS` misfire on real code.
- 262: the real probe end to end, a monorepo subdirectory whose graph describes the repository root, and `context_build` finding `sq` from an MCP server's PATH.
- 264: `cf next` before the first `cf build` on an unset brownfield repository.

## Value

- **Proof on real input.** The initiative's goal ("after adoption, `cf next` points at new work") is shown on real repositories, through a real agent session, not only through fixtures.
- **Defects found before users find them.** Threshold misfires, prompt and cf disagreements, and cross-repo contract gaps surface here, with a regression test for each cf fix.
- **Users can find the feature.** Today the README describes only the greenfield flow. After this slice, a user adopting cf on an existing codebase can read what will happen and where the details live.

## Technical Scope

Included:
- Three end-to-end runs (D1–D3) with the pass checks in D4.
- Fixes in the initiative's cf code (slices 260–264) for defects the runs expose, each with a regression test (D5).
- The run report `user/analysis/260-analysis.adoption-verification-runs.md` (D7).
- Documentation (D8): a new `README.md` section, and additions to `docs/REVIEW-GATING.md` and `packages/cli/README.md`.

Excluded:
- New features, options or formats, even when a run suggests one. They are filed as issues (D5).
- Guide prompt or squadron changes. Defects there are filed in those repositories (D5).
- Conventions reconciliation (266) and docs/ADR mapping (267).
- CHANGELOG and version bump. Those belong to the release.
- Raising `MIN_GUIDE_VERSION` (D6, deferred to #124).
- Re-verifying on real input what 261–264's fixtures already cover (D4).
- Committing anything from the scratch repositories. Only the run report is kept.

## Dependencies

### Prerequisites
- **Slices 260–264, merged to the target.** The runs exercise the integrated code, not a slice branch.
- **ai-project-guide release with the retroactive-marker rule.** 263 hands the Marker Specification to the guide (briefing item 6). Guide v0.22.2's adoption guide says the marker is "not yet specified in this guide; do not invent one", so with it the agent can't write the marker and adoption stays at 264's `existing-state-plan` step (264, Consumes from Other Slices). The CF-only and squadron runs need that release. The greenfield run doesn't.
- **Squadron with the capability probe (squadron slice 366).** The squadron run needs an `sq` whose `sq probe --json` prints `probe_version` 1, with squadron's analysis pack installed for the run's surface and the `understand-anything` plugin available. As of this design, the installed `sq` (0.23.5) has no `probe` command. An install from squadron's 366 branch is acceptable; the run report records the exact version or commit.
- If a prerequisite is missing when its run is due, the task gets a `BLOCKED:` line naming it. The other runs proceed. D2 lists which run-time failures count as a missing prerequisite.
- **What can finish without the external releases:** the greenfield run, and the docs for behavior already shipped in 260–264. **The slice is not complete until both brownfield runs pass.** A slice with only those parts done stays `in_progress`, with its blocked tasks unchecked. The slice's calendar time is set by the two external releases, not by cf work.

### Interfaces Required
- **261:** `cf build` / `context_build` adoption selection, `adoption.state`, the Adoption Facts section, `AdoptionError`, the source-walk constants.
- **262:** the probe section of Adoption Facts, the `Comprehension:` line.
- **263:** the retroactive marker, `provenance: derived`, the `retroactive-entry` rule, the gate skip, automatic `complete`.
- **264:** the adoption steps of 264 D4 (`concept`, `architecture`, `existing-state-plan`, `record-completion`) and D6 (`register-plan`, then `adopted`), with the step values defined once in `adoptionNavigation.ts`. D4 below refers to those sections, not to recommendation text.
- **260:** `/cf:onboard` as setup followed by "run `cf build` and follow it".

## Architecture

### Component Structure

This slice adds no component. Its parts are:

```
scratch repositories (outside this repo, never committed)
  CF-only run       real codebase, single package, shallow clone, sq hidden from PATH
  squadron run      real codebase, project registered in a monorepo subdirectory, full clone
  greenfield run    framework starter, scaffold only
this repo
  packages/**                                         fixes + regression tests (D5)
  project-documents/user/analysis/260-analysis.adoption-verification-runs.md   run report (D7)
  README.md, docs/REVIEW-GATING.md, packages/cli/README.md                      docs (D8)
```

### Data Flow

One brownfield run, as the user meets it:

```
/cf:onboard  → cf init (registration, guide, IDE setup) → "run cf build and follow it"   (260)
cf next      → recommends cf build before the first build (264 D2)
cf build     → detection → brownfield → adoption.state = in_progress → brownfield prompt
               + Adoption Facts (facts, probe JSON or "Squadron: unavailable")          (261, 262)
agent        → [squadron path: one /understand ask, /sq:analysis understand, concept step]
             → 000-concept (PM confirms) → cf build → 100-arch (provenance: derived)
             → cf build → 100-slices with `retroactive` entries, then new work          (guide prompt)
cf next      → the adoption steps of 264 D4                                             (264)
cf build     → retroactive entry found → adoption.state = complete, completion notice   (263)
cf next      → the post-adoption steps of 264 D6, ending on the first new slice         (264)
```

The composition points D4 checks are the hand-offs between these lines, not each line's internals.

### State Management

None in cf. Each scratch repository holds its own `.context-forge.toml` and project registration. Scratch projects are unregistered with `cf project rm` after their run, so they don't linger in the registry.

## Technical Decisions

### D1 — Repository selection
Status: decided
- Public open-source repositories only, cloned into scratch directories outside this repository. No client or private code, so no client spend or data concern arises from `/understand` or the agent reading the code.
- **CF-only run:** a single-package codebase well over 2000 non-blank source lines, in a language other than TypeScript, with a README, a CI workflow and some git history. Cloned with `--depth 1`, so the shallow-history fact is exercised on real input. A non-TypeScript language tests `SOURCE_EXTENSIONS` beyond this project's own stack.
- **Squadron run:** a monorepo with at least one package over 2000 source lines, full clone. The cf project is registered at that package's folder, so detection scoping, root CI recognition, and the probe's root-level graph (262 Interfaces Required) are all exercised at once. Its language differs from the CF-only run's.
- **Greenfield run:** a fresh framework starter generated by its official scaffolder (for example `npm create vite@latest`), with `git init` and one commit. Scaffold-only is the case the threshold exists for, so it's a stronger regression check than an empty folder (which 261's fixtures already cover).
- The implementer picks repositories that meet these criteria. The report records each URL and commit, so a run can be repeated.
- Rejected: running on this repository. It is already planned, so detection never reaches brownfield.

### D2 — How a run is driven
Status: decided
- Each run is a real agent session on Claude Code, started with `/cf:onboard` in the scratch directory, so 260's hand-off is part of the chain. Claude Code is the surface because squadron's probe lists it and cf's slash commands install there. The squadron run checks that the probe's `surfaces` has an entry for it rather than assuming one.
- Use the local build, not the published `cf` (memory: the global binary is the npm install). The scratch session must resolve `cf` to the local build (for example via `cf install-commands --local` plus a PATH entry or shell alias pointing at `packages/cli/dist/index.js`). The report records which `cf --version` the session saw.
- **The PM role.** The brownfield prompt asks the PM to confirm or correct the concept, to answer what no artifact holds, and (squadron path) to approve `/understand` once. The operator running the session answers. Answers come from the repository's own prose; anything else is answered "unknown", which the prompt must then record as unknown (arch: never fabricate intent). Spend on public scratch repositories is covered by the project's pre-authorization, so the `/understand` ask is answered "yes".
- Rules that decide a run's outcome:
  - Every step happens inside the session as the prompt directs. A run that needs a manual artifact edit to proceed fails, and the edit is a defect (D5).
  - A session that ends early resumes in a new session with `cf build`. `adoption.state` and the artifacts persist, so the resume counts as part of the proof.
  - A failed `/understand` never falls back to the CF-only path to finish the squadron run.
  - A broken probe (non-zero exit or unreadable output) is never a pass for the squadron run, even though Adoption Facts correctly says "Squadron: unavailable".
- **Live-run failure modes.** Each one ends as exactly one of: *retry* (repeat the step, no record), *BLOCKED* (a prerequisite is missing; `BLOCKED:` line on the run's task, no defect), or *defect* (D5 disposition, recorded in the report).

| Failure | Outcome |
|---|---|
| Clone, scaffolder or network failure | Retry once. If it fails again, pick another repository that meets D1. |
| `cf build` raises `AdoptionError` for a missing `brownfield-adoption` profile or prompt (261 D9) | BLOCKED if the installed guide is older than `MIN_GUIDE_VERSION` (run `cf guides update` and resume). A defect if the guide meets it. |
| The agent writes the plan but no valid marker, and `cf next` stays at `existing-state-plan` | BLOCKED if the installed guide lacks the retroactive-marker rule. A guide-prompt defect if it has the rule. |
| `cf build` raises `AdoptionError` for a state write or a walk that can't finish | Defect, unless the cause is the scratch environment (permissions, disk), which is fixed and retried. |
| `sq` missing, or `sq probe` absent or not `probe_version` 1 | BLOCKED (squadron prerequisite). Squadron run only. |
| `/understand` fails, or makes no progress for 30 minutes | Retry once in a new session. A second failure is BLOCKED with an issue in the plugin's or squadron's repository. Never a CF-only fallback. |
| Graph stale or partial after `/understand` (`graph.commits_behind` non-zero, or `/sq:analysis understand` reports missing graph content) | The prompt's single `/understand` ask covers staleness (arch), so the agent's handling is checked, not cf. A partial graph after a completed `/understand` is a squadron or plugin defect, filed there. |
| The agent misbehaves on correct inputs | Repeat once (Mitigation). Twice is a guide-prompt defect. |

### D3 — Run order and greenfield check
Status: decided
- Order: greenfield, then CF-only, then squadron. Greenfield is cheapest and catches regressions in the shared build path first. CF-only proves the full path without the cross-repo dependency. Squadron goes last because its prerequisite is the least certain.
- **Greenfield check.** "Matches today's flow" means: `cf build` selects the concept prompt, the prompt has no Adoption Facts section, and `adoption.state` stays unset. 261's fixtures already cover greenfield selection in detail, so no byte-level diff against an older cf build is made. If the run shows any other greenfield difference, compare against the build from before slice 261 at that point.
- The greenfield session continues only into the concept conversation's opening turn (the guide's concept-prompt opener, 260). The concept phase itself is unchanged by this initiative and isn't re-verified.

### D4 — Pass checks per run
Status: decided
The runs check only the composition points that fixtures can't reach. Per-step behavior that 261–264 cover with fixtures (each Adoption Facts field, each `cf next` step's text, `context_build` parity) is not re-checked; a run that happens to show it wrong still yields a defect under D5. A run passes when every check for its path holds.

Step names are 264's (D4 and D6), as defined in `adoptionNavigation.ts`. Implementation step 1 confirms them against the merged code before the first run.

**All brownfield runs (CF-only and squadron):**
1. **Hand-off chain.** `/cf:onboard` hands off to `cf build`; `cf next` before the first build recommends `cf build` (264 D2); the first build selects the brownfield prompt, sets `adoption.state` to `in_progress`, and Adoption Facts states the outcome as brownfield.
2. **No escape to Phase 1.** Through the adoption, `cf next` reports only 264 D4 steps (or, with `workflow.review_enabled`, the gate action 264 D4 puts before `existing-state-plan`) and never recommends a phase change.
3. **Real marker.** The agent writes `100-arch.*` with `provenance: derived` and a `100-slices.*` whose retroactive entries `cf check` accepts under the `retroactive-entry` rule (263), followed by at least one new entry. Unknowns in the concept are marked, not invented.
4. **Completion.** The next `cf build` sets `adoption.state` to `complete` and shows the completion notice.
5. **First new slice.** `cf next` gives `register-plan`. After its suggested command, `cf next` recommends the first new slice (264 D6, `adopted`).

**Source count (261's constants).** Once per brownfield run, compare cf's line count in Adoption Facts with `cloc` or `tokei`. Record the two numbers. A gap that changes the outcome is a defect under D5's constant-tuning rule.

**CF-only run, additionally:**
- With `sq` hidden from PATH, Adoption Facts says squadron is unavailable, and the agent takes the CF-only path without attempting a squadron step.

**Squadron run, additionally (the cross-repo probe):**
- The Adoption Facts JSON equals `sq probe --json` run in the same folder.
- The agent takes the squadron path, asks the `/understand` question exactly once, and runs the steps the probe lists for its surface. After `/sq:analysis understand`, `cf build`'s Project Context has the `Comprehension:` line, and the agent has the PM confirm the squadron-written concept before building on it.
- **Monorepo:** with graph facts describing the repository root and the cf project in a subdirectory, the agent neither stalls nor writes the architecture for the whole monorepo. Either is a guide-prompt defect (D5).
- **MCP PATH (262 Risk):** `context_build` from the MCP client either reports the same probe as `cf build` or states in Adoption Facts that squadron is unavailable. Either passes, because the surface states the unavailability rather than hiding it (arch). A silent omission fails the check. If the MCP server's PATH lacks `sq`, file the `sq` path setting 262 named as a new option (D5).

**Greenfield run:** D3's greenfield check, plus `/cf:onboard` handing off to `cf build` and the session opening the concept conversation.

### D5 — What gets fixed here, and what gets filed
Status: decided
- **Defect in the initiative's cf code (260–264)**, where cf does something its design says it shouldn't, or fails on real input its design covers: fixed in this slice. First a test that fails for the reason the run showed, using the real input's format (CLAUDE.md parser rule), then the fix. One commit per fix. Then repeat the run's affected checks.
- **Constant tuning** (`BROWNFIELD_MIN_SOURCE_LINES`, `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS`, `MAX_WALK_ENTRIES`): changed here only with evidence from a run in the report, and a fixture test at the new boundary. These are the adjustments 261 left to this slice.
- **A change to a decided design behavior, a new option, or a format change:** not made here. File an issue with the run evidence and tell the PM. If it blocks a run's end state, that run's task gets a `BLOCKED:` line.
- **Guide prompt defect** (the agent misreads correct Adoption Facts, skips a step, invents intent, writes a malformed marker): issue in ai-project-guide with the prompt excerpt and the agent's behavior. cf never works around it in code, because guide owns content (arch). Re-run once the guide ships the fix.
- **Squadron defect** (probe output outside its contract, a step that doesn't route): issue in squadron. cf doesn't work around it either.
- **cf defect outside the initiative:** issue, and continue (CLAUDE.md, "Found while implementing a slice").
- Every defect, whatever its disposition, gets a line in the run report with its commit or issue number.

### D6 — `MIN_GUIDE_VERSION` is not raised here
Status: decided
- Below the guide release that carries the retroactive-marker rule, adoption can't complete (264). Raising `MIN_GUIDE_VERSION` would warn those users, but it would also warn every greenfield project on v0.22.2. It also depends on a guide release that doesn't exist yet, and the plan entry doesn't ask for it.
- Deferred to #124, for the release that ships the initiative to decide. The run report records which guide version the brownfield runs used, as input to that decision.

### D7 — The run report
Status: decided
- One document, `project-documents/user/analysis/260-analysis.adoption-verification-runs.md` (`docType: analysis`, `topic: adoption-verification-runs`). It sits under the initiative's base index, as the naming conventions prefer for analysis serving an initiative, and claims no slice index.
- Per run, three parts only:
  - **Setup line:** repository URL and commit; cf, guide and `sq` versions (or "not on PATH").
  - **Checks:** one row per D4 check, pass or defect. The source-count row carries its two numbers.
  - **Defects:** one line each, with its disposition (fix commit or issue link) and the excerpt that proves it.
- One verbatim Adoption Facts section, from the CF-only run's first build, kept as the source for D8's example. Paths under the operator's home directory are written as `~`.
- Nothing else: no transcripts, artifact bodies, `cf next` sequences or PM Q&A unless a defect line needs them as its excerpt.

### D8 — Documentation
Status: decided
Each fact has one home. Other files link to it rather than restating it.

| Fact | Single source |
|---|---|
| The adoption flow, for a new user | `README.md`, new section |
| `adoption.state` values and the override | the config key's description (261), shown by `cf config --help` |
| `cf build` adoption selection, `cf next` adoption steps, `cf list slices` `✓ retroactive` | `packages/cli/README.md`, Commands Reference |
| The retroactive gate skip and the `retroactive-entry` / `review-gate` findings | `docs/REVIEW-GATING.md` |
| The marker format | ai-project-guide (263 hands it there); cf docs link to it |

- **`README.md`:** a short section **Adopting an Existing Codebase**, after "How It Works": the flow (`cf init` or `/cf:onboard`, then `cf build`, `cf next` through the adoption steps to the first new slice); one sentence on what Adoption Facts is for; that detection can be overridden with `adoption.state`; then links to the CLI README and `REVIEW-GATING.md`. No state values, step names or marker syntax. The "Key configuration" table is not changed.
- **`docs/REVIEW-GATING.md`:** the retroactive skip as its own subsection, distinct from Escape Hatches (it isn't one), plus the new findings in "`cf check` Findings". 263's amendment of the 240 rule belongs here because this document is the gate's reference.
- **`packages/cli/README.md`:** the three command entries above. The `/cf:onboard` line matches the root README. The `cf list slices` entry links to `REVIEW-GATING.md` for what the marker exempts.
- The README's example output is the Adoption Facts excerpt from the report (D7). Every other statement is checked against the code before it ships.
- Not changed: CLI `--help` text, and CHANGELOG (the release's).

### Technology Choices
- No new dependencies. `cloc` or `tokei`, if installed, is an operator tool for the D4 source count only. It isn't added to the project.

## Integration Points

### Provides to Other Slices
- **Release:** the run report as evidence for the initiative's release notes, and the guide version used, for #124.
- **266, 267:** the adopted repositories' URLs and commits, so their designs can look at real rule files, docs and ADR layouts.
- **ai-project-guide, squadron:** issues with run evidence for any defect on their side.

### Consumes from Other Slices
- Everything 260–264 provides, as built. Where the code differs from a design, the code and the run decide, and a real defect follows D5.
- **264's step names.** D4 points at 264 D4 and D6 rather than restating them. Implementation step 1 reads the step values in `adoptionNavigation.ts` on the merged target and confirms they match those sections. If 264 shipped different names or an extra step, D4 is updated before the first run; a step that 264's design doesn't have is a D5 question, not a silent edit.
- A missing external prerequisite blocks only the run that needs it (Prerequisites).

## Success Criteria

### Functional Requirements
- The CF-only run and the squadron run each pass every D4 check and end with `cf next` recommending the first new slice of their existing-state plan, with no manual artifact or state edits beyond commands `cf next` suggested.
- The greenfield run's `cf build` selects the concept prompt with no Adoption Facts section, `adoption.state` stays unset, and the session opens the concept conversation.
- Every defect found has a disposition in the report: fixed in this slice with a regression test, or an issue link.

### Technical Requirements
- Each cf fix has a test that failed before the fix, using the real input's format.
- `pnpm -r build`, lint, typecheck and the full test suite pass after the last fix.
- This repository's own `cf build` and `cf next --json` are unchanged by the slice's fixes (it's a planned project).

### Integration Requirements
- The docs (D8) describe the shipped behavior, each fact in its one home, and each documented command exists with the documented arguments.
- The run report exists with all three runs in D7's format and passes `cf check` frontmatter validation.

### Verification Walkthrough

Use the local build from the repo root after `pnpm -r build`: `alias cfl="node $PWD/packages/cli/dist/index.js"`. In scratch sessions, `cf` must resolve to the same build (D2). Requires 260–264 merged, a guide release with the marker rule, and (step 3) an `sq` with the probe.

1. **Greenfield regression.** Generate a starter with its framework's official scaffolder (D1), `git init` and commit it, then `cfl init`.
   ```bash
   cfl build | grep -c '### Adoption Facts'     # expect: 0; the prompt is the concept prompt
   cfl config get adoption.state                # expect: empty, source default
   ```
   Then `/cf:onboard` in Claude Code in a fresh copy: expect setup, the hand-off to `cf build`, and the concept conversation's opening question.
2. **CF-only adoption.** Clone the D1 repository with `--depth 1`. Start Claude Code with `sq` removed from PATH and run `/cf:onboard`, then follow the session to the end (D2). In a second terminal with the same PATH, at each step:
   ```bash
   cfl next --json | jq '{recommendation, suggestedCommand}'   # D4 checks 1, 2, 5
   cfl config get adoption.state                                # in_progress after the first build; complete after the completing build
   cfl check                                                    # D4 check 3: no retroactive-entry errors
   ```
   Copy the first build's Adoption Facts section into the report (D7).
3. **Squadron adoption.** Clone the D1 monorepo and work in the chosen package's folder.
   ```bash
   sq probe --json | jq '.probe_version, (.surfaces | keys)'   # expect: 1, a list that includes the session's surface
   ```
   Start Claude Code, run `/cf:onboard`, and approve `/understand` once. After `/sq:analysis understand`, `cfl build | grep '^Comprehension:'` shows the comprehension path. Then do step 2's checks, and the squadron checks in D4, including `context_build` from an MCP client for the PATH check.
4. **Report and docs.** Open `260-analysis.adoption-verification-runs.md`: every D4 check has a result, every defect a disposition. Read the README's "Adopting an Existing Codebase" section and follow its links: each fact appears in the file D8 assigns it, and nowhere else.

## Risk Assessment

### Technical Risks
- **External prerequisites.** The squadron run waits on squadron's probe, and both brownfield runs wait on the guide's marker rule. Neither is in this repository's control.
- **Live-agent variance.** An agent session can behave differently from run to run, so one clean run doesn't prove the prompt is robust.
- **Defect volume.** The effort estimate assumes the runs expose few cf defects.
### Mitigation Strategies
- Runs are independent, and a missing prerequisite blocks only its own run (Prerequisites, D2). The greenfield run and the docs for shipped behavior don't wait.
- A run that fails because of agent behavior on correct inputs is repeated once before the defect is filed against the guide, and both attempts go in the report. cf code fixes need a deterministic test, so agent variance never drives a cf change by itself.
- Defects outside 260–264's designs are filed, not fixed here (D5), which bounds the cf work.

## Implementation Notes

### Development Approach
1. Prerequisite check: 260–264 merged, the guide release with the marker rule, `sq probe`. Confirm 264's step values in `adoptionNavigation.ts` against D4 (Consumes from Other Slices). Record versions in the report skeleton.
2. Greenfield run (D3).
3. CF-only run (D4); fixes per D5 as they surface, each with its test; re-run the affected checks.
4. Squadron run (D4); fixes per D5.
5. Docs (D8), using the report's Adoption Facts excerpt.
6. Full build, lint, typecheck and tests. Confirm this repository's `cf build` / `cf next --json` are unchanged.

Effort: 2/5 in cf code, if the runs expose few defects; most of the work is run time and documentation. Completion is gated on the two external releases (Prerequisites).

### Special Considerations
- Scratch registrations are removed with `cf project rm` after each run. Scratch directories are deleted after the report is written.
- The runs send public code to the model and, on the squadron path, to squadron's analysis. No private code is involved (D1).
