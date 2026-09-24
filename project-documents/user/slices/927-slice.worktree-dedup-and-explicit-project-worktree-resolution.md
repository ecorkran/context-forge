---
docType: slice-design
project: context-forge
slice: 927
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [926]
dateCreated: 20260924
dateUpdated: 20260924
status: not_started
---

# Slice Design: 927 — Worktree Dedup and Explicit-Project Worktree Resolution

## Overview

Fixes GitHub issues #100 and #101, both filed (not fixed) during slice 926's verification walkthrough and code review. Both are worktree-surface defects left over after 926. They share no code.

- **#100** — `cf check` in a multi-worktree project prints the same project-level finding once per worktree. The merge's dedup key contains the checkout root, which differs per worktree view.
- **#101** — `--project foo` run from inside one of foo's worktrees silently operates on the project root. The explicit-flag branch of the shared resolver never looks at CWD.
- **Rider** — `resolveProjectWorktree` carries a `worktree` option that silently ignores an unknown name. No production caller passes it (`cf status` resolves `--worktree` itself and already errors on a miss), so it is dead code with a silent-fallback shape. Delete it.

## Value

- **#100:** every `cf check` in a multi-worktree project prints N copies of each project-level finding. Slice 926's `[worktree]` labels made this visible: the same warning now shows up once per registered worktree with different labels, which reads like N separate problems. Noise grows with worktree count, which is exactly when people run several agents in parallel.
- **#101:** a script that passes `--project` for determinism gets a clean pass over the wrong tree, with no warning. It is the #88 failure again, for a different invocation shape. It affects all 14 commands that go through `resolveProjectWorktree`, not just `validate`.

## Technical Scope

**Included:**

1. Root-normalized dedup key in `mergeCheckResults` (#100). CLI `cf check` and MCP `workflow_check` both get it.
2. CWD-aware worktree resolution inside the explicit `--project` branch of `resolveProjectWorktree` (#101).
3. CLI `cf check --fix` applies fixes per view before the merge, and a shared `mergeFixResults` combines fix results for both CLI and MCP (review F002).
4. Remove the unused `worktree` option from `resolveProjectWorktree` (rider).

**Explicitly excluded:**

- Changing any rule's emitted `location` or `description` text. The fix is in the merge key, not at the producers (see D1).
- Adding `--worktree` to commands other than `cf status` (PM decision 20260924: CWD-aware resolver instead of per-command flags).
- MCP tool project resolution. MCP tools take an explicit `projectId`, and the server process's CWD has no relationship to the caller's checkout, so #101 does not apply there.
- Changing which finding wins when a duplicate collapses. First-seen-wins stays as it is (set by slice 926). This covers display only; fixes are applied per view before the merge (D5).

## Dependencies

### Prerequisites

Slice 926 (complete). It gave us:
- `mergeCheckResults` / `buildAttributedViews` in core — [mergeCheckResults.ts](packages/core/src/introspection/mergeCheckResults.ts)
- `resolveWorktreeForPath` in core — [worktree-overlay.ts:30](packages/core/src/utils/worktree-overlay.ts#L30), longest-root match that prefers a worktree on a tie

### Interfaces Required

- `ConsistencyCheckResult.projectPath`: each result passed to the merge carries its own view's overlaid root. This is what the key normalization strips.
- `resolveWorktreeForPath(project, absolutePath)`: already used by `findProjectByCwd` for the no-flag branch.

## Architecture

### #100 — Dedup Key Normalization

The merge loop today:

```ts
const key = `${finding.rule}|${finding.location}|${finding.description}`;
```

Change it to build the key through a helper that replaces the view's checkout root with a fixed token in both `location` and `description`:

```ts
function dedupKey(finding: ConsistencyFinding, viewRoot: string | undefined): string {
  const norm = (s: string) => (viewRoot ? replaceRoot(s, viewRoot) : s);
  return `${finding.rule}|${norm(finding.location)}|${norm(finding.description)}`;
}
```

`replaceRoot` replaces an occurrence of `viewRoot` only when a path separator or the end of the string follows it. That way `/repo` does not match inside `/repo-other`, and the result is the same as `resolveWorktreeForPath`'s boundary check.

Producers that this now collapses correctly:
- `location: join(projectPath, …)` and every `*Path` location built from the overlaid project (ConsistencyChecker.ts, 20+ sites)
- `location: projectPath` (lines 1063/1072)
- The personal-scope-key rule (line 1108), whose `description` embeds `sharedPath`

Producers that are unaffected and already dedup correctly: non-path locations (`slice plan entry N`), and worktree-health findings whose description embeds `wt.worktreePath`. That value is registered data, not the view root, so it is identical across views.

Output is unchanged: the finding that gets kept still has its original absolute `location` and `description`, so `cf check --json` has the same shape and field meanings. The only visible change is fewer duplicate findings (and correspondingly lower counts), which is the fix.

The single-result early return (`results.length === 1`) stays, so single-checkout projects stay byte-identical.

### #100 — Fix Path (review F002)

Collapsing duplicates changes what `--fix` does today. CLI `cf check` applies fixes to the *merged* result (`checker.applyFixes(merged)` in the single-slice path, `applyFixes(dryRun)` in all-slices). Two worktrees with the same stale plan checkbox each produce a finding whose `fixAction.filePath` points at their own checkout. Once they collapse, only the first-seen checkout gets fixed, and the other's stale state vanishes from output.

MCP `workflow_check` already fixes per view before merging (`checker.fix(view)` / `fixAll(view)`), but it has its own gap: `mergeCheckResults` returns only check fields, so multi-worktree MCP fix output drops `fixed`, `fixLog`, and `fixErrors`.

Resolution: fixes are always applied per view, before the merge, and fix results merge through one shared function.

- **Core:** add `mergeFixResults(results: ConsistencyFixResult[], invokingPath)` next to `mergeCheckResults`. It delegates finding dedup to `mergeCheckResults`, sums `fixed`, and concatenates `fixLog` and `fixErrors`. Nothing is deduped in the fix fields, because each entry is a real write to a distinct file.
- **CLI single-slice:** `fixMode` runs `checker.fix(view)` per view via `runAttributed`, then `mergeFixResults`.
- **CLI all-slices:** the dry run stays merged, so the confirmation prompt shows each finding once. On confirm, `applyFixes` runs on each view's own pre-merge dry-run result (no re-check), then `mergeFixResults`. The prompt's count is the deduped count; the fix log shows every file actually written. That mismatch is correct: one logical finding, N physical files.
- **MCP:** swap `mergeCheckResults` for `mergeFixResults` in both fix branches.

### #101 — Explicit `--project` Resolution

Current explicit branch in [project.ts](packages/cli/src/utils/project.ts):

```ts
const resolved: ResolvedProjectWorktree = { id: project.id, source: 'flag' };
if (opts.worktree) {
  const wt = await findWorktreeByNameOrId(project.id, opts.worktree, store);
  if (wt) resolved.worktreeId = wt.id;
}
return resolved;
```

New behavior:

1. `resolveWorktreeForPath(project, process.cwd())`. If it matches a worktree of *this* project, use its `worktreeId`.
2. Otherwise → no `worktreeId` (project root), same as today.

The `opts.worktree` block and the `worktree` field on `ResolveProjectWorktreeOptions` are deleted (rider). `cf status` keeps its own `--worktree` handling, which runs after the resolver and already throws `UserError` on an unknown name, so an explicit `--worktree` still overrides the CWD-derived worktree.

**Migrated single-worktree projects (review F003):** the `default` worktree's path equals `projectPath`, and `resolveWorktreeForPath` prefers a worktree on a tie. So `--project foo` run from foo's root now resolves `worktreeId: default`. This is intended: bare `cf status` from the same directory already does this. Visible effect: `cf status --project foo` gains the `Worktree:` line and the `worktree` object in `--json`, and worktree-scoped `cf set`/`cf unset` go through the `default` worktree, same as without the flag.

`source` stays `'flag'`. `cf status` prints "(--project flag)" from that, and that is still accurate because the project did come from the flag.

Only the named project is consulted. `--project foo` run from inside bar's checkout resolves to foo's root, unchanged.

### Data Flow

No new data flows. #100 changes one key computation inside an existing loop. #101 adds one lookup to an existing branch using an existing core function.

## Technical Decisions

### D1 — Normalize at the merge key, not at the producers

Alternatives were (a) make every rule emit relative paths and resolve at render time, or (b) give findings an explicit dedup identity field. Both touch 20+ producer sites and change what `location` means in `--json`. Squadron and other external consumers read that field. Normalizing only inside the key fixes every current producer plus any future rule that builds paths from `projectPath`, and it changes nothing a consumer can observe except the duplicate count.

### D2 — Normalize `description` as well as `location`

Required, not speculative: the personal-scope-key rule (ConsistencyChecker.ts:1108) embeds the absolute shared-config path in its description. Normalizing `location` alone would leave that finding duplicated.

### D3 — CWD-aware explicit resolution (PM decision, 20260924)

Chosen over registering `--worktree` on 14 commands. `--project foo` names a project, not a checkout, so when the caller is standing in one of foo's worktrees, that worktree is the obvious reading. This matches what the no-flag path already does. The only behavior change is `--project foo` run from inside a foo worktree, which is exactly the #101 case.

### D4 — Delete the resolver's `worktree` option rather than harden it

The resolver's `opts.worktree` branch silently ignores an unknown name. But no production call site passes `worktree`: `cf status` calls the resolver with `{ project }` only and resolves `--worktree` itself (status.ts), throwing `UserError` on a miss. Users cannot hit the silent path today. Hardening unreachable code would add a second, dead error path for the one command that has the flag. Deleting it removes the hazard and the duplication. The existing unit test that pins the silent fallback (`project.test.ts`, `worktree: 'nonexistent'`) goes with it. (Revised after review F001; the original draft misstated that `cf status` passed the option.)

### D5 — Fixes apply per view, before the merge

Once #100 collapses cross-worktree duplicates, applying fixes after the merge only writes the first checkout's file. Fixing per view first (as MCP already does) writes every checkout and keeps CLI and MCP on the same semantics. Alternative rejected: documenting first-checkout-wins, which would leave other checkouts stale while reporting them clean.

## Success Criteria

### Functional Requirements

- [ ] In a project with 2 registered worktrees, `cf check` reports each path-derived project-level finding once, not once per worktree.
- [ ] The personal-scope-key finding (shared config holds a personal key) is reported once across 2 worktrees.
- [ ] `cf check --json` keeps the same shape; the kept finding's `location` is still absolute.
- [ ] Single-worktree / migrated-`default` projects: `cf check` output is byte-identical to before.
- [ ] `cf validate frontmatter --project <name>` run from inside a registered worktree of that project validates that worktree (`documentRoot` in `--json` names the worktree).
- [ ] `--project <name>` run from outside any of that project's checkouts resolves to the project root, as before.
- [ ] `--project <name>` run from inside a *different* project's checkout resolves to the named project's root.
- [ ] Migrated single-worktree project: `cf status --json --project <name>` run from the project root reports `worktree.name: "default"`, matching bare `cf status --json` from the same directory.
- [ ] `cf status --project <name> --worktree <name2>` still selects `<name2>` regardless of CWD; an unknown `<name2>` still exits non-zero with a `UserError` (regression guard for status's own check).
- [ ] `cf check --fix` in a project with 2 worktrees sharing the same fixable finding writes the fix in **both** checkouts; `fixLog` lists both files.
- [ ] MCP `workflow_check` with `fix: true` across 2 worktrees returns `fixed`, `fixLog`, and `fixErrors` (currently dropped by the merge).

### Technical Requirements

- [ ] `mergeCheckResults` unit tests cover: absolute-path location collapse, description-embedded root collapse, root-prefix boundary (`/repo` vs `/repo-other` do not collapse), non-path locations unchanged.
- [ ] `mergeFixResults` unit tests cover: `fixed` summed, `fixLog`/`fixErrors` concatenated (not deduped), findings deduped the same as `mergeCheckResults`.
- [ ] `resolveProjectWorktree` unit tests cover the explicit-branch cases: CWD in a worktree of the named project, CWD outside it, CWD in another project's checkout, CWD at a migrated project's root. The `worktree` option and its tests are removed.
- [ ] At least one #100 test uses the real finding shape from the issue (the 900-slices plan path under two different roots).
- [ ] `pnpm -r build` and the full test suite pass.

### Verification Walkthrough

To be filled in with actual commands and output during implementation. Outline:

1. Register a second worktree (`git worktree add /tmp/cf-wt-927 …`, `cf worktree init`).
2. `cf check` from the main checkout: confirm the slice-921 review warnings appear once, not twice. `cf check --json | jq '.findings | length'` should drop by the duplicate count.
3. `cd /tmp/cf-wt-927 && cf validate frontmatter --project context-forge --json | jq .documentRoot` should name `/tmp/cf-wt-927/...`.
4. `cd /tmp && cf validate frontmatter --project context-forge --json | jq .documentRoot` should name the main checkout.
5. `cf status --project context-forge --worktree nope` should give a non-zero exit and an error message.
6. Uncheck the same plan entry in both checkouts, run `cf check --fix --yes`, and confirm both files are re-checked and `fixLog` lists both.
7. Remove the temporary worktree.

## Risk Assessment

- **Shared resolver (#101):** 14 commands change behavior when `--project` is run from inside one of that project's worktrees. The change always moves them toward the checkout the caller is standing in. Mitigation: unit coverage of all branches; the walkthrough exercises `validate`.
- **Over-collapse (#100):** two genuinely different findings could collapse if they differ only by the root. That can only happen when the same rule reports on the same relative artifact with the same text in two checkouts, and that is the definition of the duplicate this slice removes. Collapsing happens anyway today for aggregate rules (926 D-decision), and attribution stays first-seen.
- **Fix path (#100):** moving CLI fixes to per-view changes the all-slices confirm flow. Mitigation: the dry run and prompt are unchanged; only the apply step moves, and it reuses each view's dry-run result so nothing is re-checked between prompt and write.
- Risk overall: Low–Medium.

## Review Resolution

Review `927-review.slice.worktree-dedup-and-explicit-project-worktree-resolution.md` (CONCERNS). All findings verified against source and accepted:
- **F001** (rider premise wrong): confirmed; no production caller passes `worktree`. Resolved by D4 (delete the option) and a replaced criterion.
- **F002** (`--fix` drops collapsed fixes): confirmed, plus a related MCP gap (the merge drops fix fields). Resolved by D5 and the #100 Fix Path section.
- **F003** (migrated single-worktree behavior unpinned): accepted as intended; pinned with an explicit criterion.

## Implementation Notes

- Suggested order: rider + #101 (resolver, small, isolated), then #100 (merge key), then #100 fix path (`mergeFixResults`, CLI per-view fixes, MCP swap), then walkthrough.
- `runAttributed` / `attributeFindings` are typed on `ConsistencyCheckResult`; make them generic (`<T extends ConsistencyCheckResult>`) so fix results keep their fix fields through attribution.
- `replaceRoot` should strip a trailing separator from `viewRoot` the same way `stripTrailingSeparator` does in worktree-overlay.ts. Reuse it if it is exported; otherwise export it rather than duplicating it.
- Commit `Fixes #100` / `Fixes #101` in the commit messages, but the merge is local, so close the issues manually after release.
