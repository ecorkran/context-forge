---
docType: slice-design
slice: real-adoption-run-via-sq-onboard
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 263
- 267
- 268
- 269
- 271
- 272
interfaces:
- 274
dateCreated: 20261027
dateUpdated: 20261027
status: not_started
turns: 47
promptTokens: 3128095
cachedTokens: 3001192
cacheWriteTokens: 126837
completionTokens: 28583
durationSeconds: 315.7
costUsd: 2.187187
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.1871872999999997
    completionTokens: 28583
revision_number: 2
---

# Slice Design: Real Adoption Run via sq onboard

## Overview

Slices 268–272 moved adoption out of cf. cf now provides read-only primitives (`cf detect`, `cf init --json`, `cf prompt get brownfield-adoption --path --comprehension`) and still understands the artifacts adoption writes (derived architecture, retroactive entries, docs map). Squadron's `sq onboard` (squadron slice 440) orchestrates the adoption. Each side is tested against the other's recorded JSON, and nobody has run the two together on a real codebase with a real PM.

This slice runs one adoption on a real repository the PM chooses, with the PM answering live, from `/sq:onboard` through to the first new slice design written on the derived architecture. It fixes the cf defects the run exposes, files the rest, and records the run in one short report.

The architecture makes this the initiative's exit criterion: "the initiative is complete when 273 passes" (260-arch, Exit criterion).

## Value

- **Proof that the rework composes.** The cf ↔ squadron contract (271), the reworked guide prompt (272, guide v0.22.8) and squadron's step loop (440) meet for the first time on real input, with a human making the PM decisions instead of an operator reading the repo's prose.
- **Proof of the initiative's goal.** After adoption, cf doesn't just point at new work: the first new slice design is actually written against the derived architecture, which shows the recovered artifacts are usable for later design work.
- **Defects found before users find them,** each with a regression test (cf) or an issue in the owning repository.
- **Input to 274.** The run shows what the derived architecture and the comprehension doc are worth in a later phase, and what was missing.

## Technical Scope

Included:
- One adoption run on a PM-chosen repository (D1), driven through `/sq:onboard` in Claude Code (D2), with one deliberate session break (D3).
- Continuing past the hand-off: `cf next`, any review gate it raises, then the Phase 4 slice design of the first new slice (D4).
- The pass checks in D5.
- Fixes in cf for defects the run exposes, each with a regression test (D6).
- The run report `user/analysis/260-analysis.real-adoption-run.md` (D7).

Excluded:
- A greenfield regression run, a CF-only run, or a second repository. 265 covered greenfield on the shared code paths, and squadron is the only supported adoption path (slice plan, PM 20261025).
- The Codex skill `sq-onboard` and the MCP `project_detect` path. The run uses one surface; the MCP twin's parity is covered by 271's parity test.
- Squadron or guide changes. Defects there are filed in those repositories (D6).
- New cf features, options or formats, even when the run suggests them. They are filed (D6). The comprehension doc in later phases is 274's.
- Task breakdown or implementation of the first new slice. The run ends when its slice design passes `cf validate design`.
- Committing anything in the adopted repository (D1).
- README or reference docs. 272 documented the shipped state. A doc the run shows to be wrong is a defect under D6.

## Dependencies

### Prerequisites
- **cf 271 and 272 on the target.** Both shipped in 0.19.20 (`cf detect`, `cf init --json`, `--path`/`--comprehension`, the onboarding stop, the guide copies and `MIN_GUIDE_VERSION` 0.22.8).
- **ai-project-guide ≥ v0.22.8** installed in the adopted project. Its `brownfield-adoption` prompt reads the Adoption Inputs section, runs `cf docs map`, and defines the retroactive marker.
- **cf 266, conditional.** Conventions reconciliation is exercised only if the PM accepts the guide prompt's offer (D2, D6). It is not part of the pass, so it is left out of the frontmatter `dependencies`.
- **Squadron with slice 440.** `sq onboard`, `/sq:onboard` and `sq onboard register|decline|prompt`. As of this design the installed `sq` is 0.24.5 with no `onboard` command, and 440 is complete only on squadron's `440-slice.sq-onboard` branch (fixtures regenerated from cf 0.19.20, squadron `598fcb1f`). Squadron's own live criterion for 440 is this same run (D8), so 440 may not be released when the run is due. An `sq` installed from squadron's 440 branch or its merge is acceptable. The report records the exact version and commit.
- **The understand-anything plugin and squadron's analysis pack** installed for Claude Code, as `sq onboard` checks them per surface (440 D2, D10).
- **The PM, live, for the whole run,** and a repository the PM names (D1).
- A missing prerequisite when the run is due puts a `BLOCKED:` line on the run's task naming it.

### Interfaces Required
- **271:** `cf detect --path --json` (D3 report, D5 error envelope), `cf init --json` (D8), `cf prompt get brownfield-adoption --path --comprehension` with the Adoption Inputs section (D7). Contract reference: `docs/ADOPTION-PRIMITIVES.md`.
- **269:** outcome derivation from files alone; `cf next` navigates an adopted project to its first unbuilt slice.
- **263:** retroactive entries count as complete; `cf check`'s `retroactive-entry` rule; the review gate skips retroactive entries.
- **267:** `cf docs map`, run by the guide prompt during the architecture step.
- **240 review gate:** with `workflow.review_enabled` on, `cf next` gates the derived architecture before slice work (#132).
- **Squadron 440:** the `sq onboard --json` report, its step table (440 D1) and the `/sq:onboard` loop.

## Architecture

### Component Structure

No new cf components. The run exercises existing ones across three repositories:

```
PM ─ answers ─► Claude Code session in the adopted repo
                 │
                 ├─ /sq:onboard loop (squadron 440) ── sq onboard --json ──► cf detect --path --json   (271)
                 │     ask-adopt  ─► sq onboard register ──────────────────► cf init --json          (271 D8)
                 │     build-graph ─► plugin /understand
                 │     comprehension, concept ─► /sq:analysis understand …   (squadron 362, 363)
                 │     adopt      ─► sq onboard prompt ────────────────────► cf prompt get brownfield-adoption
                 │                     agent follows the guide prompt:       --path --comprehension    (271 D7)
                 │                     cf docs map, derived arch, existing-state plan,                (267, 263)
                 │                     rules offer (cf detect facts.ruleFiles)
                 │     handoff → cf-next (outcome already-planned)
                 │
                 └─ after hand-off: cf next ─► [review gate on the derived arch] ─► first new slice
                                     cf build (Phase 4) ─► slice design ─► cf validate design
```

Output kept in this repository: the run report (D7) and any fix commits (D6). Everything else stays in the adopted repository's working tree.

### Data Flow

The cf-owned hand-offs, in run order, are the D5 checks.

### State Management

None in cf. The adopted repository holds its own config, `project-documents/` and IDE files. The project stays registered after the run unless the PM asks for it to be removed, because the result is a real adoption the PM may keep (D1).

## Technical Decisions

### D1 — Repository and working copy
Status: decided
- The PM names the repository when the run starts (slice plan: "chosen by the PM"). The design sets constraints, not the choice:
  - `cf detect --path <root> --json` reports `brownfield`. An `adoption-incomplete` repository also qualifies; any other outcome does not.
  - The PM knows the codebase well enough to answer intent questions. That is the point of a live run: 265 answered from the repo's prose and could only write "unknown".
  - A primary git checkout, not a worktree. `sq onboard` excludes worktrees (440 D5).
  - Not context-forge, squadron or ai-project-guide. They are already planned.
- **Working copy.** The run uses a checkout the PM names, with a clean working tree recorded (`git status --short` empty) before the first step, so every write the adoption makes shows in `git status` afterwards. The operator creates no branch and commits nothing in the adopted repository. Keeping, committing or discarding the result is the PM's call.
- **Private code.** The repository may be private. Spend and data exposure for the graph build and the agent session are the PM's choice when naming it. The report then gives the name the PM approves and carries no code, artifact bodies or answers, only the checks and defect lines (D7).

### D2 — How the run is driven
Status: decided
- One interactive Claude Code session in the adopted repository, started with `/sq:onboard`. Claude Code is the surface `sq onboard` and cf both install commands for. Not headless: the PM answers in the session.
- **cf on PATH is the local build of the slice branch** (`273-slice.real-adoption-run-via-sq-onboard`, forked from the target, where D6's fix commits land). `sq onboard` calls `cf` from PATH. A shim first on PATH runs `node <context-forge>/packages/cli/dist/index.js "$@"`, so a fix rebuilt during the run applies on resume without a release. Its version and the branch commit go in the report. The real project store is used, not a temp `CONTEXT_FORGE_DATA_DIR`: the registration is real (D1).
- **Commands come from the project, not user level.** Machine-level cf commands at `~/.claude/commands/cf/` are the published recipe, and 271's walkthrough found they shadow project ones. The session runs with project-level commands installed by `cf init` (or `cf install-commands --local`), and `/sq:onboard` from the installed `sq`'s bundle. The report records where each command resolved from.
- **The PM role.** The PM answers every question: adopt or decline, the graph build, the concept confirmation, unknowns in intent, contradictions between code and docs, what comes next in the slice plan, the rules-reconciliation offer, and the slice design's open points. The operator never answers for the PM. Declining the reconciliation offer is fine; it is not part of the pass.
- **Hands-off rule.** Every step happens inside the session as `/sq:onboard`, the guide prompt or `cf next` directs. A run that needs a manual file or config edit to proceed has found a defect (D6). The only manual actions are the session break (D3), cf fixes (D6), and the PATH shim.

### D3 — One session break, to prove resume
Status: decided
- After squadron's concept step completes and the PM confirms the concept, the operator ends the session. A new session runs `/sq:onboard` again and must resume at `adopt` with no repeated step (440 D1, row 7). This also covers squadron's own walkthrough step 2.
- Nothing else is interrupted on purpose. A session that ends for any other reason resumes the same way, and the report notes where.

### D4 — The run continues past the hand-off to a slice design
Status: decided
- `sq onboard`'s hand-off to `cf next` is where squadron's live criterion ends (440). This slice's end state is later: the first new slice design (slice plan, arch Exit criterion).
- **Review gate.** If `cf next` gates on reviewing the derived architecture, the review is run through the project's review process as `cf next` names it (squadron is installed, so `sq review` is available; #132 is the CF-only case and stays open). The run never sets `review: none` or clears a gate by editing frontmatter. Whether the gate appeared, and with which `workflow.review_enabled` source, goes in the report. A gate that blocks even after a passing review is a defect.
- **Slice design.** `cf next` must name the first new (non-retroactive) entry of the existing-state plan. The operator then follows cf's normal Phase 4 path for that slice (`cf set slice`, `cf build`), and the agent writes the design from the template with the PM. The run ends when `cf validate design` exits 0 on it. Its frontmatter `dependencies` and Dependencies section name retroactive slices where the new work builds on them.
- The slice design's own review gate, task breakdown and implementation are not part of the run.

### D5 — Pass checks
Status: decided
The run passes when every check holds. Checks cover the composition points no fixture reaches. Behavior 268–272 test with fixtures is not re-checked; a run that happens to show it wrong still yields a defect (D6).

| # | Point | Check |
|---|---|---|
| 1 | Before the run | `cf detect --path <root> --json` gives `brownfield` (or `adoption-incomplete`), and the root isn't in `cf project list`. Running `sq onboard --path <root>` leaves `git status --short` and the project list unchanged. |
| 2 | Register | `sq onboard register` shows every `cf init` step `ok` or `skipped`, `registration: created`. A guide install that fails for network reasons is retried, not a defect. |
| 3 | Concept from cf | After the concept step, `cf detect --json` reports `artifacts.concept` as the file squadron's concept flow wrote, and `sq onboard` moves to `adopt`. |
| 4 | Resume | D3: the new session's first `sq onboard` reports `adopt`. |
| 5 | Prompt inputs | The adoption prompt the agent receives ends with `## Adoption Inputs` naming the newest comprehension doc and the concept; architecture and plan are `none`. (`sq onboard prompt` prints cf's stdout unchanged, so the operator checks the session's tool output.) |
| 6 | Artifacts | The agent ran `cf docs map`; `050-docs-map.{project}.md` exists and the architecture links it. The architecture has `provenance: derived`. The slice plan has retroactive entries and at least one unbuilt entry the PM supplied. `cf list slices --json` shows `retroactive: true` on the recorded entries, and `cf check` reports no error for them. Where the PM said an intent was unknown, the artifacts say "unknown". |
| 7 | Hand-off | `cf detect` reports `already-planned`, and `sq onboard` hands off to `cf next`. In between, if the session stops after the architecture, `cf detect` reports `adoption-incomplete` (observed if it happens, not forced). |
| 8 | First new slice | `cf next` (after any review gate, D4) recommends the first unbuilt entry, never a retroactive one and never Phase 0–3. |
| 9 | Design on the derived arch | The Phase 4 `cf build` output for that slice names the derived architecture and the slice plan as its inputs. The design passes `cf validate design`. |
| 10 | No stray writes | At the end, `git status` in the adopted repo shows only cf setup, adoption artifacts, the slice design, squadron's analysis files and the review file, if a review ran. |

### D6 — What gets fixed here, and what gets filed
Status: decided
265 D5's rules apply unchanged (cf defects fixed here with a failing test first, one commit each; constant tuning only with run evidence; design changes, new options and formats filed and told to the PM; guide and squadron defects filed in their repositories, never worked around in cf; a repeated agent misbehavior is a guide defect; every defect gets a report line). Two changes:
- **Scope:** "the initiative's cf code" means the adoption code as it stands after the rework (261, 263, 264, 266, 267, 268, 269, 271, 272). 266 is in scope because the guide prompt offers conventions reconciliation; it is exercised only if the PM accepts (D2).
- **Contract mismatch between cf and squadron:** the side that differs from 271's design (`docs/ADOPTION-PRIMITIVES.md`) owns the fix.

### D7 — The run report
Status: decided
- One document, `project-documents/user/analysis/260-analysis.real-adoption-run.md` (`docType: analysis`, `topic: real-adoption-run`), under the initiative's base index like 265's report. 265's report (`260-analysis.adoption-verification-runs.md`) is complete and records the old flow; it is not edited.
- Three parts:
  - **Setup:** repository (name as the PM approves; URL and commit if public), language, `cf --version` and branch commit, guide version, `sq` version and commit, where `/sq:onboard` and `/cf:*` resolved from, and the `workflow.review_enabled` value and source.
  - **Checks:** one row per D5 check, pass or defect, with the evidence in a few words.
  - **Defects:** one line each with its disposition and the excerpt that proves it. For a private repository, excerpts are cf or squadron output only.
- Plus one short **Notes for 274** list: what the slice design session lacked that the comprehension doc or docs map held, as observed. No proposals; 274 designs from it.
- Nothing else: no transcripts, artifact bodies or PM answers unless a defect line needs one.

### D8 — One run serves cf 273 and squadron 440
Status: decided
- Squadron 440's integration criterion is a live `/sq:onboard` run from detect to `already-planned`, then `cf next` at the first unbuilt slice, plus a resume. This run covers it (checks 1–8 and D3), so the PM answers one adoption, not two.
- The cf report is the record for this repository. Squadron defects are filed in squadron with the evidence, and the report's setup and check rows are what squadron's session needs to close its criterion. Telling squadron's session the run's result follows the project's agent-communication rule (Implementation Notes).
- If squadron runs its own live check first on a different repository, this run still happens: 440's run ends at the hand-off and has no PM-written slice design.

## Integration Points

### Provides to Other Slices
- **Initiative 260:** the exit criterion. When the run passes, the initiative's remaining planned work is 274.
- **274:** the run report's Notes for 274, and a real adopted project with a comprehension doc and docs map to design against.
- **Squadron 440:** evidence for its live criterion (D8), and issues for squadron-side defects.
- **ai-project-guide:** issues with run evidence for prompt defects.
- **#124, #132:** the guide version used and whether the review gate fired, as input.

### Consumes from Other Slices
- Everything 263–272 ships, as built. Where code and design differ, the run decides and D6 applies.
- **Squadron 440,** as built on the branch or release installed. A missing `sq onboard`, or one that can't reach `adopt` because of a squadron defect, blocks the run (`BLOCKED:` with the squadron issue). cf never steps in to drive adoption itself, because cf never invokes squadron and orchestrates nothing (PM 20261025).

## Success Criteria

### Functional Requirements
- One real repository, chosen by the PM, adopted through `/sq:onboard` with the PM answering live, passing every D5 check.
- The run ends with a slice design for the first new slice, built on the derived architecture, passing `cf validate design`.
- No manual edits to artifacts, config or state beyond what D2 allows.
- Every defect found has a disposition in the report: fixed here with a regression test, or an issue link.

### Technical Requirements
- Each cf fix has a test that failed before the fix, using the real input's format.
- After the last fix: `pnpm -r build`, format, lint, typecheck and the full test suite pass.
- This repository's own `cf build` and `cf next --json` are unchanged by the fixes.

### Integration Requirements
- The report records the evidence squadron's session needs for 440's live criterion, or names the squadron issue that blocks it. Closing 440 is squadron's call; 273 passing does not depend on it.
- If no cf fix was needed, the slice still completes; the report says "no cf defects".

### Verification Walkthrough

Draft; refined after the run. `<root>` is the repository the PM names, `<cf>` this repository. Expected results are the D5 checks named on each step; they are not repeated here.

1. **Prerequisites**
   ```bash
   cd <cf> && git checkout 273-slice.real-adoption-run-via-sq-onboard && pnpm -r build   # rebuild after each fix
   mkdir -p ~/cf273-bin && printf '#!/bin/sh\nexec node %s/packages/cli/dist/index.js "$@"\n' "$PWD" > ~/cf273-bin/cf && chmod +x ~/cf273-bin/cf
   export PATH=~/cf273-bin:$PATH && cf --version              # local build, record it
   sq onboard --help                                         # exists; record sq --version and commit
   ```
   If `sq onboard` is missing, the run is BLOCKED on squadron 440.

2. **Before (check 1)**
   ```bash
   cd <root> && git status --short && cf detect --json | jq .outcome
   cf project list --json > /tmp/cf273-proj.json && sq onboard --path <root>
   git status --short; cf project list --json | diff - /tmp/cf273-proj.json && echo unchanged
   ```

3. **First session (checks 2–3).** In `<root>`, start Claude Code with the shim on PATH and run `/sq:onboard`. The PM answers. Once the concept is written, `cf detect --json | jq .artifacts.concept` is set; end the session.

4. **Resume and adopt (checks 4–7).** New session, `/sq:onboard`; it starts at `adopt`. After the PM approves the architecture and plan:
   ```bash
   cf list slices --json | jq '.entries[] | {index, retroactive, status}'
   cf check && cf detect --json | jq .outcome                # no retroactive-entry errors; "already-planned"
   ```

5. **First new slice (checks 8–9).** `cf next` until it names the first unbuilt slice (running any review it names), then cf's Phase 4 path for that slice, and `cf validate design <design-path>` exits 0.

6. **After (check 10).** `git -C <root> status --short` lists only expected files. Write the run report (D7).

## Risk Assessment

### Technical Risks
- **The run waits on squadron.** 440 is not merged or released. Its fixtures were regenerated from real cf 0.19.20 output, which lowers the chance of a contract break, but the guide's v0.22.8 prompt and squadron's loop have never run together live.

### Mitigation Strategies
- Accept a branch install of squadron (Prerequisites). If the run stops on a squadron defect, the issue is filed and the run's task is `BLOCKED:` on it; cf takes no workaround (D6, ban). cf-side fixes go in at once, and the run resumes from the last step, because every step is computed from the files (440 D1).

## Implementation Notes

### Development Approach
1. Confirm prerequisites: target builds, guide ≥ v0.22.8 resolvable, `sq onboard` installed, the plugin and analysis pack installed for Claude Code. `BLOCKED:` on anything missing.
2. Before the run, send squadron's session a short note that this run will also serve 440's live criterion (D8), per the project's agent-communication rule (find the peer with `ListAgents`).
3. Run the Verification Walkthrough with the PM, fixing cf defects as they appear (D6).
4. Write the run report, then send squadron's session the result and any squadron issues.
5. After the last fix: build, format, lint, typecheck, full test suite.

Effort: 2/5. Calendar time is set by squadron 440 and the PM's availability, not cf work.
