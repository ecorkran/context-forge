---
docType: tasks
slice: pending-decision-gate
project: context-forge
lld: project-documents/user/slices/245-slice.pending-decision-gate.md
dependencies:
- 241
- 242
projectState: 'Initiative 240 review gating is merged (241 navigator gate in deriveSliceStatus/getNext,
  242 ConsistencyChecker per-slice rule pattern). ai-project-guide#44 shipped the
  per-decision `Status: decided | pending-pm` line in the installed slice-design template.
  Nothing in Context Forge reads that line yet (issue #121).'
dateCreated: 20261017
dateUpdated: '20261018'
status: in_progress
turns: 37
promptTokens: 2048901
cachedTokens: 1946403
cacheWriteTokens: 102442
completionTokens: 37389
durationSeconds: 316.0
costUsd: 1.957102
usageRounds: 3
pricedRounds: 3
revision_number: 2
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
  - `packages/core/src/introspection/ConsistencyChecker.ts`: `checkSlice()` (:244), `safeEvaluateGate()` (:592). The file is already 1429 lines, so the new rule is one small private method next to `safeEvaluateGate`. All file reading and parsing stays in `decisionGate.ts`.
  - `packages/cli/src/commands/validateDesign.ts`: `ValidateDesignJson` (:25), `resolveTemplatePath` (:34).
  - `packages/cli/src/commands/next.ts`: prints `Rationale:` at :51.
  - `packages/cli/src/commands/status.ts` prints `activeSlice.status` generically (:177). It needs no code change, but it gets a test (Task 6).
  - `packages/mcp-server/src/tools/workflowTools.ts`: the `workflow_check` "Detects:" string at ~:221. `workflow_next` / `workflow_status` are tested in `packages/mcp-server/tests/workflowTools.test.ts` (:271, :322).
  - Tests live in `packages/core/tests/{schema,introspection,config}/`, `packages/cli/tests/commands/`, and `packages/mcp-server/tests/`.
- Use the local build for manual checks: `node packages/cli/dist/index.js`. The global `cf` is the published npm build.
- Verification commands: `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @context-forge/core test`, `pnpm --filter @context-forge/cli test`, `pnpm --filter @context-forge/mcp test`.

---

## Task 0: Pre-flight

- [x] Read the target: `node packages/cli/dist/index.js config get git.integration_branch`. Empty means the target is `main`.
- [x] Confirm a clean working tree (`git status --short`).
- [x] Create the slice branch from the target: `git checkout -b 245-slice.pending-decision-gate {target}`. If the branch already exists, switch to it instead.
- [x] Run `pnpm -r build` and `pnpm --filter @context-forge/core test` once, to record a green baseline.
  - [x] Success: you are on `245-slice.pending-decision-gate` and the baseline build and tests pass. If the baseline fails, stop and report it. Do not fix unrelated failures in this slice.
- **Effort:** 1/5

---

## Task 1: Extract the fence helpers into `markdownLines.ts` (D6)

- [x] Create `packages/core/src/schema/markdownLines.ts`. Move `OpenFence`, `openingFence`, `closesFence`, and `splitLines` from `sliceDesignValidator.ts` into it **unchanged**, and export all four.
- [x] In `sliceDesignValidator.ts`, delete the moved definitions and import them from `./markdownLines.js`.
- [x] Add a short header comment to `markdownLines.ts`: "CommonMark fence and line helpers shared by the heading validator and the pending-decision parser."
- [x] Do not export the helpers from the package entry points (`node.ts` / `index.ts`). They are internal to `schema/`.
  - [x] Success: `sliceDesignValidator.test.ts` and `sliceDesignFiles.test.ts` pass **without modification**. That is the behavior-preservation check.
  - [x] Success: `pnpm typecheck` and `pnpm lint` pass, and `grep -n "function openingFence" packages/core/src/schema/*.ts` matches only `markdownLines.ts`.
- [x] Commit: `refactor(core): extract fence helpers into markdownLines`
- **Effort:** 1/5

---

## Task 2: Pure parser `pendingDecisions.ts`, with tests (D1, D2)

- [x] Create `packages/core/src/schema/pendingDecisions.ts`. It is pure: no Node imports and no config. Export:
  - [x] `interface PendingDecision { heading: string; line: number }`. This is the only definition of the type. Every other module imports it from here.
  - [x] `findPendingDecisions(text: string): PendingDecision[]`.
- [x] Hold the pending words (`pending-pm`, `pending_pm`, `pending`, `tbd`, `undecided`, `open`) in one module constant, and the `(no heading)` placeholder in another.
- [x] Implement D1 and D2 with the `markdownLines.ts` helpers:
  - [x] Skip the frontmatter block and fenced lines.
  - [x] Strip blockquote markers.
  - [x] Match the anchored, case-insensitive label.
  - [x] Take the first `[A-Za-z0-9_-]` token, lowercased.
  - [x] Report the nearest heading outside a fence and the 1-based line number.
  - [x] Do not skip indented code blocks.
- [x] Tests in `packages/core/tests/schema/pendingDecisions.test.ts`:
  - [x] Cover the block and no-block fixtures listed in the design's **Technical Requirements**, the label forms in D1, and the blockquote and indented-block pins in D1.
  - [x] Pin the pending-word list with one `it.each`, plus a comment saying that changing the list is deliberate.
  - [x] Frontmatter values: run `it.each` over the exported `VALID_STATUSES`, not a typed list.
  - [x] Attribution: separate headings, duplicate headings told apart by line, `(no heading)`, and a fenced heading that is not used.
  - [x] An amoeba 108-style fixture where only `### D7 — …` is pending.
  - [x] The installed template (`SLICE_DESIGN_TEMPLATE_RELATIVE_PATH`) and this slice's design both give zero pending. A missing template fails the test; it does not skip.
  - [x] Success: `pnpm --filter @context-forge/core test -- pendingDecisions` passes.
- [x] Commit: `feat(core): add pending-decision parser`
- **Effort:** 2/5

---

## Task 3: Config key and `decisionGate.ts`, with tests (D3, API Contracts)

- [x] In `packages/core/src/config/ConfigKeys.ts`, add `workflow.decision_gate_enabled`, shaped like `workflow.review_enabled` (:71): `boolean`, default `true`, `ConfigScope.Shared`. Description: when true, a pending PM decision in a slice design fails `cf validate design` and blocks `cf next` from Phase 5 and 6. When false, the parser never runs.
- [x] Create `packages/core/src/schema/decisionGate.ts` (Node I/O only, no finding construction):
  - [x] `isDecisionGateEnabled(config: ConfigManager): Promise<boolean>`. It reads the key through `config.get()`, so the registry default applies. Do not re-type the key string in several places.
  - [x] `readPendingDecisions(absPath: string): Promise<PendingDecision[]>`. It reads the file and returns `findPendingDecisions(text)`. Read errors **propagate**; never return `[]` for a missing or unreadable file.
- [x] Export `PendingDecision`, `findPendingDecisions`, `isDecisionGateEnabled`, and `readPendingDecisions` from `packages/core/src/node.ts`.
- [x] Tests:
  - [x] `ConfigKeys.test.ts`: the key is boolean, shared, and defaults to `true`.
  - [x] New `packages/core/tests/schema/decisionGate.test.ts`, using a temp project with a real `ConfigManager`: `isDecisionGateEnabled` is `true` when unset and `false` when set to `false`. `readPendingDecisions` returns the parser result for a file with a pending line, and **rejects** for a nonexistent path.
  - [x] Success: `pnpm typecheck` and `pnpm --filter @context-forge/core test -- ConfigKeys decisionGate` pass.
- [x] Commit: `feat(core): add workflow.decision_gate_enabled and decision gate helpers`
- **Effort:** 1/5

---

## Task 4: `cf validate design` fails on pending decisions, with tests (D7)

Core and CLI change together in this task, so no commit leaves a temporary hard-coded flag.

- [x] In `packages/core/src/schema/sliceDesignFiles.ts`:
  - [x] Add `pending: PendingDecision[]` to `DesignValidationResult`. It is always present.
  - [x] Add a required parameter `options: { decisionGateEnabled: boolean }` to `validateSliceDesignFiles` and pass it on to `validateFile()`.
  - [x] In `validateFile()`, run `findPendingDecisions` on the text it has already read, and only when the flag is true. Otherwise use `pending: []`. Do not call `readPendingDecisions` here (API Contracts table).
  - [x] Set `pass = missing.length === 0 && pending.length === 0`. A docType failure still short-circuits, with `pending: []`.
- [x] In `packages/cli/src/commands/validateDesign.ts`:
  - [x] Rename `resolveTemplatePath` to `resolveCheckout`, returning `{ checkoutRoot, templatePath }`.
  - [x] In `validateDesignAction`, build `new ConfigManager(checkoutRoot)`, call `isDecisionGateEnabled(config)`, and pass `{ decisionGateEnabled }` to `validateSliceDesignFiles`.
  - [x] Add `decisionGateEnabled: boolean` to `ValidateDesignJson`. Each `files[]` entry carries `pending`.
  - [x] Human output: after any `missing:` lines, print one line per pending decision, `  pending-pm: {heading} (line {n})`. Define the `pending-pm` label once as a constant.
  - [x] Exit codes do not change: 0 when all pass, 1 when any fails, 2 on a usage or template error.
- [x] Tests:
  - [x] `sliceDesignFiles.test.ts`:
    - [x] Existing calls pass `{ decisionGateEnabled: true }`, and their expected results gain only `pending: []`.
    - [x] A pending line with the gate enabled gives `pass: false` and one `pending` entry. With the gate disabled it gives `pass: true` and `pending: []`.
    - [x] A missing heading plus a pending line reports both.
  - [x] `validate-design.test.ts`:
    - [x] A pending line prints `FAIL` and the `pending-pm: … (line N)` line, and exits 1. Changed to `decided`, it prints `PASS` and exits 0.
    - [x] A design with no status lines passes as before.
    - [x] `--json` has `files[0].pending` and `decisionGateEnabled: true`. With the key set to `false`, the design passes and the output reports `decisionGateEnabled: false`.
  - [x] Success: `pnpm typecheck`, `pnpm --filter @context-forge/core test -- sliceDesign`, and `pnpm --filter @context-forge/cli test -- validate-design` pass.
- [x] Commit: `feat: fail cf validate design on pending decisions`
- **Effort:** 2/5

---

## Task 5: Navigator status, payload, and routing, with tests (D4, D5)

- [x] In `packages/core/src/introspection/types.ts`, add `'pending-decision'` to the `SliceStatus.status` union. Add an optional `pendingDecisions?: PendingDecision[]` to `SliceStatus` and `NextAction`, present only for that status. Import the type; do not redefine it.
- [x] In `WorkflowNavigator.deriveSliceStatus()` (~:636), make exactly these changes, in this order:
  1. Add a private helper `pendingDecisionsFor(projectPath, sliceDesign): Promise<PendingDecision[]>`. It returns `[]` when `this.config` is undefined or `isDecisionGateEnabled` is false. Otherwise it returns `readPendingDecisions(join(projectPath, sliceDesign))`, and read errors propagate.
  2. Move the task-file parse up. Directly after the `gateExempt` assignment, compute `taskResult` when `docs.taskFile` exists (the same `parseTaskFileSafe` call that sits below today). Delete the later call and keep using the same variable.
  3. Immediately after that, add the single early return. When `taskResult?.inferredStatus !== STATUS.Complete` and the helper returns a non-empty list, return `{ ...base, status: 'pending-decision', pendingDecisions }`. This covers no task file, zero tasks, and partial progress, all before any `evaluateGate` call.
  4. Leave every branch after that (preTasks, needs-tasks, Complete/preAdvance, preImplementation, in-implementation) unchanged.
  - [x] Do not read `review_enabled`, `review: none`, or the effective date for this gate (D4).
- [x] In `getNext()`, add a `// LIFECYCLE: decision-gate` branch before `needs-tasks`, returned through `enrich()`:
  - [x] `recommendation`: `'Blocked: design has pending PM decisions'`, held in a constant.
  - [x] `rationale`: per D5, the slice index, the count, each `{heading} (line {n})`, and the resolution instruction.
  - [x] `summary`: `Blocked — slice {n} has {k} pending PM decision(s)`, with singular or plural wording that matches the count.
  - [x] `slice: project.fileSlice`, `phase: 'Phase 4: Slice Design'`, and `pendingDecisions`.
- [x] Tests in a new `packages/core/tests/introspection/WorkflowNavigator.decisionGate.test.ts`, with fixtures set up like `WorkflowNavigator.reviewGate.test.ts`:
  - [x] **No task file:** `getNext()` returns the decision gate, and `getStatus().activeSlice.status` is `'pending-decision'` with `pendingDecisions`.
  - [x] **Zero and partial progress:** both return the decision gate. **All checked:** the gate does not fire.
  - [x] **Precedence:** with `review_enabled = true` and no review artifact, the decision gate wins. With `review: none`, the decision gate still fires.
  - [x] **Off:** with the key `false`, or with no `ConfigManager`, you get the pre-245 result. Changed to `decided`, the normal recommendation returns.
  - [x] **Unreadable design:** `getNext()` rejects.
  - [x] **Phase:** at project Phase 6, the result carries the `cf set phase` suggestion.
  - [x] Success: `pnpm typecheck` passes, and `pnpm --filter @context-forge/core test -- WorkflowNavigator` passes with the existing files unchanged.
- [x] Commit: `feat(core): add pending-decision slice status and next routing`
  Note: existing review-gate tests failed because `makeStubConfig` throws on unknown keys, so `'workflow.decision_gate_enabled': false` was added to `GATE_ENABLED_DEFAULTS` in `tests/helpers/workflowNavigatorFixtures.js` and to the local `GATE_ENABLED` in `WorkflowNavigator.reviewVisibility.test.ts` (one line each). No test assertions changed.
- **Effort:** 3/5

---

## Task 6: `cf next` output and the status/MCP surfaces (D5)

- [x] In `packages/cli/src/commands/next.ts`, when `result.pendingDecisions` is present, print one `dim` line per decision after `Rationale:` (:51): `  - {heading} (line {n})`. `--json` needs no change.
- [x] Tests. Each one uses a fixture whose active slice design has a pending line and no task file:
  - [x] `packages/cli/tests/commands/next.test.ts`: the human output lists each decision, and `--json` includes `pendingDecisions`. Output with nothing pending is unchanged.
  - [x] `packages/cli/tests/commands/status.test.ts`: the human output shows `Status: pending-decision`. `--json` has `activeSlice.status === 'pending-decision'` and `activeSlice.pendingDecisions`.
  - [x] `packages/mcp-server/tests/workflowTools.test.ts`: the `workflow_next` response includes `pendingDecisions`. The `workflow_status` response has `activeSlice.status === 'pending-decision'`.
  - [x] Success: `pnpm --filter @context-forge/cli test -- next status` and `pnpm --filter @context-forge/mcp test -- workflowTools` pass.
- [x] Commit: `feat(cli): list pending decisions in cf next`
- **Effort:** 2/5

Note: The CLI and MCP tests in this task follow the existing pattern of mocking the navigator. Their fixtures are mocked navigator results, not real design files. End-to-end behaviour is covered by the core navigator tests and the Task 9 walkthrough.

---

## Task 7: ConsistencyChecker rule `pending-decision`, with tests (D8)

- [ ] Add `'pending-decision'` to the ConsistencyChecker rule-id type, wherever the existing rule ids are declared.
- [ ] In `ConsistencyChecker.ts`, add one private method next to `safeEvaluateGate` (:592), for example `pendingDecisionFindings(...)`. It calls `readPendingDecisions` and returns:
  - [ ] one non-fixable `warning` finding, rule `pending-decision`, listing each `{heading} (line {n})`, when anything is pending;
  - [ ] when the read rejects, one `error` finding with the same rule that names the file and the message. The catch is per slice so the run continues. Mirror `safeEvaluateGate`, including its comment explaining why the catch is correct;
  - [ ] no findings otherwise.
- [ ] In `checkSlice()` (:244), call that method only when the slice has a design, is not complete (D4 scope), and the gate is enabled through the checker's `ConfigManager`. Without a config, the gate is off.
- [ ] In `packages/mcp-server/src/tools/workflowTools.ts` (~:221), add the rule to the `workflow_check` "Detects:" string.
- [ ] Tests in a new `packages/core/tests/introspection/ConsistencyChecker.pendingDecision.test.ts`, with fixtures set up like `ConsistencyChecker.reviewGate.test.ts`:
  - [ ] An in-progress slice with two pending lines gives exactly one `warning` that names both decisions. Its error count is zero, so `cf check` does not fail.
  - [ ] There is no finding for a complete slice, for a slice with nothing pending, or with the gate disabled.
  - [ ] One unreadable design and one pending design give an `error` for the first and a `warning` for the second.
  - [ ] Success: `pnpm --filter @context-forge/core test -- ConsistencyChecker` and `pnpm --filter @context-forge/mcp test` pass.
- [ ] Commit: `feat(core): add pending-decision consistency check`
- **Effort:** 2/5

---

## Task 8: Documentation

- [ ] `README.md` config table (near :385): add `workflow.decision_gate_enabled | shared | Block design validation and cf next on pending PM decisions (on by default).`
- [ ] `docs/REVIEW-GATING.md`: add a short **Decision Gate** section after "Workflow States" (~:84). It covers:
  - [ ] the status-line form, quoted inside a fence, the pending words, and the fact that other values are ignored;
  - [ ] the key, its default `true`, and that it is independent of `review_enabled`, `review: none`, and the effective date;
  - [ ] the `pending-decision` status: it fires in Phase 5 and 6, not on complete slices, and takes precedence over review gates;
  - [ ] that `cf check` / `workflow_check` only warns and **does not block** (D8);
  - [ ] the Squadron contract: `cf validate design --json` (`files[].pending`, `decisionGateEnabled`), `cf next --json` (`pendingDecisions`), `cf status --json` (`activeSlice.status`). Consumers key on field names, never on `recommendation` text, and `pendingDecisions` is the one additive field on `NextAction`.
- [ ] Add a `pending-decision` bullet to "Workflow States" and to "`cf check` Findings", each linking to the new section.
  - [ ] Success: every key, field, and status string in the docs matches the code. Cross-check with `grep -rn "decision_gate_enabled\|pendingDecisions\|pending-decision" packages/*/src`.
- [ ] Commit: `docs: document the pending decision gate`
- **Effort:** 1/5

---

## Task 9: CI check and walkthrough

- [ ] Run the CI sequence from `.github/workflows/ci.yml`, in its order: `pnpm install --frozen-lockfile`, `pnpm -r build`, `pnpm typecheck`, `pnpm lint`, `pnpm test`. Every step passes.
- [ ] Run the design's **Verification Walkthrough** steps 1–9 with `node packages/cli/dist/index.js`:
  - [ ] Use `/tmp/pd.md` for steps 1–4.
  - [ ] For steps 5–9, put a temporary pending line in the 245 design, then revert it.
  - [ ] Finish with `cf config unset workflow.decision_gate_enabled`.
  - [ ] Success: every step gives the expected output, and `git status` shows no stray config or design edits.
- [ ] Commit any corrections with the matching semantic prefix. If there is nothing to commit, note that in the task-checker update.
- **Effort:** 1/5
