---
docType: tasks
slice: cosmetic-output-fixes-sweep
project: context-forge
lldReference: project-documents/user/slices/920-slice.cosmetic-output-fixes-sweep.md
dependencies: []
projectState: >
  0.10.4 published. main clean. Slice 920 design complete (review: none).
  Two independent cosmetic fixes: (a) TemplateProcessor literal-brace
  pass-through #13, (b) guides-update worktree-sync message #44.
status: complete
dateCreated: 20260730
dateUpdated: 20260730
---

# Tasks: Cosmetic Output Fixes Sweep (Slice 920)

## Context Summary

Two independent, low-risk output cosmetics bundled into one sweep slice. Item (a)
lives entirely in `packages/core/src/services/TemplateProcessor.ts`; item (b)
spans `packages/core/src/guides/types.ts`, `GuideManager.ts`, and
`packages/cli/src/commands/guides.ts`. The items share no code and are ordered
(a) then (b) purely for sequential execution. Each implementation task is
immediately followed by its test task.

See the design for full rationale:
[920-slice.cosmetic-output-fixes-sweep.md](../slices/920-slice.cosmetic-output-fixes-sweep.md).

---

## Item (a): Literal single-brace pass-through (GitHub #13)

### Task 1: Preserve unmatched single-brace text in TemplateProcessor

- [x] In [TemplateProcessor.ts](../../../packages/core/src/services/TemplateProcessor.ts),
      inside the single-brace `replace(/\{([^}]+)\}/g, …)` handler (around line 43):
  - [x] On the **unresolved pipe** path (primary variable not found — currently
        `return expression;` near line 54), return the original matched text
        `_match` (the full `{a | b}`) instead of the brace-stripped `expression`.
  - [x] On the **simple no-match** path (currently `return expression;` near
        line 72), return `_match` instead of `expression`.
- [x] Do **not** modify the double-brace pass (`{{var}}`, ~line 31) or any
      conditional handling.
- [x] Verify the resolved paths (real variable, `project` alias, resolved pipe)
      still return the substituted value — only the no-match returns change.
- Effort: 1/5

### Task 2: Test literal-brace pass-through

- [x] In [TemplateProcessor.test.ts](../../../packages/core/tests/services/TemplateProcessor.test.ts),
      add cases proving:
  - [x] Literal `{example}` (no matching variable) renders verbatim as
        `{example}`.
  - [x] An unresolved pipe `{foo | bar}` (neither resolves) renders verbatim
        with braces.
  - [x] A **real** variable (`{project}` / `{{slice}}`) still substitutes.
  - [x] A resolved pipe still substitutes to the primary's value.
- [x] Add one regression case using a realistic multi-line context fragment
      (Project State / Additional Instructions style) that mixes a literal
      `{example}` with a real `{project}` reference, per the design's
      real-input requirement.
- Effort: 1/5

---

## Item (b): Worktree-sync update message (GitHub #44)

### Task 3: Add `worktreeSynced` to UpdateResult and set it in GuideManager

- [x] In [types.ts](../../../packages/core/src/guides/types.ts), add an optional
      `worktreeSynced?: boolean` field to the `UpdateResult` interface.
- [x] In [GuideManager.ts](../../../packages/core/src/guides/GuideManager.ts)
      `update()` (~line 56), when the worktree-sync branch executes
      (non-default `operationPath` + `submodule` method, ~lines 78–82), include
      `worktreeSynced: true` on the returned result. Leave the field
      absent/falsy on every other path.
- Effort: 2/5

### Task 4: Test GuideManager sets `worktreeSynced` correctly

- [x] In [GuideManager.test.ts](../../../packages/core/tests/guides/GuideManager.test.ts),
      add/extend cases proving:
  - [x] `worktreeSynced` is `true` when updating from a non-default worktree
        with the `submodule` method.
  - [x] `worktreeSynced` is absent/falsy when `operationPath === projectPath`
        (default project, no worktree).
- Effort: 2/5

### Task 5: Branch the CLI same-version message on `worktreeSynced`

- [x] In [guides.ts](../../../packages/cli/src/commands/guides.ts) `update`
      action (~lines 195–204), when `previousVersion === newVersion` **and**
      `result.worktreeSynced` is true, print a message that acknowledges the
      worktree sync (e.g. `Guide already at latest (worktree synced to vX.Y.Z)`),
      using `newVersion` for the version. Keep the existing bare
      "Guide is already at the latest version." message for the non-worktree
      same-version case.
- [x] Leave the "Guide updated successfully." branch unchanged.
- Effort: 1/5

### Task 6: Test the CLI message branch

- [x] In [guides.test.ts](../../../packages/cli/tests/commands/guides.test.ts),
      add cases proving:
  - [x] Same-version update with `worktreeSynced: true` prints the
        sync-acknowledging message (and includes the version).
  - [x] Same-version update without `worktreeSynced` prints the unchanged
        "already at the latest version" message.
- Effort: 1/5

---

## Final Verification

### Task 7: Build and full test run

- [x] Run `pnpm -r build` — expect exit 0.
- [x] Run the core + cli test suites (`pnpm -r test` or the package-scoped
      equivalents) — expect all green, including the existing TemplateProcessor,
      GuideManager, and guides-command tests.
- [x] Walk the design's Verification Walkthrough for both items to confirm
      real-world behavior.
- Effort: 1/5
