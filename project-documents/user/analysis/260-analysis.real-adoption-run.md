---
layer: user
docType: analysis
topic: real-adoption-run
project: context-forge
dateCreated: 20261027
dateUpdated: 20261027
status: in_progress
---

# Real Adoption Run — context-forge

One real adoption driven through `/sq:onboard` in Claude Code with the PM answering live, continued to the first new slice design on the derived architecture. Recorded by slice 273. Home-directory paths are written as `~`.

**Result so far:** checks 2–4 and 6–8 pass. Check 1 and check 5 are unverified. Checks 9–10 are not run yet (first new slice design). Two cf defects were found and fixed in this slice; one known gate issue (#132) is still open. Not yet passed overall.

**Deviation from the design (PM-approved 20261027):** squadron 440 was not released before the run, because its live run is one of 440's open criteria. The run used the 440 branch build of `sq` and a prepared clone instead of a PM-named released repository.

## Setup

- Repository: `tank-game-onboard`, a local clone with no remote (PM-approved name), prepared by squadron's session as an unregistered brownfield project. Last pre-adoption commit `cd6f11c`. Language: TypeScript (Next.js).
- `cf` (local build): 0.19.20, branch `273-slice.real-adoption-run-via-sq-onboard`, forked from `c23fe532`. Two fixes were rebuilt during the run, `f5d4ed3f` and `e12ab0fc`.
- ai-project-guide in the adopted project: v0.22.8 (tarball), installed by `cf init` (commit `26ab940`, 111 files). At `MIN_GUIDE_VERSION`.
- `sq`: reports 0.24.5; the build is the squadron 440 branch (`440-slice.sq-onboard`), an editable install at `~/.local/bin/sq` per squadron's session. The squadron commit was not independently verified here. A stale `sq` in the Python framework directory was removed by squadron's session.
- `/sq:onboard` installed from the 440 branch into `~/.claude/commands/sq` (per squadron's session). Where `/sq:onboard` and `/cf:*` resolved from in the session: _pending (PM)_. Machine-level `~/.claude/commands/cf/` exists (9 files, not deleted).
- `workflow.review_enabled`: `true`, source `user`.
- Review gate fired: yes. `cf next` blocked on the derived architecture until `100-review.arch.tank-game-onboard.md` existed; after the review it cleared (see #132 for the wording).

## Checks

| # | Point | Result | Evidence |
|---|---|---|---|
| 1 | Before the run | unverified | Pre-run `cf detect` and project-list state were not captured before the PM started the session. |
| 2 | Register | pass | Squadron's session: `registration: created`, every `cf init` step ok or skipped. |
| 3 | Concept from cf | pass | Squadron's session: concept detected, `sq onboard` moved on. Caveat: the project's `fileConcept` stayed unset until #137's fix. |
| 4 | Resume | pass | PM confirmed the session was resumed at `adopt`. |
| 5 | Prompt inputs | unverified | The `## Adoption Inputs` tail was not captured; the inputs have changed since. |
| 6 | Artifacts | pass | `050-docs-map.tank-game-onboard.md` exists and is linked from the architecture; `provenance: derived`; `cf list slices --json` shows `retroactive: true` for 100–102 and unbuilt 103 (PM-supplied); `cf check` reports one info line, no errors; "unknown" appears in the architecture. Caveat: arch and plan had to be set by hand (`cf set arch 100`), see #137. |
| 7 | Hand-off | pass | `cf detect` reports `already-planned`; `sq onboard` hands off to `cf next`. The in-between `adoption-incomplete` state was not observed. |
| 8 | First new slice | pass | After the arch review, `cf next` recommends `cf set slice 103`, never a retroactive slice. |
| 9 | Design on the derived arch | | |
| 10 | No stray writes | | `git status --short` before the design: modified `.gitignore`; untracked `.claude/`, `.context-forge/`, `.understand-anything/`, `CLAUDE.md`, `project-documents/user/`. The guide install is committed by `cf init` itself (`26ab940`). |

## Defects

- **`cf set slicePlan` named a field that does not exist** (`cf list slices`, `cf list tasks`). Fixed in cf, commit `f5d4ed3f`: the message now says `cf set plan <path>`. Excerpt: `No slice plan configured. Set one with: cf set slicePlan <path>`.
- **Adoption never registered the derived architecture, slice plan or concept** (#137). After a complete run `cf get` showed all three unset, `cf next` said "Create architecture document" and `cf list slices` failed. Fixed in cf, commit `e12ab0fc`: `cf next` and `cf list slices` register them when adoption is complete (one derived architecture plus an existing-state plan), and do not guess between several architectures. Verified on a copy of the run's clone: `cf next` printed the three `Updated …` lines and recommended `cf set slice 103`.
- **Derived-architecture review gate after adoption** (#132, open, not a new defect). Decided behavior (D4); the message still reads "Review required before creating the slice plan … a arch review" although the plan exists. Cleared by running the review it names.

## Notes for 274

_Pending the first new slice design (Task 7)._
