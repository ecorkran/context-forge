---
docType: tasks
slice: docs-and-adr-mapping
project: context-forge
lld: user/slices/267-slice.docs-and-adr-mapping.md
dependencies:
- 261
projectState: main after slices 260-266 (built and merged). 261's `DOC_PATHS` and
  `ADR_DIRS` are `export const` in `packages/core/src/detection/presentPaths.ts` and
  `EXCLUDED_DIRS` in `sourceVolume.ts`; none of the three is re-exported from `detection/index.ts`
  (which `node.ts` re-exports wholesale). `isEnoent` lives in `detection/pathPresent.ts`
  and is also not re-exported. `formatDateProject()` in `project-defaults.ts` produces
  YYYYMMDD. No `docs-map/` module or `cf docs` command exists. Global `cf` is the
  published npm package, not the local build.
dateCreated: 20261024
dateUpdated: 20261025
status: not_started
turns: 42
promptTokens: 2527171
cachedTokens: 2443003
cacheWriteTokens: 84102
completionTokens: 24881
durationSeconds: 244.7
costUsd: 1.659588
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

## Context Summary

- Slice 267 adds a **docs map**: one cf-generated file, `project-documents/user/architecture/050-docs-map.{project}.md` (`docType: reference`), that links every existing README, `docs/` file and ADR in place. `cf docs map` writes or refreshes it. The generated list sits in a managed block (`<!-- BEGIN:cf-docs-map -->` / `<!-- END:cf-docs-map -->`); everything outside the block belongs to the project and is preserved byte for byte.
- The slice design (`user/slices/267-slice.docs-and-adr-mapping.md`) is the spec. D1–D7, API Contracts, Success Criteria and the Verification Walkthrough are referenced below by name; read the named section before each task.
- Excluded (design): any setup-ide change (D7 — `packages/cli/src/ideInstall/` must not change), reading docs for meaning (no ADR status or summaries), title sources beyond the first H1, running the map from `cf build` or adoption, an MCP tool, a build variable, link checking (#127), an entry cap (#129), `ProjectModel`/`cf status` display. File an issue for anything else found rather than adding it.
- Local build: test with `node packages/cli/dist/index.js` after `pnpm -r build`. Tests run per package with `pnpm --filter @context-forge/core test` and `pnpm --filter @context-forge/cli test`; root `pnpm lint` and `pnpm typecheck` cover the workspace. There is no format script; ESLint is the formatter gate.
- Conventions for every task: each compared value (markers, `050` index, `docs-map` filename segment, Markdown extension list, group headings, empty-result line) is one constant at the top of the `docs-map/` file that uses it. Candidate lists stay 261's — never copy them. No silent fallbacks. Any try/catch either rethrows, wraps in `DocsMapError`, or handles ENOENT alone with a comment (260's rule). No `any`; exported functions have explicit return types. New files stay under about 300 lines.
- Fixtures use real formats (design, Special Considerations): Nygard-style and MADR-style ADRs, with and without YAML frontmatter, and a README whose first line is not the heading (e.g. a badge line first).
- Branch: `267-slice.docs-and-adr-mapping`, forked from the target. No merge or push task appears here; Phase 7 merges after code review.
- Next planned slice: none consumes 267 in code. 263's derived architecture links the map through the guide prompt (guide-side follow-up, non-blocking).

---

## Tasks

### 1. Branch setup

- [ ] **1.1 Create the slice branch**
  - [ ] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`; its value (or `main` when empty) is the target
  - [ ] Confirm you are on the target, then `git checkout -b 267-slice.docs-and-adr-mapping {target}`. If the branch already exists, switch to it
  - [ ] **Success:** `git branch --show-current` prints `267-slice.docs-and-adr-mapping`

---

### 2. Core: discovery and title read

- [ ] **2.1 Create `packages/core/src/docs-map/discoverDocs.ts` — types and error** — effort 1
  - [ ] Define `MappedDoc` (`kind: 'adr' | 'doc'`, `path` root-relative POSIX, `title`) and `Discovery` (`docs: MappedDoc[]`, `skippedSymlinks: string[]`, root-relative POSIX)
  - [ ] Define `DocsMapError` in a small `docs-map/docsMapError.ts` (a separate file avoids a `discoverDocs` ↔ `docsMapFile` import cycle); every module imports it from there. It extends `Error`, carries `path` and `reason`, and its message names both
  - [ ] Define `MARKDOWN_EXTENSIONS = ['.md']` once, matched case-insensitively (`.MD` counts)
  - [ ] **Success:** file compiles; `pnpm --filter @context-forge/core typecheck` passes

- [ ] **2.2 Implement the walk: `discoverMappedDocs(root): Promise<Discovery>` (D2)** — effort 3
  - [ ] Import `DOC_PATHS`/`ADR_DIRS`/`presentPaths`, `EXCLUDED_DIRS` and `isEnoent` directly from `../detection/presentPaths.js`, `../detection/sourceVolume.js` and `../detection/pathPresent.js`. Do not add them to `detection/index.ts`: `node.ts` re-exports it, which would make them package exports (D2)
  - [ ] ADRs: for each entry of `presentPaths(root, ADR_DIRS)`, collect every Markdown file recursively as `kind: 'adr'`
  - [ ] Docs: for each entry of `presentPaths(root, DOC_PATHS)` — a file entry (`README.md`, `README`) is one doc; a directory entry (`docs`, `doc`) is walked recursively for Markdown files. Use `lstat`/`Dirent` type to tell file from directory, not the name. Skip any path already collected as an ADR
  - [ ] Use `fs/promises` `readdir(dir, { withFileTypes: true })`. Skip directories whose name starts with `.` and directories named in `EXCLUDED_DIRS`
  - [ ] Symlinks (files or directories) are never followed: record their root-relative path in `skippedSymlinks` and continue. A present-path candidate that is itself a symlink is also recorded and skipped (check with `lstat` before walking)
  - [ ] ENOENT during `readdir`/`lstat` means the entry vanished: skip it (comment why). Any other error throws `DocsMapError` with the path and the system error code
  - [ ] Paths in the result are root-relative with `/` separators on every platform; de-duplicate so a file reached twice appears once
  - [ ] **Success:** returns every candidate with `kind` and `path`, plus `skippedSymlinks`; no file content is read (titles are added in 2.3)

- [ ] **2.3 Implement the title read (D3)** — effort 2
  - [ ] Private helper `readTitle(absPath, fallbackName): Promise<string | undefined>` reading the file with `readFile(path, 'utf8')`
  - [ ] Skip a leading frontmatter block: if the first line is `---`, ignore lines up to and including the next `---` line. An unterminated block means no heading is found inside it
  - [ ] Title = the first line matching an ATX level-1 heading: optional leading whitespace, `#`, at least one space, text. Strip trailing `#` characters and surrounding whitespace. `## x` is not a match. Define the pattern once as a constant
  - [ ] No heading → the filename (basename, extension kept)
  - [ ] ENOENT on read → return `undefined`, and `discoverMappedDocs` drops the entry (comment why). Any other error → `DocsMapError` naming the file
  - [ ] Wire it into `discoverMappedDocs` so every returned `MappedDoc` has a title
  - [ ] **Success:** the only file content core reads in this slice is through this helper

- [ ] **2.4 Test discovery and titles** (`packages/core/tests/docs-map/discoverDocs.test.ts`, temp dir per test) — effort 3
  - [ ] Each `ADR_DIRS` entry is discovered (iterate the imported list, not a copied one); each `DOC_PATHS` entry (`README.md`, `README`, `docs/`, `doc/`) is discovered
  - [ ] Recursion into nested subdirectories; `docs/adr/*.md` appears once, as `adr`
  - [ ] `.git`/`.vitepress` and each `EXCLUDED_DIRS` entry (at least `node_modules` and `project-documents`) under `docs/` are not walked
  - [ ] A symlinked file and a symlinked directory under `docs/` are not followed and appear in `skippedSymlinks`; a symlink loop does not hang
  - [ ] `.MD` extension is included; `.rst`/`.txt` are not
  - [ ] Non-ENOENT walk error (e.g. a `docs/` subdirectory with mode `000`; skip the case when running as root) throws `DocsMapError` naming the path
  - [ ] Titles: plain H1; H1 after YAML frontmatter containing a `# comment` line; `#   Title ##` → `Title`; indented H1; no heading → filename; README whose first line is a badge and H1 is on line 3; Nygard ADR (`# 1. Record architecture decisions`); MADR ADR with frontmatter
  - [ ] File removed between walk and read (mock `readFile` to reject with an ENOENT error for one path) → entry dropped; unreadable file (mode `000`, or mocked EACCES) → `DocsMapError` naming the file
  - [ ] Empty project → `{ docs: [], skippedSymlinks: [] }`
  - [ ] **Success:** tests pass; `pnpm lint` and `pnpm typecheck` clean
  - [ ] Commit: `feat: add docs map discovery and title read`

---

### 3. Core: rendering

- [ ] **3.1 Implement `docs-map/renderDocsMap.ts`: `renderManagedBlock(docs, mapDir): string` (D3)** — effort 2
  - [ ] Pure function; no filesystem access
  - [ ] Constants defined once: the two group headings (`## Architecture Decision Records`, `## Documentation`) and the empty-result line `No existing docs or ADRs were found.`
  - [ ] Groups in that order, ADRs first; a group with no entries is omitted. Within a group, sort by `path` (plain code-unit string compare, so output is locale-independent)
  - [ ] Entry line: `- [{title}]({link}) — \`{path}\``. `mapDir` is root-relative POSIX (both it and each `path` are root-relative, so no `root` parameter is needed; the design's sketch lists one). `link` = `path.posix.relative(mapDir, path)`, then percent-encode spaces (`%20`)
  - [ ] Output is the lines between the markers only (markers are added by the writer), joined with `\n`, one blank line between groups, matching D3's layout
  - [ ] **Success:** for the D3 example input, output equals D3's example block minus the marker lines

- [ ] **3.2 Test rendering** (`packages/core/tests/docs-map/renderDocsMap.test.ts`) — effort 2
  - [ ] Grouping (ADRs before docs), sorting by path, omitted empty group, empty input → the single empty-result line
  - [ ] Space in a path → `%20` in the link, raw path in the code span
  - [ ] Link relativity: map dir `project-documents/user/architecture` → `../../../docs/adr/0001-x.md`; root-level `README.md` → `../../../README.md`
  - [ ] D3's example input renders exactly D3's example (snapshot as an inline string, not a snapshot file)
  - [ ] **Success:** tests pass
  - [ ] Commit: `feat: add docs map block rendering`

---

### 4. Core: map file and write

- [ ] **4.1 Implement `docs-map/docsMapFile.ts` — constants, path and private locator (D1, D4, D7)** — effort 2
  - [ ] Constants once each: `DOCS_MAP_BEGIN = '<!-- BEGIN:cf-docs-map -->'`, `DOCS_MAP_END = '<!-- END:cf-docs-map -->'`, `DOCS_MAP_INDEX = '050'`, `DOCS_MAP_SEGMENT = 'docs-map'`, `DOCS_MAP_DIR = 'project-documents/user/architecture'`, `DOCS_MAP_DOC_TYPE = 'reference'`
  - [ ] `docsMapPath(root, projectName): string` → `{root}/{DOCS_MAP_DIR}/050-docs-map.{projectName}.md`. Canonical name only; no pattern search (D1)
  - [ ] Private `locateBlock(lines)`: returns `{ state: 'absent' }`, `{ state: 'managed', begin, end }` (line indices), or `{ state: 'broken', problem }` where `problem` says which: unpaired BEGIN, unpaired END, duplicated marker, END before BEGIN. Match whole lines after stripping a trailing `\r` only. Do not import or modify setup-ide's `managedState`/`managedBlockRange` (D7)
  - [ ] **Success:** compiles; no file under `packages/cli/src/ideInstall/` is touched

- [ ] **4.2 Implement `writeDocsMap(root, projectName): Promise<DocsMapResult>` — create path and exports (D4)** — effort 2
  - [ ] `DocsMapResult` per API Contracts: `path`, `status: 'created' | 'updated' | 'unchanged'`, `adrs`, `docs`, `skippedSymlinks`. Define the status values once as an `as const` object
  - [ ] Discover (2.2), then render (3.1) with `mapDir` = `DOCS_MAP_DIR`
  - [ ] **No map file (ENOENT):** build the new file per the design's "Database / Storage Schema": frontmatter (`docType: reference`, `project`, `dateCreated` and `dateUpdated` both `formatDateProject()`), `# Docs Map: {project}`, the one-sentence note, BEGIN line, block, END line, blank line, `## Additional Material`. Create the directory if missing. Write the new file as UTF-8 (`writeFile(path, content, 'utf8')`): all of it is cf-generated, so there are no project bytes to preserve. Status `created`. A failed write → `DocsMapError` naming the path and system code
  - [ ] **Map already exists:** never write. Throw `DocsMapError` ("update path not implemented until 4.4") so a re-run before 4.4 cannot overwrite a hand-edited map; 4.4 replaces this branch
  - [ ] Create `docs-map/index.ts` exporting `writeDocsMap`, `docsMapPath`, `DocsMapError` and the `MappedDoc`/`DocsMapResult` types; add `export * from './docs-map/index.js';` to `packages/core/src/node.ts` beside the other fs-dependent modules
  - [ ] **Success:** `pnpm -r build` passes; `writeDocsMap` is importable from `@context-forge/core/node`

- [ ] **4.3 Test the create path** (`packages/core/tests/docs-map/docsMapFile.test.ts`, temp dir per test) — effort 2
  - [ ] `docsMapPath` returns the canonical path for a given name
  - [ ] Create: file appears with valid frontmatter (`docType: reference`, both dates `^\d{8}$`), heading, block and `## Additional Material`; status `created`; counts match; a non-ASCII H1 title (e.g. `Décision`) reads back as valid UTF-8
  - [ ] Write failure (map directory made read-only, skip when root; or mocked `writeFile` EACCES) → `DocsMapError` with path and code
  - [ ] **Success:** tests pass; `pnpm lint` and `pnpm typecheck` clean
  - [ ] Commit: `feat: add docs map file creation`

- [ ] **4.4 Extend `writeDocsMap` — update an existing map (D4)** — effort 2
  - [ ] **Map exists:** read as latin1 (one char per byte, as `ideInstall/managedSection.ts` does). Split into lines keeping each line's own ending. `absent` → `DocsMapError` ("no cf-docs-map block"); `broken` → `DocsMapError` with the locator's problem; both name the file and write nothing
  - [ ] **Managed:** replace only the lines strictly between the markers. Convert the rendered (UTF-8) block to the latin1 representation (`Buffer.from(block, 'utf8').toString('latin1')`) before splicing, so non-ASCII titles are written as valid UTF-8. Use the line ending found on the BEGIN line for the inserted lines. Frontmatter is never edited (D4: `dateUpdated` is creation-only)
  - [ ] Unchanged content → no write, status `unchanged`. Changed → `writeFile(path, content, 'latin1')`, status `updated`. Plain write, no temp file (D4). A failed read (non-ENOENT) or write → `DocsMapError` naming the path and system code
  - [ ] Discovery runs before the existing map is touched, so a discovery error leaves the map unwritten
  - [ ] **Success:** `pnpm -r build` passes; no file under `packages/cli/src/ideInstall/` is touched

- [ ] **4.5 Test the update path** (same test file) — effort 3
  - [ ] Unchanged: second run returns `unchanged`; file bytes and `mtimeMs` identical
  - [ ] Update: add an ADR, run again → `updated`; new entry present; every byte outside the block (frontmatter with a hand-edited `dateUpdated`, hand entries under `## Additional Material`, text above the block) identical to before
  - [ ] Locator states, each → `DocsMapError` naming the file and problem, file byte-identical afterwards: missing END, missing BEGIN, duplicated BEGIN, END before BEGIN, no block at all
  - [ ] Frontmatter untouched on update even when it is malformed or lacks `dateUpdated`
  - [ ] latin1 round trip: a file with CRLF line endings and an invalid-UTF-8 byte (e.g. `0xFF`) outside the block keeps both after an update; a non-ASCII H1 title (e.g. `Décision`) is written as valid UTF-8 inside the block
  - [ ] Read error leaves the map unchanged: with an existing map, make one candidate doc unreadable (mode `000`, skip when root; or mocked `readFile` EACCES for that path) → `DocsMapError` naming the doc; the map is byte-identical and its `mtimeMs` unchanged
  - [ ] Write failure on update (existing map made read-only, skip when root; or mocked `writeFile` EACCES) → `DocsMapError` with path and code
  - [ ] **Success:** tests pass; `pnpm lint` and `pnpm typecheck` clean
  - [ ] Commit: `feat: add docs map block update`

---

### 5. CLI: `cf docs map`

- [ ] **5.1 Implement `packages/cli/src/commands/docs.ts` (D5, API Contracts)** — effort 2
  - [ ] `registerDocsCommand(program)` adds `docs` with subcommand `map` (description: generate or refresh the docs map in project-documents). Register it in `packages/cli/src/index.ts` next to `registerRulesCommand`
  - [ ] Apply `withProjectOption`; no other options
  - [ ] Resolve the project as `cf build` does: `resolveProjectWorktree({ project: opts.project }, store)` then core `resolveProject(store, id, worktreeId)`, so a worktree's overlay supplies the checkout path. Not found → `UserError`; no `projectPath` → `UserError` with the same remedy wording `resolvePathedProject` uses
  - [ ] Call `writeDocsMap(project.projectPath, project.name)`
  - [ ] Print per API Contracts: `Docs map: {path relative to root} ({status})`, then `  ADRs: {n}   Docs: {n}`, then `  Skipped symlinks (not followed): {comma-separated}` only when non-empty
  - [ ] Errors go through `handleError` (exit 1, `Error: <message>`); `DocsMapError` is not swallowed or rewrapped
  - [ ] **Success:** `node packages/cli/dist/index.js docs map --help` shows the command after `pnpm -r build`

- [ ] **5.2 Test the command** (`packages/cli/tests/commands/docs.test.ts`, follow `rules.test.ts`'s project-store setup) — effort 2
  - [ ] Created run prints the path line with `(created)` and the counts; second run prints `(unchanged)`
  - [ ] Symlink line appears only when a symlink was skipped
  - [ ] Broken block → exit code 1, output starts with `Error:` and names the file
  - [ ] Unregistered project → exit 1
  - [ ] Monorepo subdirectory project (registered `projectPath` is `repo/packages/app`): only `packages/app`'s README and docs are mapped, not the repo root's
  - [ ] Originals untouched: hash every file under the fixture root except the map before and after the command; hashes identical
  - [ ] **Success:** tests pass; `git diff --stat {target} -- packages/cli/src/ideInstall` is empty
  - [ ] Commit: `feat: add cf docs map command`

---

### 6. Out-of-tree regression fixture (D6)

- [ ] **6.1 Add `packages/core/tests/docs-map/outOfTreeLinks.test.ts`** — effort 3
  - [ ] Build a fixture project in a temp dir: `README.md`, `docs/adr/0001-x.md`, a valid concept and architecture doc under `project-documents/user/` (reuse `tests/helpers/adoptionFixtures.ts` where it fits), where the architecture doc links `../../../docs/adr/0001-x.md` and `../../../README.md`. Generate the map with `writeDocsMap` so it holds the same two links
  - [ ] Assert `new ConsistencyChecker(...).checkAll(project)` (construct it as `tests/introspection/checkRun.test.ts` does) returns zero findings
  - [ ] Assert the map does not appear in the `ProjectModel` built for the fixture (no architecture or slice entry has the map's path)
  - [ ] Assert 261's outcome is unchanged by the map: with a brownfield-sized source fixture (as `adoptionResolver.test.ts` builds it), the outcome is brownfield before and after `writeDocsMap`, and `findPlanningArtifacts` does not list the map
  - [ ] **Success:** test passes without any change to `ConsistencyChecker`, `ProjectModelBuilder` or detection code
  - [ ] Commit: `test: add out-of-tree link regression test for cf check`

---

### 7. Documentation

- [ ] **7.1 README entries** — effort 1
  - [ ] Root `README.md`, "Adopting an Existing Codebase": add a short paragraph after the rule-files paragraph — `cf docs map` writes `project-documents/user/architecture/050-docs-map.{project}.md`, linking the README, `docs/` and ADRs in place without moving them; re-run to refresh; hand entries outside the managed block are kept. Full adoption docs are 265's
  - [ ] `packages/cli/README.md`, Commands Reference → "Project & Workflow" table: add a `cf docs map` row (usage `cf docs map`, one-line description) beside the `cf rules` rows
  - [ ] **Success:** both entries name the command and the output path; no other README sections change
  - [ ] Commit: `docs: add cf docs map to READMEs`

---

### 8. Final verification

- [ ] **8.1 Workspace checks** — effort 1
  - [ ] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`
  - [ ] Run `node packages/cli/dist/index.js check` in this repo and confirm findings match those on the target (run the global `cf check` or the target's build for comparison)
  - [ ] **Success:** all pass; `cf check` findings on this repository are unchanged; `git diff --stat {target} -- packages/cli/src/ideInstall` is empty

- [ ] **8.2 Verification Walkthrough** — effort 2
  - [ ] Run the design's Verification Walkthrough steps 1–6 with the local build alias (`cfl`)
  - [ ] **Success:** each step's expectation holds: created map with `../../../` links, originals' hashes unchanged, `unchanged` then `updated` with the runbook hand entry kept, `cf check` reports nothing about the map, deleting the END line fails with exit 1 naming the file and leaves it unchanged
  - [ ] If any step fails, fix the cause in the relevant task's code and test, then re-run the walkthrough
  - [ ] Commit any fixes: `fix: {summary}` (slice-internal; no issue needed). If nothing changed, no commit
