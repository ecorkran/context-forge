---
docType: slice-design
slice: cosmetic-output-fixes-sweep
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260730
dateUpdated: 20260801
status: complete
review: none
---

# Slice Design: Cosmetic Output Fixes Sweep

## Overview

A catch-all slice for small, low-risk output/messaging cosmetics. It bundles two
independent user-visible defects that each require a narrow, well-contained fix:

- **(a) GitHub #13** — `TemplateProcessor` silently unwraps literal single-brace
  content (`{example}` → `example`) in generated context output.
- **(b) GitHub #44** — `cf guides update` from a non-default worktree prints
  "Guide is already at the latest version" even though the worktree-sync step
  visibly changes files afterward, so the message contradicts what happened.

The two items share no code and can be implemented and tested independently. They
are grouped only because each is too small to warrant its own slice. Additional
cosmetic items may be appended to this slice and worked incrementally.

---

## Item (a): Literal single-brace pass-through (GitHub #13)

### Problem

`TemplateProcessor.process()`
([TemplateProcessor.ts:43](../../../packages/core/src/services/TemplateProcessor.ts#L43))
runs a single-brace substitution pass:

```ts
processed = processed.replace(/\{([^}]+)\}/g, (_match, expression) => { ... });
```

When `expression` is not a known template variable (and not a pipe form), the
handler returns `expression` — i.e. the **inner text without its braces**
([TemplateProcessor.ts:72](../../../packages/core/src/services/TemplateProcessor.ts#L72)).
Any literal `{example}` in user content (Project State, Additional Instructions,
Monorepo Structure, etc.) is therefore silently rewritten to `example`. This is a
data-corruption cosmetic: braces the user typed on purpose disappear from output.

### Decision

Distinguish **resolved** from **unresolved** single-brace expressions:

- A brace expression that resolves to a real variable value → substitute (current
  behavior, unchanged).
- A pipe form `{a | b}` whose primary resolves → substitute; whose primary does
  **not** resolve → return the expression **with braces preserved** (`{a | b}`),
  not the current brace-stripped form. (Today the unresolved pipe branch at
  [TemplateProcessor.ts:54](../../../packages/core/src/services/TemplateProcessor.ts#L54)
  also strips braces.)
- A simple expression that does **not** resolve to any variable/alias → return the
  **original matched text unchanged**, braces included.

The rule: the single-brace pass must never alter text it did not successfully
substitute. On the no-match path, return `_match` (the full `{…}` slice) rather
than the inner `expression`.

This preserves all real substitution — including the `project` alias
([TemplateProcessor.ts:61](../../../packages/core/src/services/TemplateProcessor.ts#L61))
and resolved pipe forms — while making unknown/literal braces inert.

### Scope

- Change both no-match return sites (simple and unresolved-pipe) to return the
  original matched text with braces intact.
- Do **not** touch the double-brace pass (`{{var}}`,
  [TemplateProcessor.ts:31](../../../packages/core/src/services/TemplateProcessor.ts#L31))
  or the conditional handling.

### Risk

Low. The double-brace and conditional paths are untouched. The only behavior
change is on the single-brace no-match path, which previously corrupted output.

---

## Item (b): Worktree-sync update message (GitHub #44)

### Problem

`GuideManager.update()`
([GuideManager.ts:56](../../../packages/core/src/guides/GuideManager.ts#L56)) runs
the primary `strategy.update()` against the **host** `projectPath`, then — when
operating from a non-default worktree — separately syncs the worktree's submodule
checkout at `operationPath`
([GuideManager.ts:78-82](../../../packages/core/src/guides/GuideManager.ts#L78-L82)).

When the host pointer is already current, `previousVersion === newVersion`, so the
CLI prints "Guide is already at the latest version"
([guides.ts:195-196](../../../packages/cli/src/commands/guides.ts#L195-L196)) — even
though the worktree sync step just changed files in the user's working tree. The
message contradicts the visible file changes.

The root cause is that `UpdateResult`
([types.ts:27-32](../../../packages/core/src/guides/types.ts#L27-L32)) carries no
signal that a worktree sync occurred, so the CLI cannot tell the two cases apart.

### Decision

Surface the worktree-sync fact on the result and branch the message on it:

- Add an optional `worktreeSynced?: boolean` field to `UpdateResult`.
- In `GuideManager.update()`, set `worktreeSynced: true` on the returned result
  when the worktree-sync branch runs (non-default worktree + `submodule` method).
- In the CLI `update` action
  ([guides.ts:195-204](../../../packages/cli/src/commands/guides.ts#L195-L204)),
  when `previousVersion === newVersion` **and** `worktreeSynced` is true, print a
  message that acknowledges the sync (e.g. "Guide already at latest (worktree
  synced to vX.Y.Z)") instead of the bare "already at the latest version".

The field is optional and defaults to falsy, so the non-worktree path and all
existing callers (including the `guide_update` MCP tool) are unaffected.

### Scope

- `UpdateResult` type: add optional `worktreeSynced?: boolean`.
- `GuideManager.update()`: set the flag when the sync branch executes.
- CLI `update` action: branch the same-version message on the flag.
- No change to strategy `update()`/`sync()` implementations.

### Risk

Low. Additive optional field; message-only branch. No behavior change off the
worktree path.

---

## Success Criteria

- (a) Context output containing literal `{example}` renders `{example}` verbatim;
  real variables (`{project}`, `{{slice}}`, resolved `{a | b}` pipes) still
  substitute correctly.
- (a) A regression test uses real generated-context input (not a synthetic
  minimal fixture) to prove literal braces survive.
- (b) `cf guides update` from a worktree where the host pointer is already current
  prints a message that mentions the worktree sync; from the default project (no
  worktree) it prints the unchanged "already at the latest version" message.
- (b) The `guide_update` MCP tool output is unchanged for the non-worktree case.
- All existing TemplateProcessor and guides tests pass.

---

## Verification Walkthrough

**Item (a):**

1. Build a project context whose Project State (or Additional Instructions) field
   contains a literal `{example}` and also a real `{project}` reference.
2. Run `cf build` (or the `context_build` MCP tool).
3. Confirm the output contains `{example}` verbatim and the resolved project name
   in place of `{project}`.

**Item (b):**

1. In a project with `git.integration_branch` unset or set, create a worktree and
   ensure the host guide pointer is already at the latest tag.
2. From the worktree, run `cf guides update`.
3. Confirm files under the worktree's guide dir change **and** the printed message
   acknowledges the worktree sync rather than claiming nothing happened.
4. From the default project path, run `cf guides update` when already current and
   confirm the unchanged "Guide is already at the latest version." message.

---

## Notes

This slice will skip design review (`cf check --set-review-none 920`). Additional
low-risk cosmetic items may be appended here as discovered and worked
incrementally; each new item follows the same "narrow fix + real-input regression
test" pattern.
