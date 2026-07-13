---
docType: slice-design
slice: guide-update-branch-guard
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [914]
interfaces: []
dateCreated: 20260714
dateUpdated: 20260714
status: not_started
---

# Slice Design: Guide Update Branch Guard

## Overview

`cf guides update` (and the `guide_update` MCP tool) call `GuideManager.update()`, which delegates to `SubmoduleStrategy.update()` or `CloneStrategy.update()` — both of which run `git add` + `git commit` directly against the host project's `projectPath` with zero branch-awareness. When `git.integration_branch` (914) is configured specifically to keep direct commits off `main`, guide update ignores it entirely and will happily commit straight to `main`.

This slice adds a branch guard evaluated once, immediately before `GuideManager.update()` delegates to a strategy's commit-producing `update()` call. It resolves a `trunk` branch (the configured integration branch, or `main` if unset) and either proceeds silently, blocks, or warns-and-confirms, per current branch position relative to `trunk`.

## Value

Closes a gap where a configured guardrail (`git.integration_branch`, added in 914 specifically to prevent direct commits to `main`) can be silently bypassed by one specific code path. Developer-facing: prevents an accidental commit to `main` when running `cf guides update` from the wrong branch, while still allowing the legitimate workflow of testing a guide update on a feature/test branch before it reaches trunk.

## Technical Scope

**In scope:**
- A new branch-resolution/guard function in `packages/core/src/guides/` that determines one of three outcomes (`proceed`, `block`, `warn`) given the current branch and configured `git.integration_branch`.
- Wiring the guard into `GuideManager.update()`, before the strategy's `update()` is invoked.
- CLI (`cf guides update`) surfaces the block as a hard error and the warn case as an interactive y/N confirmation (reusing the existing `askConfirmation` readline pattern from `setup-ide.ts`), bypassable with `--yes`.
- MCP (`guide_update` tool) surfaces the block as a tool error, and the warn case as a required `confirm: true` input parameter (no interactive stdin available in MCP context) — omitting it when a warn condition is detected returns an error describing the condition and instructing the caller to retry with `confirm: true`.
- Unit tests for the guard function's three-way decision logic (proceed / block / warn), covering all `trunk` × current-branch combinations described below.

**Out of scope:**
- `TarballStrategy` — does no git commit, unaffected, no guard needed.
- `cf guides install` — install always happens on whatever branch the user is on when initializing the project; this is a one-time setup action, not a recurring update, and was not identified as a bypass risk. Not gated by this slice.
- Any change to `git.integration_branch` itself (914 already shipped it) or to the upstream `ai-project-guide` branch-naming rule.
- Automated branch switching — the guard only blocks or asks; it never switches branches on the user's behalf.

## Dependencies

### Prerequisites
- 914 (config key is `git.integration_branch`, not the legacy `git.branch_root`) — complete on `main`.

### Interfaces Required
- `ConfigManager.get('git.integration_branch')` — already available (914).
- `gitExec(args, cwd)` from `packages/core/src/guides/gitExec.ts` — existing generic git runner, no new plumbing needed.

## Architecture

### Component Structure

New module: `packages/core/src/guides/branchGuard.ts`

```typescript
export type BranchGuardVerdict =
  | { outcome: 'proceed' }
  | { outcome: 'block'; trunk: string; current: string }
  | { outcome: 'warn'; trunk: string; current: string; ancestry: 'descends' | 'unrelated' };

export async function evaluateBranchGuard(
  projectPath: string,
  configManager: ConfigManager
): Promise<BranchGuardVerdict>;
```

`GuideManager.update()` calls `evaluateBranchGuard()` first. On `block`, it throws (CLI/MCP already have uniform error surfacing for thrown errors from `GuideManager` methods — no new error-handling path needed). On `warn`, `update()` needs a way to receive caller confirmation before proceeding — see Data Flow below for how confirmation threads through.

### Data Flow

1. `GuideManager.update()` calls `evaluateBranchGuard(this.projectPath, this.configManager)`.
   - If `this.configManager` is undefined (GuideManager can be constructed without one), the guard cannot resolve `git.integration_branch` and treats it as unset — `trunk = 'main'`. This matches `resolveSource()`/`resolveStrategy()`'s existing fallback pattern in the same file.
2. Guard resolves current branch via `gitExec(['rev-parse', '--abbrev-ref', 'HEAD'], projectPath)`.
3. Guard decision table (see Technical Decisions below) produces a `BranchGuardVerdict`.
4. `GuideManager.update()` signature gains an options parameter: `update(opts?: { confirmed?: boolean }): Promise<UpdateResult>`.
   - `proceed` → continue to strategy update immediately, unchanged.
   - `block` → throw `Error` naming the configured trunk and current branch; caller (CLI/MCP) surfaces this as a hard failure. No confirmation can override a block.
   - `warn` and `opts?.confirmed !== true` → throw a distinguishable error (see below) carrying the warning text; caller is responsible for confirming (interactively for CLI, via explicit parameter for MCP) and re-calling `update({ confirmed: true })`.
   - `warn` and `opts?.confirmed === true` → proceed to strategy update.
5. On `proceed` (including confirmed-warn), execution continues exactly as today — unchanged strategy `update()` calls, unchanged worktree sync.

This mirrors the existing two-call pattern already used elsewhere in the CLI for `--yes`-gated destructive actions (`setup-ide.ts`'s `askConfirmation`), just applied at the `GuideManager` API boundary instead of purely in the CLI layer, so MCP gets the same guarantee without duplicating branch logic.

### State Management

No persisted state. The guard is evaluated fresh on every `update()` call — branch position can change between calls, so there is nothing to cache.

## Technical Decisions

### Guard Decision Table

Let `trunk` = `git.integration_branch` config value if non-empty, else `'main'`. Let `current` = current branch name (via `git rev-parse --abbrev-ref HEAD`).

| Condition | Outcome |
|---|---|
| `current === 'HEAD'` (detached HEAD — `rev-parse --abbrev-ref` returns the literal string `HEAD` when not on a named branch) | `block` — a guide-update commit cannot land anywhere meaningful in a detached state (it would create a dangling commit with no branch pointing at it), and there is no branch name to show the user in a warn message. Treated as its own row, evaluated before the `trunk`/`main` comparisons below, not folded into the ancestry check. |
| `current === trunk` | `proceed` — unchanged behavior, on-trunk commits are exactly what guide update has always done. |
| `current === 'main'` AND `trunk !== 'main'` (i.e. integration branch configured, user is on `main`) | `block` — this is precisely the bypass scenario `git.integration_branch` exists to prevent. |
| otherwise: run `git merge-base --is-ancestor <trunk> HEAD` via the local ancestry-check helper (see below) | exit code 0 → `warn` (`ancestry: 'descends'`) — current branch contains trunk's tip in its history (typically a feature/test branch forked from trunk, or one that has since merged trunk back in; the guard does not distinguish these, since both are legitimate reasons to test an update before it lands on trunk). exit code 1 → `warn` (`ancestry: 'unrelated'`) — no resolvable common ancestry (the expected, well-formed "false" result); stronger warning text, but still confirmation-gated, not blocked, since forcing a hard stop here would remove a legitimate escape hatch for unusual-but-valid repo states the user may need to work through manually. exit code >1 → **not a verdict** — this is a genuine git error (e.g. invalid ref, corrupted object store), not a "false" ancestry result; the helper throws rather than returning an outcome, and `evaluateBranchGuard()` propagates that throw uncaught. Silently downgrading a real git error to `warn('unrelated')` would let a user confirm past a corrupted-repo state into a commit — see Failure Modes below. |

This applies identically whether or not `git.integration_branch` is set — when unset, `trunk = 'main'` and the same rows evaluate the same way, just against `main`. No separate code path for the unset case.

`gitExec` already throws on non-zero exit for most commands (see `gitExec.ts:17-24`), which is the correct behavior for e.g. `git commit` failing. `git merge-base --is-ancestor` uses exit code as its actual return value (0 = true, 1 = false, >1 = error) — not a uniform failure signal — so the guard must NOT call `gitExec` directly for this check. Implementation note for task breakdown: add a small local wrapper in `branchGuard.ts`, `isAncestor(trunk, cwd): Promise<boolean>` (using `execFile` directly, same no-shell-injection pattern as `gitExec`), that inspects the child process's exit code explicitly: `0` → resolve `true`, `1` → resolve `false`, anything else (including spawn failure) → reject with an `Error` carrying stderr, exactly mirroring `gitExec`'s own error-message shape (`` `git ${args.join(' ')} failed in ${cwd}: ${stderr.trim() || error.message}` ``) so it reads consistently with every other git-related error the guard or its callers might surface.

### Failure Modes for New Subprocess I/O

Two new git subprocess calls are introduced: `git rev-parse --abbrev-ref HEAD` (via `gitExec`, unchanged contract) and `git merge-base --is-ancestor <trunk> HEAD` (via the new `isAncestor` helper above). Handling strategy for each failure class:

- **Not a git repository / corrupted `.git`.** `git rev-parse` fails → `gitExec` throws per its existing contract. `evaluateBranchGuard()` does not catch this; it propagates to `GuideManager.update()` and out to the caller exactly as any other unexpected `gitExec` failure already does elsewhere in `update()` (e.g. the existing `fetch --tags` call in `SubmoduleStrategy.update()`). No new handling needed — this is the pre-existing propagation contract, just exercised by a new call site.
- **`merge-base` exit code >1 (real git error).** Per the decision table above: `isAncestor` throws, `evaluateBranchGuard()` propagates. Never silently coerced into a `warn`/`block` verdict.
- **Hung subprocess (e.g. git blocking on an interactive credential prompt).** Neither `git rev-parse` nor `git merge-base --is-ancestor` performs network I/O — both are purely local object-database reads, so neither can trigger a credential prompt or network hang the way `fetch`/`pull`/`clone` (used elsewhere in the strategies) can. No timeout is added for these two calls specifically; this is consistent with `gitExec`'s existing behavior, which has never had a timeout for any local, non-network git command. Out of scope: a general subprocess-timeout policy for `gitExec`, if ever needed, is a separate concern spanning all strategies, not specific to this guard.
- **Child process fails to spawn (e.g. `git` binary missing).** Both `gitExec` and the new `isAncestor` helper reject on `execFile`'s `error` callback regardless of cause (spawn failure vs. non-zero exit are both routed through the same `error` parameter in Node's `execFile`), so this is already covered by the same propagation path as the other error cases above — no separate handling required. `isAncestor` must distinguish this from a legitimate exit-code-1 "false" result: `execFile`'s `error` callback fires for spawn failures with no meaningful `error.code`, so the wrapper treats any `error` callback invocation without a parsable exit code as reject (same as exit >1), and only resolves `false` when the process exited cleanly with code 1.

### Error Shape for the Warn Case

`GuideManager.update()` throwing a plain `Error` for both `block` and unconfirmed-`warn` would make it impossible for callers to distinguish "stop, this is final" from "stop, but you can proceed if you confirm." Define a small discriminated error type:

```typescript
export class BranchGuardBlockedError extends Error {
  constructor(public readonly trunk: string, public readonly current: string) { /* ... */ }
}
export class BranchGuardWarnError extends Error {
  constructor(
    public readonly trunk: string,
    public readonly current: string,
    public readonly ancestry: 'descends' | 'unrelated'
  ) { /* ... */ }
}
```

Both live in `branchGuard.ts` alongside `evaluateBranchGuard`. CLI and MCP both import and `instanceof`-check these to decide how to respond, instead of parsing error message text.

### Patterns and Conventions

- Follows the existing `packages/core/src/guides/` module boundary — pure orchestration/decision logic in core, no CLI- or MCP-specific concerns (readline, MCP tool schemas) leak into `branchGuard.ts`.
- Reuses `gitExec` for the standard git calls (`rev-parse`, `commit`, etc.) and adds one narrowly-scoped local helper for the exit-code-as-value `merge-base --is-ancestor` check, rather than changing `gitExec`'s contract for all callers.
- `GuideManager.update()`'s new `opts?: { confirmed?: boolean }` parameter is additive and optional — existing callers that don't pass it get today's behavior on `proceed`/unconfigured-trunk paths, and correctly stop (rather than silently committing) on `block`/`warn` paths, which is the intended tightening.

## Integration Points

### Provides to Other Slices
- `evaluateBranchGuard()` is a general-purpose "should I let an automated commit happen right now" check. If a future slice adds another auto-committing code path (none currently exist outside guide update), it can reuse this function rather than reimplementing trunk resolution.

### Consumes from Other Slices
- `git.integration_branch` config key and its validation (914).
- `gitExec` (pre-existing, `packages/core/src/guides/gitExec.ts`).

## CLI / MCP Interface Changes

### CLI: `cf guides update`
- Add `-y`/`--yes` option (via existing `withYesOption` helper) to bypass the warn-confirmation non-interactively — consistent with `cf setup-ide`'s existing use of the same helper for the same purpose.
- On `BranchGuardBlockedError`: print an error naming the configured trunk and current branch, with a suggested remediation (switch to the trunk branch, or unset `git.integration_branch` if that's not actually desired). For the detached-HEAD variant (`current === 'HEAD'`), the remediation instead suggests checking out a branch before updating. Exit non-zero. No prompt — block is final.
- On `BranchGuardWarnError` (and `--yes` not passed): print the warning (ancestry-dependent text — softer for `descends`, stronger for `unrelated`) and prompt `Continue? (y/N)` via the existing `askConfirmation` pattern. If confirmed, re-invoke `manager.update({ confirmed: true })`. If declined, exit without error (user chose not to proceed — not a failure).
- On `BranchGuardWarnError` with `--yes` passed: skip the prompt, proceed as if confirmed.

### MCP: `guide_update`
- Add optional `confirm: z.boolean().optional()` input parameter.
- On `BranchGuardBlockedError`: return `errorResult` with the same message/remediation text as CLI.
- On `BranchGuardWarnError` and `confirm !== true`: return `errorResult` describing the warning condition and instructing the caller to retry with `confirm: true` if they intend to proceed.
- On `BranchGuardWarnError` and `confirm === true`: re-invoke `manager.update({ confirmed: true })`.

## Success Criteria

### Functional Requirements
- Running `cf guides update` while on `main` with `git.integration_branch` set to a non-`main` value fails with a clear error naming both the configured trunk and the fact the user is on `main`; no commit is made.
- Running `cf guides update` while on the resolved trunk (whether that's `main` with the key unset, or a configured integration branch) behaves exactly as it does today — no new prompt, no behavior change.
- Running `cf guides update` from a branch that descends from trunk (e.g. a slice branch cut from `main`, or from a configured integration branch) produces a confirmation prompt; answering `y` proceeds and commits on the current branch as before; answering anything else aborts cleanly with no commit and a non-zero-free "aborted" message (not an error).
- `cf guides update --yes` from a descends-from-trunk or unrelated-ancestry branch proceeds without prompting.
- `guide_update` MCP tool returns an actionable error (not a silent commit) when called from `main` with an integration branch configured, and when called from a non-trunk branch without `confirm: true`.
- `TarballStrategy`-installed guides (`manual` strategy) are entirely unaffected — no guard evaluation overhead or behavior change, since that strategy never commits.

### Technical Requirements
- `evaluateBranchGuard()` has full unit test coverage of the decision table: trunk unset + on main, trunk unset + on unrelated branch, trunk unset + on descendant branch, trunk set + on trunk, trunk set + on main, trunk set + on descendant-of-trunk branch, trunk set + on unrelated branch, detached HEAD (trunk unset and trunk set), and `merge-base --is-ancestor` returning exit code >1 (asserted as a thrown error, not a `warn` verdict).
- No change to `gitExec`'s existing throw-on-nonzero contract or its existing call sites.
- `pnpm -r build` and full test suite clean.

### Verification Walkthrough

1. In a scratch git repo with context-forge initialized and the guide installed (submodule strategy):
   ```bash
   cf config set git.integration_branch dev/erik --project
   git checkout main
   cf guides update
   ```
   Expect: hard failure naming `dev/erik` as the configured trunk and warning that the current branch is `main`. `git log` shows no new commit.

2. ```bash
   git checkout -b dev/erik main   # or however the integration branch is established
   cf guides update
   ```
   Expect: proceeds silently (assuming an update is actually available), commits on `dev/erik` — identical to pre-slice behavior.

3. ```bash
   git checkout -b 916-slice.guide-update-branch-guard dev/erik
   cf guides update
   ```
   Expect: a confirmation prompt referencing that this branch descends from `dev/erik`. Answering `y` proceeds and commits on the feature branch; `n` aborts with no commit.

4. Repeat step 3 with `cf guides update --yes` — expect no prompt, proceeds directly.

5. With `git.integration_branch` unset (default), repeat steps 2–4 substituting `main` for `dev/erik` — same three-way behavior, confirming the guard applies uniformly regardless of whether the key is configured.

## Risk Assessment

Low risk — additive guard, no change to existing on-trunk behavior, and the block case only fires in exactly the scenario `git.integration_branch` was introduced to prevent. Main implementation risk is the `merge-base --is-ancestor` exit-code handling needing to bypass `gitExec`'s throw-on-nonzero contract correctly — mitigated by isolating that one call in a local helper rather than touching shared `gitExec` behavior.

## Implementation Notes

### Development Approach
1. `branchGuard.ts`: trunk resolution, current-branch lookup, the local ancestry-check helper, `evaluateBranchGuard()`, and the two error classes — with unit tests covering the full decision table first (no CLI/MCP wiring yet).
2. Wire into `GuideManager.update()` — add the `opts?: { confirmed?: boolean }` parameter, call the guard, throw on block/unconfirmed-warn.
3. CLI: `--yes` option, error-type-specific handling, `askConfirmation` prompt reuse.
4. MCP: `confirm` input parameter, error-type-specific `errorResult` handling.
5. Manual verification per the walkthrough above in a scratch repo (both submodule and clone strategies, at minimum one block/warn/proceed cycle each).

### Special Considerations
- The confirmation-required MCP flow (return an error instructing the caller to retry with `confirm: true`) is a slightly unusual MCP pattern — no interactive stdin exists in that context, so this two-call shape (call, get told to confirm, call again) is the correct analog to CLI's prompt, not a compromise. Worth calling out explicitly in the tool description text so agent callers understand it's not a transient failure.
