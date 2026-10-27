---
docType: slice-design
slice: real-adoption-run-via-sq-onboard
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 271
- 272
interfaces:
- 274
dateCreated: 20261027
dateUpdated: 20261027
status: not_started
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

The cf-owned hand-offs D5 checks, in run order:

1. `cf detect` before anything: brownfield (or adoption-incomplete), unregistered, nothing written.
2. `cf init --json`: one JSON object on stdout, `ok: true`, read by `sq onboard register`.
3. After squadron's concept flow: `cf detect` reports `artifacts.concept`. Squadron learns the concept's path only from cf (440 D3).
4. `cf prompt get`: Adoption Inputs names the comprehension doc squadron passed and the concept cf found.
5. The agent's artifacts: `050-docs-map`, the `provenance: derived` architecture, and a slice plan with retroactive entries plus at least one new entry. `cf check` and `cf list slices --json` read them.
6. `cf detect` reports `already-planned`, so `sq onboard` hands off to `cf next`.
7. `cf next` reaches the first new slice, and the Phase 4 `cf build` includes the derived architecture and slice plan.

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
- **cf on PATH is the local build of the target.** `sq onboard` calls `cf` from PATH. A shim first on PATH runs `node <context-forge>/packages/cli/dist/index.js "$@"`, so a fix made during the run applies on resume without a release. Its version and the target commit go in the report. The real project store is used, not a temp `CONTEXT_FORGE_DATA_DIR`: the registration is real (D1).
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
| 8 | First new slice | `cf next` (after any review gate, D4) recommends the first unbuilt entry, never a retroactive one and never Phase 0–3. `workflow_next` agrees, checked once from an MCP client. |
| 9 | Design on the derived arch | The Phase 4 `cf build` output for that slice names the derived architecture and the slice plan as its inputs. The design passes `cf validate design`. |
| 10 | No stray writes | At the end, `git status` in the adopted repo shows only cf setup, adoption artifacts, the slice design and squadron's analysis files; nothing outside the repository changed except the cf project store and the review file, if a review ran. |

### D6 — What gets fixed here, and what gets filed
Status: decided
This follows 265 D5, with the scope moved to the reworked code.
- **cf defect in the adoption code as it stands** (261, 263, 264, 267, 268, 269, 271, 272): cf does something its design says it shouldn't, or fails on real input its design covers. Fixed in this slice: first a test that fails for the reason the run showed, using the real input's format, then the fix, one commit each. Then re-run the affected checks.
- **Contract mismatch between cf and squadron:** the side that differs from 271's design (`docs/ADOPTION-PRIMITIVES.md`) owns the fix. If cf differs, it is a cf defect above. If squadron differs, file it in squadron.
- **Constant tuning** (`BROWNFIELD_MIN_SOURCE_LINES`, `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS`, `MAX_WALK_ENTRIES`): only with evidence from the run in the report, and a fixture test at the new boundary.
- **A change to a decided design behavior, a new option, or a format change:** not made here. File an issue with the run evidence and tell the PM. If it blocks the end state, the run's task gets a `BLOCKED:` line.
- **Guide prompt defect** (the agent misreads correct Adoption Inputs, skips the docs map, invents intent, writes a malformed marker): issue in ai-project-guide with the prompt excerpt and the behavior. cf doesn't work around it in code.
- **Squadron or plugin defect** (a step that doesn't route, a comprehension doc that isn't found): issue in squadron, or the plugin's repository. cf doesn't work around it either.
- **cf defect outside the initiative:** issue, and continue.
- **Agent misbehavior on correct inputs:** repeat the step once. A second occurrence is a guide-prompt defect.
- Every defect gets a line in the report with its fix commit or issue link.

### D7 — The run report
Status: decided
- One document, `project-documents/user/analysis/260-analysis.real-adoption-run.md` (`docType: analysis`, `topic: real-adoption-run`), under the initiative's base index like 265's report. 265's report (`260-analysis.adoption-verification-runs.md`) is complete and records the old flow; it is not edited.
- Three parts:
  - **Setup:** repository (name as the PM approves; URL and commit if public), language, `cf --version` and target commit, guide version, `sq` version and commit, where `/sq:onboard` and `/cf:*` resolved from, and the `workflow.review_enabled` value and source.
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
- The report gives squadron's session enough to close 440's live criterion, or names the squadron issue that blocks it.
- If no cf fix was needed, the slice still completes; the report says "no cf defects".

### Verification Walkthrough

Draft; refined after the run. `<root>` is the repository the PM names, `<cf>` this repository. The shim makes `cf` the local build.

1. **Prerequisites**
   ```bash
   cd <cf> && git checkout main && pnpm -r build
   mkdir -p ~/cf273-bin && printf '#!/bin/sh\nexec node %s/packages/cli/dist/index.js "$@"\n' "$PWD" > ~/cf273-bin/cf && chmod +x ~/cf273-bin/cf
   export PATH=~/cf273-bin:$PATH && cf --version              # local build, record it
   sq onboard --help                                         # exists; record sq --version and commit
   ```
   If `sq onboard` is missing, the run is BLOCKED on squadron 440.

2. **Before (check 1)**
   ```bash
   cd <root> && git status --short                           # empty
   cf detect --json | jq '.outcome, .facts.source'          # "brownfield"
   cf project list --json > /tmp/cf273-proj.json
   sq onboard --path <root>                                  # Next: ask-adopt
   git status --short; cf project list --json | diff - /tmp/cf273-proj.json && echo unchanged
   ```

3. **Adoption, first session (checks 2–3).** In `<root>`, start Claude Code with the shim on PATH and run `/sq:onboard`. The PM answers yes to adopt and to the graph build, then confirms or corrects the concept. Once the concept is written:
   ```bash
   cf detect --json | jq '.outcome, .artifacts.concept'      # concept path set
   sq onboard --json | jq '.next.step'                       # "adopt"
   ```
   End the session.

4. **Resume and adopt (checks 4–7).** New session, `/sq:onboard`. Expect it to start at `adopt`, fetch the prompt (the tool output ends with `## Adoption Inputs`), run `cf docs map`, and write the architecture and slice plan with the PM. Then:
   ```bash
   cf list slices --json | jq '.entries[] | {index, name, retroactive, status}'
   cf check                                                  # no retroactive-entry errors
   cf detect --json | jq .outcome                            # "already-planned"
   ```

5. **First new slice (checks 8–9)**
   ```bash
   cf next                                                   # review gate on the derived arch, or the first unbuilt slice
   ```
   Run any review it names, then `cf next` again until it names the first unbuilt slice. Call `workflow_next` once from an MCP client and compare. Follow cf's Phase 4 path for that slice; confirm the `cf build` output lists the derived architecture and slice plan. The agent writes the design with the PM. Then:
   ```bash
   cf validate design project-documents/user/slices/<nnn>-slice.<name>.md   # PASS, exit 0
   ```

6. **After (check 10)**
   ```bash
   git -C <root> status --short                              # only expected adoption and design files
   ```
   Write the run report (D7).

## Risk Assessment

### Technical Risks
- **The run waits on squadron.** 440 is not merged or released. Its fixtures were regenerated from real cf 0.19.20 output, which lowers the chance of a contract break, but the guide's v0.22.8 prompt and squadron's loop have never run together live.

### Mitigation Strategies
- Accept a branch install of squadron (Prerequisites). If the run stops on a squadron defect, the issue is filed and the run's task is `BLOCKED:` on it; cf takes no workaround (D6, ban). cf-side fixes go in at once, and the run resumes from the last step, because every step is computed from the files (440 D1).

## Implementation Notes

### Development Approach
1. Confirm prerequisites: target builds, guide ≥ v0.22.8 resolvable, `sq onboard` installed, the plugin and analysis pack installed for Claude Code. `BLOCKED:` on anything missing.
2. Before the run, send squadron's session a short note that this run will also serve 440's live criterion (D8), per the project's agent-communication rule (find the peer with `ListAgents`).
3. The PM names the repository; check D1's constraints with walkthrough step 2.
4. Run the adoption (walkthrough steps 3–4), fixing cf defects as they appear (D6) and resuming.
5. Continue to the first new slice design (step 5).
6. Write the run report, then send squadron's session the result and any squadron issues.
7. After the last fix: build, format, lint, typecheck, full test suite.

Effort: 2/5. Calendar time is set by squadron 440 and the PM's availability, not cf work.

### Special Considerations
- **The PM's real repository.** The run writes setup files and artifacts into a real checkout. The clean-tree start (D1) makes them reviewable and discardable with git. The operator commits nothing there.
- **Spend.** The graph build and the agent sessions are pre-authorized as LLM spend. Whether a private codebase may be sent through them is the PM's decision in naming it (D1).
