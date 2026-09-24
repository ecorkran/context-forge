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
- **Rider** — an unknown `--worktree` name is silently ignored and falls back to the project root. Same failure shape as #101, same function, two lines.

## Value

- **#100:** every `cf check` in a multi-worktree project prints N copies of each project-level finding. Slice 926's `[worktree]` labels made this visible: the same warning now shows up once per registered worktree with different labels, which reads like N separate problems. Noise grows with worktree count, which is exactly when people run several agents in parallel.
- **#101:** a script that passes `--project` for determinism gets a clean pass over the wrong tree, with no warning. It is the #88 failure again, for a different invocation shape. It affects all 14 commands that go through `resolveProjectWorktree`, not just `validate`.

## Technical Scope

**Included:**

1. Root-normalized dedup key in `mergeCheckResults` (#100). CLI `cf check` and MCP `workflow_check` both get it.
2. CWD-aware worktree resolution inside the explicit `--project` branch of `resolveProjectWorktree` (#101).
3. `UserError` on an unknown `--worktree` name (rider).

**Explicitly excluded:**

- Changing any rule's emitted `location` or `description` text. The fix is in the merge key, not at the producers (see D1).
- Adding `--worktree` to commands other than `cf status` (PM decision 20260924: CWD-aware resolver instead of per-command flags).
- MCP tool project resolution. MCP tools take an explicit `projectId`, and the server process's CWD has no relationship to the caller's checkout, so #101 does not apply there.
- Changing which finding wins when a duplicate collapses. First-seen-wins stays as it is (set by slice 926).

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

New behavior, in priority order:

1. `opts.worktree` given → resolve it by name or id. **Not found → `UserError`** (rider). Found → use it.
2. Otherwise → `resolveWorktreeForPath(project, process.cwd())`. If it matches a worktree of *this* project, use its `worktreeId`.
3. Otherwise → no `worktreeId` (project root), same as today.

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

### D4 — Unknown `--worktree` is an error

A misspelled worktree name currently falls back to the project root without saying so. Per the project rule against silent fallbacks, it throws a `UserError` naming the project and pointing to `cf worktree list`. Today only `cf status` passes `opts.worktree`.

## Success Criteria

### Functional Requirements

- [ ] In a project with 2 registered worktrees, `cf check` reports each path-derived project-level finding once, not once per worktree.
- [ ] The personal-scope-key finding (shared config holds a personal key) is reported once across 2 worktrees.
- [ ] `cf check --json` keeps the same shape; the kept finding's `location` is still absolute.
- [ ] Single-worktree / migrated-`default` projects: `cf check` output is byte-identical to before.
- [ ] `cf validate frontmatter --project <name>` run from inside a registered worktree of that project validates that worktree (`documentRoot` in `--json` names the worktree).
- [ ] `--project <name>` run from outside any of that project's checkouts resolves to the project root, as before.
- [ ] `--project <name>` run from inside a *different* project's checkout resolves to the named project's root.
- [ ] `cf status --project <name> --worktree <bogus>` exits non-zero with a `UserError`.

### Technical Requirements

- [ ] `mergeCheckResults` unit tests cover: absolute-path location collapse, description-embedded root collapse, root-prefix boundary (`/repo` vs `/repo-other` do not collapse), non-path locations unchanged.
- [ ] `resolveProjectWorktree` unit tests cover the three explicit-branch cases plus the unknown-`--worktree` error.
- [ ] At least one #100 test uses the real finding shape from the issue (the 900-slices plan path under two different roots).
- [ ] `pnpm -r build` and the full test suite pass.

### Verification Walkthrough

To be filled in with actual commands and output during implementation. Outline:

1. Register a second worktree (`git worktree add /tmp/cf-wt-927 …`, `cf worktree init`).
2. `cf check` from the main checkout: confirm the slice-921 review warnings appear once, not twice. `cf check --json | jq '.findings | length'` should drop by the duplicate count.
3. `cd /tmp/cf-wt-927 && cf validate frontmatter --project context-forge --json | jq .documentRoot` should name `/tmp/cf-wt-927/...`.
4. `cd /tmp && cf validate frontmatter --project context-forge --json | jq .documentRoot` should name the main checkout.
5. `cf status --project context-forge --worktree nope` should give a non-zero exit and an error message.
6. Remove the temporary worktree.

## Risk Assessment

- **Shared resolver (#101):** 14 commands change behavior when `--project` is run from inside one of that project's worktrees. The change always moves them toward the checkout the caller is standing in. Mitigation: unit coverage of all branches; the walkthrough exercises `validate`.
- **Over-collapse (#100):** two genuinely different findings could collapse if they differ only by the root. That can only happen when the same rule reports on the same relative artifact with the same text in two checkouts, and that is the definition of the duplicate this slice removes. Collapsing happens anyway today for aggregate rules (926 D-decision), and attribution stays first-seen.
- Risk overall: Low–Medium.

## Implementation Notes

- Suggested order: rider + #101 (resolver, small, isolated), then #100 (merge key), then walkthrough.
- `replaceRoot` should strip a trailing separator from `viewRoot` the same way `stripTrailingSeparator` does in worktree-overlay.ts. Reuse it if it is exported; otherwise export it rather than duplicating it.
- Commit `Fixes #100` / `Fixes #101` in the commit messages, but the merge is local, so close the issues manually after release.
