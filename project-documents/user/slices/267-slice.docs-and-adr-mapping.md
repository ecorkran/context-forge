---
docType: slice-design
slice: docs-and-adr-mapping
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
interfaces: []
dateCreated: 20261020
dateUpdated: 20261021
status: not_started
turns: 39
promptTokens: 2773522
cachedTokens: 2670385
cacheWriteTokens: 103063
completionTokens: 29174
durationSeconds: 313.5
costUsd: 1.942686
usageRounds: 1
pricedRounds: 1
---

# Slice Design: docs-and-adr-mapping

## Overview

An adopted project usually already has design material: a README, a `docs/` tree, and often a directory of architecture decision records. Those files have inbound links, tooling (doc sites, ADR tools) and owners, so CF must not move or rewrite them. Today nothing in `project-documents/` points at them, and an agent working from CF's artifacts doesn't know they exist.

This slice adds a **docs map**: one cf-generated index file inside `project-documents/` that links every existing doc and ADR in place. `cf docs map` writes or refreshes it. The generated list sits in a managed block, so the PM or an agent can add hand-written entries around it, and a re-run never touches them. `cf check` treats links that leave `project-documents/` as normal and reports nothing for them; a regression test fixes that behavior.

## Value

- **Adopted projects keep their design history reachable.** The derived architecture and later slice designs can link one file to reach every ADR and doc, instead of each agent rediscovering `docs/` on its own.
- **Nothing existing breaks.** No original file is moved or modified, so inbound links, doc-site builds and ADR tooling keep working.
- **Out-of-tree references are a supported case, not an accident.** A test fixes `cf check`'s behavior for artifacts that link outside `project-documents/`.

## Technical Scope

Included:
- `docs-map/` core module: candidate discovery, entry rendering, managed-block merge and the write (D1–D4).
- `cf docs map` CLI command (D5).
- A regression test that `cf check` reports nothing for out-of-tree links (D6).
- Making 261's `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS` core-internal exports, so "where docs and ADRs live" has one definition (D2).
- README: one short entry for `cf docs map`. Full adoption docs are 265's.

Excluded:
- Reading docs or ADRs for meaning: no ADR status, no summaries, no mapping of ADRs to components. That's agent work (arch: facts in core, judgement in the prompt).
- Running the mapping during `cf build` or adoption automatically (D5).
- An MCP tool. Like 266, this is CLI-first. The logic is in core so an MCP tool can be added later without moving code.
- A build variable (`fileDocsMap`) or profile change. That needs guide work and no consumer asks for it yet.
- Link checking of any kind, including the docs map's own links. Deferred: #127.
- Changes to setup-ide's managed-section code. Sharing one locator is deferred: #128.
- Showing the map in `ProjectModel` or `cf status`.

## Dependencies

### Prerequisites
- **Slice 261 (Detection and Adoption State):** the `detection/` module with `presentPaths`, `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS`, and 261's checkout-root rule (D5 there). 267 doesn't need the adoption state or outcome: a map is useful in any project with existing docs.
- **ai-project-guide:** the docs map filename convention lands in the guide before the cf release that writes it (D1). Implementation can proceed before that; the release can't.
- No external services or new packages.

### Interfaces Required
- From 261: `DOC_PATHS`, `ADR_DIRS`, `EXCLUDED_DIRS` and `presentPaths(root, candidates)` from `packages/core/src/detection/`. 261 keeps them out of the package exports. 267 imports them inside core, the same way 266 takes `RULE_FILE_PATHS`.
- From 260: `pathPresent` / `isEnoent` (the missing-file rule).
- Existing: `ConsistencyChecker.checkAll` (unchanged; used by the regression test), `parseFrontmatter`, the CLI project resolution `cf build` uses.

## Architecture

### Component Structure

```
packages/core/src/detection/
  presentPaths.ts       (261) DOC_PATHS, ADR_DIRS exported inside core (not from the package)
  sourceVolume.ts       (261) EXCLUDED_DIRS exported inside core
packages/core/src/docs-map/
  constants.ts          DOCS_MAP_BEGIN, DOCS_MAP_END, DOCS_MAP_INDEX, DOCS_MAP_SEGMENT,
                        MAX_DOCS_MAP_ENTRIES, DocsMapError
  discoverDocs.ts       discoverMappedDocs(root) → Promise<Discovery>              (D2, D3)
  renderDocsMap.ts      renderManagedBlock(docs, mapDir, root) → string             (pure, D3)
  managedBlock.ts       locateBlock(lines) → absent | managed | broken              (private, D4)
  docsMapFile.ts        findDocsMap(root) → string | null; writeDocsMap(root, project) → DocsMapResult  (D1, D4)
  index.ts
packages/cli/src/commands/
  docs.ts               `cf docs map` (D5)
```

`docs-map/` writes exactly one file, the map. It reads candidate docs only for their title (D3). Nothing in `introspection/`, `schema/` or setup-ide changes.

### Data Flow

```
cf docs map
  → resolve project (as cf build does); root = checkout path (worktree path ?? projectPath)
  → writeDocsMap(root, project.name)
      1. findDocsMap(root)        existing map path, or null; more than one → DocsMapError
      2. read the existing map's bytes (if any) and keep them as the baseline
      3. discoverMappedDocs(root) present ADR_DIRS → *.md (kind adr)
                                  present DOC_PATHS → README files and *.md under docs dirs (kind doc),
                                  minus files already listed as ADRs;
                                  symlinks skipped and collected; cap → DocsMapError
      4. renderManagedBlock(...)  grouped, sorted entries with links relative to the map's directory
      5a. no map → new file: frontmatter + heading + managed block
      5b. map exists → locate the block; broken or absent → DocsMapError, nothing written;
          managed → replace the block only
      6. content unchanged → no write; changed → write temp, re-read the map and compare
         with the baseline (changed → DocsMapError), rename into place
  → print path, entry counts, "created" | "updated" | "unchanged", and every skipped symlink
```

### State Management

The map file is the only state. It's a project document, committed with the project like any other artifact. There's no config key and no cache. The managed block is regenerated wholesale from the filesystem on each run. Everything outside the block (hand entries, notes) belongs to the project, and cf preserves it byte for byte. The one exception is the frontmatter `dateUpdated` field, which cf sets when the block changes (D4).

## Technical Decisions

### D1 — One generated index file in an existing docType
Status: decided
- The map is `project-documents/user/architecture/050-docs-map.{project}.md`. `{project}` is the registered project name, as in `000-concept.{project}.md`.
- Frontmatter `docType: reference`. `reference` is already in the guide's valid docType list (`file-naming-conventions.md`) and in squadron's `DocType` enum, so no new docType is introduced and cf's frontmatter schema doesn't change. cf has no `reference` schema, so the validator passes it as it does today. The map is still found by name, not by docType alone: `findDocsMap(root)` matches `^\d+-docs-map\..*\.md$` (case-insensitive) in `user/architecture/` and requires `docType: reference`. Matching any index rather than exactly `050` means a renumbered or renamed-project map is still found and never duplicated. Two matches is a `DocsMapError`.
- **Guide lands first.** The filename is new, so `file-naming-conventions.md` gains the `050-docs-map.{project}.md` entry before the cf release that writes it. The same rule applies to the brownfield profile (arch: guide release coupling). The cf release bumps its documented guide minimum to that version. If the guide picks a different name or index, cf changes `DOCS_MAP_INDEX` or `DOCS_MAP_SEGMENT` before release. Nothing has shipped, so there's nothing to migrate. No runtime guide-version check is added, because a filename convention isn't something a build can fail on.
- Index 050 is the project-level architecture and governance band, the same base as the project HLD (`050-arch.hld-{project}.md`). The map describes the project as a whole, and ADRs are governance records.
- Rejected: one stub file per mapped doc in `project-documents/`. A repo with 80 ADRs would get 80 stubs that duplicate titles and drift, and stubs would need index numbers that collide with the slice index space.
- Rejected: a config key listing paths. Config isn't discoverable by reading `project-documents/`, and the success criterion is discovery from there.
- Rejected: pointing `fileArch` or `fileHLD` at an out-of-tree file. Artifact fields are stems resolved inside fixed directories (`resolveArtifactPath`). Allowing escapes changes every consumer of those fields for one use case.

### D2 — What gets mapped
Status: decided
- Root: the checkout root (261 D5). A CF project in a monorepo subdirectory maps its own folder. Docs at the repository root, outside the project folder, are not scanned; the PM can add them as hand entries.
- Candidates come from 261's lists, so detection and mapping agree on where docs and ADRs live:
  - **ADRs:** every `*.md` file under each present `ADR_DIRS` entry, recursively.
  - **Docs:** each present file entry of `DOC_PATHS` (`README.md`, `README`), and every `*.md` file under each present directory entry (`docs`, `doc`), recursively. Files already listed as ADRs are skipped, so `docs/adr/` files appear once, as ADRs.
  - Extensions are matched case-insensitively (`.md`, `.MD`). Only Markdown is mapped. Other formats (`.rst`, `.adoc`) are a one-line extension list change if 265's real-repo runs show a need.
- Skipped while walking: directories whose name starts with `.`, and directories in `EXCLUDED_DIRS` (this includes `project-documents`, so cf's own documents never map themselves).
- **Symlinks are not followed, and never silently.** A symlinked candidate root (for example a `docs/` symlink in a monorepo), a symlinked directory or a symlinked file inside one is skipped. Its root-relative path goes in the result's `skippedSymlinks`, which the command prints under the counts: `Skipped symlinks (not followed): docs`. Not following keeps the walk inside the root with no loops. The PM sees what was left out and can add a hand entry.
- `MAX_DOCS_MAP_ENTRIES` (1000, in `docs-map/constants.ts`) bounds the map. Over the cap, `DocsMapError` names the count per candidate root and writes nothing. A partial map that silently omits files would be a worse failure. A docs site that large is better linked by hand as one entry.
- Errors follow 260's rule: ENOENT mid-walk is "not present"; any other error throws `DocsMapError` with the path and code.
- An empty result is valid. The block then holds one line, "No existing docs or ADRs were found.", so the file never reads as broken.

### D3 — Entry contents are structure, never interpretation
Status: decided
- Each entry has: the kind (`adr` or `doc`), the link target (relative from the map's directory, POSIX separators, spaces percent-encoded), the root-relative path shown as code, and a title.
- Title, in order: the frontmatter `title:` value; else the first ATX level-1 heading (`# ...`, after any frontmatter, leading whitespace tolerated, trailing `#`s stripped); else the filename. Only the first 64 KiB of a file is read for this. Nothing else in the file is read.
- Title bytes are decoded as UTF-8 with invalid sequences replaced by U+FFFD. The title is display text only, and the exact path is printed beside it, so nothing is lost.
- A file the walk listed but that's gone by the title read (ENOENT) is dropped, the same as if the walk hadn't seen it (260's rule). Any other read error (permissions, I/O) is a `DocsMapError` naming the file, and nothing is written.
- No ADR status, date or supersession. Those live in prose formats that vary (MADR, Nygard, custom), and judging them is agent work.
- Rendered layout, sorted by path within each group (ADR filenames carry their numbers, so path order is ADR order):

```markdown
<!-- BEGIN:cf-docs-map -->
## Architecture Decision Records
- [1. Record architecture decisions](../../../docs/adr/0001-record-architecture-decisions.md) — `docs/adr/0001-record-architecture-decisions.md`

## Documentation
- [Acme Service](../../../README.md) — `README.md`
- [Deployment](../../../docs/deployment.md) — `docs/deployment.md`
<!-- END:cf-docs-map -->
```

  A group with no entries is omitted.

### D4 — Managed block; everything else is the project's
Status: decided
- Markers are whole lines: `<!-- BEGIN:cf-docs-map -->` and `<!-- END:cf-docs-map -->`. They're deliberately distinct from setup-ide's `<!-- BEGIN:context-forge -->`, so neither tool can mistake the other's file for its own.
- The block is located by a small private function in `docs-map/managedBlock.ts`: exactly one BEGIN line before exactly one END line. setup-ide's `managedState` does a similar check. Sharing one implementation is deferred to #128, so this slice doesn't touch setup-ide code.
- New file: frontmatter (`docType: reference`, `project`, `dateCreated`, `dateUpdated`), a `# Docs Map: {project}` heading, one sentence saying the block is regenerated by `cf docs map` and entries outside it are kept, the block, then an empty `## Additional Material` section for hand entries.
- Existing file: only the lines between the markers are replaced. A broken block (unpaired, duplicated, out of order) or a docs map with no block is a `DocsMapError` naming the file and the problem; nothing is written. cf never guesses where a block should go.
- Unchanged block → no write, and `dateUpdated` stays as it is. Changed → `dateUpdated` is set to today.
- Line endings and bytes outside the block are preserved (read and written as latin1, as setup-ide's merge does).
- **Write failures.** Every failure below is a `DocsMapError` naming the path and the system error code, and leaves the existing map as it was:
  - The temp file is `{map}.cf-docs-map.tmp` in the map's directory. That's the same filesystem, so the rename is atomic and never cross-device.
  - A failed temp write (permissions, disk full) or rename: the temp file is removed, then the error is raised. If removing the temp file also fails, both errors are reported.
  - A temp file left by a crashed earlier run is overwritten by the next run's write. It's never read.
  - **A change during the run.** Before the rename, the map is read again and compared with the bytes read at step 2 of the data flow. If they differ (another `cf docs map`, an editor save), the temp file is removed and `DocsMapError` says the map changed during the run and to re-run. This doesn't catch a change in the instant between that compare and the rename. That window is accepted: the alternative is file locking, which is out of proportion for a command run by hand.

### D5 — Mapping is an explicit command, CLI-only for now
Status: decided
- `cf docs map` is the only writer. `cf build` and the adoption resolver never write the map. A build that writes project documents as a side effect would surprise the PM and make a `template_preview` impure. 261's build already writes one thing (the adoption state), and that stays the only build-time write.
- How an adoption reaches it: 261's Adoption Facts already list the docs and ADR directories present. The guide's brownfield prompt can then tell the agent to run `cf docs map` before the architecture step, and to link the map from the derived architecture. That prompt change is a guide-side follow-up (see Integration Points). Until it ships, the PM or agent runs the command by hand, and nothing in cf depends on it.
- No MCP tool in this slice, matching 266 (`setup-ide` and reconciliation are CLI-only). The core function takes `(root, projectName)` and returns a result object, so a `docs_map` tool is a thin wrapper later.
- Rejected: a new `--docs` flag on `cf init`. `init` runs before adoption decides anything, and a flag on it would need re-running to refresh.

### D6 — `cf check` tolerates out-of-tree links
Status: decided
- No current rule follows links, so tolerance is already true. This slice makes it tested behavior and adds no rule. The fixture has an architecture doc and a docs map that both link to `../../../docs/adr/0001-x.md` and `../../../README.md`. `cf check` on it must report zero findings.
- **Readers of `user/architecture/` and what they do with the map.** Each one was checked against the name and docType:
  - cf `discoverAllArchFiles` (`-arch.`), `discoverAllSlicePlans` (`-slices.`), `resolveFileByIndex` (`arch.`, `slices.`, `hld.`, `arch.hld-`, `spec.`): no match.
  - cf `ProjectModelBuilder`: `INDEXED_RE` has no `docs-map` type, so the map isn't modeled.
  - cf frontmatter validator: scans every `.md` in the directory. It has no schema for `reference`, so it reports nothing, and the required `docType` is present.
  - 261's planning-artifact check (`arch`, `hld`, `slices`): no match, so a map can't make a project "already planned".
  - Squadron: `resolve_arch_file` and `integrations/context_forge.py` resolve `{num}-arch.*.md` or the configured `fileArch` only. Its `DocType` enum includes `reference`.
  - 263 and 264: their index logic reads slice plan entries in the 100–799 initiative space, not filenames in the 050 band.
  The regression fixture asserts the cf readers above: zero `cf check` findings, 261's outcome unchanged, the map absent from `ProjectModel`. Squadron is cross-repo, so the evidence there is the code reading above, not a cf test.
- Rejected: `user/analysis/` with `docType: analysis`. Squadron's tech-debt audit takes the newest `*-analysis.*.md` written during its run as the audit result (`metrology/audit.py`, `_AUDIT_FILE_GLOBS`). A docs map refreshed mid-run would be read as the audit.
- Validating the map's own links (a deleted ADR) is deferred: #127.

### Technology Choices
- Node `fs/promises` for the walk and reads; no new dependencies. No Markdown library: the heading pattern is line-level and the tests cover each variant.

### Patterns and Conventions
- Every compared value is one constant: the markers, the `050` index used for new files, the `docs-map` filename segment, `MAX_DOCS_MAP_ENTRIES`, the title read limit, the temp suffix, the Markdown extension list. The candidate lists stay 261's.
- Errors: `DocsMapError` carries the path and reason and is printed by the CLI with a non-zero exit. No error is swallowed; ENOENT during the walk or title read is the only "not present" case, per 260.
- Files stay near the repo's size guideline: one responsibility per file in `docs-map/`.

## Implementation Details

### API Contracts

`cf docs map`

```
$ cf docs map
Docs map: project-documents/user/architecture/050-docs-map.acme.md (created)
  ADRs: 12   Docs: 7
  Skipped symlinks (not followed): docs/vendor-docs
```

- Status word is `created`, `updated` or `unchanged`. The symlink line appears only when there are skipped symlinks.
- Exit 0 on success. Exit 1 with `Error: <DocsMapError message>` when the project isn't registered, the map's block is broken or missing, there's more than one map, the cap is exceeded, a read or write fails, or the map changed during the run.
- Options: none beyond the global project selection `cf build` already accepts.

Core:

```ts
interface MappedDoc { kind: 'adr' | 'doc'; path: string; title: string }   // path: root-relative, POSIX
interface DocsMapResult {
  path: string; status: 'created' | 'updated' | 'unchanged';
  adrs: number; docs: number; skippedSymlinks: string[];
}
writeDocsMap(root: string, projectName: string): Promise<DocsMapResult>
findDocsMap(root: string): Promise<string | null>
```

### Database / Storage Schema

The map file (filename convention lands in the guide first; see D1):

```markdown
---
docType: reference
project: acme
dateCreated: 20261101
dateUpdated: 20261101
---

# Docs Map: acme

The block below is regenerated by `cf docs map`. Entries outside it are kept.

<!-- BEGIN:cf-docs-map -->
...entries (D3)...
<!-- END:cf-docs-map -->

## Additional Material
```

No existing format changes, so there's nothing to migrate.

## Integration Points

### Provides to Other Slices
- **The docs map file and `findDocsMap`:** a stable place for the derived architecture (263's provenance-marked arch) and later designs to link existing material.
- **265 (end-to-end runs):** not a dependency of 265. If 267 lands first, 265's real-repo runs can include `cf docs map`; otherwise it's verified on its own (Verification Walkthrough).
- **Guide side (ai-project-guide):**
  - Before the cf release (D1): `file-naming-conventions.md` gains the `050-docs-map.{project}.md` file with `docType: reference`.
  - Non-blocking: the brownfield prompt runs `cf docs map` when the Adoption Facts list docs or ADRs, before the architecture step, and links the map from the derived architecture instead of copying ADR content.

### Consumes from Other Slices
- **261:** `DOC_PATHS`, `ADR_DIRS`, `EXCLUDED_DIRS`, `presentPaths` and the checkout-root rule. If 261 renames or extends a list, the map follows automatically; that's the point of sharing them.
- **260:** `pathPresent` / `isEnoent`.
- Nothing from 262–266. The map works on any registered project, adopted or not.

## Success Criteria

### Functional Requirements
- `cf docs map` in a project with a README, `docs/` and `docs/adr/` creates `050-docs-map.{project}.md` listing every Markdown doc and ADR, ADRs once, with working relative links and titles per D3.
- A second run with no changes reports `unchanged` and leaves the file's bytes and mtime unchanged. After adding an ADR it reports `updated`, adds the entry, and keeps hand entries outside the block byte for byte.
- No candidate file is moved or modified: a test hashes every file under the fixture root, excluding the map, before and after the command and finds them identical.
- A symlinked `docs/` is skipped and named in the command output.
- A broken or missing block, two map files, more than `MAX_DOCS_MAP_ENTRIES` candidates, a failed temp write or rename, a non-ENOENT title read error, and a map changed during the run each fail with a named `DocsMapError`, leave the existing map unchanged and leave no temp file.
- In a monorepo subdirectory project, only that folder's docs are mapped.
- `cf check` on a project whose docs map and architecture doc link outside `project-documents/` reports no findings.
- Writing a map doesn't change 261's outcome: a brownfield fixture is still brownfield, not "already planned".

### Technical Requirements
- Unit tests:
  - `discoverMappedDocs`: each `ADR_DIRS` and `DOC_PATHS` entry, recursion, ADR de-duplication, dot and excluded dirs, symlinked root, directory and file skipped and reported, extension case, cap error, non-ENOENT error.
  - Title extraction: frontmatter title, H1 after frontmatter, trailing hashes, no heading, read limit, invalid UTF-8, file vanished before the read (dropped), unreadable file (error).
  - `renderManagedBlock`: grouping, sorting, empty case, spaces in paths, link relativity.
  - `locateBlock`: all three states.
  - `writeDocsMap`: create, update, unchanged, broken block, missing block, duplicate maps, latin1 round trip outside the block, temp write failure, rename failure, map changed during the run, leftover temp file overwritten.
  - The out-of-tree regression fixture (D6).
- Format, lint and typecheck clean across the workspace.
- README: a `cf docs map` entry.

### Integration Requirements
- 261's tests pass with `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS` exported inside core, and the lists aren't exported from the package.
- `cf check`'s existing findings on this repository are unchanged.

### Verification Walkthrough

Uses the local build (the global `cf` is the published npm package): `alias cfl='node /Users/manta/source/repos/manta/context-forge/packages/cli/dist/index.js'` after `pnpm -r build`.

1. **Set up a project with existing docs.**
   ```bash
   rm -rf /tmp/dm && mkdir -p /tmp/dm/docs/adr && cd /tmp/dm && git init -q
   printf '# Acme Service\n' > README.md
   printf '# Deployment\n' > docs/deployment.md
   printf '# 1. Record architecture decisions\n' > docs/adr/0001-record-architecture-decisions.md
   cfl init            # registers the project and installs the guide
   find . -path ./project-documents -prune -o -type f -print | xargs shasum > /tmp/dm-before.txt
   ```
2. **Create the map.**
   ```bash
   cfl docs map
   # Docs map: project-documents/user/architecture/050-docs-map.<project>.md (created)
   #   ADRs: 1   Docs: 2
   cat project-documents/user/architecture/050-docs-map.*.md
   ```
   Expect the ADR under "Architecture Decision Records" and README plus `docs/deployment.md` under "Documentation", each with a `../../../` link. Open a link from an editor's Markdown preview and confirm it resolves.
3. **Originals untouched.**
   ```bash
   find . -path ./project-documents -prune -o -type f -print | xargs shasum | diff /tmp/dm-before.txt -
   ```
   Expect no output.
4. **Re-run is stable; hand entries survive.**
   ```bash
   cfl docs map                                   # (unchanged)
   echo '- [Runbook](../../../ops/runbook.md)' >> project-documents/user/architecture/050-docs-map.*.md
   printf '# 2. Use Postgres\n' > docs/adr/0002-use-postgres.md
   cfl docs map                                   # (updated)  ADRs: 2
   tail -3 project-documents/user/architecture/050-docs-map.*.md   # runbook line still present
   ```
5. **Symlinks are reported, not followed.**
   ```bash
   mkdir -p /tmp/dm-ext && printf '# External\n' > /tmp/dm-ext/ext.md && ln -s /tmp/dm-ext docs/ext
   cfl docs map         # ... Skipped symlinks (not followed): docs/ext
   ```
6. **`cf check` tolerates out-of-tree links.**
   ```bash
   cfl check            # no findings mention the docs map or its links
   ```
7. **Explicit failures.** Delete the `<!-- END:cf-docs-map -->` line and run `cfl docs map`. Expect a non-zero exit naming the file and the unpaired marker, the file unchanged, and no `*.cf-docs-map.tmp` file left in `project-documents/user/architecture/`.

## Risk Assessment

### Technical Risks
- **Large or unusual doc trees.** A generated doc site under `docs/` can exceed the cap, and some projects keep docs in formats other than Markdown or in directories outside 261's lists.

### Mitigation Strategies
- The cap fails explicitly with per-root counts rather than writing a partial map, and hand entries cover anything outside the lists. 265's real-repo runs are where the lists and the cap get tuned; each is a one-constant change.

## Implementation Notes

### Development Approach
1. Export 261's lists inside core.
2. `discoverMappedDocs` and title extraction, with tests.
3. `renderManagedBlock`, `locateBlock`, then `findDocsMap` / `writeDocsMap`, with tests.
4. `cf docs map` command and README entry.
5. The out-of-tree regression fixture.
6. Walk through the Verification Walkthrough on the local build.

If 261 isn't merged when this starts, step 1 waits for it.

### Special Considerations
- Fixtures must use the real formats the code meets in production: ADR files in Nygard and MADR style (with and without frontmatter), and a README whose first line isn't the heading.
- The command reads only what the walk lists inside the root, and writes only the map and its temp file. It never follows symlinks, and it reports each one it skips.
