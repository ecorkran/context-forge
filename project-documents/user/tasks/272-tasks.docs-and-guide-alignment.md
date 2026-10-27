---
docType: tasks
slice: docs-and-guide-alignment
project: context-forge
lld: user/slices/272-slice.docs-and-guide-alignment.md
dependencies:
- pure-cf-build
- collapse-adoption-state
- adoption-primitives-for-sq-onboard
projectState: main after slice 271 (adoption primitives, merged). `cf detect`, MCP
  `project_detect`, `cf init --json` and `cf prompt get --path --comprehension` exist.
  `MIN_GUIDE_VERSION` is `0.22.6` and only `cf build` and `context_build` call `checkGuideMinimum`.
  This repo's installed guide is v0.22.7, whose Brownfield Adoption prompt still describes
  Adoption Facts and the squadron probe. The root README, CLI README and MCP README
  still describe adoption through `cf build`. Global `cf` is the published npm package,
  not the local build.
dateCreated: 20261026
dateUpdated: 20261026
status: not_started
turns: 45
promptTokens: 2783828
cachedTokens: 2678017
cacheWriteTokens: 105743
completionTokens: 35281
durationSeconds: 296.3
costUsd: 2.087723
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.0877237000000006
    completionTokens: 35281
revision_number: 2
---

## Context Summary

- Slice 272 brings cf's docs and the guide in line with slices 268, 269 and 271: adoption is run by squadron's `sq onboard`, and cf provides read-only primitives. Most of the slice is documentation. The code changes are small: fixture stub text, one test fixture removal, one comment, a `cf prompt get` stderr warning, and the `MIN_GUIDE_VERSION` raise.
- The slice design (`user/slices/272-slice.docs-and-guide-alignment.md`) is the spec. Decisions D1–D6, the Migration Plan table, Success Criteria and the Verification Walkthrough are referenced by name below. Read the named section before each task. The contract facts come from slice 271's design (`user/slices/271-slice.adoption-primitives-for-sq-onboard.md`, sections D1–D10 and API Contracts) and from the code. Where the code and 271's design disagree, document the code and report the difference to the PM in the task's commit message and in the final summary.
- Order follows the design's Development Approach: guide contract hand-off, fixtures, `cf prompt get` warning, contract document, README, references, squadron hand-off, guide release alignment, validation.
- External dependency: the `MIN_GUIDE_VERSION` raise (task 11) needs the ai-project-guide release that carries D3. Everything before it can land without that release. If the release does not exist when task 11 starts, record `BLOCKED:` there, run 12.1, and stop.
- Excluded (design): any behavior change to `cf build`, `cf next`, `cf detect`, `cf init` or the onboarding recipe; the wording of the guide prompt and adoption guide (ai-project-guide owns it); `docs/TOOLS.md`; issue #136; CHANGELOG and version bump (done by the release). If you find something outside scope, file an issue and continue.
- Local build: run `pnpm -r build`, then use `node packages/cli/dist/index.js` (written `cf` below). Point `CONTEXT_FORGE_DATA_DIR` at a temp dir for every walkthrough command so the real project store is untouched. Tests run per package with `pnpm --filter @context-forge/{core|cli|mcp} test [pattern]`. Root `pnpm lint` and `pnpm typecheck` cover the workspace. There is no format script; ESLint is the formatter gate.
- Conventions: every literal used in a comparison or assertion is defined once and imported, including in tests. No silent fallbacks. No `any`. Source files stay near 300 lines (`prompt.ts` is 199 now).
- Branch: `272-slice.docs-and-guide-alignment`, forked from the target. This file has no merge or push task; Phase 7 merges after code review.
- Next planned slice: 273 (real adoption via `sq onboard`).

---

## Tasks

### 1. Branch setup

- [x] **1.1 Create the slice branch** — effort 1
  - [x] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`. Its value, or `main` when empty, is the target
  - [x] Run `git status --short`. If it lists only this task file, commit it to the target first (`docs: update slice 272 task file`). Anything else: stop and report it
  - [x] Confirm you are on the target, then `git checkout -b 272-slice.docs-and-guide-alignment {target}`. If the branch already exists, switch to it
  - [x] **Success:** `git branch --show-current` prints `272-slice.docs-and-guide-alignment`

### 2. Send the guide-side contract to ai-project-guide (D3, D6)

- [x] **2.1 Compose and send the D3 message** — effort 2
  - [x] Write a message containing D3 in full, copied rather than paraphrased, plus the walkthrough step 4 grep terms so the guide session can check its own text. Open with one line: cf delivers this prompt through `cf prompt get brownfield-adoption` and appends `## Adoption Inputs`; cf will raise `MIN_GUIDE_VERSION` to the release that carries these changes, so please reply with that release's tag
  - [x] Run `ListAgents` and find the ai-project-guide session. Send the message with `SendMessage`
  - [x] **Success:** the message covers every bullet in D3's four parts, and it is sent, or the `BLOCKED:` line and message text are in this file

### 3. Fixtures, `pureBuild.test.ts` and the `presentPaths.ts` comment (D5)

- [x] **3.1 Fixture stubs** — effort 1
  - [x] In each of the three stubs below, change line 45 "Use the Adoption Facts section below." to "Use the Adoption Inputs section below." Change nothing else in the files. Each path is under `packages/core/tests/fixtures/` and ends in `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`:
    1. `brownfield-guide/`
    2. `pure-build-golden/greenfield/`
    3. `pure-build-golden/planned/`
  - [x] **Success:** `grep -rn -i "Adoption Facts" packages/core/tests/fixtures || echo clean` prints `clean`

- [x] **3.2 `pureBuild.test.ts`: drop the comprehension doc** — effort 1
  - [x] In `packages/mcp-server/tests/integration/pureBuild.test.ts`, delete the `COMPREHENSION_DOC` and `COMPREHENSION_LINE` constants, the `mkdirSync`/`writeFileSync` pair that writes the doc in the brownfield fixture, and the `not.toContain(COMPREHENSION_LINE)` assertion
  - [x] Keep `ADOPTION_FACTS_HEADING` and both of its `not.toContain` assertions (D5 kept list). Leave every other assertion unchanged
  - [x] **Success:** `grep -n -i "comprehension" packages/mcp-server/tests/integration/pureBuild.test.ts || echo clean` prints `clean`

- [x] **3.3 `presentPaths.ts` comment, test and commit** — effort 1
  - [x] In `packages/core/src/detection/presentPaths.ts`, replace "Presence-only facts for the Adoption Facts section (slice 261, D5)" with a line naming its current consumers: the detection report's facts (`cf detect`, slice 271), docs map discovery and rule reconciliation. Check the importers first (`adoption/projectDetection.ts`, `docs-map/discoverDocs.ts`, `ruleReconciliation/projectSources.ts`) and name only what they use it for. Keep the rest of the comment
  - [x] Run `pnpm --filter @context-forge/core test`, `pnpm --filter @context-forge/mcp test` and `pnpm lint`. `git status` shows no change to `pure-build-golden/greenfield.golden.md` or `pure-build-golden/planned.golden.md`
  - [x] Commit: `test: align adoption fixtures with Adoption Inputs`
  - [x] **Success:** `grep -c "Adoption Facts" packages/core/src/detection/presentPaths.ts` prints 0; both suites and lint pass; golden outputs unchanged

### 4. `cf prompt get` guide-minimum warning (D4)

- [x] **4.1 Implement the warning** — effort 1
  - [x] Read D4 and the existing pattern in `packages/cli/src/commands/build.ts` (the `checkGuideMinimum` call and its `process.stderr.write` line)
  - [x] In the `get` action of `packages/cli/src/commands/prompt.ts`, import `checkGuideMinimum` from `@context-forge/core/node`. Call it with `opPath` after the prompt has been read and the `No prompt found` check has passed, and before `printRaw`. Use `opPath` because it is the checkout whose guide was read
  - [x] Write a non-null result to stderr in the same form as `cf build`. If that duplicates logic from `build.ts`, extract it into an existing CLI module rather than a new file
  - [x] Do not change the exit code, stdout, or any existing error path. Do not add the check to `prompt list` (D4 names `prompt get` only)
  - [x] **Success:** `pnpm typecheck` passes; `prompt.ts` stays near 200 lines

- [x] **4.2 Tests for each D4 case** — effort 2
  - [x] Add `packages/cli/tests/commands/prompt.guideMinimum.test.ts`. Follow the setup in `prompt.adoption.test.ts` (real brownfield-guide fixture prompt, only `FileProjectStore` stubbed) and the guide-install helper pattern in `packages/core/tests/guides/guideMinimum.test.ts` for writing `VERSION_MARKER_FILE`. Import `MIN_GUIDE_VERSION` and `VERSION_MARKER_FILE` rather than retyping them
  - [x] Cases, from the design's Technical Requirements:
    1. Older than the minimum: stderr carries the "needs v{MIN_GUIDE_VERSION} or newer" warning, stdout carries the prompt, no error is raised
    2. Version marker missing or empty: stderr carries the "version is unknown" warning, stdout carries the prompt, no error
    3. Version marker unreadable (a directory created at the `VERSION_MARKER_FILE` path): same expectation as case 2
    4. Current version (`v${MIN_GUIDE_VERSION}`): no warning on stderr
    5. No guide installed: the command fails through `handleError` with exit 1 and nothing on stdout
  - [x] Build expected messages from `checkGuideMinimum`'s output or from imported constants, not from retyped sentences
  - [x] If case 5 does not behave as D4 describes (for example `ensureGuideReady` installs a guide instead of failing), do not change `ensureGuideReady`. Record the actual behavior in the test name and report it to the PM in the commit message
  - [x] Run `pnpm --filter @context-forge/cli test prompt`, `pnpm lint` and `pnpm typecheck`
  - [x] Commit: `feat: warn on an old guide from cf prompt get`
  - [x] **Success:** the new tests and the existing `prompt.test.ts` and `prompt.adoption.test.ts` pass; lint and typecheck pass

### 5. Contract document `docs/ADOPTION-PRIMITIVES.md` (D1)

- [x] **5.1 Capture the examples from the local build** — effort 2
  - [x] Run `pnpm -r build`. Create the brownfield fixture as in 271's Verification Walkthrough step 3 (a git repo with at least 2000 non-blank `.ts` lines, committed) under a temp dir
  - [x] With `CONTEXT_FORGE_DATA_DIR` set to a temp dir, run `cf detect --json` in the fixture and save stdout. Run `cf detect --path /tmp/does-not-exist --json` and save its output and exit code
  - [x] Replace machine-specific paths in both outputs with an obviously-placeholder path (for example `/path/to/repo`). Leave keys, outcome values and codes exactly as printed
  - [x] **Success:** two saved JSON outputs, one success and one error, each produced by the local build

- [x] **5.2 Write the document** — effort 3
  - [x] Create `docs/ADOPTION-PRIMITIVES.md` with YAML frontmatter in the form `docs/REVIEW-GATING.md` uses (`docType: guide`, `scope: adoption-primitives`, plus the other keys that file carries)
  - [x] Opening paragraph: these primitives exist for squadron's `sq onboard`; cf never starts or runs an adoption
  - [x] One section per primitive: `cf detect` / MCP `project_detect`; `cf init --json`; `cf prompt get <phase> --path <dir> --comprehension <file>`. Each states only inputs, where output goes (stdout/stderr), exit codes, and guarantees, taken from 271's API Contracts and D3, D5, D7, D8, then checked against the code
  - [x] In the `cf prompt get` section include the path rules from 271 D7 and that stderr may carry the guide-minimum warning while stdout and the exit code are unaffected (272 D4)
  - [x] For field lists, outcome values and error codes, name the definitions in `packages/core/src/adoption/detectionReport.ts` (`DetectionReport`, `DETECTION_ERROR_CODES`, `REPORT_VERSION`, `INIT_REPORT_VERSION`). Do not re-list the schema. State the `reportVersion` bump rule in one sentence, taken from 271 D3
  - [x] Include the two JSON examples from 5.1 in the `cf detect` section only. `cf init --json` and `cf prompt get` get prose only
  - [x] Mention the opt-out key `adoption.state` with value `declined`, reading the exact key and value from the code that defines them
  - [x] A difference between the code and 271's design is documented as the code behaves and reported, not fixed in code
  - [x] Commit: `docs: add adoption primitives contract for sq onboard`. Record the commit hash; task 10 sends it to squadron
  - [x] **Success:** each primitive has inputs, output streams, exit codes and guarantees; exactly two JSON blocks exist, matching the 5.1 outputs apart from paths (walkthrough step 3); no schema field list is duplicated

### 6. Root README adoption section (D2)

- [x] **6.1 Rewrite "Adopting an Existing Codebase"** — effort 2
  - [x] Read D2. In `README.md`, rewrite the section's first paragraph to say each D2 point in order: adoption is run by `sq onboard`, which calls cf; what cf does alone (`cf init`, `/cf:onboard` and `cf next` print one line naming `sq onboard` and the opt-out; onboarding stops before the concept conversation; `cf build` is unchanged by the codebase); the opt-out `cf config set adoption.state declined`; what an adoption writes and that `cf next` then points at the first new slice; a link to `docs/ADOPTION-PRIMITIVES.md`
  - [x] Describe the one-line notices; do not quote them
  - [x] Delete the `### Adoption Facts` heading, its paragraph and the example block entirely. Do not add a replacement example
  - [x] Keep the conventions reconciliation and `cf docs map` paragraphs. Remove any "Adoption Facts" wording from them, if present
  - [x] Replace the last paragraph's "override it with the `adoption.state` setting" with the opt-out wording; keep its CLI reference and Review Gating links
  - [x] Commit: `docs: rewrite README adoption section for sq onboard`
  - [x] **Success:** `grep -n -i "Adoption Facts\|then \`cf build\`" README.md || echo clean` prints `clean`; `grep -c "ADOPTION-PRIMITIVES" README.md` is at least 1

### 7. CLI reference rows (`packages/cli/README.md`)

- [x] **7.1 Update the rows and commit** — effort 2
  - [x] Edit each row as the design's Migration Plan table specifies. Describe current behavior only; read each command's `--help` from the local build to confirm flags:
    1. `/cf:onboard`: replace "hands off to `cf build`" with the stop and one-line notice on an existing codebase
    2. `cf init`: add `--json`, exit 1 when a setup step fails, and the existing-codebase line
    3. `cf detect`: new row after `cf init`, a one-sentence description (read-only detection report)
    4. `cf next`: remove the adoption step list, `record-completion`, `register-plan` and "carried out by `cf build`"; say it prints one line naming `sq onboard` and the opt-out for an unadopted or incompletely adopted repo, and navigates normally otherwise
    5. `cf build`: remove the brownfield prompt swap, the *Adoption Facts* section and the `adoption.state` text; keep the usage and "Generate context prompt"
    6. `cf prompt`: add `--path <dir>` and `--comprehension <file>` to the usage with one clause each
  - [x] Link `docs/ADOPTION-PRIMITIVES.md` from the `cf init`, `cf detect` and `cf prompt` rows
  - [x] Read the whole file once for any other adoption text describing `cf build` or adoption steps in `cf next`, and fix it
  - [x] Commit: `docs: update CLI reference for adoption primitives`
  - [x] **Success:** `grep -n "cf detect\|--comprehension\|init --json" packages/cli/README.md` finds the rows; `grep -n "register-plan\|record-completion\|Adoption Facts" packages/cli/README.md || echo clean` prints `clean`; `grep -c "ADOPTION-PRIMITIVES" packages/cli/README.md` is at least 1

### 8. MCP reference (`packages/mcp-server/README.md`)

- [x] **8.1 `project_detect` and `agent_onboard` rows, and commit** — effort 1
  - [x] Add a `project_detect` row in the Project Management table. Take the description from the tool's registration in `packages/mcp-server/src/tools/detectTools.ts`, shortened to one line, and link `docs/ADOPTION-PRIMITIVES.md` (path relative to `packages/mcp-server/`)
  - [x] In the `agent_onboard` row, add that on an existing codebase the recipe stops and points to `sq onboard`. Confirm against `agentOnboardTool.ts` and the recipe text before writing
  - [x] Commit: `docs: add project_detect to MCP reference`
  - [x] **Success:** `grep -n "project_detect" packages/mcp-server/README.md` finds the row; `grep -c "ADOPTION-PRIMITIVES" packages/mcp-server/README.md` is at least 1; the `agent_onboard` row mentions the stop

### 9. Stale-text sweep (walkthrough step 1, D5 triage)

- [x] **9.1 Run walkthrough step 1** — effort 1
  - [x] Run both commands from walkthrough step 1. The first may print only the kept hits listed in D5 (`pureBuild.test.ts` `ADOPTION_FACTS_HEADING`, `WorkflowNavigator.adoption.test.ts:63`). The second must print `clean`
  - [x] Any new hit is either fixed, or added to D5's kept list in the slice design with its reason, per D5's last bullet
  - [x] If anything changed, commit: `docs: remove remaining stale adoption text`
  - [x] **Success:** only kept hits remain. (Walkthrough step 2 is covered by the success checks of 6.1, 7.1 and 8.1)

### 10. Send squadron the contract (D6)

- [x] **10.1 Message the `sq` session** — effort 1
  - [x] Run `ListAgents` and find the squadron session. Send the path `docs/ADOPTION-PRIMITIVES.md`, the branch `272-slice.docs-and-guide-alignment`, and the commit hash from 5.2 (or the latest commit touching the file, if it changed since). Say it documents 271's contract. Ask nothing else
  - [x] **Success:** the message is sent, or the `BLOCKED:` line and message text are in this file

### 11. Guide release alignment and `MIN_GUIDE_VERSION` (D4)

- [x] **11.1 Install the guide release that carries D3** — effort 1
  Prior version: v0.22.7
  - [x] Before updating, run `cf guides info` and record the installed version as the *prior version* under this task. 11.3 uses it. `git status --short project-documents/ai-project-guide` must be empty; otherwise stop and report it
  - [x] Run `cf guides update` with the local build in this repo, then `cf guides info` and note the installed version
  - [x] Run the extraction and grep commands from the design's walkthrough step 4 (everything except the `MIN_GUIDE_VERSION` grep)
  - [x] If the ai-project-guide session replied with a tag (task 2), confirm the installed version matches it. If it does not, use the installed version only when the step 4 checks pass, and report the difference to the PM
  - [x] **Success:** walkthrough step 4's guide checks pass on the installed release; the prior version is recorded

- [x] **11.2 Raise `MIN_GUIDE_VERSION`** — effort 1
  - [x] Set `MIN_GUIDE_VERSION` in `packages/core/src/guides/guideMinimum.ts` to the installed release's version, read from `cf guides info` (no leading `v`, matching the current value's form). Never type a version that was not read from that output
  - [x] Leave the "ships in ai-project-guide v0.22.6" sentence in the README's reconciliation paragraph as it is: it names where the reconciliation prompt first shipped, not the minimum
  - [x] Run `pnpm --filter @context-forge/core test guideMinimum` and `pnpm --filter @context-forge/cli test prompt`
  - [x] **Success:** walkthrough step 4's two version lines match; tests pass

- [x] **11.3 Walkthrough steps 5–6** — effort 2
  - [x] Run `pnpm -r build`. Use the brownfield fixture from 5.1; if its temp dir is gone, recreate it the same way. Run `cf init --name cf272-bf --no-ide` in it, then walkthrough step 5. Expect the prompt to name the Adoption Inputs section, followed by the section with the no-comprehension sentence and three `none` lines
  - [x] Walkthrough step 6: confirm the prior version recorded in 11.1 is strictly below the `MIN_GUIDE_VERSION` set in 11.2. If it is not, stop and report it to the PM. Otherwise write the prior version into the fixture's `project-documents/ai-project-guide/.context-forge-guide-version`, then run the step's command
  - [x] Commit the installed guide and the raised minimum: `chore: raise minimum guide version for brownfield adoption prompt`
  - [x] **Success:** step 5 output as expected; step 6 prints `exit=0`, the warning in `/tmp/err` and the prompt in `/tmp/out`

### 12. Validation

- [x] **12.1 Full suite, hand-offs and commit (walkthrough step 7)** — effort 1
  - [x] Run this task even when task 11 is blocked; it validates tasks 1–10 on their own
  - [x] `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm -r test` all pass. The golden tests pass with no golden file changed
  - [x] `grep -n -i "comprehension" packages/mcp-server/tests/integration/pureBuild.test.ts || echo clean` prints `clean`
  - [x] Re-run walkthrough step 1 once more; only D5's kept hits remain
  - [x] Commit any validation fixes: `chore: complete slice 272 validation`. Work ends at this commit on the slice branch
  - [x] **Success:** all commands exit 0; each hand-off is sent or reported
