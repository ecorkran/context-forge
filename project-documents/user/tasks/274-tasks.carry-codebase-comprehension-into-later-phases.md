---
docType: tasks
slice: carry-codebase-comprehension-into-later-phases
project: context-forge
lld: user/slices/274-slice.carry-codebase-comprehension-into-later-phases.md
dependencies:
- 267
- 271
- 273
projectState: main at 0.19.21 (slices 267-273 complete; guide v0.22.10 installed,
  its `brownfield-adoption` profile already lists `fileComprehension`; no Phase 2-4
  profile lists `fileComprehension` or `fileDocsMap`). `MIN_GUIDE_VERSION` is 0.22.8.
  `resolveComprehensionPath` lives in the CLI (`promptAdoption.ts`). Slice 274 design
  committed and reviewed.
dateCreated: 20261028
dateUpdated: 20261028
status: not_started
turns: 32
promptTokens: 1827693
cachedTokens: 1743475
cacheWriteTokens: 84164
completionTokens: 25516
durationSeconds: 297.5
costUsd: 1.532831
usageRounds: 2
pricedRounds: 2
usageByModel:
  claude-opus-5-5:
    rounds: 2
    costUsd: 1.5328303000000003
    completionTokens: 25516
revision_number: 1
---

## Context Summary
- Working on slice 274: add squadron's comprehension doc and cf's docs map to the Phase 2, 3 and 4 builds, through a new `### Codebase Reference` section (design D6).
- New cf-owned project field `fileComprehension` (alias `comprehension`), path-valued and root-relative, set by squadron with `cf set comprehension <path>` or MCP `project_update` (D2, D3).
- `fileDocsMap` is a derived build variable from `docsMapPath(root, projectName)`, not a field (D4).
- Freshness: docs map only (`current` / `out of date`), through a compare step shared with `writeDocsMap`. Comprehension doc: present or missing only. The section never fails a build (D5).
- The section appears only when the active profile lists either variable. Under today's guide only `brownfield-adoption` lists one (`fileComprehension`), so only that build changes, by one line (D6).
- External work (D1): the ai-project-guide session adds both variables to the `architecture-phase-2`, `slice-planning-phase-3` and `slice-design-phase-4` rows; the squadron session adds the `cf set comprehension` call. The cf code is inert until the guide ships. `MIN_GUIDE_VERSION` rises to that release.
- Ban (PM 20261025): cf never searches for squadron's files, parses its output or runs it. The 271 guard test (`packages/core/tests/squadronBan.test.ts`) must stay green.
- Excluded: `--embed` of either doc (#139), comprehension freshness facts (#138), changes to 271's `--comprehension` flag and Adoption Inputs section.
- Effort: 3/5 overall. Next planned slice: per `260-slices.brownfield-adoption.md`.

### Conventions for every task
- Run from the project root (`pwd` first). Test the local build with `node packages/cli/dist/index.js`, not the global `cf`.
- Per-package checks: `pnpm --filter <pkg> test`, `pnpm typecheck`, `pnpm lint`. Build with `pnpm -r build` when a later package consumes a core change.
- Commit messages use semantic prefixes and end with the attribution line from the session.
- All user-visible wording lives in constants in `packages/core/src/adoption/codebaseReference.ts` (like `adoptionInputs.ts`). Tests assert against the constants, not copied strings.

### Decision recorded in this breakdown
- **The inside-the-root rule applies to the setters only.** D3 adds it to the shared check, but the design excludes changes to 271's `--comprehension` flag, and `packages/cli/tests/commands/prompt.adoption.test.ts` already asserts that the flag accepts a path outside the root. The shared check therefore takes an option that turns on containment. The setters turn it on; `cf prompt get --comprehension` does not.

---

## Tasks

### Setup

- [ ] **Task 1: Create the slice branch** (effort 1)
  - [ ] Read the target with `cf config get git.integration_branch` (empty means `main`).
  - [ ] Create `274-slice.carry-codebase-comprehension-into-later-phases` from the target, or switch to it if it exists.
  - [ ] Success: `git branch --show-current` prints the slice branch.

- [ ] **Task 2: Send the external requests (D1, Implementation Notes step 1)** (effort 1)
  - [ ] Find the ai-project-guide and squadron sessions with `ListAgents`.
  - [ ] Send the ai-project-guide session: add `fileComprehension` and `fileDocsMap` to the `architecture-phase-2`, `slice-planning-phase-3` and `slice-design-phase-4` rows of `context_profiles`. Semantics: absent unless the project has the document; cf emits the Codebase Reference section only when a row lists them. Ask for the release version that carries the rows.
  - [ ] Send the squadron session: after `sq onboard` writes the comprehension doc, and after any comprehension refresh, call `cf set comprehension <path>` (or MCP `project_update` with `fileComprehension`). The path may be absolute or root-relative and must be inside the project root.
  - [ ] Follow the ack-then-result rule for replies.
  - [ ] If a session is not listed, write `NOT SENT: <which session, why>` under this task and continue. No cf code depends on the send. Report it to the Project Manager in the Phase 6 summary.
  - [ ] Success: both messages sent (or the NOT SENT line written).

- [ ] **Task 3: Test fixture: guide with the new profile rows** (effort 1)
  - [ ] Copy `packages/core/tests/fixtures/brownfield-guide/` to `packages/core/tests/fixtures/codebase-reference-guide/`.
  - [ ] In the copy's `prompt.ai-project.system.md`, replace the `context_profiles` rows with the real guide's full row list (from `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`), keeping the compact `name: [a, b]` layout, and add `fileComprehension, fileDocsMap` to the `architecture-phase-2`, `slice-planning-phase-3` and `slice-design-phase-4` rows only.
  - [ ] Leave `fixtures/brownfield-guide/` and `fixtures/pure-build-golden/` untouched: they stand for today's guide.
  - [ ] Add a one-line comment or README note in the fixture directory saying it mirrors the pending guide release rows (D1).
  - [ ] Success: the fixture exists; Task 20's gate tests exercise its rows.
  - [ ] Commit: `test: add guide fixture with codebase reference profile rows`

### Schema and path check

- [ ] **Task 4: Add the `fileComprehension` field and the path-valued marker (D2, D3)** (effort 2)
  - [ ] In `packages/core/src/schema/projectSchema.ts`, add an optional boolean property on the field definition type (name it for meaning, e.g. `pathValued`) with a doc comment: the value is a root-relative file path, so stem normalization and index resolution do not apply.
  - [ ] Add the `fileComprehension` entry to `PROJECT_FIELDS` after `fileTasks`: `type: 'string'`, `group: 'artifacts'`, `aliases: ['comprehension']`, `label: 'Codebase Comprehension'`, path-valued, description naming it the root-relative path to the codebase comprehension doc.
  - [ ] Add `fileComprehension?: string` to `ProjectData` (and to `UpdateProjectData` if it lists fields explicitly). Do not add it to `WORKTREE_SCOPED_FIELDS`.
  - [ ] Export a small helper, e.g. `isPathValuedField(field)`, from the schema module so the setters and the build never compare against the field name.
  - [ ] Success: typecheck passes; `resolveFieldName('comprehension')` returns `fileComprehension`.

- [ ] **Task 5: Schema tests** (effort 1)
  - [ ] In `packages/core/tests/schema/`, add tests: the alias resolves; the field is in the `artifacts` group; the path-valued helper is true for `fileComprehension` and false for every other artifact field; the field is not worktree-scoped.
  - [ ] Success: `pnpm --filter @context-forge/core test` passes.
  - [ ] Commit: `feat: add fileComprehension project field`

- [ ] **Task 6: Move the comprehension path check to core (D3)** (effort 2)
  - [ ] Create `packages/core/src/adoption/codebaseReference.ts`. Move `resolveComprehensionPath` from `packages/cli/src/commands/promptAdoption.ts` into it.
  - [ ] Core has no `UserError`. Add a core error class in the same file (pattern: `AdoptionError` in `adoption/contracts.ts`) carrying a reason: `missing`, `directory`, `outside-root`. Messages are constants and do not start with `--comprehension` (the check now serves the setters too).
  - [ ] Add an option that enables the inside-the-root rule (see "Decision recorded" above). With it on, a resolved path outside the root raises `outside-root`. With it off, behavior equals today's.
  - [ ] Add the setter-side function, e.g. `normalizePathFieldValue(root, input)`: `""` returns `""` (clears); otherwise runs the check with containment on and returns the path relative to `root` with `/` separators.
  - [ ] Export the new symbols from `packages/core/src/adoption/index.ts` and the core node entry (follow how `adoptionInputs.ts` symbols are exported).
  - [ ] Update `promptAdoption.ts` (or `prompt.ts`) to call the core check with containment off. Add one CLI helper (e.g. in `packages/cli/src/utils/errors.ts`) that maps the core error to `UserError`: `missing` → `ARTIFACT_NOT_FOUND`, `directory` and `outside-root` → `INVALID_ARGUMENT`; `prompt get` and `cf set` (Task 8) both use it. Delete the CLI copy of the check; do not leave a duplicate.
  - [ ] Success: typecheck passes; existing `prompt.adoption.test.ts` passes, with message assertions updated to the new constants only where they matched the old text.

- [ ] **Task 7: Path check tests** (effort 2)
  - [ ] Add `packages/core/tests/adoption/codebaseReference.test.ts` covering the check: missing path, directory, absolute inside, relative inside, outside the root with containment on (error) and off (accepted).
  - [ ] Cover `normalizePathFieldValue`: absolute input stored root-relative; `..`-relative path that lands outside rejected; `""` returns `""`; Windows-style separators are not produced (use `path.posix`/`split(path.sep)` as appropriate).
  - [ ] Confirm `packages/core/tests/squadronBan.test.ts` still passes.
  - [ ] Success: core and CLI test suites pass.
  - [ ] Commit: `refactor: move comprehension path check to core`

### Setters (CLI and MCP parity)

- [ ] **Task 8: `cf set comprehension` through the core setter (D3, API Contracts)** (effort 2)
  - [ ] In `packages/cli/src/commands/project.ts` (the `cf set` handler), branch on the path-valued helper from Task 4, before the artifact warning, `normalizeArtifactValue` and `resolveFileByIndex` blocks. A path-valued field skips all three.
  - [ ] Call `normalizePathFieldValue` with the operation root the handler already computes (`resolveOperationPath`). Convert core errors with the Task 6 helper. Each exits non-zero.
  - [ ] Output follows `cf set`'s existing pattern: `fileComprehension = <root-relative path>`. `cf set comprehension ""` clears the field through the existing clear path.
  - [ ] Success: manual run against a temp project stores an absolute input root-relative.

- [ ] **Task 9: `cf set comprehension` tests** (effort 2)
  - [ ] In `packages/cli/tests/commands/project.test.ts`: absolute input stored root-relative; relative input stored as given (normalized `/`); missing path, directory and outside-root each throw `UserError` with the mapped code; `""` clears; no "doesn't look like a valid artifact value" warning and no "Normalized" line on stderr; the stored value is not reduced to a bare file name.
  - [ ] Add the D2 test to `packages/cli/tests/commands/prompt.adoption.test.ts`: set `fileComprehension`, run `cf prompt get brownfield-adoption` without `--comprehension`, and assert the existing "No codebase comprehension analysis was provided." constant appears.
  - [ ] Success: CLI suite passes.
  - [ ] Commit: `feat: add cf set comprehension`

- [ ] **Task 10: MCP `project_update` through the same setter** (effort 2)
  - [ ] In `packages/mcp-server/src/tools/projectTools.ts`, add `fileComprehension: z.string().optional()` to the `project_update` input schema, described as the root-relative or absolute path to the codebase comprehension doc.
  - [ ] Before both the worktree and the standard update branches, pass every path-valued field in the updates through `normalizePathFieldValue`, using the root from `resolveOperationPath.ts`. Return `errorResult` with the core error's message on failure; write nothing in that case.
  - [ ] The field is project-level, so in the worktree branch it lands in `projectUpdates` (it is not in `WORKTREE_SCOPED_FIELDS`).
  - [ ] Success: typecheck passes.

- [ ] **Task 11: MCP setter tests** (effort 1)
  - [ ] In `packages/mcp-server/tests/projectTools.test.ts`: absolute input stored root-relative; each of the three errors returns an error result and leaves the stored project unchanged; `""` clears; with a worktree id, the value is stored at project level.
  - [ ] Success: MCP suite passes.
  - [ ] Commit: `feat: accept fileComprehension in project_update`

### Docs-map compare step

- [ ] **Task 12: Factor the compare step out of `writeDocsMap` (D5)** (effort 2)
  - [ ] In `packages/core/src/docs-map/docsMapFile.ts`, extract the read-only part of `writeDocsMap` (discover, render, read the existing map, replace the block, compare) into one exported function, e.g. `compareDocsMap(root, projectName)`. It returns the path, the discovery counts, a state (`absent` when there is no map file, `current`, `out-of-date`) and the content `writeDocsMap` needs to write.
  - [ ] Broken or absent markers keep raising `DocsMapError` with today's messages; discovery and read errors keep their wrapped errors.
  - [ ] `writeDocsMap` calls the compare step and only decides whether and what to write. Its results and `DOCS_MAP_STATUS` values are unchanged.
  - [ ] Export the new function and its state constants from `docs-map/index.ts`. State values are constants, not string literals repeated at call sites.
  - [ ] Success: existing `docsMapFile.test.ts` passes unchanged.

- [ ] **Task 13: Compare step tests** (effort 1)
  - [ ] In `packages/core/tests/docs-map/docsMapFile.test.ts`: no map → `absent`; map just written → `current`; doc added under `docs/` → `out-of-date`; broken markers → `DocsMapError` with the same message `writeDocsMap` reports; the compare step writes nothing (bytes and mtime unchanged).
  - [ ] Success: core suite passes.
  - [ ] Commit: `refactor: share docs map compare step with the build`

### Codebase Reference facts and section

- [ ] **Task 14: Codebase reference facts (D5)** (effort 2)
  - [ ] In `codebaseReference.ts`, add an async facts function, e.g. `readCodebaseReference(root, projectName, fileComprehension, listed)`, where `listed` says which of the two variables the active profile lists. It returns structured facts (no wording) only for listed variables:
    1. Comprehension: none registered (empty field); present (a readable file); missing (ENOENT); not readable (a directory or another fs error, with its reason).
    2. Docs map: none (`absent`); current; out of date; cannot check (a `DocsMapError`, with its message); cannot check (other read or discovery errors, with the reason).
  - [ ] The function never throws for these cases and never writes. Any other unexpected error is not swallowed silently: follow the project's exception rule (handle the specific errors above; rethrow anything else).
  - [ ] Paths in facts are root-relative with `/` (the docs-map path is relativized from `docsMapPath`).
  - [ ] Success: typecheck passes.

- [ ] **Task 15: Facts tests** (effort 1)
  - [ ] Extend `packages/core/tests/adoption/codebaseReference.test.ts` with one test per D5 case: comprehension none, present, missing, directory; docs map none, current, out of date, broken markers, unreadable docs tree. Unlisted variables produce no facts.
  - [ ] Assert no file under the temp root changes during the facts call.
  - [ ] Success: core suite passes.
  - [ ] Commit: `feat: add codebase reference facts`

- [ ] **Task 16: Section wording and rendering (D6, D7)** (effort 2)
  - [ ] Add wording constants: labels `Codebase comprehension` and `Docs map`; `none registered.`; `none. Run \`cf docs map\` to create it.`; the docs-map states `current` and `out of date: run \`cf docs map\` to refresh`; the missing and not-readable forms; the `cannot check` forms from the D5 table, including the "fix the markers, then run `cf docs map`" tail for a `DocsMapError`; and the D7 refresh sentence: "Refresh it through squadron, which registers the new path with `cf set comprehension`."
  - [ ] Add a pure render function that turns facts into the section text: `### Codebase Reference` then one line per listed variable, comprehension first. Returns `''` when nothing is listed. The D7 sentence is appended only to the missing and not-readable comprehension lines, never to `none registered`.
  - [ ] Keep `codebaseReference.ts` near 300 lines; if it grows past that, move the wording constants into a sibling `codebaseReferenceText.ts`.
  - [ ] Success: typecheck passes.

- [ ] **Task 17: Rendering tests** (effort 1)
  - [ ] In `codebaseReference.test.ts`, render hand-built facts for every D5/D6 case and assert the line text against the constants: the D7 sentence on missing and not-readable only; the fix tail on broken markers; nothing listed renders `''`; comprehension line comes first; the `none registered` line contains no squadron text.
  - [ ] Success: core suite passes.
  - [ ] Commit: `feat: add Codebase Reference section text`

- [ ] **Task 18: Profile gate and facts resolver in `ContextIntegrator` (D6)** (effort 2)
  - [ ] Add `fileComprehension` to `EnhancedContextData` and to `mapProjectToEnhancedContext` (the existing `applyProfileFiltering` zeroes it when not listed, like `fileArch`).
  - [ ] Make `applyProfileFiltering` (or a small sibling) also report which of `fileComprehension` / `fileDocsMap` the active profile lists. When no profiles are available, neither is listed. Use the field-name constant from the schema and one exported constant for `fileDocsMap`, not repeated literals.
  - [ ] Inject the facts reader as a resolver, following the existing pattern (`resolveIntegrationBranchForPrompt` in `CoreServiceFactory.createContextPipeline`). When neither variable is listed, the resolver is not called, so the docs tree is not walked.
  - [ ] Put the rendered section text on the context data (e.g. `codebaseReference: string`); `''` when nothing is listed.
  - [ ] Success: typecheck passes.

- [ ] **Task 19: Emit the section in the build output (D6, D8)** (effort 1)
  - [ ] `SectionBuilder` / `ContextTemplateEngine`: emit the section text right after the Project Context section (`project-info`, order 1.5), only when it is non-empty. An empty text must leave the output byte-identical to today.
  - [ ] `cf build --json` carries the section only inside its rendered text; add no JSON fields. `ContextEmbedder` is unchanged (D8).
  - [ ] Success: typecheck passes; `pure-build-golden.test.ts` passes unchanged.

- [ ] **Task 20: Gate and build output tests (Tasks 18-19)** (effort 2)
  - [ ] In `packages/core/tests/services/ContextTemplateEngine.test.ts` (or `ContextIntegrator.test.ts`), using the Task 3 fixture: Phase 2, 3 and 4 builds of a project with both documents show the section after Project Context with both paths and `current`; with neither, the two `none` lines; Phase 5, Phase 6 and `_default` builds have no section and never call the resolver; with no profiles available, the resolver is not called.
  - [ ] With the stock `brownfield-guide` fixture: Phase 2-4 builds are byte-identical to the same build with the resolver stubbed to report nothing listed (or extend the golden fixtures if that is the established pattern).
  - [ ] Success: core suite passes; `pure-build-golden.test.ts` unchanged and passing.
  - [ ] Commit: `feat: emit Codebase Reference section in cf build`

- [ ] **Task 21: CLI and MCP parity and purity tests** (effort 2)
  - [ ] In `packages/cli/tests/commands/build.test.ts`: on a temp project using the Task 3 fixture guide, at Phase 4, adding `docs/b.md` turns the docs map `out of date`; running the docs map writer then makes it `current`; deleting the registered comprehension file shows the missing line with the D7 sentence, and the build still exits 0.
  - [ ] Beside `packages/mcp-server/tests/integration/pureBuild.test.ts`: `context_build` returns the same section text as `cf build` for the same project; under the stock guide, the `brownfield-adoption` build differs from the pre-change output by exactly the one comprehension line.
  - [ ] Extend the purity test (268) to a project with both documents registered: no file and no config changes after `cf build` and `context_build`.
  - [ ] Success: CLI and MCP suites pass.
  - [ ] Commit: `test: cover codebase reference parity and build purity`

### Docs and architecture

- [ ] **Task 22: User docs** (effort 2)
  - [ ] `docs/ADOPTION-PRIMITIVES.md`: document the registration call (`cf set comprehension <path>` / `project_update` `fileComprehension`), its rules (exists, a file, inside the root, stored root-relative, `""` clears, machine-local) and the Codebase Reference section with its lines. State that the adoption prompt takes the path only from `--comprehension`.
  - [ ] `packages/cli/README.md`: add the `comprehension` alias to the `cf set` field list and mention the section under `cf build`.
  - [ ] `docs/TOOLS.md` and `packages/mcp-server/README.md`: add `fileComprehension` to `project_update` and the section to `context_build`.
  - [ ] Success: each doc names the commands exactly as implemented.
  - [ ] Commit: `docs: document cf set comprehension and the Codebase Reference section`

- [ ] **Task 23: Amend the architecture (Implementation Notes step 5)** (effort 1)
  - [ ] In `project-documents/user/architecture/260-arch.brownfield-adoption.md`, make the three amendments listed in the design's Implementation Notes step 5: Responsibility Split row (b) lists both channels; the "Comprehension in later phases (274)" paragraph and the "Comprehension freshness" bullet say cf judges freshness only for artifacts it writes; the "Greenfield behaves the same" goal notes the two neutral `none` lines.
  - [ ] Update `dateUpdated` in the frontmatter. Do not change any section titled "User-Provided Concept".
  - [ ] Success: the three passages match D5 and D6.
  - [ ] Commit: `docs: amend 260 architecture for codebase reference`

### Validation

- [ ] **Task 24: Full validation** (effort 1)
  - [ ] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` once each from the root. Fix any failure in this slice's code.
  - [ ] Confirm `squadronBan.test.ts` passes and `grep -rn "codebase-comprehension" packages/*/src` returns nothing.
  - [ ] Success: all four commands pass.
  - [ ] Commit any fixes with the semantic type that fits the change (skip if none).

- [ ] **Task 25: Verification walkthrough** (effort 2)
  - [ ] Run the design's Verification Walkthrough steps 1-8 against a temp project using the local build and a copy of the Task 3 fixture guide.
  - [ ] Refine the walkthrough text in the slice design to match the actual commands and output (the design calls it a draft).
  - [ ] Success: each step's expected result is observed; any mismatch is fixed in code (with a test) or recorded under this task.
  - [ ] Commit: `docs: refine slice 274 verification walkthrough`

- [ ] **Task 26: Raise `MIN_GUIDE_VERSION` (Prerequisites, Integration Requirements)** (effort 1)
  - [ ] Check whether an ai-project-guide release with the new Phase 2-4 rows exists (the version the guide session reported in Task 2, or the guide repo's release tags and its `prompt.ai-project.system.md`).
  - [ ] If it exists: set `MIN_GUIDE_VERSION` in `packages/core/src/guides/guideMinimum.ts` to that version, update `prompt.guideMinimum.test.ts` if it pins the value, and run the touched tests.
  - [ ] If it does not exist: write `BLOCKED: guide release with fileComprehension/fileDocsMap rows not yet published` under this task, leave it unchecked, and stop. All other tasks remain valid; the release waits on this item (Risk Assessment).
  - [ ] Commit: `chore: raise MIN_GUIDE_VERSION for codebase reference rows`
