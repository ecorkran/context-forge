---
docType: tasks
slice: pending-decision-gate
project: context-forge
lld: project-documents/user/slices/245-slice.pending-decision-gate.md
dependencies: [241, 242]
projectState: "Initiative 240 review gating is merged (241 navigator gate in deriveSliceStatus/getNext, 242 ConsistencyChecker per-slice rule pattern). ai-project-guide#44 shipped the per-decision `Status: decided | pending-pm` line in the installed slice-design template. Nothing in Context Forge reads that line yet (issue #121)."
dateCreated: 20261017
dateUpdated: 20261017
status: not_started
---

# Tasks: Pending Decision Gate (Slice 245)

## Context Summary

- Working on slice 245, `pending-decision-gate` (issue #121). Design: `user/slices/245-slice.pending-decision-gate.md`. Decisions D1–D8 there are the spec; tasks cite them rather than repeating them.
- A slice design whose decision status line holds a pending word (`pending-pm` and the other words in D1's table) must not advance to Phase 5 or 6. This slice enforces that in four places, all behind one config key, `workflow.decision_gate_enabled` (default `true`):
  1. Pure parser `findPendingDecisions(text)`: returns `{ heading, line }[]`.
  2. `cf validate design` fails on a pending decision and names each one (D7).
  3. `WorkflowNavigator`: new slice status `pending-decision`, a `pendingDecisions` payload, and a `LIFECYCLE: decision-gate` branch in `getNext()` (D4, D5). `cf next`, `cf status`, and the MCP `workflow_next` / `workflow_status` tools pick it up.
  4. ConsistencyChecker rule `pending-decision`, severity `warning` (D8). It is reported only and never blocks.
- Out of scope: architecture docs, slice plans, task files, frontmatter `status:` cross-checks, Squadron changes.
- Verified code anchors (as of 20261017):
  - Fence helpers are private in `packages/core/src/schema/sliceDesignValidator.ts`: `OpenFence` (:31), `openingFence` (:37), `closesFence` (:46), `splitLines` (:54).
  - `packages/core/src/schema/sliceDesignFiles.ts`: `validateFile()` and `validateSliceDesignFiles()` (:121).
  - `packages/core/src/introspection/types.ts`: `SliceStatus` (~:345), `NextAction` (~:391).
  - `packages/core/src/introspection/WorkflowNavigator.ts`: constructor takes an optional `ConfigManager` (:102). Its `getNext()` cascade has `needs-tasks` (~:339), and `deriveSliceStatus()` starts at ~:636.
  - `packages/core/src/introspection/ConsistencyChecker.ts`: `checkSlice()` (:244), `safeEvaluateGate()` (:592). The file is already 1429 lines, so add exactly one call in it and put the logic in `decisionGate.ts`.
  - `packages/cli/src/commands/validateDesign.ts`: `ValidateDesignJson` (:25), `resolveTemplatePath` (:34).
  - `packages/cli/src/commands/next.ts`: prints `Rationale:` at :51.
  - `packages/cli/src/commands/status.ts` prints `activeSlice.status` generically (:177). It needs no code change.
  - `packages/mcp-server/src/tools/workflowTools.ts`: the `workflow_check` "Detects:" string at ~:221.
  - Tests live in `packages/core/tests/{schema,introspection,config}/`, `packages/cli/tests/commands/`, and `packages/mcp-server/tests/`.
- Use the local build for manual checks: `node packages/cli/dist/index.js`. The global `cf` is the published npm build.
- Verification commands: `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @context-forge/core test`, `pnpm --filter @context-forge/cli test`, `pnpm --filter @context-forge/mcp test`.
- The next planned slice comes from the 240 slice plan. Slice 245 is the last listed entry.

---

## Task 0: Pre-flight

- [ ] Read the target: `node packages/cli/dist/index.js config get git.integration_branch`. Empty means the target is `main`.
- [ ] Confirm a clean working tree (`git status --short`).
- [ ] Create the slice branch from the target: `git checkout -b 245-slice.pending-decision-gate {target}`. If the branch already exists, switch to it instead.
- [ ] Run `pnpm -r build` and `pnpm --filter @context-forge/core test` once, to record a green baseline.
  - [ ] Success: you are on `245-slice.pending-decision-gate` and the baseline build and tests pass. If the baseline fails, stop and report it. Do not fix unrelated failures in this slice.
- **Effort:** 1/5

---

## Task 1: Extract the fence helpers into `markdownLines.ts` (D6)

- [ ] Create `packages/core/src/schema/markdownLines.ts`. Move `OpenFence`, `openingFence`, `closesFence`, and `splitLines` from `sliceDesignValidator.ts` into it **unchanged**, and export all four.
- [ ] In `sliceDesignValidator.ts`, delete the moved definitions and import them from `./markdownLines.js`.
- [ ] Add a short header comment to `markdownLines.ts`: "CommonMark fence and line helpers shared by the heading validator and the pending-decision parser."
- [ ] Do not export the helpers from the package entry points (`node.ts` / `index.ts`). They are internal to `schema/`.
  - [ ] Success: `sliceDesignValidator.test.ts` and `sliceDesignFiles.test.ts` pass **without modification**. That is the behavior-preservation check.
  - [ ] Success: `pnpm typecheck` and `pnpm lint` pass, and `grep -n "function openingFence" packages/core/src/schema/*.ts` matches only `markdownLines.ts`.
- [ ] Commit: `refactor(core): extract fence helpers into markdownLines`
- **Effort:** 1/5

---

## Task 2: Implement the pure parser `pendingDecisions.ts` (D1, D2)

- [ ] Create `packages/core/src/schema/pendingDecisions.ts` and export:
  - [ ] `interface PendingDecision { heading: string; line: number }`. This is the **only** definition of the type. Every other module imports it from here.
  - [ ] `findPendingDecisions(text: string): PendingDecision[]`. It is pure: no I/O and no config.
- [ ] Define a single module-level constant holding the pending words: `pending-pm`, `pending_pm`, `pending`, `tbd`, `undecided`, `open`. Classification looks words up in this constant. Do not repeat the words anywhere else (D1: "Adding a word is a one-line change").
- [ ] Implement the scan with `splitLines` / `openingFence` / `closesFence` from `markdownLines.ts`:
  - [ ] Skip a leading YAML frontmatter block (`---` on line 1 through the next `---`).
  - [ ] Skip lines inside fenced code blocks. Track fence state the same way `sliceDesignValidator.ts` does.
  - [ ] Track the nearest preceding heading outside a fence (any level). Strip the `#` markers and trim.
  - [ ] Strip leading blockquote markers (`>`, possibly nested, with optional spaces), then trim.
  - [ ] Match the label with D1's anchored, case-insensitive prefix: an optional bullet (`-`, `*`, `+`), optional `*`/`_` emphasis up to 2 characters around `status`, then a colon. A line starting with a backtick does not match.
  - [ ] Value: strip the leading whitespace and emphasis markers after the colon. Take the first run of `[A-Za-z0-9_-]` and lowercase it. Ignore the rest of the line.
  - [ ] Classify with D1's table. A token in the pending constant is pending. Anything else (including `decided` or no token) is ignored.
  - [ ] Each pending match gives `{ heading, line }`, where `line` is 1-based. When no heading precedes the match, `heading` is the literal placeholder `(no heading)`. Define that placeholder as a named constant.
- [ ] Do **not** skip indented (4-space) code blocks (D1).
- [ ] Keep the file under ~150 lines and each function under ~50 lines.
  - [ ] Success: the module compiles and imports nothing from Node or config.
- **Effort:** 2/5

## Task 3: Parser unit tests

- [ ] Create `packages/core/tests/schema/pendingDecisions.test.ts`. Each item below is one `it` case or a small `it.each` table.
- [ ] **Label forms that block** (value `pending-pm`): plain `Status: pending-pm`, bold label `**Status:** pending-pm`, bold whole `**Status: pending-pm**`, bullet `- Status: pending-pm`, `* Status:` and `+ Status:`, and mixed case `STATUS: Pending-PM`.
- [ ] **Values that block:** `pending-pm.`, `pending-pm;`, `Pending-PM — waiting on PM`, `pending-pm*`, `pending pm`, `pending_pm`, `TBD`, `undecided`, `open`.
- [ ] **Pending-word list pin:** one `it.each` over exactly the six pending words. Add a comment saying that widening or narrowing the list is a deliberate change, and that this test must be updated with it.
- [ ] **Values that must not block:** `decided`, `decided.`, `Decided — PM 20261017`, each frontmatter status value (`not_started`, `in_progress`, `complete`, and any others listed in `packages/core/src/schema/frontmatterSchema.ts`), the misspelling `pendng-pm`, an empty value (`Status:`), and real prose from older designs: `**Status:** Executed and verified`, `**STATUS: SCRAPPED**`, `Status: shipped in 0.12`.
- [ ] **Skips:**
  - [ ] A design's own frontmatter `status: pending` line is ignored.
  - [ ] A pending line inside a backtick fence is ignored. So is one inside a tilde fence.
  - [ ] A line starting with inline code (`` `Status: pending-pm` ``) is ignored.
- [ ] **Pinned edge cases:**
  - [ ] A pending line inside a blockquote (`> Status: pending-pm`, and nested `> > ...`) blocks.
  - [ ] A pending line in a 4-space indented block blocks, with the correct line number.
- [ ] **Attribution:**
  - [ ] Two decisions under different `###` headings report each heading and the 1-based line of its status line.
  - [ ] Duplicate headings are told apart by line.
  - [ ] A status line before any heading reports `(no heading)`.
  - [ ] A heading inside a fence is not used for attribution.
- [ ] **Amoeba 108 layout fixture:** an inline fixture modeled on D2's example. It has a frontmatter block, a `## Technical Decisions` section, several `### D1 — …` to `### D8 — …` headings each with a `Status:` line, and `### D7 — Where amoeba finds the CF data directory` set to `pending-pm`. Expect exactly one result naming D7 with its line.
- [ ] **Real template:** read the installed template. Resolve it as `path.resolve(repoRoot, 'project-documents/ai-project-guide', SLICE_DESIGN_TEMPLATE_RELATIVE_PATH)`, and import the constant from core's guides module. Assert zero pending decisions. If the template file is missing, the test must **fail**, not skip.
- [ ] **This design as a fixture:** read `project-documents/user/slices/245-slice.pending-decision-gate.md` and assert zero pending decisions. Every example of pending syntax in it is fenced.
  - [ ] Success: `pnpm --filter @context-forge/core test -- pendingDecisions` passes, and every case above is present.
- [ ] Commit: `feat(core): add pending-decision parser`
- **Effort:** 2/5

---

## Task 4: Add the config key and `decisionGate.ts` (D3, API Contracts)

- [ ] In `packages/core/src/config/ConfigKeys.ts`, add `workflow.decision_gate_enabled`. Follow the `workflow.review_enabled` entry (:71) for shape:
  - [ ] type `boolean`, default `true`, scope `ConfigScope.Shared`.
  - [ ] Description: when true, a slice design with a pending PM decision status line fails `cf validate design` and blocks `cf next` from Phase 5 and 6. When false, the parser never runs.
- [ ] Create `packages/core/src/schema/decisionGate.ts`, a Node I/O module:
  - [ ] `isDecisionGateEnabled(config: ConfigManager): Promise<boolean>`. It reads the key through `config.get()`, and the registry default applies. Reference the key with a named constant or the existing key-reference pattern, not a re-typed string in several places.
  - [ ] `readPendingDecisions(absPath: string): Promise<PendingDecision[]>`. It reads the file and returns `findPendingDecisions(text)`. Read errors **propagate**. Do not catch them, and never return `[]` for a missing or unreadable file.
- [ ] Export `PendingDecision`, `findPendingDecisions`, `isDecisionGateEnabled`, and `readPendingDecisions` from `@context-forge/core/node` (`packages/core/src/node.ts`).
  - [ ] Success: `pnpm typecheck` passes.
- **Effort:** 1/5

## Task 5: Config key and `decisionGate` tests

- [ ] In `packages/core/tests/config/ConfigKeys.test.ts`, assert that the key exists and is boolean, shared, and defaults to `true`. Follow the existing per-key assertions.
- [ ] Create `packages/core/tests/schema/decisionGate.test.ts`:
  - [ ] `isDecisionGateEnabled` returns `true` with the key unset, `false` after it is set to `false`, and `true` after it is set to `true`. Use a temporary project directory with a real `ConfigManager`, the same way existing config tests do.
  - [ ] `readPendingDecisions` returns the parser result for a temp file that has a pending line.
  - [ ] `readPendingDecisions` **rejects** for a nonexistent path.
  - [ ] Success: `pnpm --filter @context-forge/core test -- ConfigKeys decisionGate` passes.
- [ ] Commit: `feat(core): add workflow.decision_gate_enabled and decision gate helpers`
- **Effort:** 1/5

---

## Task 6: Extend `validateSliceDesignFiles` in core (D7)

- [ ] In `packages/core/src/schema/sliceDesignFiles.ts`:
  - [ ] Add `pending: PendingDecision[]` to `DesignValidationResult`. It is always present.
  - [ ] Add a required third parameter `options: { decisionGateEnabled: boolean }` to `validateSliceDesignFiles`, and pass it on to `validateFile()`.
  - [ ] In `validateFile()`, run `findPendingDecisions` on the text it has **already read** only when `decisionGateEnabled` is true. Otherwise set `pending: []`. Do not call `readPendingDecisions` here (API Contracts table).
  - [ ] Set `pass = missing.length === 0 && pending.length === 0`. A docType failure still short-circuits as it does today, with `pending: []`.
- [ ] Update every existing caller of `validateSliceDesignFiles` to compile. The CLI caller is updated properly in Task 8. Until then, pass `{ decisionGateEnabled: true }` there with a `// TODO(245 Task 8)` comment, and remove that comment in Task 8.
  - [ ] Success: `pnpm typecheck` passes.
- **Effort:** 1/5

## Task 7: Core validation tests

- [ ] In `packages/core/tests/schema/sliceDesignFiles.test.ts`:
  - [ ] Update the existing calls to pass `{ decisionGateEnabled: true }`. Their expected results gain `pending: []` and are otherwise unchanged.
  - [ ] A valid design with one pending line, with the gate enabled, gives `pass: false`, an empty `missing`, and one `pending` entry with its heading and line.
  - [ ] The same design with the gate disabled gives `pass: true` and `pending: []`.
  - [ ] A design that is missing a required heading **and** has a pending line reports both.
  - [ ] A docType failure still short-circuits with `pending: []`.
  - [ ] Success: `pnpm --filter @context-forge/core test -- sliceDesign` passes.
- [ ] Commit: `feat(core): fail design validation on pending decisions`
- **Effort:** 1/5

---

## Task 8: `cf validate design` CLI plumbing and output (D7)

- [ ] In `packages/cli/src/commands/validateDesign.ts`:
  - [ ] Rename `resolveTemplatePath` to `resolveCheckout`, returning `{ checkoutRoot, templatePath }`. The function already computes the checkout root.
  - [ ] In `validateDesignAction`, build `new ConfigManager(checkoutRoot)`, call `isDecisionGateEnabled(config)`, and pass `{ decisionGateEnabled }` to `validateSliceDesignFiles`. Remove the Task 6 TODO.
  - [ ] Add `decisionGateEnabled: boolean` to `ValidateDesignJson`. Each `files[]` entry carries `pending` from the core result.
  - [ ] Human output: after any `missing:` lines for a failing file, print one line per pending decision in the D7 format, `  pending-pm: {heading} (line {n})`. Define the `pending-pm` label once as a constant in this file.
  - [ ] Exit codes do not change: 0 when all pass, 1 when any file fails, 2 on a usage or template error.
- **Effort:** 1/5

## Task 9: `cf validate design` CLI tests

- [ ] In `packages/cli/tests/commands/validate-design.test.ts`:
  - [ ] A design with a pending line prints `FAIL`, prints the `pending-pm: … (line N)` line, and exits 1.
  - [ ] After the line is changed to `decided`, it prints `PASS` and exits 0.
  - [ ] A design with no status lines passes exactly as before.
  - [ ] `--json` contains `files[0].pending` (one entry with `heading` and `line`) and `decisionGateEnabled: true`.
  - [ ] With `workflow.decision_gate_enabled` set to `false` in the test project's config, the pending design passes and `--json` reports `decisionGateEnabled: false`.
  - [ ] Success: `pnpm --filter @context-forge/cli test -- validate-design` passes.
- [ ] Commit: `feat(cli): report pending decisions in cf validate design`
- **Effort:** 2/5

---

## Task 10: Navigator status, payload, and routing (D4, D5)

- [ ] In `packages/core/src/introspection/types.ts`:
  - [ ] Add `'pending-decision'` to the `SliceStatus.status` union.
  - [ ] Add an optional `pendingDecisions?: PendingDecision[]` to `SliceStatus` and to `NextAction`, each with a one-line doc comment saying it is present only for the `pending-decision` status. Import `PendingDecision` from `../schema/pendingDecisions.js`. Do not redefine it.
- [ ] In `WorkflowNavigator.ts`, `deriveSliceStatus()`:
  - [ ] Add a private helper (for example `decisionGate(projectPath, designRelPath)`) that returns `PendingDecision[] | null`:
    - [ ] It returns `null` when `this.config` is undefined or `isDecisionGateEnabled` is false.
    - [ ] Otherwise it returns `readPendingDecisions(join(projectPath, designRelPath))`. Read errors propagate, the same way the task-file read failure does.
  - [ ] After the `needs-design` return and **before** any `evaluateGate` call, compute the pending decisions once.
  - [ ] Return `{ ...base, status: 'pending-decision', pendingDecisions }` (non-empty) on each of these paths:
    - [ ] no task file (before the preTasks gate);
    - [ ] a task file with zero total tasks;
    - [ ] any implementation progress short of complete, before the pre-implementation gate.
  - [ ] Do **not** apply it on the `STATUS.Complete` path (pre-advance).
  - [ ] Avoid duplicating the check across branches. Compute once, then use one early return placed before the task-file branching and guarded by "not complete". Restructure the order of the existing code only as far as needed to keep the `complete` path unaffected.
  - [ ] The gate ignores `review_enabled`, `review: none`, and `review_gate_effective_date` (D4). Keep `gateExempt` on `base` as it is today.
- [ ] In `getNext()`, add a `// LIFECYCLE: decision-gate` branch placed **before** `needs-tasks`. It returns the D5 shape:
  - [ ] `recommendation`: `'Blocked: design has pending PM decisions'`. Define it as a constant and reference that constant.
  - [ ] `rationale`: names the slice index and count, and lists each `{heading} (line {n})`, followed by the D5 resolution instruction. Use singular or plural wording that matches the count.
  - [ ] `slice: project.fileSlice`, `phase: 'Phase 4: Slice Design'`, and `summary` in the D5 form: `Blocked — slice {n} has {k} pending PM decision(s)`.
  - [ ] `pendingDecisions` copied from the slice status.
  - [ ] Route it through `enrich()` like the other branches, so the existing `cf set phase` suggestion appears when the project phase is later than Phase 4.
- [ ] Keep `WorkflowNavigator.ts` changes small. If the helper and branch together exceed ~40 lines, put the helper in `decisionGate.ts`.
  - [ ] Success: `pnpm typecheck` passes, and the existing navigator tests pass unchanged. Those tests construct a navigator without config, so the gate is off for them.
- **Effort:** 3/5

## Task 11: Navigator tests

- [ ] Create `packages/core/tests/introspection/WorkflowNavigator.decisionGate.test.ts`. Follow the fixture setup in `WorkflowNavigator.reviewGate.test.ts`, which uses a temp project, a `ConfigManager`, and an active slice.
- [ ] Design with a pending line and **no task file**:
  - [ ] `getNext()` returns the decision-gate recommendation with `pendingDecisions`, `phase: 'Phase 4: Slice Design'`, and not "Create task breakdown".
  - [ ] `getStatus().activeSlice.status === 'pending-decision'` and `pendingDecisions` is set.
- [ ] Task file with **zero** items checked, then with **partial** progress: both return the decision gate, not "Continue implementation".
- [ ] Task file with **all** items checked: the decision gate does not fire, and the result matches the same fixture without the pending line.
- [ ] **Review-gate precedence:** with `review_enabled = true` and no slice review artifact, the decision gate wins over `pending-review`.
- [ ] **`review: none` independence:** a design with `review: none` and a pending line still returns `pending-decision`.
- [ ] **Gate disabled:** with `workflow.decision_gate_enabled = false`, all of the above return the pre-245 recommendation.
- [ ] **No ConfigManager:** a navigator built without config ignores the pending line.
- [ ] **Resolved:** after the line is changed to `decided`, the normal recommendation returns.
- [ ] **Unreadable design:** `getNext()` rejects. Make the detected design path unreadable, for example a directory with that name or `chmod 000`, whichever existing tests already use.
- [ ] **Phase suggestion:** with the project phase set to Phase 6, the result carries the `enrich()` `cf set phase` suggestion.
  - [ ] Success: `pnpm --filter @context-forge/core test -- WorkflowNavigator` passes (the new file and all existing ones).
- [ ] Commit: `feat(core): add pending-decision slice status and next routing`
- **Effort:** 3/5

---

## Task 12: `cf next` human output (D5)

- [ ] In `packages/cli/src/commands/next.ts`, when `result.pendingDecisions` is present, print one indented line per decision after the `Rationale:` line (:51): `  - {heading} (line {n})`. Use the existing `dim` style.
- [ ] `--json` needs no change, because `pendingDecisions` serializes from `NextAction`.
- [ ] Add tests in `packages/cli/tests/commands/next.test.ts`:
  - [ ] The human output lists each pending decision under Rationale.
  - [ ] `--json` includes `pendingDecisions`.
  - [ ] Output with no pending decisions is unchanged.
  - [ ] Success: `pnpm --filter @context-forge/cli test -- next` passes.
- [ ] Commit: `feat(cli): list pending decisions in cf next`
- **Effort:** 1/5

---

## Task 13: ConsistencyChecker rule `pending-decision` (D8)

- [ ] In `packages/core/src/schema/decisionGate.ts`, add one function that builds this slice's findings, for example `pendingDecisionFindings(...)`. It returns the finding list for one slice:
  - [ ] When there are pending decisions: one `warning` finding with rule id `'pending-decision'`. The message lists each `{heading} (line {n})`, and the finding is not fixable.
  - [ ] When the design read rejects: catch it **for this slice only** and return one `error`-severity `pending-decision` finding that names the file and the error message. Mirror `safeEvaluateGate` (ConsistencyChecker :592), including a comment saying why the catch is correct (per-slice isolation, so the run continues).
  - [ ] Otherwise: no findings.
- [ ] Add `'pending-decision'` to the ConsistencyChecker rule-id type or union, wherever the existing rule ids are declared.
- [ ] In `ConsistencyChecker.checkSlice()` (:244), add **a single call** to that function. Apply it only when the slice has a design, is not complete (D4 scope), and the gate is enabled (the checker's `ConfigManager`, through `isDecisionGateEnabled`). If the checker has no config, the gate is off. Do not parse inline.
- [ ] In `packages/mcp-server/src/tools/workflowTools.ts` (~:221), add the pending-decision rule to the `workflow_check` "Detects:" description string. This is the only MCP change.
  - [ ] Success: `pnpm typecheck` passes, and the `ConsistencyChecker.ts` diff is only the call, the guard, and the import.
- **Effort:** 2/5

## Task 14: ConsistencyChecker and MCP tests

- [ ] Create `packages/core/tests/introspection/ConsistencyChecker.pendingDecision.test.ts`. Follow `ConsistencyChecker.reviewGate.test.ts` for fixtures.
  - [ ] An in-progress slice whose design has two pending lines gives exactly one `warning` finding with rule `pending-decision` that names both decisions. `fixable` is false or absent, matching how other non-fixable findings are represented.
  - [ ] A complete slice with a pending line gives no `pending-decision` finding.
  - [ ] A slice with no pending lines gives no finding.
  - [ ] The gate disabled through config gives no finding.
  - [ ] One unreadable design and one readable pending design give an `error` finding for the first and a `warning` for the second, so the run continues.
  - [ ] The `cf check` exit status is unaffected by the warning, per the existing exit logic. Assert this in the CLI check test if one exists. Otherwise assert that the result's error count is zero.
- [ ] In `packages/mcp-server/tests/introspectionTools.test.ts` or the file that covers `workflow_check`, assert that the description includes the new rule, if descriptions are tested there. If they are not, skip this item.
  - [ ] Success: `pnpm --filter @context-forge/core test -- ConsistencyChecker` and `pnpm --filter @context-forge/mcp test` pass.
- [ ] Commit: `feat(core): add pending-decision consistency check`
- **Effort:** 2/5

---

## Task 15: Documentation

- [ ] `README.md`, in the config table near :385: add the row `workflow.decision_gate_enabled | shared | Block design validation and cf next on pending PM decisions (on by default).`
- [ ] `docs/REVIEW-GATING.md`: add a short section, **Decision Gate**, after "Workflow States" (~:84). It must state:
  - [ ] What the gate checks. Quote the status-line form inside a fence, because the gate must not trip on this doc's own text. Also give the pending words and say that other values are ignored.
  - [ ] The key `workflow.decision_gate_enabled`, its default `true`, and that it is independent of `review_enabled`, `review: none`, and the effective date.
  - [ ] The new `pending-decision` slice status, where it fires (Phase 5 and Phase 6, not complete slices), and that it takes precedence over review gates.
  - [ ] That `cf check` / `workflow_check` reports the condition as a `warning` and **does not block on it** (D8).
  - [ ] The Squadron contract: `cf validate design --json` (`files[].pending`, `decisionGateEnabled`), `cf next --json` (`pendingDecisions`), and `cf status --json` (`activeSlice.status === 'pending-decision'`). Say that consumers key on field names, never on `recommendation` text, and that `pendingDecisions` is the one additive field on `NextAction`.
- [ ] Add a `pending-decision` bullet to the "Workflow States" list and to the "`cf check` Findings" section, linking to the new section.
  - [ ] Success: every key name, field name, and status string in the docs matches the code exactly. Cross-check with `grep -rn "decision_gate_enabled\|pendingDecisions\|pending-decision" packages/*/src`.
- [ ] Commit: `docs: document the pending decision gate`
- **Effort:** 1/5

---

## Task 16: Full verification and walkthrough

- [ ] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`. All pass.
- [ ] Confirm that no new file is over ~300 lines: `wc -l` on `markdownLines.ts`, `pendingDecisions.ts`, `decisionGate.ts`, and the new test files.
- [ ] Run the design's **Verification Walkthrough** steps 1–9 with `node packages/cli/dist/index.js`, against a scratch project or this repo.
  - [ ] Use `/tmp/pd.md` for steps 1–4.
  - [ ] For steps 5–9 in this repo, create a temporary pending line in the 245 design, and **revert it** before committing (`git diff` must show no change to the design file).
  - [ ] After step 9, run `cf config unset workflow.decision_gate_enabled`.
- [ ] Run `node packages/cli/dist/index.js validate design project-documents/user/slices/245-slice.pending-decision-gate.md`. It PASSes (Special Considerations).
  - [ ] Success: every walkthrough step gives the expected output, `git status` shows no stray config or design edits, and all checks are green.
- [ ] Commit any corrections from this task with the semantic prefix that matches the change (`feat`, `test`, or `docs`). If there is nothing to commit, note that in the task-checker update.
- **Effort:** 2/5
