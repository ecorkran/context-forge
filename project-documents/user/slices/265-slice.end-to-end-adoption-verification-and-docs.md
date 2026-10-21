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
dateUpdated: 20261021
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
3. **Greenfield regression run:** a scaffold-only project, which must behave exactly as before the initiative.

It fixes the defects those runs expose in the initiative's code, records each run in one analysis document, and documents the shipped flow (adoption, the override, the adoption state, the Adoption Facts section, the retroactive marker) in the README and the CLI and MCP references.

Several earlier designs left checks for this slice. They are collected in D4 so none is lost:
- 261: whether `BROWNFIELD_MIN_SOURCE_LINES`, `SOURCE_EXTENSIONS` and `EXCLUDED_DIRS` misfire on real code.
- 262: the real probe end to end, a monorepo subdirectory whose graph describes the repository root, and `context_build` finding `sq` from an MCP server's PATH.
- 264: `cf next` before the first `cf build` on an unset brownfield repository.

## Value

- **Proof on real input.** The initiative's goal ("after adoption, `cf next` points at new work") is shown on real repositories, through a real agent session, not only through fixtures.
- **Defects found before users find them.** Threshold misfires, prompt and cf disagreements, and cross-repo contract gaps surface here, with a regression test for each cf fix.
- **Users can find the feature.** Today the README describes only the greenfield flow. After this slice, a user adopting cf on an existing codebase can read what will happen, how to override detection, and what the adoption artifacts mean.

## Technical Scope

Included:
- Three end-to-end runs (D1–D3) with the pass checks in D4.
- Fixes in the initiative's cf code (slices 260–264) for defects the runs expose, each with a regression test (D5).
- Raising `MIN_GUIDE_VERSION` to the first guide release that carries the retroactive-marker rule (D6).
- The run report `user/analysis/260-analysis.adoption-verification-runs.md` (D7).
- Documentation (D8): `README.md`, `docs/REVIEW-GATING.md`, `docs/TOOLS.md`, `packages/cli/README.md`.

Excluded:
- New features, options or formats, even when a run suggests one. They are filed as issues (D5).
- Guide prompt or squadron changes. Defects there are filed in those repositories (D5).
- Conventions reconciliation (266) and docs/ADR mapping (267).
- CHANGELOG and version bump. Those belong to the release.
- Committing anything from the scratch repositories. Only the run report and its excerpts are kept.

## Dependencies

### Prerequisites
- **Slices 260–264, merged to the target.** The runs exercise the integrated code, not a slice branch.
- **ai-project-guide release with the retroactive-marker rule.** 263 hands the Marker Specification to the guide (briefing item 6). Guide v0.22.2's adoption guide says the marker is "not yet specified in this guide; do not invent one", so with it the agent can't write the marker and adoption never completes (264, Consumes from Other Slices). The CF-only and squadron runs need that release. The greenfield run doesn't.
- **Squadron with the capability probe (squadron slice 366).** The squadron run needs an `sq` whose `sq probe --json` prints `probe_version` 1, with squadron's analysis pack installed for the run's surface and the `understand-anything` plugin available. As of this design, the installed `sq` (0.23.5) has no `probe` command. An install from squadron's 366 branch is acceptable; the run report records the exact version or commit.
- If a prerequisite is missing when its run is due, the task gets a `BLOCKED:` line naming it. The other runs proceed.

### Interfaces Required
- **261:** `cf build` / `context_build` adoption selection, `adoption.state`, the Adoption Facts section, `AdoptionError`, the source-walk constants.
- **262:** the probe section of Adoption Facts, the `Comprehension:` line.
- **263:** the retroactive marker, `provenance: derived`, the `retroactive-entry` rule, the gate skip, automatic `complete`.
- **264:** `cf next` adoption steps, `register-plan`, the hand-off to the first new entry.
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
  packages/**                                         fixes + regression tests (D5); MIN_GUIDE_VERSION (D6)
  project-documents/user/analysis/260-analysis.adoption-verification-runs.md   run report (D7)
  README.md, docs/REVIEW-GATING.md, docs/TOOLS.md, packages/cli/README.md       docs (D8)
```

### Data Flow

One brownfield run, as the user meets it:

```
/cf:onboard  → cf init (registration, guide, IDE setup) → "run cf build and follow it"   (260)
cf next      → recorded before the first build (264 D2)
cf build     → detection → brownfield → adoption.state = in_progress → brownfield prompt
               + Adoption Facts (facts, probe JSON or "Squadron: unavailable")          (261, 262)
agent        → [squadron path: one /understand ask, /sq:analysis understand, concept step]
             → 000-concept (PM confirms) → cf build → 100-arch (provenance: derived)
             → cf build → 100-slices with `retroactive` entries, then new work          (guide prompt)
cf next      → at each step: concept / architecture / existing-state-plan / record-completion   (264)
cf build     → retroactive entry found → adoption.state = complete, completion notice   (263)
cf next      → register-plan → cf set arch 100-arch.{name} → "Pick slice {first new index}"   (264)
```

Each arrow is a check in D4. Evidence from each run goes into the run report (D7). Real output excerpts from the report become the documentation examples (D8).

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
- A session may be driven interactively or headless (`claude -p`, with `--continue` for each PM answer). Either way, the report keeps each PM question and answer verbatim.
- Every answer, approval and step happens inside the session as the prompt directs. The operator doesn't write artifacts by hand. A run that needs a manual edit to proceed is a defect (D5), not a pass.

### D3 — Run order and greenfield baseline
Status: decided
- Order: greenfield, then CF-only, then squadron. Greenfield is cheapest and catches regressions in the shared build path first. CF-only proves the full path without the cross-repo dependency. Squadron goes last because its prerequisite is the least certain.
- **Greenfield baseline.** "Matches today's flow" means it matches the cf build immediately before slice 261 merged (260 already changed onboarding, so that is "today"). Build that commit in a separate git worktree. In the scratch starter, compare `cf build` and `cf next --json` from both builds. Expected: identical apart from the date line. Then check that `adoption.state` is still unset and the prompt has no Adoption Facts section.
- The greenfield session continues only into the concept conversation's opening turn (the guide's concept-prompt opener, 260). The concept phase itself is unchanged by this initiative and isn't re-verified.

### D4 — Pass checks per run
Status: decided
A run passes when every check for it holds. Each check is recorded in the report as pass or as a defect with its disposition (D5).

**All brownfield runs (CF-only and squadron):**
1. `cf next` before the first `cf build` (unset state, Phase 0, no concept) recommends `cf build` (264 D2).
2. First `cf build`: brownfield prompt selected; Adoption Facts outcome is brownfield with the line count; every fact matches the repository (the README, the CI workflow, the rule files and the history are listed as they really are); `adoption.state` is `in_progress`.
3. **Threshold sanity (261 D1, D2):** run `measureSourceVolume` on the folder without the line cap (a one-off script against the built core, not a shipped feature) and compare with `cloc` or `tokei` if installed. A count that misses a whole mainstream language or counts generated output is a defect (D5).
4. MCP parity: `context_build` from an MCP client in the scratch directory gives the same prompt text as `cf build` at the same point. `template_preview` leaves `adoption.state` unchanged.
5. `cf next` at each adoption step reports the matching step (`concept` → `architecture` → `existing-state-plan` → `record-completion`) and never "Advance to Phase 1".
6. Artifacts: `000-concept.*` confirmed by the PM, with unknowns marked rather than invented; `100-arch.*` with `provenance: derived`; `100-slices.*` whose retroactive entries follow the Marker Specification exactly (263) and precede at least one new entry.
7. `cf check` has no `retroactive-entry` or `frontmatter-schema` findings. With `workflow.review_enabled true` it adds one `review-gate` info naming the retroactive entries as skipped, and no `pending-review` for them. Set the key back afterward.
8. `cf build` after the plan is written: `adoption.state` becomes `complete`, and Adoption Facts carries the completion notice.
9. `cf next` gives `register-plan` with `cf set arch 100-arch.{name}`. After running that command, `cf next` gives "Pick slice {first new index}". `workflow_next` returns the same `recommendation` and `suggestedCommand` as `cf next --json`.
10. `cf list slices` shows the retroactive entries as `✓ retroactive`.

**CF-only run, additionally:**
- With `sq` hidden from PATH, Adoption Facts says "Squadron: unavailable. `sq` was not found on PATH." The agent states in one line that it's taking the CF-only path and never attempts a squadron step.

**Squadron run, additionally:**
- The Adoption Facts JSON equals `sq probe --json` run in the same folder, and the probe's stderr warnings appear verbatim.
- The agent takes the squadron path, asks the `/understand` question exactly once, then runs `entry` and `concept` as the probe lists them for its surface.
- After `/sq:analysis understand`, `cf build`'s Project Context has `Comprehension: user/analysis/{n}-analysis.codebase-comprehension.md` with the highest index.
- The agent asks the PM to confirm the squadron-written concept (363 provenance) before building on it.
- **Monorepo:** the agent copes with graph facts that describe the repository root while the cf project is a subdirectory. It neither stalls nor writes the architecture for the whole monorepo. If it does either, that's a guide-prompt defect (D5).
- **MCP PATH (262 Risk):** `context_build` from the MCP client reports the probe the same way `cf build` does. If the MCP server's PATH lacks `sq`, record that as a finding and file the follow-up 262 named (an `sq` path setting), since that is a new option (D5).

**Greenfield run:** D3's baseline comparison, plus `/cf:onboard` handing off to `cf build` and the session opening the concept conversation.

### D5 — What gets fixed here, and what gets filed
Status: decided
- **Defect in the initiative's cf code (260–264)**, where cf does something its design says it shouldn't, or fails on real input its design covers: fixed in this slice. First a test that fails for the reason the run showed, using the real input's format (CLAUDE.md parser rule), then the fix. One commit per fix. Then repeat the run's affected checks.
- **Constant tuning** (`BROWNFIELD_MIN_SOURCE_LINES`, `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS`, `MAX_WALK_ENTRIES`): changed here only with evidence from a run in the report, and a fixture test at the new boundary. These are the adjustments 261 left to this slice.
- **A change to a decided design behavior, a new option, or a format change:** not made here. File an issue with the run evidence and tell the PM. If it blocks a run's end state, that run's task gets a `BLOCKED:` line.
- **Guide prompt defect** (the agent misreads correct Adoption Facts, skips a step, invents intent, writes a malformed marker): issue in ai-project-guide with the prompt excerpt and the agent's behavior. cf never works around it in code, because guide owns content (arch). Re-run once the guide ships the fix.
- **Squadron defect** (probe output outside its contract, a step that doesn't route): issue in squadron. cf doesn't work around it either.
- **cf defect outside the initiative:** issue, and continue (CLAUDE.md, "Found while implementing a slice").
- Every defect, whatever its disposition, gets a line in the run report with its commit or issue number.

### D6 — Raise `MIN_GUIDE_VERSION` to the marker-rule release
Status: decided
- `MIN_GUIDE_VERSION` (`packages/core/src/guides/guideMinimum.ts`, currently `0.22.2`) becomes the first ai-project-guide release that carries the retroactive-marker rule. That's the guide version the brownfield runs used (Prerequisites).
- Why: below that version the brownfield prompt can't write the marker, so adoption never completes and `cf next` stays at step 3 indefinitely (264). Raising the minimum makes `cf build` warn on such guides with the existing message, instead of leaving users in a silent dead end. Greenfield runs fine on either version, and the minimum only warns, so nothing fails that works today.
- The README's "needs ai-project-guide v0.22.2 or newer" text changes with it. The version number is taken from the guide release actually used, never written ahead of it.
- Rejected: a brownfield-only minimum. It would be a second version constant for one flow, while the existing warning already covers it.

### D7 — The run report
Status: decided
- One document, `project-documents/user/analysis/260-analysis.adoption-verification-runs.md` (`docType: analysis`, `topic: adoption-verification-runs`). It sits under the initiative's base index, as the naming conventions prefer for analysis serving an initiative, and claims no slice index.
- Per run: repository URL and commit, clone depth, project folder; cf commit and `cf --version`; guide version; `sq --version` (or "not on PATH"); the Adoption Facts section from the first build; the `cf next` sequence (step, recommendation, command); artifact paths with their frontmatter; PM questions and answers verbatim; each D4 check as pass or defect; each defect's disposition (fix commit or issue link).
- Paths under the operator's home directory are written as `~`. Probe JSON is kept verbatim otherwise.
- Not included: full transcripts and the generated artifacts' bodies. The scratch repositories are disposable, and the report keeps what a later reader needs to judge the run.

### D8 — Documentation
Status: decided
Every example output in the docs is copied from the run report, never written from the designs. A doc statement with no run evidence behind it is checked against the code before it ships.
- **`README.md`:**
  - New section **Adopting an Existing Codebase**, after "How It Works". It covers: what detection looks at and the one signal that decides (the source-line threshold, stated as the constant's value); the flow (`cf init` or `/cf:onboard`, then `cf build`, the three artifacts, `cf next` at each step, completion, the first new slice); the squadron path versus the CF-only path, and that cf decides neither, the guide prompt does from the probe facts; the Adoption Facts section and what it contains; the `adoption.state` values and the override in both directions; the retroactive marker in one example line; the planned-project rule (an initiative plan, architecture or slice plan means no detection).
  - "Key configuration" table: the `adoption.state` row 261 added, checked against the shipped values.
  - "Review Gating": one sentence saying retroactive entries are skipped, never reviewed or exempt, with a link to the reference.
  - The guide-minimum sentence in Get Started (D6).
- **`docs/REVIEW-GATING.md`:** the retroactive skip as its own subsection, distinct from Escape Hatches (it isn't one), plus the `review-gate` info and `retroactive-entry` errors in "`cf check` Findings". This document is the gate's reference, so 263's amendment of the 240 rule must appear here.
- **`docs/TOOLS.md`:** `context_build` selects the brownfield adoption prompt on the same terms as `cf build` and may write `adoption.state`. `template_preview` never writes it.
- **`packages/cli/README.md`:** in the Commands Reference, `cf build` (adoption selection), `cf next` (adoption steps), `cf list slices` (`✓ retroactive`). The `/cf:onboard` line matches the root README.
- Not changed: CLI `--help` text (261 put the state's description on the config key, which `cf config --help` shows). CHANGELOG belongs to the release.

### Technology Choices
- No new dependencies. `cloc` or `tokei`, if installed, is an operator tool for D4 check 3 only. It isn't added to the project.

## Integration Points

### Provides to Other Slices
- **Release:** the verified guide minimum (D6) and the run report as evidence for the initiative's release notes.
- **266, 267:** real adopted projects' rule files, docs and ADR layouts, recorded in the report, as input to their designs.
- **ai-project-guide, squadron:** issues with run evidence for any defect on their side.

### Consumes from Other Slices
- Everything 260–264 provides, as built. Where the code differs from a design, the code and the run decide, and a real defect follows D5.
- A missing external prerequisite blocks only the run that needs it (Prerequisites).

## Success Criteria

### Functional Requirements
- The CF-only run and the squadron run each pass every D4 check and end with `cf next` recommending the first new slice of their existing-state plan, with no manual artifact or state edits beyond commands `cf next` suggested.
- The greenfield run's `cf build` and `cf next --json` match the pre-261 baseline apart from the date line, `adoption.state` stays unset, and the session opens the concept conversation.
- Every defect found has a disposition in the report: fixed in this slice with a regression test, or an issue link.
- `MIN_GUIDE_VERSION` equals the guide release the brownfield runs used.

### Technical Requirements
- Each cf fix has a test that failed before the fix, using the real input's format.
- `pnpm -r build`, lint, typecheck and the full test suite pass after the last fix.
- This repository's own `cf build` and `cf next --json` are unchanged by the slice's fixes (it's a planned project).

### Integration Requirements
- The docs (D8) describe the shipped behavior. Each example output appears in the run report, and each documented command exists with the documented arguments.
- The run report exists with all three runs and passes `cf check` frontmatter validation.

### Verification Walkthrough

Use the local build from the repo root after `pnpm -r build`: `alias cfl="node $PWD/packages/cli/dist/index.js"`. In scratch sessions, `cf` must resolve to the same build (D2). Requires 260–264 merged, a guide release with the marker rule, and (step 3) an `sq` with the probe.

1. **Greenfield regression.**
   ```bash
   git worktree add /tmp/cf-pre261 <commit before slice 261 merged> && (cd /tmp/cf-pre261 && pnpm install && pnpm -r build)
   alias cfb="node /tmp/cf-pre261/packages/cli/dist/index.js"
   cd /tmp && npm create vite@latest gf -- --template react-ts && cd gf && git init && git add -A && git commit -m init
   cfl init --name gf
   cfl build > /tmp/gf-after.md && cfb build > /tmp/gf-before.md && diff /tmp/gf-before.md /tmp/gf-after.md
   # expect: only the date line differs; no "### Adoption Facts"
   cfl config get adoption.state                # expect: empty, source default
   ```
   Then `/cf:onboard` in Claude Code in a fresh copy: expect setup, the hand-off to `cf build`, and the concept conversation's opening question.
2. **CF-only adoption.**
   ```bash
   git clone --depth 1 <repo per D1> /tmp/bf-cf && cd /tmp/bf-cf
   PATH=<PATH without sq> claude          # run /cf:onboard, then follow the session to the end
   ```
   Along the way, in a second terminal (same PATH):
   ```bash
   cfl next --json | jq '{recommendation, suggestedCommand}'   # at each step: D4 check 5
   cfl build | sed -n '/### Adoption Facts/,/^### [^A]/p'      # first build: facts and "Squadron: unavailable"
   cfl check                                                    # after the plan: no retroactive-entry findings
   cfl config get adoption.state                                # after the completing build: complete
   cfl next                                                     # register-plan, then after cf set arch: "Pick slice N"
   ```
3. **Squadron adoption.**
   ```bash
   git clone <monorepo per D1> /tmp/bf-sq && cd /tmp/bf-sq/<package>
   sq probe --json | jq '.probe_version, (.surfaces | keys)'   # expect: 1, a list that includes the session's surface
   claude                                                       # /cf:onboard; approve /understand once
   cfl build | grep '^Comprehension:'                           # after /sq:analysis understand
   ```
   Then the same `cf next`, `cf check` and completion checks as step 2, and `context_build` / `workflow_next` from an MCP client for the parity and PATH checks.
4. **Report and docs.** Open `260-analysis.adoption-verification-runs.md`: every D4 check has a result, every defect a disposition. Read the README's "Adopting an Existing Codebase" section and follow it on a new scratch clone. The commands and outputs it shows should match what you get.

## Risk Assessment

### Technical Risks
- **External prerequisites.** The squadron run waits on squadron's probe, and both brownfield runs wait on the guide's marker rule. Neither is in this repository's control.
- **Live-agent variance.** An agent session can behave differently from run to run, so one clean run doesn't prove the prompt is robust.

### Mitigation Strategies
- Runs are independent, and a missing prerequisite blocks only its own run (Prerequisites). The greenfield run and the docs for shipped behavior don't wait.
- A run that fails because of agent behavior on correct inputs is repeated once before the defect is filed against the guide, and both attempts go in the report. cf code fixes need a deterministic test, so agent variance never drives a cf change by itself.

## Implementation Notes

### Development Approach
1. Prerequisite check: 260–264 merged, the guide release with the marker rule, `sq probe`. Record versions in the report skeleton.
2. Greenfield run (D3), with the pre-261 baseline worktree.
3. CF-only run (D4); fixes per D5 as they surface, each with its test; re-run the affected checks.
4. Squadron run (D4); fixes per D5.
5. `MIN_GUIDE_VERSION` (D6) with its test updated.
6. Docs (D8) from the report's evidence.
7. Full build, lint, typecheck and tests. Confirm this repository's `cf build` / `cf next --json` are unchanged.

Effort: 2/5 in cf code; most of the work is run time and documentation.

### Special Considerations
- Scratch registrations are removed with `cf project rm` after each run. Scratch directories are deleted after the report is written.
- The runs send public code to the model and, on the squadron path, to squadron's analysis. No private code is involved (D1).
