---
docType: slice-plan
parent: project-documents/user/architecture/260-arch.brownfield-adoption.md
project: context-forge
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
---

# Slice Plan: Brownfield Adoption

## Parent Document
`project-documents/user/architecture/260-arch.brownfield-adoption.md`

## Migration / Refactoring Slices
1. [ ] **(260) Onboarding Consolidation** — Replace the three hand-written onboarding recipes (`packages/cli/commands/cf/onboard.md`, the Codex `cf-onboard` skill, and the `agent_onboard` text in `agentOnboardTool.ts`) with one cf-owned source rendered to each surface. The recipe shrinks to setup (registration check, `cf init`, or the MCP `project_create`/`guide_install` fallback) followed by "run `cf build` and follow it" (`context_build` on the MCP-only path). The `/setup-ci` offer leaves onboard and moves to `cf next`, and CI recognition stops keying on the single filename `.github/workflows/ci.yml`.
   - **Value:** ends the drift between three copies, and leaves onboarding with no methodology content, so brownfield needs no onboard changes at all.
   - **Success criteria:** the three surfaces come from one source, and a test fails if a rendered copy diverges from it. A greenfield run behaves as today: setup, then the concept conversation (the opener now comes from the guide's concept prompt, v0.22.0+). `cf next` offers `/setup-ci` once a stack is detected and no CI is recognized. An existing CI workflow under another name is recognized.
   - **Dependencies:** none in this repo. Guide ≥ v0.22.1, the initiative minimum. The concept-prompt opener shipped in v0.22.0.
   - **Interfaces:** provides the single onboarding source; consumes `cf build` / `context_build` unchanged.
   - **Risk:** Low. **Effort:** 2/5

## Foundation Work
2. [ ] **(261) Detection and Adoption State** — The core detection report (source volume, history, docs, ADRs, CI, rule files) and the mapping to one outcome, checked in order: adoption in progress → already planned (an initiative plan, arch or slice plan exists; a concept alone doesn't count) → brownfield or greenfield from code signals. Includes a user override in both directions, detection scoped to the project folder (monorepo subdirectories), and a persisted adoption state owned by core. `cf build` and `context_build` select the `brownfield-adoption` profile for brownfield or in-progress adoption, and append the "Adoption Facts" section after the instruction prompt, outside the template. Until 262 lands, that section states that squadron was not probed. If the installed guide lacks the profile, the build fails with a named error and never falls back to the greenfield prompt.
   - **Value:** the one decision every other slice consumes, and a working CF-only brownfield path end to end with guide v0.22.1.
   - **Success criteria:** each outcome is reachable and covered by tests, including scaffold-only repos, shallow clones and a monorepo subdirectory. The override works both ways. Adoption state persists and resumes across sessions. A missing profile produces the named error. CLI and MCP produce identical builds.
   - **Dependencies:** none in this repo. Guide ≥ v0.22.1.
   - **Interfaces:** provides the detection report, the outcome and the adoption state (consumed by 262–264, 266, 267). Consumes the guide's `brownfield-adoption` profile.
   - **Risk:** Medium (thresholds must not misfire). **Effort:** 3/5

## Feature Slices (in implementation order)
3. [ ] **(262) Squadron Path** — Run `sq probe --json`, validate `probe_version`, and carry the probe JSON verbatim in the Adoption Facts section. A missing `sq`, an unknown version or unreadable output becomes a plain "squadron unavailable" statement, never a silent skip. Resolve the new `fileComprehension` variable to squadron 362's `{n}-analysis.codebase-comprehension.md` by filename and `docType`, passing nothing when none exists. cf never interprets `surfaces`: the agent checks its own surface against them.
   - **Value:** makes squadron the normal adoption path wherever its probe lists the surface.
   - **Success criteria:** tests check the probe's field names against squadron's `capability-probe-contract.md`. Every probe outcome yields the right Adoption Facts text. `fileComprehension` resolves when present and is absent otherwise, with no placeholder.
   - **Dependencies:** 261. External: squadron's probe, which ships after squadron slice 366.
   - **Interfaces:** consumes the probe contract (`probe_version` 1, squadron commit 32b3c609). Provides `fileComprehension`.
   - **Risk:** Medium (cross-repo contract). **Effort:** 2/5
4. [ ] **(263) Retroactive Marker and Existing-State Slice Plan** — Define how a slice plan entry is marked retroactive, and parse it. Retroactive entries count as complete for every "done" check, and the code-review gate skips them rather than passing them, which amends the 240 gate rule. A retroactive entry with a slice design or task file is a checker error. The derived architecture carries provenance marking it as derived. Adoption state moves to complete once the existing-state slice plan is written; the slice design settles the mechanism. The design also settles the absolute index scheme for retroactive entries, constrained by the arch's rule that they precede new work, and permits a single coarse "existing system" entry.
   - **Value:** an adopted project's plan records what exists without tripping the review gate or opening a loophole around it.
   - **Success criteria:** a retroactive entry counts as complete in navigation and in `cf check`. The review gate skips it and never reports it as reviewed. A retroactive entry with a design or task file is a checker error. Adoption state reaches complete.
   - **Dependencies:** 261.
   - **Interfaces:** provides the marker spec. ai-project-guide writes its rule from it (briefing item 6), and squadron's pipeline gates and 364 "candidates adopt" consume it.
   - **Risk:** Medium (touches the gate and the plan parser). **Effort:** 3/5
5. [ ] **(264) Brownfield-Aware cf next** — The workflow navigator reads the adoption state. While adoption is in progress, it recommends the next adoption step. Once adoption is complete, it recommends the first new work item instead of Phase 0, and first-run logic tells an adopted project from a fresh one.
   - **Value:** the initiative's goal: after adoption, `cf next` points at new work.
   - **Success criteria:** in-progress, complete and greenfield projects each get the correct recommendation, and `workflow_next` matches it. Navigation for already-planned projects is unchanged.
   - **Dependencies:** 261, 263.
   - **Interfaces:** consumes the adoption state and the retroactive marker.
   - **Risk:** Low. **Effort:** 2/5

## Integration Work
6. [ ] **(265) End-to-End Adoption Verification and Docs** — Run adoption on real repositories: one with squadron on a surface the probe lists, one CF-only, and a greenfield regression run. Fix what those runs expose. Document the adoption flow, the override, the adoption state and the Adoption Facts section in the README and CLI references.
   - **Value:** proof that the parts compose on real input rather than fixtures.
   - **Success criteria:** each run reaches "`cf next` points at new work" with correct artifacts. The greenfield run matches today's flow. The docs describe what shipped.
   - **Dependencies:** 260–264.
   - **Risk:** Low. **Effort:** 2/5

## Later Feature Slices
These aren't needed for the core goal and follow the integration slice.

7. [ ] **(266) Conventions Reconciliation** — Enumerate where the project's existing rules (CLAUDE.md, AGENTS.md, rule files) disagree with the guide's rules; the comparison is agent work driven by a guide prompt. Record the PM's resolution for each conflict, keyed by rule file identity and never by heading text. `setup-ide` applies stored resolutions deterministically, so a re-run doesn't re-introduce them. Must work with issue #123's CLAUDE.md/AGENTS.md audience split; the slice design settles whether #123 lands first or is folded in.
   - **Value:** adoption no longer silently merges contradictory instructions into one file.
   - **Success criteria:** conflicts are listed for PM decision. Resolutions persist and survive `setup-ide` re-runs. A guide wording change doesn't break a stored resolution.
   - **Dependencies:** 261. Coordinated with #123.
   - **Interfaces:** provides a new persisted resolution format, and needs a guide-side reconciliation prompt.
   - **Risk:** High (semantic comparison, new persisted format). **Effort:** 4/5
8. [ ] **(267) Docs and ADR Mapping** — Link existing docs and ADRs into the project-documents structure in place, without moving them. Introspection and `cf check` tolerate artifacts that point outside `project-documents/`.
   - **Value:** an adopted project's existing design material is reachable from CF's artifacts without breaking inbound links or tooling.
   - **Success criteria:** mapped material is discoverable from project-documents. No original file is moved or modified. `cf check` raises no findings for out-of-tree references.
   - **Dependencies:** 261.
   - **Risk:** Medium. **Effort:** 3/5

## Notes
- **Settled in the arch (don't relitigate in slice design):** onboarding is setup plus a handoff, with no brownfield logic in the recipe. Squadron is the normal path. `/understand` (the probe's `graph_build`) is the only step that asks the PM, once. A missing Adoption Facts section stops the prompt. A missing brownfield profile fails the build. The CF/squadron responsibility split is PM approved 20261020.
- **Cross-repo state:** ai-project-guide v0.22.1 ships the profile, the prompt, the concept opener and the adoption guide. Its retroactive-marker rule waits on 263's spec. Squadron's probe contract is locked (`probe_version` 1, squadron commit 32b3c609), but the probe isn't built and ships after squadron 366. Only 262 waits on it.
- **Review status:** the 260 arch review (CONCERNS, 11 findings) is addressed in the arch revision. No re-review has been run.
- No migration of user data: the adoption state and the retroactive marker are new formats, and no existing format changes.

## Future Work
Items to be added here as they arise during slice design, task breakdown, or implementation.
