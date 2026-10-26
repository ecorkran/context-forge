---
docType: slice-design
slice: docs-and-guide-alignment
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 268
- 269
- 271
interfaces:
- 273
dateCreated: 20261026
dateUpdated: 20261026
status: not_started
turns: 61
promptTokens: 5564830
cachedTokens: 5445051
cacheWriteTokens: 119667
completionTokens: 32198
durationSeconds: 312.8
costUsd: 2.691083
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.6910831
    completionTokens: 32198
revision_number: 2
---

# Slice Design: Docs and Guide Alignment

## Overview

Slices 268, 269 and 271 took adoption out of `cf build` and gave squadron read-only primitives instead. The docs and the guide still describe the old behavior:

- The root README's "Adopting an Existing Codebase" section tells the user to run `cf build`, and shows an *Adoption Facts* block that no longer exists.
- The CLI reference describes per-step adoption navigation in `cf next` and the brownfield prompt swap in `cf build`. It doesn't mention `cf detect`, `cf init --json` or `cf prompt get --comprehension`. The MCP reference doesn't list `project_detect`.
- The guide's `Brownfield Adoption` prompt (ai-project-guide v0.22.7) says Context Forge selects it and appends Adoption Facts. It branches on squadron's raw probe output, tells the agent to run squadron's graph build, analysis and concept skill, and to re-run `cf build`. The adoption guide says the prompt chooses between the squadron path and the repo alone, and points at the Adoption Facts for rule files.

This slice brings all of it in line with what shipped. In cf it rewrites the docs, adds one contract document for squadron, tidies the test fixtures and a stale comment, raises `MIN_GUIDE_VERSION`, and makes `cf prompt get` warn on an old guide. On the guide side it specifies what the reworked prompt and adoption guide must say and hands that to ai-project-guide, which owns the wording and the release. It sends squadron the 271 contract.

## Value

- **Users:** the README and references describe what cf does today. Nobody is told to run `cf build` to adopt a codebase.
- **Agents:** no prompt delivered by cf tells an agent to run squadron, branch on a probe, or look for a section cf no longer writes.
- **Squadron:** one reference document for the contract `sq onboard` builds on, in the cf repo, linked from the README.

## Technical Scope

**Included**
- Root `README.md`: rewrite "Adopting an Existing Codebase".
- `packages/cli/README.md`: the `/cf:onboard`, `cf init`, `cf next`, `cf build` and `cf prompt` rows, and a new `cf detect` row.
- `packages/mcp-server/README.md`: a `project_detect` row, and the `agent_onboard` description.
- New `docs/ADOPTION-PRIMITIVES.md`: the cf ↔ squadron contract from 271 (D1).
- The guide-side change contract (D3), sent to ai-project-guide.
- Test fixtures: the stub guide copies' adoption prompt line, and the comprehension-doc setup in `pureBuild.test.ts` (D5).
- `detection/presentPaths.ts`: its header comment still names the Adoption Facts section.
- `MIN_GUIDE_VERSION` raised to the guide release that carries D3 (D4).
- `cf prompt get` prints the guide-minimum warning on stderr (D4).
- Sending squadron the contract document (D6).

**Excluded**
- Any behavior change in `cf build`, `cf next`, `cf detect`, `cf init` or the onboarding recipe. Those shipped in 268, 269 and 271.
- The wording of the guide prompt and adoption guide. ai-project-guide owns it; this slice fixes the contract it must meet.
- `docs/TOOLS.md`. It documents 8 of the MCP tools and has never listed the rest; completing it is separate work.
- The `cf prompt get concept-phase-0` key defect (#136).
- CHANGELOG and version bump: done by the release.

## Dependencies

### Prerequisites
- **268, 269, 271 (complete).** The behavior the docs describe.
- **ai-project-guide release carrying D3.** External. `MIN_GUIDE_VERSION` can't be raised until that release exists (D4).

### Interfaces Required
- 271's API Contracts section and decisions D1–D9: the source for `docs/ADOPTION-PRIMITIVES.md`.
- `checkGuideMinimum` (`guides/guideMinimum.ts`), already used by `cf build` and `context_build`.

## Architecture

### Component Structure

```
README.md                                        adoption section rewritten
docs/ADOPTION-PRIMITIVES.md                      cf ↔ squadron contract           (new)
packages/cli/README.md                           command rows updated
packages/mcp-server/README.md                    project_detect, agent_onboard
packages/cli/src/commands/prompt.ts              guide-minimum warning on stderr  (changed)
packages/core/src/guides/guideMinimum.ts         MIN_GUIDE_VERSION raised         (changed)
packages/core/src/detection/presentPaths.ts      header comment                   (changed)
packages/core/tests/fixtures/{brownfield-guide,pure-build-golden/*}/…/prompt.ai-project.system.md
packages/mcp-server/tests/integration/pureBuild.test.ts
```

Outside this repo: `prompt.ai-project.system.md` and `guide.ai-project.brownfield-adoption.md` in ai-project-guide.

### Data Flow

The adoption flow these docs describe (no change in this slice):

```
sq onboard ─► cf init --json ─► cf detect --json ─► (squadron: graph, analysis, concept written and PM-confirmed)
           ─► cf prompt get brownfield-adoption --path <root> --comprehension <doc>
                 └─ guide prompt + "## Adoption Inputs" ─► agent writes derived arch, existing-state plan
cf alone   ─► cf init / /cf:onboard / cf next ─► one line: adoption arrives with sq onboard, and the opt-out
```

### State Management

None.

## Technical Decisions

### D1 — One contract document, linked from the references
Status: decided
- `docs/ADOPTION-PRIMITIVES.md` states, per primitive, only what squadron depends on: inputs, where output goes, exit codes, and guarantees. For `cf prompt get … --path --comprehension` that includes the path rules and that stderr may carry the guide-minimum warning while stdout and the exit code are unaffected by it (D4).
- It does not re-list the schemas. For field lists, outcome values and error codes it names the code's definitions in `core/src/adoption/detectionReport.ts` (`DetectionReport`, `DETECTION_ERROR_CODES`, `REPORT_VERSION`, `INIT_REPORT_VERSION`) and gives the `reportVersion` bump rule in one sentence.
- It keeps one JSON example per primitive (a success and an error), taken from the local build; walkthrough step 3 checks them.
- It opens with the rule: a change to those definitions updates this document in the same commit. The owner is whoever changes the code, as for any doc the change makes stale.
- The README and the CLI and MCP references give one row or paragraph per primitive and link to it. The schema is written once.
- It is written from 271's API Contracts and D3, D5, D7 and D8, then checked against the code: each JSON example comes from running the local build, not from the design text.
- Rejected: the contract in the CLI README. Squadron needs MCP and CLI together, and the CLI README is a command table.

### D2 — The README section says what cf does alone, and where adoption lives
Status: decided
- The rewritten section says:
  - Adoption is run by squadron's `sq onboard`, which calls cf. cf doesn't start or run an adoption.
  - On its own, cf notices an existing codebase. `cf init`, `/cf:onboard` and `cf next` print one line naming `sq onboard` and the opt-out, and onboarding stops before the concept conversation. `cf build` is unchanged by the codebase.
  - The opt-out: `cf config set adoption.state declined` treats the project as new.
  - What an adoption writes: squadron writes the concept and the PM confirms it; the agent, driven by cf's adoption prompt, then writes the derived architecture and the existing-state slice plan with retroactive entries. An adopted project is then navigated like any other, so `cf next` points at the first new slice.
  - The primitives exist for squadron; link `docs/ADOPTION-PRIMITIVES.md`.
- The `cf docs map`, conventions reconciliation and review-gating paragraphs stay. They are standalone features. Their "Adoption Facts list rule files" wording, if any, goes.
- The Adoption Facts example block is deleted, not replaced. A `cf detect --json` example lives in the contract document only.
- The one-line notices are described (one line naming `sq onboard` and the opt-out), not quoted, so the README can't drift from `adoptionLines.ts`.

### D3 — The guide-side change contract
Status: decided
- ai-project-guide owns the wording. cf specifies what the reworked text must and must not say, because cf delivers the prompt. It goes to the ai-project-guide session as a message, in the form 266 used for the reconciliation prompt.
- **Brownfield Adoption prompt must not contain:**
  - "Context Forge selects it" or any mention of `cf build`.
  - "Adoption Facts", or the instruction to stop when that section is missing.
  - The "Choose the path" block: `surfaces`, `probe_version`, `analysis_skill_installed`, `understand_plugin_installed`, the CF-only path.
  - The "Squadron path steps" (graph build, "start squadron's analysis", invoking the `concept` entry, re-running `cf build`) and the `baseline.available` offer.
  - Any step that drafts a concept. Today's step 1 says "If no concept exists, draft one"; the architecture's Concept row gives the concept to squadron's concept flow (363), and the adoption prompt never drafts it.
- **It must say:**
  - It starts from the confirmed concept that `sq onboard` produced, named on the Concept line of Adoption Inputs. If that line is `none`, stop and say the concept comes from `sq onboard`; do not draft one.
  - It is fetched by `sq onboard` with `cf prompt get brownfield-adoption`, and cf appends a `## Adoption Inputs` section after it.
  - The comprehension doc, when provided, is named in Adoption Inputs. When it isn't, the section says so, and the agent works from the repo alone. Inputs listed as `none` don't exist yet.
  - If the Adoption Inputs section is absent, stop and say the prompt was not delivered by `cf prompt get`. No example value near that instruction.
  - Project rule files: the agent runs `cf detect --json` and reads `facts.ruleFiles`, instead of "the Adoption Facts list rule files".
  - Steps 2–3 (derived architecture with `cf docs map`, existing-state plan) and the rules stay as they are. Step 1 (baseline concept) goes: its draft branch is removed above, and its confirm-or-correct branch is already done by squadron's concept flow before the prompt is fetched (arch, flow step 5).
- **Adoption guide (`guide.ai-project.brownfield-adoption`):** "How It Is Run" says adoption is orchestrated by `sq onboard`, which runs squadron's analysis and then fetches the prompt from cf; cf on its own stops and points to `sq onboard`. Drop "including whether to use squadron's graph-based analysis or to work from the repo alone". "After Adoption" gets the same rule-files change as the prompt.
- **Unchanged:** the `brownfield-adoption` context profile row and its `fileComprehension` variable. 271 D7 keys `--comprehension` on it.
- Rejected: editing the guide repo from this slice. It is another repository with its own releases, and the PM has routed guide changes through its session before.

### D4 — Raise `MIN_GUIDE_VERSION`, and warn from `cf prompt get`
Status: decided
- `MIN_GUIDE_VERSION` becomes the ai-project-guide release that ships D3. Its value is read from that release's tag, never assumed. Until the release exists, that task is blocked; the docs work doesn't wait for it.
- `cf prompt get` calls `checkGuideMinimum` for the resolved project and prints the warning on stderr, as `cf build` does. Exit code and stdout are unchanged, so `sq onboard` still gets the prompt.
- The check runs after the prompt has been read, so the existing errors come first and nothing new is added for them. Each case:
  - **Project can't be resolved** (including from `--path`): the existing project-not-found error, exit 1. No check runs.
  - **No guide installed:** the existing "System prompt file not found" error from `SystemPromptParser`, exit 1. No fallback prompt. (`checkGuideMinimum` returns null for this case anyway.)
  - **Version marker missing, empty or unreadable:** the existing "version is unknown; context-forge needs vX or newer" warning on stderr. The prompt is still printed, exit 0.
  - **Older than the minimum:** the "needs vX or newer" warning on stderr, prompt printed, exit 0.
  - **Current:** no warning.
- **This extends the plan entry.** The entry raises the minimum, but today only `cf build` and `context_build` check it, and `sq onboard` calls neither. Without the warning, a project on guide v0.22.7 hands `sq onboard` the old prompt, which says the Adoption Facts section is missing and stops, with nothing pointing at the stale guide. Two lines reusing an existing function; no new logic.
- Rejected: failing `cf prompt get` on an old guide. Build only warns, and the two should agree.

### D5 — Fixtures and tests
Status: decided
- The three stub `prompt.ai-project.system.md` copies (`brownfield-guide`, `pure-build-golden/greenfield`, `pure-build-golden/planned`) carry one adoption line, "Use the Adoption Facts section below." It becomes "Use the Adoption Inputs section below." These are trimmed stubs, not copies of the real guide, so nothing else in them changes. The golden outputs don't contain the adoption prompt and don't change.
- `pureBuild.test.ts`: delete `COMPREHENSION_DOC`, its write in the brownfield fixture, and the `COMPREHENSION_LINE` assertion. With 271's lookup gone, nothing reads the file, and the fixture would be cf test code writing squadron's file name. The test's real claim (a brownfield build has no facts section and writes nothing) stays.
- `pure-build-golden` tests still pass byte for byte.
- Triage of the repo-wide search (run 20261026; command/skill markdown under `packages/cli/commands` had no hits):
  - Fixed by this slice: `README.md`, `packages/cli/README.md` rows, `presentPaths.ts` comment, the three fixture stubs.
  - Kept: `pureBuild.test.ts` `ADOPTION_FACTS_HEADING`, used only in `not.toContain` assertions that the removed section stays gone. `WorkflowNavigator.adoption.test.ts:63`, a comment saying Phase 0 navigation may suggest `cf build` for the concept, which is true and not about adoption; its test asserts the adoption lines never mention `cf build`.
  - Any new hit found at implementation time is fixed or added to this kept list with its reason.

### D6 — Hand-offs to squadron and ai-project-guide
Status: decided
- Squadron: once `docs/ADOPTION-PRIMITIVES.md` is committed, send the `sq` session its path and commit hash. Find the session with `ListAgents`. The message names the contract only; it asks nothing of squadron that 271 hasn't already confirmed.
- ai-project-guide: send the D3 contract when implementation starts, so the guide release can proceed alongside the docs work.
- If either session can't be found, the task records `BLOCKED:` with the reason and the message text is left in the task file for the PM to route.

## Implementation Details

### Migration Plan

No code moves. Text that describes removed behavior is replaced:

| Location | Old | New |
|---|---|---|
| README adoption section | `cf build` adoption, Adoption Facts example, `adoption.state` "override" | D2 |
| CLI README `cf next` row | adoption steps carried out by `cf build`, `register-plan` | one line for an unadopted or incompletely adopted repo; normal navigation otherwise |
| CLI README `cf build` row | brownfield prompt swap, Adoption Facts | no adoption text |
| CLI README `cf init` row | `cf init` | `--json`, exit 1 on a failed step, existing-codebase line |
| CLI README `cf prompt` row | `list\|get <phase>` | adds `--path`, `--comprehension` |
| CLI README `/cf:onboard` row | "hands off to `cf build`" | stops on an existing codebase |
| CLI README | — | `cf detect` row |
| MCP README | — | `project_detect` row; `agent_onboard` notes the stop |
| Guide prompt and adoption guide | D3 "must not" list | D3 "must say" list |

Verification is by grep (Success Criteria) and the unchanged golden tests.

## Integration Points

### Provides to Other Slices
- **273 (real adoption via `sq onboard`):** a guide prompt that matches cf's delivery, a minimum guide version that enforces it, and docs a PM can follow.
- **Squadron 440 (`sq onboard`):** `docs/ADOPTION-PRIMITIVES.md`.
- **ai-project-guide:** the D3 contract.

### Consumes from Other Slices
- **271:** the contract, unchanged. If the docs work finds the code disagreeing with 271's design, the code is what's documented and the difference is reported to the PM; this slice doesn't change primitive behavior.
- **ai-project-guide release:** if it slips, everything except D4's version raise can land. The slice isn't complete until the raise is in, because 271 noted that no release ships before 272.

## Success Criteria

### Functional Requirements
- A repo-wide search (walkthrough step 1: everything except `project-documents/`, `CHANGELOG.md`, `node_modules` and `dist`, plus the test fixtures' guide stubs) finds no adoption text describing `cf build` or Adoption Facts, apart from the kept hits listed in D5.
- No cf doc tells the user to run `cf build` to adopt a codebase, and none describes adoption steps in `cf next`.
- The CLI README lists `cf detect`, `cf init --json`, and `cf prompt get --path --comprehension`. The MCP README lists `project_detect`. Each links `docs/ADOPTION-PRIMITIVES.md`.
- Every JSON example in `docs/ADOPTION-PRIMITIVES.md` matches what the local build prints for that case, apart from paths and counts.
- In the installed guide at the new minimum, the `Brownfield Adoption` prompt and the adoption guide contain none of: `cf build`, `Adoption Facts`, `probe`, `surfaces`, `analysis_skill_installed`, `understand_plugin_installed`, `graph_build`, "Context Forge selects", "start squadron's analysis".
- `cf prompt get brownfield-adoption` against that guide prints a prompt that refers to the Adoption Inputs section it appends.
- `cf prompt get` on a project whose guide is older than the minimum prints the warning on stderr and still prints the prompt on stdout with exit 0.

### Technical Requirements
- `MIN_GUIDE_VERSION` equals the tag of the guide release that carries D3.
- `pureBuild.test.ts` writes no comprehension doc. Its other assertions are unchanged.
- A test covers each D4 case for `cf prompt get`: old version and unreadable version warn on stderr with the prompt on stdout and exit 0; current version prints no warning; no guide installed exits 1 with no prompt on stdout.
- Format, lint, typecheck and the full test suite pass. The golden tests pass unchanged.

### Integration Requirements
- The `sq` session has the contract document's path and commit.
- The ai-project-guide session has the D3 contract, and its release is installed in this repo's `project-documents/ai-project-guide`.

### Verification Walkthrough

Use the local build (`node packages/cli/dist/index.js`, written `cf` below) after `pnpm -r build`. Point `CONTEXT_FORGE_DATA_DIR` at a temp directory so the real project store isn't touched.

1. **No stale adoption text in cf**
   ```bash
   grep -rn -i "Adoption Facts\|record-completion\|register-plan\|record adoption\|cf build.*adopt\|adopt.*cf build" . \
     --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=project-documents --exclude=CHANGELOG.md
   grep -rn -i "Adoption Facts" packages/core/tests/fixtures || echo clean
   ```
   Expect the first to print only the kept hits in D5, and the second `clean`. (The first excludes `project-documents`, which also skips the fixture stubs' guide copies; the second covers them.)

2. **The references name the primitives**
   ```bash
   grep -n "cf detect\|--comprehension\|init --json" packages/cli/README.md
   grep -n "project_detect" packages/mcp-server/README.md
   grep -c "ADOPTION-PRIMITIVES" README.md packages/cli/README.md packages/mcp-server/README.md
   ```
   Expect a row for each, and at least one link per file.

3. **The contract document matches the build.** Create a brownfield fixture as in 271's walkthrough step 3 (≥2000 non-blank `.ts` lines, committed). Run `cf detect --json` in it and compare the keys and outcome with the document's report example. Run `cf detect --path /tmp/does-not-exist --json` and compare with the error example.

4. **Guide alignment.** After the ai-project-guide release is out, run `cf guides update` in this repo, then:
   ```bash
   cf guides info | grep Version
   grep -n "MIN_GUIDE_VERSION =" packages/core/src/guides/guideMinimum.ts
   awk '/^##### Brownfield Adoption/,/^##### Conventions/' project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md \
     | grep -n -i "cf build\|adoption facts\|probe\|surfaces\|analysis_skill\|understand_plugin\|graph_build\|selects it" || echo clean
   grep -n -i "adoption facts\|graph-based analysis or" project-documents/ai-project-guide/project-guides/guide.ai-project.brownfield-adoption.md || echo clean
   ```
   Expect the two versions to match and `clean` twice.

5. **The delivered prompt.** In the brownfield fixture after `cf init --name cf272-bf --no-ide`:
   ```bash
   cf prompt get brownfield-adoption | tail -8
   ```
   Expect the prompt to name the Adoption Inputs section, followed by that section with "No codebase comprehension analysis was provided." and three `none` lines.

6. **Old-guide warning.** In the same fixture, set the installed guide's version below the minimum (write an older tag, e.g. the previous release, into `project-documents/ai-project-guide/.context-forge-guide-version`), then:
   ```bash
   cf prompt get brownfield-adoption 2>/tmp/err >/tmp/out; echo "exit=$?"; cat /tmp/err; wc -l /tmp/out
   ```
   Expect `exit=0`, the "needs vX or newer. Run: cf guides update" warning in `/tmp/err`, and the prompt in `/tmp/out`.

7. **Tests**
   ```bash
   pnpm -r test
   grep -n -i "comprehension" packages/mcp-server/tests/integration/pureBuild.test.ts || echo clean
   ```
   Expect a passing suite and `clean`.

## Implementation Notes

### Development Approach
1. Send the D3 contract to the ai-project-guide session (D6).
2. Fixtures, `pureBuild.test.ts` and the `presentPaths.ts` comment (D5).
3. `cf prompt get` guide-minimum warning, with its test (D4).
4. `docs/ADOPTION-PRIMITIVES.md`, examples taken from the local build (D1).
5. README section (D2), then the CLI and MCP references.
6. Send squadron the contract document's path and commit (D6).
7. When the guide release exists: install it in this repo, raise `MIN_GUIDE_VERSION`, and run walkthrough steps 4–6.

Effort: 2/5. The plan said 1/5. The contract document and the `cf prompt get` warning (D4, an extension of the entry) account for the difference.

### Special Considerations
- **Ordering with the guide release.** cf can't ship this slice before the guide release, because the raised minimum would name a version that doesn't exist. The docs work lands first on the slice branch; the version raise is the last task.
