---
docType: slice-design
slice: docs-and-adr-mapping
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
interfaces: []
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
---

# Slice Design: docs-and-adr-mapping

## Overview

An adopted project usually already has design material: a README, a `docs/` tree, and often a directory of architecture decision records. Those files have inbound links, tooling (doc sites, ADR tools) and owners, so CF must not move or rewrite them. Today nothing in `project-documents/` points at them, and an agent working from CF's artifacts doesn't know they exist.

This slice adds a **docs map**: one cf-generated index file inside `project-documents/` that links every existing doc and ADR in place. `cf docs map` writes or refreshes it. The generated list sits in a managed block, so the PM or an agent can add hand-written entries around it, and a re-run never touches them. `cf check` validates the map's links and treats links that leave `project-documents/` as normal. Only a link whose target is missing is reported.

## Value

- **Adopted projects keep their design history reachable.** The derived architecture and later slice designs can link one file to reach every ADR and doc, instead of each agent rediscovering `docs/` on its own.
- **Nothing existing breaks.** No original file is moved or modified, so inbound links, doc-site builds and ADR tooling keep working.
- **Out-of-tree references are a supported case, not an accident.** A test fixes `cf check`'s behavior for artifacts that link outside `project-documents/`, and the map's own links are checked so a deleted ADR doesn't leave a silent dead link.

## Technical Scope

Included:
- `docs-map/` core module: candidate discovery, entry rendering, managed-block merge and the write (D1–D4).
- `cf docs map` CLI command (D5).
- `docs-map` frontmatter schema entry, and one checker rule, `docs-map-link`, for unresolved links and duplicate maps (D6).
- A pure managed-block locator in core, shared with cli's `managedState` (D7).
- Making 261's `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS` core-internal exports, so "where docs and ADRs live" has one definition (D2).
- Tests, including a regression fixture where an architecture doc links outside `project-documents/` and `cf check` reports nothing.
- README: one short entry for `cf docs map`. Full adoption docs are 265's.

Excluded:
- Reading docs or ADRs for meaning: no ADR status, no summaries, no mapping of ADRs to components. That's agent work (arch: facts in core, judgement in the prompt).
- Running the mapping during `cf build` or adoption automatically (D5).
- An MCP tool. Like 266, this is CLI-first. The logic is in core so an MCP tool can be added later without moving code.
- A build variable (`fileDocsMap`) or profile change. That needs guide work and no consumer asks for it yet.
- Link checking in any document other than the docs map.
- Showing the map in `ProjectModel` or `cf status`.

## Dependencies

### Prerequisites
- **Slice 261 (Detection and Adoption State):** the `detection/` module with `presentPaths`, `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS`, and 261's checkout-root rule (D5 there). 267 doesn't need the adoption state or outcome: a map is useful in any project with existing docs.
- No external services or new packages.

### Interfaces Required
- From 261: `DOC_PATHS`, `ADR_DIRS`, `EXCLUDED_DIRS` and `presentPaths(root, candidates)` from `packages/core/src/detection/`. 261 keeps them out of the package exports. 267 imports them inside core, the same way 266 takes `RULE_FILE_PATHS`.
- From 260: `pathPresent` / `isEnoent` (the missing-file rule).
- Existing: `ConsistencyChecker.checkAll`, `FRONTMATTER_SCHEMAS`, `parseFrontmatter`, the CLI project resolution `cf build` uses.

## Architecture

### Component Structure

```
packages/core/src/detection/
  presentPaths.ts       (261) DOC_PATHS, ADR_DIRS exported inside core (not from the package)
  sourceVolume.ts       (261) EXCLUDED_DIRS exported inside core
packages/core/src/utils/
  managedBlock.ts       locateManagedBlock(lines, begin, end) → absent | managed | broken   (pure, D7)
packages/core/src/docs-map/
  constants.ts          DOCS_MAP_BEGIN, DOCS_MAP_END, DOCS_MAP_DOCTYPE, DOCS_MAP_INDEX,
                        DOCS_MAP_SEGMENT, MAX_DOCS_MAP_ENTRIES, DocsMapError
  discoverDocs.ts       discoverMappedDocs(root) → Promise<MappedDoc[]>          (D2, D3)
  renderDocsMap.ts      renderManagedBlock(docs, mapDir, root) → string           (pure, D3)
  docsMapFile.ts        findDocsMap(root) → string | null; writeDocsMap(root, project) → DocsMapResult  (D1, D4)
  index.ts
packages/core/src/introspection/
  ConsistencyChecker.ts + ruleDocsMapLinks (D6)
packages/core/src/schema/
  frontmatterSchema.ts  + 'docs-map' schema (D6)
packages/cli/src/commands/
  docs.ts               `cf docs map` (D5)
packages/cli/src/ideInstall/
  managedSection.ts     managedState delegates pair classification to locateManagedBlock (D7)
```

`docs-map/` writes exactly one file, the map. It reads candidate docs only for their title (D3). The checker reads the map and stats link targets; it never writes.

### Data Flow

```
cf docs map
  → resolve project (as cf build does); root = checkout path (worktree path ?? projectPath)
  → writeDocsMap(root, project.name)
      1. findDocsMap(root)        existing map path, or null; more than one → DocsMapError
      2. discoverMappedDocs(root) present ADR_DIRS → *.md (kind adr)
                                  present DOC_PATHS → README files and *.md under docs dirs (kind doc),
                                  minus files already listed as ADRs; cap → DocsMapError
      3. renderManagedBlock(...)  grouped, sorted entries with links relative to the map's directory
      4a. no map → new file: frontmatter + heading + managed block
      4b. map exists → locate the block; broken → DocsMapError, nothing written;
          absent → DocsMapError (a docs-map file without its block); managed → replace the block only
      5. content unchanged → no write; changed → dateUpdated = today, temp file + rename
  → print path, entry counts, and "created" | "updated" | "unchanged"

cf check
  → checkAll → ruleDocsMapLinks(root)
      findDocsMap → none: no findings; several: one error finding
      parse every relative link in the file (managed and hand entries) → resolve from the map's directory
      → target missing: warning finding. URLs, mailto and pure #anchors are skipped.
```

### State Management

The map file is the only state. It's a project document, committed with the project like any other artifact. There's no config key and no cache. The managed block is regenerated wholesale from the filesystem on each run. Everything outside the block (hand entries, notes) belongs to the project, and cf preserves it byte for byte. The one exception is the frontmatter `dateUpdated` field, which cf sets when the block changes (D4).

## Technical Decisions

### D1 — One generated index file, located by docType and name
Status: decided
- The map is `project-documents/user/architecture/050-docs-map.{project}.md`, frontmatter `docType: docs-map`. `{project}` is the registered project name, as in `000-concept.{project}.md`.
- Index 050 is the project-level architecture and governance band, the same base as the project HLD (`050-arch.hld-{project}.md`). The map describes the project as a whole, and ADRs are governance records, so it shares the HLD's lineage. It is not in `project-guides/`: indices 000–003 there mirror the process phases (concept, initiative plan, spec, slices), and 004 would read as the slice-design phase.
- `findDocsMap(root)` matches `^\d+-docs-map\..*\.md$` (case-insensitive) in `user/architecture/`, not the exact `050`, so a renumbered or renamed-project map is still found and never duplicated. Two matches is an error in both the command and the checker.
- No existing scanner claims the name. `discoverAllArchFiles` matches `-arch.` and `discoverAllSlicePlans` `-slices.`. 261's planning-artifact check (D6 there) matches `arch`, `hld` and `slices`. `ProjectModelBuilder`'s `INDEXED_RE` has no `docs-map` type. Writing a map therefore can't make a project "already planned". A test asserts it.
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
- Skipped while walking: directories whose name starts with `.`, directories in `EXCLUDED_DIRS` (this includes `project-documents`, so cf's own documents never map themselves), and symlinks (not followed, so no loops and no escaping the root). This is the same walk policy as 261 D2.
- `MAX_DOCS_MAP_ENTRIES` (1000, in `docs-map/constants.ts`) bounds the map. Over the cap, `DocsMapError` names the count per candidate root and writes nothing. A partial map that silently omits files would be a worse failure. A docs site that large is better linked by hand as one entry.
- Errors follow 260's rule: ENOENT mid-walk is "not present"; any other error throws `DocsMapError` with the path and code.
- An empty result is valid. The block then holds one line, "No existing docs or ADRs were found.", so the file never reads as broken.

### D3 — Entry contents are structure, never interpretation
Status: decided
- Each entry has: the kind (`adr` or `doc`), the link target (relative from the map's directory, POSIX separators, spaces percent-encoded), the root-relative path shown as code, and a title.
- Title, in order: the frontmatter `title:` value; else the first ATX level-1 heading (`# ...`, after any frontmatter, leading whitespace tolerated, trailing `#`s stripped); else the filename. Only the first 64 KiB of a file is read for this. Nothing else in the file is read.
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
- New file: frontmatter (`docType: docs-map`, `project`, `dateCreated`, `dateUpdated`), a `# Docs Map: {project}` heading, one sentence saying the block is regenerated by `cf docs map` and entries outside it are kept, the block, then an empty `## Additional Material` section for hand entries.
- Existing file: only the lines between the markers are replaced. A broken block (unpaired, duplicated, out of order) or a docs-map file with no block is a `DocsMapError` naming the file and the problem; nothing is written. cf never guesses where a block should go.
- Unchanged block → no write, and `dateUpdated` stays as it is. Changed → `dateUpdated` is set to today and the file is written to a temp file and renamed into place, so a crash can't leave half a map.
- Line endings and bytes outside the block are preserved (read and written as latin1, as setup-ide's merge does).

### D5 — Mapping is an explicit command, CLI-only for now
Status: decided
- `cf docs map` is the only writer. `cf build` and the adoption resolver never write the map. A build that writes project documents as a side effect would surprise the PM and make a `template_preview` impure. 261's build already writes one thing (the adoption state), and that stays the only build-time write.
- How an adoption reaches it: 261's Adoption Facts already list the docs and ADR directories present. The guide's brownfield prompt can then tell the agent to run `cf docs map` before the architecture step, and to link the map from the derived architecture. That prompt change is a guide-side follow-up (see Integration Points). Until it ships, the PM or agent runs the command by hand, and nothing in cf depends on it.
- No MCP tool in this slice, matching 266 (`setup-ide` and reconciliation are CLI-only). The core function takes `(root, projectName)` and returns a result object, so a `docs_map` tool is a thin wrapper later.
- Rejected: a new `--docs` flag on `cf init`. `init` runs before adoption decides anything, and a flag on it would need re-running to refresh.

### D6 — `cf check` tolerates out-of-tree links and validates the map's own
Status: decided
- Tolerance is mostly true already: no current rule follows links, and every scanner reads only `project-documents/user/`. This slice fixes it as behavior with a regression test: a fixture whose architecture doc and docs map both link to `../../../docs/adr/0001-x.md` and `../../../README.md` must produce zero `cf check` findings.
- New rule `docs-map-link`, run from `checkAll`:
  - no map: no findings;
  - more than one map file: one `error` finding listing them;
  - for each relative link in the map, managed and hand entries alike: resolve it from the map's directory, strip any `#fragment`, and report a `warning` when the target is missing. The suggested fix names `cf docs map` for managed entries and "edit or remove the entry" for hand entries.
  - Not fixable by `cf check --fix`. Regeneration is `cf docs map`'s job, and hand entries are the project's.
- Link parsing is lenient: inline links `[text](target)` with an optional title (`"..."`, `'...'`, `(...)`), angle-bracket targets `<path with spaces>`, percent-encoded paths, and reference definitions `[id]: target`. URLs with a scheme (`https:`, `mailto:` and so on) and pure `#anchor` links are skipped. Links inside fenced code blocks are ignored.
- A link that leaves the project root is still checked for existence and is not otherwise reported. Hand entries may point at a monorepo root's docs.
- `FRONTMATTER_SCHEMAS` gains `docs-map`: `docType`, `project`, `dateCreated`, `dateUpdated` required. There's no `status`: the map is an index with no lifecycle, like the squadron machine artifacts.

### D7 — One managed-block locator
Status: decided
- cli's `managedState` (setup-ide) and the docs map both need "find exactly one BEGIN line before exactly one END line". A pure `locateManagedBlock(lines, begin, end)` in `core/src/utils/managedBlock.ts` returns `absent`, `managed` (with the two line indices) or `broken`. cli's `managedState` calls it for the pair check and keeps its own `legacy`/`unmanaged` handling, backups and IO. Its behavior and tests are unchanged.
- Rejected: copying the classifier into core. That would put two implementations of one rule in the repo (DRY).
- Rejected: moving all of `managedSection.ts` into core. Its backups, printer and IDE paths are setup-ide concerns.

### Technology Choices
- Node `fs/promises` for the walk and reads; no new dependencies. No Markdown library: the link and heading patterns above are line-level and the tests cover each variant.

### Patterns and Conventions
- Every compared value is one constant: the markers, the docType, the `050` index used for new files, the `docs-map` filename segment, `MAX_DOCS_MAP_ENTRIES`, the title read limit, the Markdown extension list. The candidate lists stay 261's.
- Errors: `DocsMapError` carries the path and reason and is printed by the CLI with a non-zero exit. No error is swallowed; ENOENT during the walk is the only "not present" case, per 260.
- Files stay near the repo's size guideline: one responsibility per file in `docs-map/`.

## Implementation Details

### API Contracts

`cf docs map`

```
$ cf docs map
Docs map: project-documents/user/architecture/050-docs-map.acme.md (created)
  ADRs: 12   Docs: 7
```

- Status word is `created`, `updated` or `unchanged`.
- Exit 0 on success. Exit 1 with `Error: <DocsMapError message>` when the project isn't registered, the map's block is broken or missing, there's more than one map, the cap is exceeded, or a read fails.
- Options: none beyond the global project selection `cf build` already accepts.

Core:

```ts
interface MappedDoc { kind: 'adr' | 'doc'; path: string; title: string }   // path: root-relative, POSIX
interface DocsMapResult { path: string; status: 'created' | 'updated' | 'unchanged'; adrs: number; docs: number }
writeDocsMap(root: string, projectName: string): Promise<DocsMapResult>
findDocsMap(root: string): Promise<string | null>
```

### Database / Storage Schema

The map file (new format, guide convention pending; see Integration Points):

```markdown
---
docType: docs-map
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
- **`locateManagedBlock`:** shared by setup-ide and the docs map.
- **265 (end-to-end runs):** not a dependency of 265. If 267 lands first, 265's real-repo runs can include `cf docs map`; otherwise it's verified on its own (Verification Walkthrough).
- **Guide-side follow-up (ai-project-guide, non-blocking):**
  - `file-naming-conventions.md`: the `docs-map` docType and the `050-docs-map.{project}.md` file, from D1 and the schema above.
  - The brownfield prompt: when the Adoption Facts list docs or ADRs, run `cf docs map` before the architecture step, and link the map from the derived architecture instead of copying ADR content.

### Consumes from Other Slices
- **261:** `DOC_PATHS`, `ADR_DIRS`, `EXCLUDED_DIRS`, `presentPaths` and the checkout-root rule. If 261 renames or extends a list, the map follows automatically; that's the point of sharing them.
- **260:** `pathPresent` / `isEnoent`.
- Nothing from 262–266. The map works on any registered project, adopted or not.

## Success Criteria

### Functional Requirements
- `cf docs map` in a project with a README, `docs/` and `docs/adr/` creates `050-docs-map.{project}.md` listing every Markdown doc and ADR, ADRs once, with working relative links and titles per D3.
- A second run with no changes reports `unchanged` and leaves the file's bytes and mtime unchanged. After adding an ADR it reports `updated`, adds the entry, and keeps hand entries outside the block byte for byte.
- No candidate file is moved or modified: a test hashes every file under the fixture root, excluding the map, before and after the command and finds them identical.
- A broken or missing block, two map files, or more than `MAX_DOCS_MAP_ENTRIES` candidates each fail with a named `DocsMapError` and write nothing.
- In a monorepo subdirectory project, only that folder's docs are mapped.
- `cf check` on a project whose docs map and architecture doc link outside `project-documents/` reports no findings. Deleting a linked ADR yields exactly one `docs-map-link` warning naming the link, for managed and hand entries alike.
- Writing a map doesn't change 261's outcome: a brownfield fixture is still brownfield, not "already planned".

### Technical Requirements
- Unit tests: `discoverMappedDocs` (each `ADR_DIRS` and `DOC_PATHS` entry, recursion, ADR de-duplication, dot and excluded dirs, symlinks not followed, extension case, cap error, non-ENOENT error); title extraction (frontmatter title, H1 after frontmatter, trailing hashes, no heading, read limit); `renderManagedBlock` (grouping, sorting, empty case, spaces in paths, link relativity); `writeDocsMap` (create, update, unchanged, broken block, missing block, duplicate maps, latin1 round trip outside the block); `locateManagedBlock` (all three states); `docs-map-link` (every link form in D6, fenced code ignored, URLs and anchors skipped, out-of-root link checked, duplicate maps); the `docs-map` frontmatter schema.
- cli `managedState` tests pass unchanged after D7.
- Format, lint and typecheck clean across the workspace.
- README: a `cf docs map` entry.

### Integration Requirements
- 261's tests pass with `DOC_PATHS`, `ADR_DIRS` and `EXCLUDED_DIRS` exported inside core, and the lists aren't exported from the package.
- `cf check`'s existing findings on this repository are unchanged by the new rule (this repo has no docs map).

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
   # Docs map: project-documents/user/architecture/050-docs-map.dm.md (created)
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
5. **`cf check` tolerates out-of-tree links and catches a dead one.**
   ```bash
   cfl check
   # one docs-map-link warning: ../../../ops/runbook.md does not exist (hand entry)
   mkdir ops && printf '# Runbook\n' > ops/runbook.md
   cfl check            # no docs-map findings
   rm docs/adr/0002-use-postgres.md
   cfl check            # one docs-map-link warning for 0002, suggesting `cf docs map`
   cfl docs map && cfl check   # warning gone
   ```
6. **Explicit failures.** Delete the `<!-- END:cf-docs-map -->` line and run `cfl docs map`. Expect a non-zero exit naming the file and the unpaired marker, and the file unchanged.

## Risk Assessment

### Technical Risks
- **Large or unusual doc trees.** A generated doc site under `docs/` can exceed the cap, and some projects keep docs in formats other than Markdown or in directories outside 261's lists.

### Mitigation Strategies
- The cap fails explicitly with per-root counts rather than writing a partial map, and hand entries cover anything outside the lists. 265's real-repo runs are where the lists and the cap get tuned; each is a one-constant change.

## Implementation Notes

### Development Approach
1. `locateManagedBlock` in core; switch cli's `managedState` to it; cli tests green.
2. Export 261's lists inside core.
3. `discoverMappedDocs` and title extraction, with tests.
4. `renderManagedBlock`, then `findDocsMap` / `writeDocsMap`, with tests.
5. `cf docs map` command and README entry.
6. `docs-map` frontmatter schema and the `docs-map-link` rule, with the out-of-tree regression fixture.
7. Walk through the Verification Walkthrough on the local build.

If 261 isn't merged when this starts, step 2 waits for it; steps 1 and 6's link parser don't depend on it.

### Special Considerations
- Fixtures must use the real formats the code meets in production: ADR files in Nygard and MADR style (with and without frontmatter), and a README whose first line isn't the heading.
- The command never follows symlinks, and the checker only stats link targets, so neither reads or writes outside what the walk or the map names.
