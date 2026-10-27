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
---

# Slice Design: Carry Codebase Comprehension into Later Phases

## Overview

After adoption, two documents describe the existing system better than anything else cf has: squadron's comprehension doc and cf's docs map (267). Only the adoption prompt sees the comprehension doc (271, `--comprehension`). No `cf build` context profile lists either one (#135). Later design sessions see them only if the agent follows a link from the derived architecture, and 273's run confirmed the docs map is in no build context.

This slice adds both documents to the Phase 2, 3 and 4 builds. It adds a cf-owned project field, `fileComprehension`, which squadron sets with `cf set`. It also adds a short "Codebase Reference" section to the build output. The section lists each document or says plainly that it is absent, and it gives one freshness fact for each: whether `cf docs map` would change the map, and how many commits have touched the project since the comprehension doc was registered.

The slice plan expected this umbrella to split. It does split, but by repository rather than into several cf slices (D1). The cf work is this one slice. The guide's profile rows and squadron's `cf set` call are external items, each one change in its own repo.

## Value

- **Adoption pays off after the first afternoon.** Each architecture, slice-planning and slice-design session after adoption starts with the comprehension doc and the docs map in its context. It does not depend on the agent finding a link.
- **Staleness shows up.** A design session can see that the code has moved on since the comprehension doc was written, or that the docs map no longer matches the repo, and it is told how to refresh.
- **The ban holds.** cf learns the doc's location from a field squadron sets. It never searches for squadron's files, parses squadron's output or runs squadron (PM 20261025).

## Technical Scope

Included:
- A project field `fileComprehension`: path-valued, root-relative, validated on set (D2, D3).
- An auto-set field `comprehensionCommit`, recorded when `fileComprehension` is set (D5).
- A derived build variable `fileDocsMap`, taken from the docs map's canonical path. It is not a project field (D4).
- A `### Codebase Reference` section in `cf build` and `context_build` output, emitted when the active profile lists either variable (D6).
- Freshness facts and refresh lines (D5, D7).
- `cf build --embed` embeds both documents when they are listed (D8).
- CLI and MCP parity: `cf set comprehension` and `project_update` share one core setter, and `cf build` and `context_build` produce the same section.

Excluded:
- Judging staleness. cf reports facts and applies no threshold. Freshness is squadron's call (arch, Technical Considerations).
- Refreshing anything. cf never rebuilds the graph or the comprehension doc, and the build never runs `cf docs map`. A build writes nothing (268).
- Changing 271's `--comprehension` flag or the Adoption Inputs section. The adoption prompt still gets the path squadron passes.
- The guide's profile rows and the squadron call (external, D1).
- Sharing the field across clones. Project fields are machine-local, like every other `cf set` field (Special Considerations).

## Dependencies

### Prerequisites
- **267 (shipped):** `docsMapPath`, `discoverMappedDocs`, `renderManagedBlock` and the managed-block markers.
- **271 (shipped):** `resolveComprehensionPath` (`packages/cli/src/commands/promptAdoption.ts`), which moves to core (D3). `readPlanningFacts` gives the derived-architecture test (D6).
- **273 (complete):** the run's Notes for 274. The Phase 4 profile now includes the architecture (guide v0.22.10), and the docs map is in no profile.
- **External, ai-project-guide:** a release that adds `fileComprehension` and `fileDocsMap` to the `architecture-phase-2`, `slice-planning-phase-3` and `slice-design-phase-4` rows of `context_profiles` (D1). The cf code is inert until it ships, and `MIN_GUIDE_VERSION` rises to that release.
- **External, squadron:** `sq onboard`, and squadron's comprehension refresh, call `cf set comprehension <path>` after writing the doc (D1).

### Interfaces Required
- The guide's `context_profiles` table, read by `ContextProfileParser`. Its variable names are the guide's contract: `fileComprehension` is already in the guide (271 D10), and `fileDocsMap` is new and named in the issue (#135).
- `git` on PATH, for the commit fact only. Without it, or outside a repository, the fact says so (D5).

## Architecture

### Component Structure

```
packages/core/src/
  schema/projectSchema.ts         fileComprehension (artifacts), comprehensionCommit (metadata)   (changed)
  codebase-reference/                                                                             (new)
    comprehensionField.ts         validate + normalize a path, record HEAD                        D2, D3, D5
    codebaseReference.ts          gather facts for the section                                    D5, D6, D7
    renderCodebaseReference.ts    the section text and its constants                              D6, D7
  project-autoset.ts              rule: fileComprehension → comprehensionCommit                   (changed)
  services/ContextIntegrator.ts   compute fileDocsMap; pass facts to the engine                   (changed)
  services/SectionBuilder.ts      emit ### Codebase Reference after Project Context               (changed)
  services/ContextEmbedder.ts     embed both documents when listed                                (changed)
packages/cli/src/commands/
  promptAdoption.ts               uses the core path check                                        (changed)
  project.ts                      `cf set comprehension` goes through the core setter              (changed)
packages/mcp-server/src/tools/    project_update goes through the same setter                     (changed)
```

### Data Flow

```
squadron writes / refreshes its doc
   └─► cf set comprehension <path>                 (CLI or MCP project_update)
         ├─ comprehensionField: exists, a file, inside the root → stored root-relative with '/'
         └─ autoset: comprehensionCommit = git rev-parse HEAD (or empty, with the reason)

cf build / context_build   (Phase 2, 3 or 4)
   ├─ profile lists fileComprehension / fileDocsMap?   (no → section omitted, build unchanged)
   ├─ codebaseReference(root, project):
   │     comprehension: path, exists?, commits since comprehensionCommit touching the project folder
   │     docs map:      docsMapPath(root, name), exists?, would `cf docs map` change it?
   │     adopted:       readPlanningFacts(root).derivedArchitectures.length > 0
   └─ SectionBuilder: ### Codebase Reference   (read-only; nothing written)
```

### State Management

Two new project fields: `fileComprehension` and `comprehensionCommit`. They are project-level, not worktree-scoped, because the comprehension doc describes the whole codebase. The docs map has no stored state; cf finds it by its canonical path. The build writes nothing.

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

### D3 — The field holds a validated root-relative path, not a stem
Status: decided
- Other artifact fields hold bare stems (`normalizeArtifactValue`) that `resolveArtifactPath` maps to a fixed directory. The comprehension doc's location is squadron's choice, so cf must not assume a directory or a naming pattern (the ban). The schema entry is marked path-valued, and that marker skips stem normalization and index resolution for this field. It is the only path-valued field. The marker is a schema property, not a special case in the setter.
- On set, the path may be absolute or root-relative. It must exist, be a file and lie inside the project root. It is stored root-relative with `/`. 271's `resolveComprehensionPath` moves from the CLI into `codebase-reference/comprehensionField.ts`, so both setters and `cf prompt get --comprehension` share one check and one set of error messages. A path outside the root is a new named error.
- `cf set comprehension ""` clears the field and `comprehensionCommit`.

### D4 — The docs map is found by its canonical path, with no field
Status: decided
- cf writes the map, so cf knows where it is: `docsMapPath(root, projectName)` (267 D1). `fileDocsMap` is a variable the build computes when the active profile lists it. It is not a project field, so there is nothing to set and nothing that can drift. This answers #135's question: "fixed path by convention".

### D5 — Freshness facts, with no verdict
Status: decided
- **Comprehension doc.** When the field is set, the autoset rule records `comprehensionCommit` = `git rev-parse HEAD` in the project root. The build reports the number of commits since then that touch the project folder (`git rev-list --count <commit>..HEAD -- <project folder>`, the same folder scoping as detection). cf records HEAD at registration rather than reading a commit from the doc, because reading the doc would mean parsing squadron output. Squadron registers right after it writes the doc, so the two commits match in practice.
- Each case gets its own fact line, and none is an error: no commit recorded (not a git repository at set time), recorded commit not in history (rewritten or shallow), `git` unavailable.
- **Docs map.** The build runs `discoverMappedDocs` and `renderManagedBlock` and compares the result with the file's managed block, read-only. It reports `current` or `out of date`. This is the comparison `writeDocsMap` already makes to decide `unchanged`. It is factored out and shared, not duplicated.
- No thresholds. "12 commits since" is a fact for the agent and the PM. cf does not call the doc stale (arch: freshness is squadron's).

### D6 — When the section appears, and the plain absence line
Status: decided
- The `### Codebase Reference` section follows Project Context. It appears only when the active profile lists `fileComprehension` or `fileDocsMap`, and only the listed variables get lines. With today's guide nothing changes, and greenfield builds stay byte-identical while the profile rows are absent.
- The section shows a document that exists, or a registered comprehension path whose file is gone, which is named as missing. Absence ("none") is shown only for an **adopted** project, meaning a derived architecture exists (adopted or adoption-incomplete, `readPlanningFacts`). A greenfield project whose profile lists the variables, and that has neither document, gets no section. "None" there would be noise rather than information.
- Wording lives in constants in `renderCodebaseReference.ts`, like `adoptionInputs.ts`. Shape:

```
### Codebase Reference
Codebase comprehension: project-documents/user/analysis/362-analysis.foo.md (registered at 1a2b3c4; 12 commits have touched this project since)
Docs map: project-documents/user/architecture/050-docs-map.foo.md (out of date: run `cf docs map` to refresh)
```

  Absent, on an adopted project:

```
Codebase comprehension: none registered. Refresh it through squadron, which registers the new path with `cf set comprehension`.
Docs map: none. Run `cf docs map` to create it.
```

### D7 — How the comprehension refresh is named
Status: decided
- The success criteria require "the way to refresh is named". The docs map is cf's, so its line names `cf docs map`. The comprehension doc is squadron's, and cf does not know squadron's refresh command, so the design cannot name one without guessing.
- **Decided: cf names the action, not a squadron command.** The line reads: "Refresh it through squadron, which registers the new path with `cf set comprehension`." The way to refresh is named, cf holds no squadron command name, and `cf set comprehension` is cf's own command.
- Rejected for now: **(a)** naming squadron's refresh command in a constant. There is precedent (`cf next` names `sq onboard`), but no stable refresh command has been confirmed. If squadron's session confirms one, switching is a change to one constant and its test, made as a small fix. **(b)** squadron registering the command text in a second field. That adds state that can go stale, just to print a sentence.

### D8 — `--embed` includes both documents
Status: decided
- `ContextEmbedder` already inlines the profile's artifacts for models without file access. It gains the two documents when they are listed and exist, embedded after the slice plan. Without them, an embedded build would list paths the model cannot open. The comprehension doc's path is used as stored, not passed through `resolveArtifactPath` (D3).

### Patterns and Conventions
- New code lives in `packages/core/src/codebase-reference/`. Constants follow `adoptionInputs.ts`, and errors are `UserError` codes like 271's (`ARTIFACT_NOT_FOUND`, `INVALID_ARGUMENT`).
- The 271 D10 guard test (no `codebase-comprehension` or `sq` invocation in `src`) stays green. Nothing here names squadron's file pattern.

## Implementation Details

### API Contracts

**`cf set comprehension <path>`** (alias of `fileComprehension`). Output follows `cf set`'s pattern, including the autoset description:

```
fileComprehension = project-documents/user/analysis/362-analysis.foo.md
comprehensionCommit = 1a2b3c4d… (auto-set from fileComprehension)
```

Errors: the path does not exist, is a directory, or lies outside the project root. Each is a named error with a non-zero exit. `cf set comprehension ""` clears both fields.

**MCP `project_update`** with `fileComprehension` behaves the same, through the same core setter.

**`cf build` / `context_build`:** the section in D6. The JSON output of `cf build`, if any, carries the section in its rendered text and nothing else; no new JSON fields.

### Database / Storage Schema
- `fileComprehension`: string, `artifacts` group, path-valued, alias `comprehension`, label `Codebase Comprehension`.
- `comprehensionCommit`: string, `metadata` group, set only by the autoset rule.
- Neither is in `WORKTREE_SCOPED_FIELDS`. No migration: both are new and optional.

## Integration Points

### Provides to Other Slices
- Later design sessions in adopted projects: the comprehension doc and the docs map in Phase 2–4 context, plus their freshness facts.
- Squadron: a stable registration call, `cf set comprehension <path>` or `project_update`, documented in `docs/ADOPTION-PRIMITIVES.md`.
- ai-project-guide: the variable names `fileComprehension` and `fileDocsMap` for the profile rows. Their semantics: absent unless the project has the document; the section exists only when the row lists them.

### Consumes from Other Slices
- 267's map path and rendering, and 271's path check and planning facts.
- If the guide lacks the new rows, the section is never emitted, and no error or fallback occurs. `MIN_GUIDE_VERSION` warns about an old guide, as it does today.
- If squadron never calls `cf set`, an adopted project shows "Codebase comprehension: none registered", which is plain and correct.

## Success Criteria

### Functional Requirements
- With a guide whose Phase 2, 3 and 4 rows list both variables, a build on an adopted project with both documents shows the Codebase Reference section with both paths and their freshness facts. CLI and MCP output are identical.
- On an adopted project without them, the section says "none" for each and names the way to create or refresh it.
- A registered comprehension path whose file was deleted is shown as missing.
- After a commit touching the project folder, the comprehension fact's count rises by one. After a new doc is added under `docs/`, the docs map shows `out of date`, and after `cf docs map` it shows `current`.
- A greenfield build, and every build under the current guide (whose rows lack the variables), is byte-identical to before.
- `cf set comprehension` rejects a missing path, a directory and a path outside the root, and stores an absolute input root-relative.
- `cf build --embed` inlines both documents when listed.
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
   cf set comprehension "$PWD/project-documents/user/analysis/x.md"   # stored root-relative; comprehensionCommit auto-set
   cf docs map && cf build | sed -n '/### Codebase Reference/,/^###/p'
   ```
   Expected: both paths, `0 commits have touched this project since`, and the docs map `current`.
4. **Drift.** `echo b > docs/b.md && git add -A && git commit -qm b && cf build`: the count is 1, and the docs map is `out of date: run \`cf docs map\` to refresh`.
5. **Errors.** `cf set comprehension nope.md; echo $?` and `cf set comprehension /tmp/outside.md; echo $?` each print a named error and exit 1.
6. **Parity and purity.** `context_build` through the MCP server returns the same section. `git status --short` and the project's config are unchanged by steps 2 and 4.
7. **Greenfield and current guide.** On a greenfield project, and on this project with the stock guide, the `cf build` output matches the output before the change (diff against the saved output).

## Risk Assessment

### Technical Risks
- **A three-repo contract.** The section is invisible until the guide ships the rows, and empty until squadron calls `cf set`.

### Mitigation Strategies
- The two external changes are one line each. They are sent once the design is approved (Implementation Notes step 1), and the cf release waits for the guide release so `MIN_GUIDE_VERSION` can point at it. Before then, the walkthrough uses a fixture guide.

## Implementation Notes

### Development Approach
1. Once the design is approved, send the ai-project-guide session the profile rows and the squadron session the registration call. Find both with `ListAgents`, and follow the ack-then-result rule.
2. Schema fields, the path-valued marker, the core path check (moved from the CLI) and the autoset rule, with `cf set` and `project_update` tests.
3. Factor the docs-map comparison out of `writeDocsMap`.
4. `codebaseReference` facts and rendering, then the `SectionBuilder` and `ContextIntegrator` wiring and the profile gate.
5. `ContextEmbedder`.
6. Docs. Raise `MIN_GUIDE_VERSION` when the guide release exists.

Effort: 3/5.

### Special Considerations
- **The field is machine-local.** Like every `cf set` field, it lives in the local project store, so a teammate's clone does not have it until squadron (or the teammate) runs `cf set comprehension`. On that clone, an adopted project shows "none registered", which is accurate. A shared, committed pointer would be a new state format and is out of scope.
- **Build cost.** The docs-map comparison walks the docs tree, and the commit count runs one `git rev-list`. Both run only when the profile lists the variable, which means Phase 2–4 builds only.
