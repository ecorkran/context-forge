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
status: not_started
turns: 30
promptTokens: 1518103
cachedTokens: 1430314
cacheWriteTokens: 87743
completionTokens: 28407
durationSeconds: 245.3
costUsd: 1.556612
usageRounds: 2
pricedRounds: 2
revision_number: 1
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
  - `packages/cli/src/commands/status.ts` prints `activeSlice.status` generically (:177). It needs no code change, but it gets a test (Task 9).
  - `packages/mcp-server/src/tools/workflowTools.ts`: the `workflow_check` "Detects:" string at ~:221. `workflow_next` / `workflow_status` are tested in `packages/mcp-server/tests/workflowTools.test.ts` (:271, :322).
  - Tests live in `packages/core/tests/{schema,introspection,config}/`, `packages/cli/tests/commands/`, and `packages/mcp-server/tests/`.
- Use the local build for manual checks: `node packages/cli/dist/index.js`. The global `cf` is the published npm build.
- Verification commands: `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @context-forge/core test`, `pnpm --filter @context-forge/cli test`, `pnpm --filter @context-forge/mcp test`.

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
- [ ] **Values that must not block:** `decided`, `decided.`, `Decided — PM 20261017`, every frontmatter status value (an `it.each` over the exported `VALID_STATUSES` from `packages/core/src/schema/frontmatterSchema.ts`, never a hand-typed list), the misspelling `pendng-pm`, an empty value (`Status:`), and real prose from older designs: `**Status:** Executed and verified`, `**STATUS: SCRAPPED**`, `Status: shipped in 0.12`.
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

## Task 4: Config key and `decisionGate.ts`, with tests (D3, API Contracts)

- [ ] In `packages/core/src/config/ConfigKeys.ts`, add `workflow.decision_gate_enabled`, shaped like `workflow.review_enabled` (:71): `boolean`, default `true`, `ConfigScope.Shared`. Description: when true, a pending PM decision in a slice design fails `cf validate design` and blocks `cf next` from Phase 5 and 6. When false, the parser never runs.
- [ ] Create `packages/core/src/schema/decisionGate.ts` (Node I/O only, no finding construction):
  - [ ] `isDecisionGateEnabled(config: ConfigManager): Promise<boolean>`. It reads the key through `config.get()`, so the registry default applies. Do not re-type the key string in several places.
  - [ ] `readPendingDecisions(absPath: string): Promise<PendingDecision[]>`. It reads the file and returns `findPendingDecisions(text)`. Read errors **propagate**; never return `[]` for a missing or unreadable file.
- [ ] Export `PendingDecision`, `findPendingDecisions`, `isDecisionGateEnabled`, and `readPendingDecisions` from `packages/core/src/node.ts`.
- [ ] Tests:
  - [ ] `ConfigKeys.test.ts`: the key is boolean, shared, and defaults to `true`.
  - [ ] New `packages/core/tests/schema/decisionGate.test.ts`, using a temp project with a real `ConfigManager`: `isDecisionGateEnabled` is `true` when unset and `false` when set to `false`. `readPendingDecisions` returns the parser result for a file with a pending line, and **rejects** for a nonexistent path.
  - [ ] Success: `pnpm typecheck` and `pnpm --filter @context-forge/core test -- ConfigKeys decisionGate` pass.
- [ ] Commit: `feat(core): add workflow.decision_gate_enabled and decision gate helpers`
- **Effort:** 1/5

---

## Task 5: `cf validate design` fails on pending decisions (D7)

Core and CLI change together in this task, so no commit leaves a temporary hard-coded flag.

- [ ] In `packages/core/src/schema/sliceDesignFiles.ts`:
  - [ ] Add `pending: PendingDecision[]` to `DesignValidationResult`. It is always present.
  - [ ] Add a required parameter `options: { decisionGateEnabled: boolean }` to `validateSliceDesignFiles` and pass it on to `validateFile()`.
  - [ ] In `validateFile()`, run `findPendingDecisions` on the text it has already read, and only when the flag is true. Otherwise use `pending: []`. Do not call `readPendingDecisions` here (API Contracts table).
  - [ ] Set `pass = missing.length === 0 && pending.length === 0`. A docType failure still short-circuits, with `pending: []`.
- [ ] In `packages/cli/src/commands/validateDesign.ts`:
  - [ ] Rename `resolveTemplatePath` to `resolveCheckout`, returning `{ checkoutRoot, templatePath }`.
  - [ ] In `validateDesignAction`, build `new ConfigManager(checkoutRoot)`, call `isDecisionGateEnabled(config)`, and pass `{ decisionGateEnabled }` to `validateSliceDesignFiles`.
  - [ ] Add `decisionGateEnabled: boolean` to `ValidateDesignJson`. Each `files[]` entry carries `pending`.
  - [ ] Human output: after any `missing:` lines, print one line per pending decision, `  pending-pm: {heading} (line {n})`. Define the `pending-pm` label once as a constant.
  - [ ] Exit codes do not change: 0 when all pass, 1 when any fails, 2 on a usage or template error.
  - [ ] Success: `pnpm typecheck` passes.
- **Effort:** 2/5

## Task 6: `cf validate design` tests

- [ ] `packages/core/tests/schema/sliceDesignFiles.test.ts`:
  - [ ] Existing calls pass `{ decisionGateEnabled: true }`, and their expected results gain only `pending: []`.
  - [ ] A pending line with the gate enabled gives `pass: false` and one `pending` entry. With the gate disabled it gives `pass: true` and `pending: []`.
  - [ ] A missing heading plus a pending line reports both. A docType failure still short-circuits.
- [ ] `packages/cli/tests/commands/validate-design.test.ts`:
  - [ ] A pending line prints `FAIL` and the `pending-pm: … (line N)` line, and exits 1. Changed to `decided`, it prints `PASS` and exits 0.
  - [ ] A design with no status lines passes as before.
  - [ ] `--json` has `files[0].pending` (with `heading` and `line`) and `decisionGateEnabled: true`. With the key set to `false`, the design passes and the output reports `decisionGateEnabled: false`.
  - [ ] Success: `pnpm --filter @context-forge/core test -- sliceDesign` and `pnpm --filter @context-forge/cli test -- validate-design` pass.
- [ ] Commit: `feat: fail cf validate design on pending decisions`
- **Effort:** 2/5

---

## Task 7: Navigator status, payload, and routing (D4, D5)

- [ ] In `packages/core/src/introspection/types.ts`, add `'pending-decision'` to the `SliceStatus.status` union. Add an optional `pendingDecisions?: PendingDecision[]` to `SliceStatus` and `NextAction`, present only for that status. Import the type from `../schema/pendingDecisions.js`; do not redefine it.
- [ ] In `WorkflowNavigator.deriveSliceStatus()`:
  - [ ] After the `needs-design` return and **before** any `evaluateGate` call, compute the pending decisions once. Use `[]` when `this.config` is undefined or `isDecisionGateEnabled` is false. Otherwise call `readPendingDecisions(join(projectPath, docs.sliceDesign))`, and let read errors propagate.
  - [ ] When the list is non-empty, return `{ ...base, status: 'pending-decision', pendingDecisions }` for every case except a task file whose `inferredStatus` is `STATUS.Complete`. That covers no task file, zero tasks, and any partial progress. Use one early return, and restructure the existing order only as far as that requires.
  - [ ] The gate ignores `review_enabled`, `review: none`, and the effective date (D4). Leave `gateExempt` on `base` as it is.
- [ ] In `getNext()`, add a `// LIFECYCLE: decision-gate` branch **before** `needs-tasks`, returning the D5 shape through `enrich()`:
  - [ ] `recommendation`: `'Blocked: design has pending PM decisions'`, held in a constant.
  - [ ] `rationale`: the slice index and count, each `{heading} (line {n})`, and the D5 resolution instruction.
  - [ ] `summary`: `Blocked — slice {n} has {k} pending PM decision(s)`, with singular or plural wording that matches the count.
  - [ ] `slice: project.fileSlice`, `phase: 'Phase 4: Slice Design'`, and `pendingDecisions`.
  - [ ] Success: `pnpm typecheck` passes, and the existing navigator tests pass unchanged. They build the navigator without config, so the gate is off for them.
- **Effort:** 3/5

## Task 8: Navigator tests

- [ ] Create `packages/core/tests/introspection/WorkflowNavigator.decisionGate.test.ts`, with fixtures set up like `WorkflowNavigator.reviewGate.test.ts`. Cover:
  - [ ] **No task file:** `getNext()` returns the decision gate (`pendingDecisions`, Phase 4), not "Create task breakdown". `getStatus().activeSlice.status` is `'pending-decision'` and carries `pendingDecisions`.
  - [ ] **Zero and partial progress:** both return the decision gate, not "Continue implementation".
  - [ ] **All checked:** the gate does not fire.
  - [ ] **Precedence:** with `review_enabled = true` and no review artifact, the decision gate wins. With `review: none`, the decision gate still fires.
  - [ ] **Off:** with the key `false`, or with no `ConfigManager`, you get the pre-245 result. Changed to `decided`, the normal recommendation returns.
  - [ ] **Unreadable design:** `getNext()` rejects.
  - [ ] **Phase suggestion:** with the project phase at Phase 6, the result carries the `cf set phase` suggestion.
  - [ ] Success: `pnpm --filter @context-forge/core test -- WorkflowNavigator` passes.
- [ ] Commit: `feat(core): add pending-decision slice status and next routing`
- **Effort:** 3/5

---

## Task 9: `cf next` output and the status/MCP surfaces (D5)

- [ ] In `packages/cli/src/commands/next.ts`, when `result.pendingDecisions` is present, print one `dim` line per decision after `Rationale:` (:51): `  - {heading} (line {n})`. `--json` needs no change.
- [ ] Tests. Each one uses a fixture whose active slice design has a pending line and no task file:
  - [ ] `packages/cli/tests/commands/next.test.ts`: the human output lists each decision, and `--json` includes `pendingDecisions`. Output with nothing pending is unchanged.
  - [ ] `packages/cli/tests/commands/status.test.ts`: the human output shows `Status: pending-decision`. `--json` has `activeSlice.status === 'pending-decision'` and `activeSlice.pendingDecisions`.
  - [ ] `packages/mcp-server/tests/workflowTools.test.ts`: the `workflow_next` response includes `pendingDecisions`. The `workflow_status` response has `activeSlice.status === 'pending-decision'`.
  - [ ] Success: `pnpm --filter @context-forge/cli test -- next status` and `pnpm --filter @context-forge/mcp test -- workflowTools` pass.
- [ ] Commit: `feat(cli): list pending decisions in cf next`
- **Effort:** 2/5

---

## Task 10: ConsistencyChecker rule `pending-decision` (D8)

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

## Task 11: Documentation

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

## Task 12: Full verification and walkthrough

- [ ] `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass. No new file is over ~300 lines (`wc -l`).
- [ ] Run the design's **Verification Walkthrough** steps 1–9 with `node packages/cli/dist/index.js`:
  - [ ] Use `/tmp/pd.md` for steps 1–4.
  - [ ] For steps 5–9, put a temporary pending line in the 245 design, then revert it. `git diff` must show no change to the design file.
  - [ ] After step 9, run `cf config unset workflow.decision_gate_enabled`.
- [ ] `node packages/cli/dist/index.js validate design project-documents/user/slices/245-slice.pending-decision-gate.md` PASSes.
  - [ ] Success: every walkthrough step gives the expected output, and `git status` shows no stray config or design edits.
- [ ] Commit any corrections with the matching semantic prefix. If there is nothing to commit, note that in the task-checker update.
- **Effort:** 2/5
