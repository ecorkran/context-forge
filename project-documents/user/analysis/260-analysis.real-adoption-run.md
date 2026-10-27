---
layer: user
docType: analysis
topic: real-adoption-run
project: context-forge
dateCreated: 20261027
dateUpdated: 20261027
status: complete
---

# Real Adoption Run — context-forge

One real adoption driven through `/sq:onboard` in Claude Code with the PM answering live, continued to the first new slice design on the derived architecture. Recorded by slice 273. Home-directory paths are written as `~`.

**Result:** all ten checks pass. Checks 1 and 5 were not captured live and are reproduced on a fresh clone of tank-game at the pre-adoption commit; check 9's design is a template stub in a copy (PM chose the lighter path). Three cf defects found and fixed in this slice (error text, #137, #132 wording); guide v0.22.10 added the architecture to the Phase 4 profile.

**Deviations from the design (PM-approved 20261027):** (1) the PM chose not to write a real slice design for the old game, so check 9's design step is a template stub. (2) squadron 440 was not released before the run, because its live run is one of 440's open criteria. The run used the 440 branch build of `sq` and a prepared clone instead of a PM-named released repository.

## Setup

- Repository: `tank-game-onboard`, a local clone with no remote (PM-approved name), prepared by squadron's session as an unregistered brownfield project. Last pre-adoption commit `cd6f11c`. Language: TypeScript (Next.js).
- `cf` (local build): 0.19.20, branch `273-slice.real-adoption-run-via-sq-onboard`, forked from `c23fe532`. Two fixes were rebuilt during the run, `f5d4ed3f` and `e12ab0fc`.
- ai-project-guide in the adopted project: v0.22.8 (tarball), installed by `cf init` (commit `26ab940`, 111 files). At `MIN_GUIDE_VERSION`.
- `sq`: reports 0.24.5; the build is the squadron 440 branch (`440-slice.sq-onboard`), an editable install at `~/.local/bin/sq` per squadron's session. The squadron commit was not independently verified here. A stale `sq` in the Python framework directory was removed by squadron's session.
- Command sources (from the file system after the run; not captured in-session): `/sq:onboard` is `~/.claude/commands/sq/onboard.md` (machine level, from the 440 branch per squadron's session). The clone has no project-level `.claude/commands/`, so `/cf:*` resolved from machine-level `~/.claude/commands/cf/` (9 files, not deleted).
- `workflow.review_enabled`: `true`, source `user`.
- Review gate fired: yes. `cf next` blocked on the derived architecture until `100-review.arch.tank-game-onboard.md` existed; after the review it cleared (see #132 for the wording).

## Checks

| # | Point | Result | Evidence |
|---|---|---|---|
| 1 | Before the run | pass (reproduced) | Not captured before the live run. Reproduced afterwards on a fresh clone of tank-game at the pre-adoption commit `cd6f11c` (own project store): `cf detect` gives `brownfield`, not in `cf project list`; `sq onboard --path` left `git status --short` empty and the project list unchanged. `sq onboard --json` surfaces: `claude-code` has the analysis skill and the understand plugin installed. |
| 2 | Register | pass | Squadron's session: `registration: created`, every `cf init` step ok or skipped. |
| 3 | Concept from cf | pass | Squadron's session: concept detected, `sq onboard` moved on. Caveat: the project's `fileConcept` stayed unset until #137's fix. |
| 4 | Resume | pass | PM confirmed the session was resumed at `adopt`. |
| 5 | Prompt inputs | pass (reproduced) | Not captured in the live session. Reproduced on the same fresh clone after `sq onboard register`, with the run's comprehension doc and concept copied in: `sq onboard` reported `Next: adopt`, and `sq onboard prompt` ended with `## Adoption Inputs`: comprehension `940-analysis.codebase-comprehension.md`, concept `000-concept.tank-game-onboard.md`, derived architecture `none`, existing-state slice plan `none`. |
| 6 | Artifacts | pass | `050-docs-map.tank-game-onboard.md` exists and is linked from the architecture; `provenance: derived`; `cf list slices --json` shows `retroactive: true` for 100–102 and unbuilt 103 (PM-supplied); `cf check` reports one info line, no errors; "unknown" appears in the architecture. Caveat: arch and plan had to be set by hand (`cf set arch 100`), see #137. |
| 7 | Hand-off | pass | `cf detect` reports `already-planned`; `sq onboard` hands off to `cf next`. The in-between `adoption-incomplete` state was not observed. |
| 8 | First new slice | pass | After the arch review, `cf next` recommends `cf set slice 103`, never a retroactive slice. |
| 9 | Design on the derived arch | pass | PM chose a lighter path (no real design effort on the old game): in a copy of the clone the operator ran `cf set slice 103`, `cf set phase 4`, `cf build`, filled the slice-design template frontmatter, and `cf validate design` exited 0. First `cf build` (guide v0.22.8) named only the slice plan; the guide added the architecture to the `slice-design-phase-4` profile in v0.22.10, and after `cf guides update` the Phase 4 context shows `Architecture: 100-arch.tank-game-onboard` and `Slice Plan: 100-slices.tank-game-onboard`. `cf validate design` checks section presence only, so the template stub passes; the design is a stub, not real design work. |
| 10 | No stray writes | pass | On the PM's clone (no design written there):  modified `.gitignore`; untracked `.claude/`, `.context-forge/`, `.understand-anything/`, `CLAUDE.md`, `project-documents/user/`. The guide install is committed by `cf init` itself (`26ab940`). |

## Defects

- **`cf set slicePlan` named a field that does not exist** (`cf list slices`, `cf list tasks`). Fixed in cf, commit `f5d4ed3f`: the message now says `cf set plan <path>`. Excerpt: `No slice plan configured. Set one with: cf set slicePlan <path>`.
- **Adoption never registered the derived architecture, slice plan or concept** (#137). After a complete run `cf get` showed all three unset, `cf next` said "Create architecture document" and `cf list slices` failed. Fixed in cf, commit `e12ab0fc`: `cf next` and `cf list slices` register them when adoption is complete (one derived architecture plus an existing-state plan), and do not guess between several architectures. Verified on a copy of the run's clone: `cf next` printed the three `Updated …` lines and recommended `cf set slice 103`.
- **Derived-architecture review gate after adoption** (#132, open, not a new defect). Decided behavior (D4); the message still reads "Review required before creating the slice plan … a arch review" although the plan exists. Cleared by running the review it names.

## Notes for 274

- With guide v0.22.8 the Phase 4 build context for slice 103 listed the slice plan and the slice, not the architecture; fixed in guide v0.22.10. The docs map is still in no build context profile (#135).
- No real design session was run, so nothing was observed about what that session lacked.
