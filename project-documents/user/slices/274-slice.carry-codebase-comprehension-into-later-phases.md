---
docType: slice-design
slice: carry-codebase-comprehension-into-later-phases
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 267
- 271
- 273
interfaces: []
dateCreated: 20261027
dateUpdated: 20261027
status: not_started
turns: 42
promptTokens: 3789156
cachedTokens: 3658847
cacheWriteTokens: 130229
completionTokens: 35342
durationSeconds: 398.5
costUsd: 2.481093
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.4810932
    completionTokens: 35342
revision_number: 2
---

# Slice Design: Carry Codebase Comprehension into Later Phases

## Overview

After adoption, two documents describe the existing system better than anything else cf has: squadron's comprehension doc and cf's docs map (267). Only the adoption prompt sees the comprehension doc (271, `--comprehension`). No `cf build` context profile lists either one (#135). Later design sessions see them only if the agent follows a link from the derived architecture, and 273's run confirmed the docs map is in no build context.

This slice adds both documents to the Phase 2, 3 and 4 builds. It adds a cf-owned project field, `fileComprehension`, which squadron sets with `cf set`. It also adds a short "Codebase Reference" section to the build output. The section lists each document, or says plainly that it is absent or missing, and names the way to refresh it. Only the docs map, which is cf's own artifact, gets a freshness check: whether `cf docs map` would change it. The comprehension doc's freshness belongs to squadron (arch), so cf reports it only as present or missing. A commit-count fact for it is deferred to #138.

The slice plan expected this umbrella to split. It does split, but by repository rather than into several cf slices (D1). The cf work is this one slice. The guide's profile rows and squadron's `cf set` call are external items, each one change in its own repo.

## Value

- **Adoption pays off after the first afternoon.** Each architecture, slice-planning and slice-design session after adoption starts with the comprehension doc and the docs map in its context. It does not depend on the agent finding a link.
- **Staleness shows up where cf owns it.** A design session can see that the docs map no longer matches the repo, and that a registered comprehension doc has gone missing. Each line names the way to refresh.
- **The ban holds.** cf learns the doc's location from a field squadron sets. It never searches for squadron's files, parses squadron's output or runs squadron (PM 20261025).

## Technical Scope

Included:
- A project field `fileComprehension`: path-valued, root-relative, validated on set (D2, D3).
- A derived build variable `fileDocsMap`, taken from the docs map's canonical path. It is not a project field (D4).
- A `### Codebase Reference` section in `cf build` and `context_build` output, emitted when the active profile lists either variable (D6).
- The docs-map freshness check and the refresh lines (D5, D7).
- CLI and MCP parity: `cf set comprehension` and `project_update` share one core setter, and `cf build` and `context_build` produce the same section.

Excluded:
- Comprehension freshness. cf does not judge it and reports no fact about it; it is squadron's (arch, Technical Considerations). A commit-count fact is deferred to #138, pending squadron's interest.
- `cf build --embed` of either document. Deferred to #139 until a model without file access needs them; it needs a size rule first (D8).
- Refreshing anything. cf never rebuilds the graph or the comprehension doc, and the build never runs `cf docs map`. A build writes nothing (268).
- Changing 271's `--comprehension` flag or the Adoption Inputs section. The adoption prompt gets its path only from the flag, never from the stored field (D2).
- The guide's profile rows and the squadron call (external, D1).
- Sharing the field across clones. Project fields are machine-local, like every other `cf set` field (Special Considerations).

## Dependencies

### Prerequisites
- **267 (shipped):** `docsMapPath`, `discoverMappedDocs`, `renderManagedBlock` and the managed-block markers.
- **271 (shipped):** `resolveComprehensionPath` (`packages/cli/src/commands/promptAdoption.ts`), which moves to core (D3).
- **273 (complete):** the run's Notes for 274. The Phase 4 profile now includes the architecture (guide v0.22.10), and the docs map is in no profile.
- **External, ai-project-guide:** a release that adds `fileComprehension` and `fileDocsMap` to the `architecture-phase-2`, `slice-planning-phase-3` and `slice-design-phase-4` rows of `context_profiles` (D1). The cf code is inert until it ships, and `MIN_GUIDE_VERSION` rises to that release.
- **External, squadron:** `sq onboard`, and squadron's comprehension refresh, call `cf set comprehension <path>` after writing the doc (D1).

### Interfaces Required
- The guide's `context_profiles` table, read by `ContextProfileParser`. Its variable names are the guide's contract: `fileComprehension` is already in the guide (271 D10), and `fileDocsMap` is new and named in the issue (#135).

## Architecture

### Component Structure

```
packages/core/src/
  schema/projectSchema.ts         fileComprehension (artifacts, path-valued)                      (changed)
  adoption/codebaseReference.ts   path check (moved from the CLI), facts, section text            (new)   D3, D5–D7
  docs-map/docsMapFile.ts         compare step shared by writeDocsMap and the build               (changed) D5
  services/ContextIntegrator.ts   compute fileDocsMap; pass facts to the engine                   (changed)
  services/SectionBuilder.ts      emit ### Codebase Reference after Project Context               (changed)
packages/cli/src/commands/
  promptAdoption.ts               uses the core path check                                        (changed)
  project.ts                      `cf set comprehension` goes through the core setter              (changed)
packages/mcp-server/src/tools/    project_update goes through the same setter                     (changed)
```

### Data Flow

```
squadron writes / refreshes its doc
   └─► cf set comprehension <path>                 (CLI or MCP project_update)
         └─ path check: exists, a file, inside the root → stored root-relative with '/'

cf build / context_build   (Phase 2, 3 or 4)
   ├─ profile lists fileComprehension / fileDocsMap?   (no → section omitted, build unchanged)
   ├─ codebaseReference(root, project):
   │     comprehension: path, a readable file?
   │     docs map:      docsMapPath(root, name), exists?, would `cf docs map` change it?
   └─ SectionBuilder: ### Codebase Reference   (read-only; nothing written)
```

### State Management

One new project field, `fileComprehension`. It is project-level, not worktree-scoped, because the comprehension doc describes the whole codebase. The docs map has no stored state; cf finds it by its canonical path. The build writes nothing.

## Technical Decisions

### D1 — The umbrella splits by repository, not into several cf slices
Status: decided
- The work falls into three parts: cf (this slice), the guide (profile rows) and squadron (one `cf set` call wherever it writes or refreshes the doc). The cf part is one coherent change of effort 3/5, with one test surface (the build output). Splitting it further would ship a field with no reader, or a section with no data.
- The guide and squadron parts are requests to those sessions, not cf slices. This follows 272's pattern for cross-repo changes. They are sent when this design is approved, so all three can land together.
- Rejected: separate cf slices for the docs map and the comprehension doc. They share the section, the profile gate and the absence rule, and a split would design those twice.

### D2 — `fileComprehension` is a cf project field that squadron sets with `cf set`
Status: decided
- The field lives in the `artifacts` group, with the alias `comprehension`, so the existing profile filter (`ContextIntegrator.applyProfileFiltering`) handles it like `fileArch`: zeroed unless the active profile lists it.
- Squadron runs `cf set comprehension <path>` (or MCP `project_update`) after it writes or refreshes the doc. This is the "cf-owned field that squadron sets" the slice plan calls for. cf never looks for the file itself.
- Rejected: a `cf config` key. Project fields are where artifact pointers already live. They already reach the build and already have a CLI and MCP setter.
- Rejected: reusing 271's `--comprehension` value. `cf prompt get` is read-only and must not store anything.
- **The adoption prompt ignores the stored field.** The architecture says the adoption prompt's comprehension path "comes only from squadron's argument". `cf prompt get` keeps filling the Adoption Inputs line from `--comprehension` alone. When the flag is omitted, the prompt says "No codebase comprehension analysis was provided." even if `fileComprehension` is set. The stored field feeds only `cf build` and `context_build`. A test sets the field, runs `cf prompt get brownfield-adoption` without the flag and asserts the "not provided" sentence.

### D3 — The field holds a validated root-relative path, not a stem
Status: decided
- Other artifact fields hold bare stems (`normalizeArtifactValue`) that `resolveArtifactPath` maps to a fixed directory. The comprehension doc's location is squadron's choice, so cf must not assume a directory or a naming pattern (the ban). The schema entry is marked path-valued, and that marker skips stem normalization and index resolution for this field. This is the one piece of new schema the slice needs: without it, `cf set` would reduce the path to a bare file name. A schema property is used rather than a field-name check in the setter, so that the setter and the build don't each hard-code the field.
- On set, the path may be absolute or root-relative. It must exist, be a file and lie inside the project root. It is stored root-relative with `/`. 271's `resolveComprehensionPath` moves from the CLI into `adoption/codebaseReference.ts`, so both setters and `cf prompt get --comprehension` share one check and one set of error messages. The inside-the-root rule adds one error message to that check.
- `cf set comprehension ""` clears the field.

### D4 — The docs map is found by its canonical path, with no field
Status: decided
- cf writes the map, so cf knows where it is: `docsMapPath(root, projectName)` (267 D1). `fileDocsMap` is a variable the build computes when the active profile lists it. It is not a project field, so there is nothing to set and nothing that can drift. This answers #135's question: "fixed path by convention".

### D5 — Freshness: the docs map only; the section never fails a build
Status: decided
- **Comprehension doc: presence only.** The architecture says squadron owns its freshness and cf "only says plainly when a doc is missing". cf stores no commit, runs no git and reports no age. Squadron refreshes the doc and re-registers it (D7). A commit-count fact is deferred to #138, to be added only if squadron's session asks for it.
- **Docs map: `current` or `out of date`.** This deliberately goes beyond the architecture's "only says plainly when a doc is missing", which is about the comprehension doc. The slice plan's success criterion ("staleness is detectable, and the way to refresh is named") needs it, and the docs map is the one document whose freshness cf owns. The map is cf's own artifact, and the check is bounded: it walks the same doc tree `cf docs map` walks. The build runs `discoverMappedDocs` and `renderManagedBlock` and compares the result with the file's managed block, read-only. This is the comparison `writeDocsMap` already makes to decide `unchanged`. It is factored out as one compare step that both use, not duplicated.
- **No failure mode fails the build.** The section is advisory. Each case below degrades to one plain line, and the rest of the build is unchanged:

| Case | Line |
|---|---|
| Registered comprehension path is gone | `<path> (missing: …)`, with the D7 refresh sentence |
| Registered path is a directory or unreadable | `<path> (not readable: <reason>)`, with the D7 refresh sentence |
| Docs map's managed block is absent or broken (the cases where `cf docs map` itself refuses) | `<path> (cannot check: <the problem writeDocsMap reports>; fix the markers, then run \`cf docs map\`)` |
| Docs map or doc tree unreadable during discovery | `<path> (cannot check: <reason>)` |

### D6 — When the section appears, and the plain absence line
Status: decided
- The `### Codebase Reference` section follows Project Context. It appears only when the active profile lists `fileComprehension` or `fileDocsMap`, and only the listed variables get lines. With today's guide nothing changes, and greenfield builds stay byte-identical while the profile rows are absent.
- Each listed variable gets one line: the document, a registered path named as missing, or "none". The build does no adoption check of its own (no `readPlanningFacts`, no derived-architecture test), so `cf build` keeps one meaning (arch, amendment 20261025). Under the new guide rows, a greenfield Phase 2–4 build therefore also shows the "none" lines. That is plain and accurate.
- Wording lives in constants in `codebaseReference.ts`, like `adoptionInputs.ts`. Shape:

```
### Codebase Reference
Codebase comprehension: project-documents/user/analysis/362-analysis.foo.md
Docs map: project-documents/user/architecture/050-docs-map.foo.md (out of date: run `cf docs map` to refresh)
```

  Absent:

```
Codebase comprehension: none registered. Refresh it through squadron, which registers the new path with `cf set comprehension`.
Docs map: none. Run `cf docs map` to create it.
```

### D7 — How the comprehension refresh is named
Status: decided
- The success criteria require "the way to refresh is named". The docs map is cf's, so its line names `cf docs map`. The comprehension doc is squadron's, and cf does not know squadron's refresh command, so the design cannot name one without guessing.
- **Decided: cf names the action, not a squadron command.** The line reads: "Refresh it through squadron, which registers the new path with `cf set comprehension`." The way to refresh is named, cf holds no squadron command name, and `cf set comprehension` is cf's own command.
- Rejected for now: **(a)** naming squadron's refresh command in a constant. There is precedent (`cf next` names `sq onboard`), but no stable refresh command has been confirmed. If squadron's session confirms one, switching is a change to one constant and its test, made as a small fix. **(b)** squadron registering the command text in a second field. That adds state that can go stale, just to print a sentence.

### D8 — `--embed` is not extended
Status: decided
- `ContextEmbedder` is unchanged. The slice plan asks for the documents to be available to later phases, not inlined. A generated comprehension doc can be large, and inlining it needs a size rule that no current consumer has asked for. An embedded build lists the two paths in the section like any other build. Deferred to #139.

### Patterns and Conventions
- New code is one file, `packages/core/src/adoption/codebaseReference.ts`, next to `adoptionInputs.ts`. Constants follow `adoptionInputs.ts`, and errors are `UserError` codes like 271's (`ARTIFACT_NOT_FOUND`, `INVALID_ARGUMENT`).
- The 271 D10 guard test (no `codebase-comprehension` or `sq` invocation in `src`) stays green. Nothing here names squadron's file pattern.

## Implementation Details

### API Contracts

**`cf set comprehension <path>`** (alias of `fileComprehension`). Output follows `cf set`'s pattern:

```
fileComprehension = project-documents/user/analysis/362-analysis.foo.md
```

Errors: the path does not exist, is a directory, or lies outside the project root. Each is a named error with a non-zero exit. `cf set comprehension ""` clears the field.

**MCP `project_update`** with `fileComprehension` behaves the same, through the same core setter.

**`cf build` / `context_build`:** the section in D6. The JSON output of `cf build`, if any, carries the section in its rendered text and nothing else; no new JSON fields.

### Database / Storage Schema
- `fileComprehension`: string, `artifacts` group, path-valued, alias `comprehension`, label `Codebase Comprehension`.
- It is not in `WORKTREE_SCOPED_FIELDS`. No migration: the field is new and optional.

## Integration Points

### Provides to Other Slices
- Later design sessions in adopted projects: the comprehension doc and the docs map in Phase 2–4 context, plus the docs map's freshness.
- Squadron: a stable registration call, `cf set comprehension <path>` or `project_update`, documented in `docs/ADOPTION-PRIMITIVES.md`.
- ai-project-guide: the variable names `fileComprehension` and `fileDocsMap` for the profile rows. Their semantics: absent unless the project has the document; the section exists only when the row lists them.

### Consumes from Other Slices
- 267's map path and rendering, and 271's path check and planning facts.
- If the guide lacks the new rows, the section is never emitted, and no error or fallback occurs. `MIN_GUIDE_VERSION` warns about an old guide, as it does today.
- If squadron never calls `cf set`, the build shows "Codebase comprehension: none registered", which is plain and correct.

## Success Criteria

### Functional Requirements
- With a guide whose Phase 2, 3 and 4 rows list both variables, a build on an adopted project with both documents shows the Codebase Reference section with both paths and the docs map's freshness. CLI and MCP output are identical.
- On a project without them, the section says "none" for each and names the way to create or refresh it.
- A registered comprehension path whose file was deleted, or that is now a directory, is shown as missing or not readable. A docs map with broken markers is shown as `cannot check`. None of these fails the build (D5).
- After a new doc is added under `docs/`, the docs map shows `out of date`, and after `cf docs map` it shows `current`.
- Every build under the current guide (whose rows lack the variables) is byte-identical to before. Under the new rows, a greenfield Phase 2–4 build gains only the two "none" lines.
- `cf prompt get brownfield-adoption` without `--comprehension` says no analysis was provided, even when `fileComprehension` is set (D2).
- `cf set comprehension` rejects a missing path, a directory and a path outside the root, and stores an absolute input root-relative.
- No build writes to the filesystem or to config (268's purity test extended to a project with both documents).

### Technical Requirements
- Tests use the guide's real `context_profiles` table layout (compact rows), with the two variables added in the fixture copy.
- The docs-map comparison is shared with `writeDocsMap`, not duplicated.
- The guard test from 271 D10 passes, along with format, lint, typecheck and the full suite.
- `docs/ADOPTION-PRIMITIVES.md` and the CLI and MCP references document `cf set comprehension` and the section.

### Integration Requirements
- The ai-project-guide session has the variable names and row changes, and the guide release that carries them is the new `MIN_GUIDE_VERSION`.
- The squadron session has the registration call.

### Verification Walkthrough

Draft, refined after implementation. Uses a temp adopted project, with the guide fixture's rows edited until the guide release ships. `cf` is the local build (`node packages/cli/dist/index.js`).

1. **Setup.** Create a project with code, a derived architecture (`provenance: derived`), a slice plan with a retroactive entry and `docs/a.md`. Register it with `cf init`. Point its guide at a copy whose Phase 2–4 rows list `fileComprehension` and `fileDocsMap`.
2. **Absent, adopted.**
   ```bash
   cf set phase 4 && cf build | sed -n '/### Codebase Reference/,/^###/p'
   ```
   Expected: `Codebase comprehension: none registered.` plus the D7 refresh line, and `Docs map: none. Run \`cf docs map\` to create it.`
3. **Register and map.**
   ```bash
   mkdir -p project-documents/user/analysis && echo '# x' > project-documents/user/analysis/x.md
   cf set comprehension "$PWD/project-documents/user/analysis/x.md"   # stored root-relative
   cf docs map && cf build | sed -n '/### Codebase Reference/,/^###/p'
   ```
   Expected: both paths, and the docs map `current`.
4. **Drift and degradation.** `echo b > docs/b.md && cf build`: the docs map is `out of date: run \`cf docs map\` to refresh`. Then `rm project-documents/user/analysis/x.md && cf build`: the comprehension line says missing, and the build exits 0.
5. **Errors.** `cf set comprehension nope.md; echo $?` and `cf set comprehension /tmp/outside.md; echo $?` each print a named error and exit 1.
6. **Parity and purity.** `context_build` through the MCP server returns the same section. `git status --short` and the project's config are unchanged by steps 2 and 4.
7. **Current guide.** On this project with the stock guide, the `cf build` output matches the output before the change (diff against the saved output).
8. **Prompt ignores the field.** With the field set from step 3, `cf prompt get brownfield-adoption | tail -5` still says "No codebase comprehension analysis was provided."

## Risk Assessment

### Technical Risks
- **A three-repo contract.** The section is invisible until the guide ships the rows, and empty until squadron calls `cf set`.

### Mitigation Strategies
- The two external changes are one line each. They are sent once the design is approved (Implementation Notes step 1), and the cf release waits for the guide release so `MIN_GUIDE_VERSION` can point at it. Before then, the walkthrough uses a fixture guide.

## Implementation Notes

### Development Approach
1. Once the design is approved, send the ai-project-guide session the profile rows and the squadron session the registration call. Find both with `ListAgents`, and follow the ack-then-result rule.
2. The schema field, the path-valued marker and the core path check (moved from the CLI), with `cf set` and `project_update` tests.
3. Factor the docs-map compare step out of `writeDocsMap`.
4. `codebaseReference` facts and rendering, including every D5 degradation case, then the `SectionBuilder` and `ContextIntegrator` wiring and the profile gate.
5. Docs. Raise `MIN_GUIDE_VERSION` when the guide release exists. Update row (b) of the architecture's Responsibility Split to list both channels squadron uses: the `--comprehension` argument for the adoption prompt, and `cf set comprehension` / `project_update` for later builds.

Effort: 3/5. The slice touches the schema, the core path check, the CLI and MCP setters, the docs-map writer's compare step and `SectionBuilder`.

### Special Considerations
- **The field is machine-local.** Like every `cf set` field, it lives in the local project store, so a teammate's clone does not have it until squadron (or the teammate) runs `cf set comprehension`. On that clone, the build shows "none registered", which is accurate. A shared, committed pointer would be a new state format and is out of scope.
- **Build cost.** The docs-map comparison walks the docs tree, and only when the profile lists `fileDocsMap`, which means Phase 2–4 builds only. The build runs no git.
