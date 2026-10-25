---
docType: slice-plan
parent: project-documents/user/architecture/260-arch.brownfield-adoption.md
project: context-forge
dateCreated: 20261020
dateUpdated: 20261025
status: in_progress
---

# Slice Plan: Brownfield Adoption

## Parent Document
`project-documents/user/architecture/260-arch.brownfield-adoption.md`

## Migration / Refactoring Slices
1. [x] **(260) Onboarding Consolidation** — Replace the three hand-written onboarding recipes (`packages/cli/commands/cf/onboard.md`, the Codex `cf-onboard` skill, and the `agent_onboard` text in `agentOnboardTool.ts`) with one cf-owned source rendered to each surface. The recipe shrinks to setup (registration check, `cf init`, or the MCP `project_create`/`guide_install` fallback) followed by "run `cf build` and follow it" (`context_build` on the MCP-only path). The `/setup-ci` offer leaves onboard and moves to `cf next`, and CI recognition stops keying on the single filename `.github/workflows/ci.yml`.
   - **Value:** ends the drift between three copies, and leaves onboarding with no methodology content, so brownfield needs no onboard changes at all.
   - **Success criteria:** the three surfaces come from one source, and a test fails if a rendered copy diverges from it. A greenfield run behaves as today: setup, then the concept conversation (the opener now comes from the guide's concept prompt, v0.22.0+). `cf next` offers `/setup-ci` once a stack is detected and no CI is recognized. An existing CI workflow under another name is recognized.
   - **Dependencies:** none in this repo. Guide ≥ v0.22.2, the initiative minimum. The concept-prompt opener shipped in v0.22.0.
   - **Interfaces:** provides the single onboarding source; consumes `cf build` / `context_build` unchanged.
   - **Risk:** Low. **Effort:** 2/5

## Foundation Work
2. [x] **(261) Detection and Adoption State** — The core detection report (source volume, history, docs, ADRs, CI, rule files) and the mapping to one outcome, checked in order: adoption in progress → already planned (an initiative plan, arch or slice plan exists; a concept alone doesn't count) → brownfield or greenfield from code signals. Includes a user override in both directions, detection scoped to the project folder (monorepo subdirectories), and a persisted adoption state owned by core. `cf build` and `context_build` select the `brownfield-adoption` profile for brownfield or in-progress adoption, and append the "Adoption Facts" section after the instruction prompt, outside the template. Until 262 lands, that section states that squadron was not probed. If the installed guide lacks the profile, the build fails with a named error and never falls back to the greenfield prompt.
   - **Value:** the one decision every other slice consumes, and a working CF-only brownfield path end to end with guide v0.22.2.
   - **Success criteria:** each outcome is reachable and covered by tests, including scaffold-only repos, shallow clones and a monorepo subdirectory. The override works both ways. Adoption state persists and resumes across sessions. A missing profile produces the named error. CLI and MCP produce identical builds.
   - **Dependencies:** none in this repo. Guide ≥ v0.22.2.
   - **Interfaces:** provides the detection report, the outcome and the adoption state (consumed by 262–264, 266, 267). Consumes the guide's `brownfield-adoption` profile.
   - **Risk:** Medium (thresholds must not misfire). **Effort:** 3/5

## Feature Slices (in implementation order)
3. [x] **(262) Squadron Path** — *Superseded by the 20261025 ban on cf invoking squadron; its code is removed by 268 and 271.* Run `sq probe --json`, validate `probe_version`, and carry the probe JSON verbatim in the Adoption Facts section. A missing `sq`, an unknown version or unreadable output becomes a plain "squadron unavailable" statement, never a silent skip. Resolve the new `fileComprehension` variable to squadron 362's `{n}-analysis.codebase-comprehension.md` by filename and `docType`, passing nothing when none exists. cf never interprets `surfaces`: the agent checks its own surface against them. The probe exits 0 even when a field can't be determined; it writes such a field as null and puts a warning on stderr. cf therefore carries the probe's stderr warnings into the Adoption Facts alongside the JSON, so a null field is never left unexplained. Contract readings from squadron 366's design (squadron-brownfield 4b3afa91): `graph.path` is null whenever `graph.present` is false; `analysis_skill_installed` requires a 366-era dispatcher; `understand_plugin_installed` means installed, not enabled.
   - **Value:** makes squadron the normal adoption path wherever its probe lists the surface.
   - **Success criteria:** tests check the probe's field names against squadron's `capability-probe-contract.md`. Every probe outcome yields the right Adoption Facts text. `fileComprehension` resolves when present and is absent otherwise, with no placeholder.
   - **Dependencies:** 261. External: squadron's probe, which ships after squadron slice 366.
   - **Interfaces:** consumes the probe contract (`probe_version` 1, squadron commit 32b3c609). Provides `fileComprehension`.
   - **Risk:** Medium (cross-repo contract). **Effort:** 2/5
4. [x] **(263) Retroactive Marker and Existing-State Slice Plan** — Define how a slice plan entry is marked retroactive, and parse it. Retroactive entries count as complete for every "done" check, and the code-review gate skips them rather than passing them, which amends the 240 gate rule. A retroactive entry with a slice design or task file is a checker error. The derived architecture carries provenance marking it as derived. Adoption state moves to complete once the existing-state slice plan is written; the slice design settles the mechanism. The design also settles the absolute index scheme for retroactive entries, constrained by the arch's rule that they precede new work, and permits a single coarse "existing system" entry.
   - **Value:** an adopted project's plan records what exists without tripping the review gate or opening a loophole around it.
   - **Success criteria:** a retroactive entry counts as complete in navigation and in `cf check`. The review gate skips it and never reports it as reviewed. A retroactive entry with a design or task file is a checker error. Adoption state reaches complete.
   - **Dependencies:** 261.
   - **Interfaces:** provides the marker spec. ai-project-guide writes its rule from it (briefing item 6), and squadron's pipeline gates and 364 "candidates adopt" consume it.
   - **Risk:** Medium (touches the gate and the plan parser). **Effort:** 3/5
5. [x] **(264) Brownfield-Aware cf next** — The workflow navigator reads the adoption state. While adoption is in progress, it recommends the next adoption step. Once adoption is complete, it recommends the first new work item instead of Phase 0, and first-run logic tells an adopted project from a fresh one.
   - **Value:** the initiative's goal: after adoption, `cf next` points at new work.
   - **Success criteria:** in-progress, complete and greenfield projects each get the correct recommendation, and `workflow_next` matches it. Navigation for already-planned projects is unchanged.
   - **Dependencies:** 261, 263.
   - **Interfaces:** consumes the adoption state and the retroactive marker.
   - **Risk:** Low. **Effort:** 2/5

## Integration Work
6. [x] **(265) End-to-End Adoption Verification and Docs** — Run adoption on real repositories: one with squadron on a surface the probe lists, one CF-only, and a greenfield regression run. Fix what those runs expose. Document the adoption flow, the override, the adoption state and the Adoption Facts section in the README and CLI references.
   - **Value:** proof that the parts compose on real input rather than fixtures.
   - **Success criteria:** each run reaches "`cf next` points at new work" with correct artifacts. The greenfield run matches today's flow. The docs describe what shipped.
   - **Dependencies:** 260–264.
   - **Risk:** Low. **Effort:** 2/5

## Later Feature Slices
These aren't needed for the core goal and follow the integration slice.

7. [x] **(266) Conventions Reconciliation** — Enumerate where the project's existing rules (CLAUDE.md, AGENTS.md, rule files) disagree with the guide's rules; the comparison is agent work driven by a guide prompt. Record the PM's resolution for each conflict, keyed by rule file identity and never by heading text. `setup-ide` applies stored resolutions deterministically, so a re-run doesn't re-introduce them. Must work with issue #123's CLAUDE.md/AGENTS.md audience split; the slice design settles whether #123 lands first or is folded in.
   - **Value:** adoption no longer silently merges contradictory instructions into one file.
   - **Success criteria:** conflicts are listed for PM decision. Resolutions persist and survive `setup-ide` re-runs. A guide wording change doesn't break a stored resolution.
   - **Dependencies:** 261. Coordinated with #123.
   - **Interfaces:** provides a new persisted resolution format, and needs a guide-side reconciliation prompt.
   - **Risk:** High (semantic comparison, new persisted format). **Effort:** 4/5
8. [x] **(267) Docs and ADR Mapping** — Link existing docs and ADRs into the project-documents structure in place, without moving them. Introspection and `cf check` tolerate artifacts that point outside `project-documents/`.
   - **Value:** an adopted project's existing design material is reachable from CF's artifacts without breaking inbound links or tooling.
   - **Success criteria:** mapped material is discoverable from project-documents. No original file is moved or modified. `cf check` raises no findings for out-of-tree references.
   - **Dependencies:** 261. Guide follow-up, non-blocking: ai-project-guide documents the docs map filename after cf specifies it.
   - **Risk:** Medium. **Effort:** 3/5

## Rework: Adoption Out of cf, Waiting for sq onboard (PM decision 20261025, critical)
Shipped 261–264 put adoption inside `cf build`. A Phase 0 build scans the repo, writes `adoption.state` as a side effect, swaps the concept prompt for the adoption prompt, and later "records adoption complete" when it sees a retroactive plan entry. `cf next` carries a per-step adoption guide (~240 lines in `adoptionNavigation.ts` plus routing) that the 265 runs never exercised live. cf also runs and parses squadron's probe. Everywhere else, `cf build` assembles context for a phase; here it became a hidden state machine.

**Direction:** adoption is orchestrated by `sq onboard`, which squadron builds once this core is stable. cf orchestrates nothing.

**Ban (PM 20261025): cf never invokes squadron.** Squadron calls cf, never the reverse. cf runs no squadron command, parses no squadron output and hard-codes none of squadron's file names. When cf needs a squadron artifact, squadron passes the path in. Every trace of cf driving squadron is removed by this rework: the probe code (gone in 268), the comprehension filename lookup (271), and the guide prompt's probe branching and squadron steps (272). Its part is a few read-only primitives, plus the artifacts adoption writes (retroactive entries, docs map, registered architecture and plan), which cf already understands. Until `sq onboard` exists, adoption is parked. `/cf:onboard` gets no brownfield path, and cf neither starts nor half-runs an adoption.

9. [x] **(268) Pure cf build** — Remove the adoption resolver from `cf build`, `context_build` and `template_preview`: `ContextIntegrator.resolveAdoptionFn`, the Adoption Facts section in `ContextTemplateEngine`, the brownfield profile swap, and both state writes. A Phase 0 build selects the concept prompt and has no side effects, the same as every other phase. Delete the code only build-time adoption used. Keep `MIN_GUIDE_VERSION` and its build warning, which are not adoption logic.
   - **Value:** `cf build` means one thing again: assemble context for the current phase. No hidden writes.
   - **Success criteria:** no `cf build`, `context_build` or `template_preview` path reads or writes adoption state, runs detection or probes squadron. A test asserts that a build in a brownfield repo writes nothing to config. Greenfield builds are byte-identical to before. CLI and MCP builds match.
   - **Dependencies:** none.
   - **Risk:** Medium (the guide's current brownfield prompt tells agents to run `cf build`; 272 aligns it). **Effort:** 2/5
10. [ ] **(269) Collapse Adoption State** — Replace the four-value `adoption.state` (`""`, `in_progress`, `complete`, `declined`) with what the filesystem already says. Brownfield means code and no planning artifacts. A derived architecture without a retroactive slice plan means adoption is incomplete. Once a slice plan has a retroactive entry, the project is planned (arch Detection section, amended 20261025). Keep only an explicit opt-out ("treat this as new"). The slice design settles whether that keeps `declined` under the same key or uses a new boolean. Existing `in_progress` and `complete` values are ignored with a notice, never an error. Delete the state transitions, completion detection and their tests. Also carries the former 270: delete the per-step adoption guidance (`adoptionNavigation.ts`, `routeAdoption` in `WorkflowNavigator`, and the "run `cf build` to record adoption" advice). A project with code, no planning artifacts and no opt-out gets one line saying adoption arrives with `sq onboard`, and how to opt out. An incomplete adoption gets one line saying it resumes through `sq onboard`. An adopted project is navigated like any other planned project; retroactive entries already count as complete, so `cf next` points at the first unbuilt slice. `workflow_next` matches.
   - **Value:** no stored state that can drift from the files, and a large cut in code and rules.
   - **Success criteria:** detection gives the same outcome from files alone. The opt-out works. Configs already holding `in_progress` or `complete` keep working with no hand edit. `cf check` and `cf config get` describe only the remaining value. `cf next` and `workflow_next` give the one line for an unadopted brownfield repo or an incomplete adoption and normal navigation otherwise, and no adoption-specific routing remains in the navigator.
   - **Dependencies:** 268.
   - **Risk:** Medium (config key semantics change for shipped 0.19.x users). **Effort:** 3/5
11. ~~**(270) Remove Adoption Navigation from cf next**~~ — Folded into 269 (PM 20261025), so navigation is rewired and deleted once and no release ships navigation that points at `cf build` for adoption. The index stays unused.
12. [ ] **(271) Adoption Primitives for sq onboard** — Two read-only primitives for `sq onboard` to call, and nothing that orchestrates. **(a) Project state:** one CLI command and MCP tool returning JSON: greenfield, brownfield or already planned, plus the detection facts (source volume labelled as a floor, history, docs, ADRs, CI, rule files). It writes nothing and makes no squadron decisions. cf owns it because "already planned" means cf artifacts exist. `cf init` uses the same core function to print one line when it finds an existing codebase. `/cf:onboard`, its Codex variant and `agent_onboard` read the report and stop before the concept conversation on a brownfield repo, printing one message: adoption needs `sq onboard`, plus how to opt out. The report carries a `reportVersion` field (arch: cf ↔ squadron contract), plus `artifacts` (paths of the concept, derived architectures and existing-state plan that exist). Paths are relative to the project root, the report works on an unregistered directory, and errors are a JSON object with a stable code and a non-zero exit. `cf init` gains `--json` (project id plus each step's result) and exits non-zero when a step fails; today a failed guide install only warns (PM 20261025, from squadron's contract review). **(b) Prompt delivery:** the guide's adoption prompt by key, with the comprehension doc's path as squadron passes it. With no path, the prompt says so plainly; a path that doesn't exist is a named error. Check first whether `cf prompt get` accepting the path is all this needs. Delete `detection/comprehensionAnalysis.ts`, its test and the `COMPREHENSION_PROFILE_VARIABLE` export (review 268 F004): cf no longer searches for squadron's file. Delete cf's squadron probe code (262): running `sq probe`, `probe_version` checks and the probe JSON in the facts (done in 268, D3, because the build was its only consumer). Squadron owns graphs and comprehension. The slice design settles command names, and how the guide's `brownfield-adoption` context profile is delivered now that `cf build` no longer selects it.
   - **Value:** `sq onboard` gets exactly what it needs from cf, with no logic duplicated across the two repos and nothing to unwind later.
   - **Success criteria:** the state command and its MCP tool return matching JSON and write nothing. The prompt fills the comprehension path squadron passes and says plainly when none is given. No cf code runs or parses `sq probe`, and none names squadron's comprehension file pattern. `cf init` and the state command share one detection function.
   - **Dependencies:** 269 (no stored state to report).
   - **Risk:** Low–Medium (the contract squadron will build against; confirm it with the sq session before design is final). **Effort:** 2/5
13. [ ] **(272) Docs and Guide Alignment** — README, CLI and MCP references describe the reworked state: adoption arrives with `sq onboard`, the opt-out exists, and the primitives are there for squadron. Coordinate with ai-project-guide so its brownfield prompt and adoption guide drop every `cf build` step, the raw-probe branching and path choice, the squadron step list ("start squadron's analysis"), "Context Forge selects it", and the Adoption Facts references. Rewrite the README's adoption section, which still shows a `cf build` run with an Adoption Facts example. Refresh the guide copies in the test fixtures and drop the comprehension-doc setup in `pureBuild.test.ts`. Raise `MIN_GUIDE_VERSION` to the guide release that carries that. Send squadron the primitives contract (271) for `sq onboard`.
   - **Value:** nothing in cf, the guide or the docs points at the removed `cf build` behavior.
   - **Success criteria:** no doc or guide prompt tells anyone to run `cf build` for adoption, and no guide prompt delivered by cf tells the agent to run squadron. The squadron session has the 271 contract.
   - **Dependencies:** 268, 269, 271. External: ai-project-guide prompt update.
   - **Risk:** Low. **Effort:** 1/5

**Parked until `sq onboard` exists:**

14. [ ] **(273) Real Adoption Run via sq onboard** — One adoption on a real repository chosen by the PM, with the PM answering live (not scripted), through to the first new slice design built on the derived architecture. Fix or file what it finds.
   - **Dependencies:** 271, 272. External: `sq onboard`.
   - **Risk:** Medium. **Effort:** 2/5
15. [ ] **(274) Carry Codebase Comprehension into Later Phases** — Today the comprehension doc is in only one guide context profile, `brownfield-adoption`. Architecture and slice-design builds never see it, and neither does the docs map (#135). The graph's understanding is used once, condensed into the derived architecture, and then never seen again, and nothing refreshes it as the code changes. Make the comprehension doc and the docs map available to the phases that do later design work (architecture, slice planning, slice design), and decide how they are kept current. cf learns the comprehension doc's location from a cf-owned field that squadron sets, never by searching for squadron's files. This entry is an umbrella and is expected to split into several slices at design time.
   - **Value:** adoption improves every later design session, not just the first afternoon. This is the benefit that justifies adoption at all.
   - **Success criteria:** after adoption, an architecture or slice-design build includes the comprehension doc and the docs map when they exist, and says so plainly when they don't. Staleness is detectable, and the way to refresh is named.
   - **Dependencies:** 273. External: ai-project-guide context profiles (new variables), squadron (refresh of the graph and the comprehension doc).
   - **Risk:** Medium (three-repo contract; staleness rules). **Effort:** 3/5 as an umbrella; real effort is set when it splits.

**Squadron is the only supported adoption path (PM decision 20261025).** There is no CF-only branch, prompt path or verification. The rework removes the CF-only special cases it touches instead of carrying them forward. A proper CF-only path is low-priority Future Work.

**Deliberately not in this rework:** retroactive slice entries (cf check, the review gate and the plan parser; consumed by ai-project-guide and squadron as a cross-repo contract), conventions reconciliation (266), the docs map (267), and #123. Each stands on its own and is not part of the `cf build` and `cf next` problem.

## Notes
- **Ban 20261025 (PM):** cf never invokes squadron. This supersedes 262 and the 20261022 journal entry that accepted cf running `sq probe`.
- **Reversed 20261025 (PM):** the arch's adoption flow, in which onboard hands off to `cf build` and `cf build` selects the brownfield prompt and holds adoption state, no longer holds. Adoption is orchestrated by `sq onboard`, and cf provides read-only primitives (271). The cf/squadron responsibility split changes with it: cf no longer runs the squadron probe. The arch was amended to match (20261025). The settled list below is superseded where it conflicts.
- **Settled in the arch (don't relitigate in slice design):** onboarding is setup plus a handoff, with no brownfield logic in the recipe. Squadron is the only adoption path, and `sq onboard` asks the PM once, before a paid graph build. The CF/squadron responsibility split is PM approved 20261020 and amended 20261025. (The earlier Adoption Facts and brownfield-profile rules died with 268.)
- **Cross-repo state:** ai-project-guide v0.22.1 ships the profile, the prompt, the concept opener and the adoption guide. Its retroactive-marker rule waits on 263's spec. Squadron's probe is internal to squadron; its cf-facing contract is deprecated (squadron 02f4b753). Squadron initiative 440 is re-scoped to `sq onboard` (squadron 0017d867) and depends on cf 271.
- **Review status:** the 260 arch review (CONCERNS, 11 findings) is addressed in the arch revision. No re-review has been run.
- No migration of user data: the adoption state and the retroactive marker are new formats, and no existing format changes.

## Future Work
Items to be added here as they arise during slice design, task breakdown, or implementation.

- **CF-only adoption path (low priority, PM 20261025):** adoption without squadron. Deferred; until then a project without squadron is told adoption needs squadron.

- **From slice 266 (conventions reconciliation):**
  - A `cf next` recommendation to run reconciliation when rule files are present and no resolutions are recorded.
  - MCP tools for `rules inventory` and `rules resolve` (a later MCP surface would move `delivered()` and its exclusion input to core).
  - A "not a conflict" record, so the agent stops re-raising a pair the PM judged compatible (#125).
  - A command to remove a resolution; today it is a hand edit of the JSON file (#126).
  - Issue #123's audience split: extend the single `delivered()` predicate with a target parameter.
