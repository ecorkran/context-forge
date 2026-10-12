---
docType: tasks
slice: native-slice-design-validation
project: context-forge
lld: user/slices/214-slice.native-slice-design-validation.md
dependencies: []
projectState: main at 0.19.5. The ai-project-guide is going docs-only (PM decision 20261011); the Phase 4 prompt still calls the guide's `scripts/validate-slice-design` by path. Design reviewed (CONCERNS, resolved in the design).
dateCreated: 20261011
dateUpdated: 20261012
status: complete
---

## Context Summary

- Slice 214 adds `cf validate design <file...>` (`--json`, `--project`), a native port of the guide's 168-line `scripts/validate-slice-design`.
- The output contract, exit codes, JSON shape, normalization rules, preflight rule and Verification Walkthrough are in the slice design. Do not widen them or re-derive its decisions (lenient `docType` via `parseFrontmatter`, `[files...]` declared optional so "no files" exits 2, no `cf check` wiring, no `SLICE_DESIGN_TEMPLATE` env override).
- Key source files:
  - `packages/core/src/guides/types.ts` (add the template path constant beside `GUIDE_RELATIVE_PATH`)
  - new `packages/core/src/schema/sliceDesignValidator.ts` (pure, no I/O)
  - new `packages/core/src/schema/sliceDesignFiles.ts` (node-only, exported from `packages/core/src/node.ts`)
  - new `packages/cli/src/commands/validateDesign.ts`, registered from `packages/cli/src/commands/validate.ts` (already 258 lines; keep the new code out of it)
- Pattern to copy: the `frontmatterSchema.ts` (pure) / `frontmatterFileValidator.ts` (file layer) split, and the `frontmatter` subcommand's use of `withJsonOption`, `withProjectOption`, `resolveProjectWorktree`/`resolveOperationPath` and `handleError(err, 2)`.
- Tests:
  - new `packages/core/tests/schema/sliceDesignValidator.test.ts`
  - new `packages/core/tests/schema/sliceDesignFiles.test.ts`
  - new `packages/cli/tests/commands/validate-design.test.ts`
- The real template is `project-documents/ai-project-guide/project-guides/templates/slice-design.md`. The bash script stays in the guide checkout and is used for the parity sweep in Task 5.
- Use the local build (`node packages/cli/dist/index.js`); the global `cf` is the published package.
- README's `cf validate` row lists no subcommands, so the design's "update CLI reference docs" step needs no change (Task 6 confirms).
- No new dependencies.
- After release (not a task here): send the ai-project-guide-old session the cf version and the exact command `cf validate design <path>`.
- Next planned slice: 215 (native setup-ide install).

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Run `cf config get git.integration_branch`. Expect empty (target is `main`). If not empty, stop and ask the Project Manager.
  - [x] Create the branch from the target: `git checkout -b 214-slice.native-slice-design-validation main` (or switch to it if it already exists).
  - [x] Success: `git branch --show-current` prints `214-slice.native-slice-design-validation`.

- [x] **Task 1: Template path constant** (effort: 1)
  - [x] In `packages/core/src/guides/types.ts`, add `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH = 'project-guides/templates/slice-design.md'` beside `GUIDE_RELATIVE_PATH`, with a one-line comment saying it is relative to the guide root.
  - [x] Confirm it is exported through the existing `guides/index.js` re-export; add it there if the barrel lists names explicitly.
  - [x] Success: `pnpm -r build` passes. No other file hard-codes the template path.

- [x] **Task 2: Pure validator** (effort: 2)
  - [x] Create `packages/core/src/schema/sliceDesignValidator.ts` with no file or `node:` imports.
  - [x] Define and export types `RequiredHeading` (original heading text for messages, plus its normalized key) and `HeadingKey` (level plus normalized text).
  - [x] Implement heading normalization exactly per the design's "Heading normalization" and "Line handling" lists:
    1. Strip `\r` from each line before matching.
    2. A heading is a line matching `^(#{1,6})\s+(.*)$`; level is the `#` count.
    3. Text: remove `<!--.*-->` comments, remove `\([^)]*\)` parentheticals, cut at the first `{`, trim, lowercase.
  - [x] `requiredHeadings(templateText)`: every heading whose next line, trimmed, is `<!-- required -->`.
  - [x] `documentHeadingKeys(docText)`: every heading outside fenced code blocks. A fence toggles on any line starting with three backticks.
  - [x] `missingHeadings(required, docKeys)`: required headings with no document heading of the same level whose text starts with the required text (prefix match).
  - [x] Export the three functions and two types from `packages/core/src/index.ts`, beside the `frontmatterSchema.js` exports.
  - [x] Success: `pnpm -r build` and `pnpm lint` pass; file under ~300 lines.

- [x] **Task 2T: Pure validator tests** (effort: 2)
  - [x] Create `packages/core/tests/schema/sliceDesignValidator.test.ts` using inline strings only.
  - [x] `requiredHeadings`: picks headings followed by `<!-- required -->`; ignores unmarked headings; accepts the marker with surrounding whitespace; keeps the original text for messages.
  - [x] Normalization: case differences, extra whitespace, HTML comments, parentheticals, and a `{placeholder}` suffix each still match.
  - [x] Prefix match: template `# Slice Design: {slice-name}` matches document `# Slice Design: Store Foundation`.
  - [x] Level mismatch fails (`### Value` does not satisfy `## Value`).
  - [x] A heading inside a fenced code block is not counted.
  - [x] CRLF template and CRLF document both work.
  - [x] A line like `#hashtag text` (no space after `#`) is not a heading.
  - [x] `missingHeadings` returns entries in template order with original text.
  - [x] Success: `pnpm --filter @context-forge/core test` passes.

- [x] **Task 2C: Commit** — `feat(core): add slice design heading validator`

- [x] **Task 3: File layer** (effort: 2)
  - [x] Create `packages/core/src/schema/sliceDesignFiles.ts` (node-only).
  - [x] Define and export `SliceDesignValidationError` (typed error carrying the message) and `DesignValidationResult` (`path` as given, `pass`, `missing` as original heading text, optional `reason: 'doctype'`). Define the `'doctype'` reason value once as a constant.
  - [x] Template loading: read the template at a given absolute path. Missing or unreadable → `SliceDesignValidationError` whose message names `cf guides update`. Template with no required headings → `SliceDesignValidationError` with "template declares no required headings".
  - [x] Preflight: before validating anything, check every file argument exists, is a regular file and is readable. The first that fails → `SliceDesignValidationError` naming that path. No results are returned in that case.
  - [x] Per file, in order: parse frontmatter with `parseFrontmatter`; if `docType` is not `slice-design`, the result fails with `reason: 'doctype'` and empty `missing`. Otherwise match headings with Task 2's functions. A failing file does not stop later files.
  - [x] Wrap any unexpected `fs` error in `SliceDesignValidationError` so all I/O failures surface as that one type.
  - [x] Expose one entry function taking the template path and the file list, returning the results array.
  - [x] Export the entry function, error class and result type from `packages/core/src/node.ts`, beside the `frontmatterFileValidator.js` exports.
  - [x] Success: `pnpm -r build` and `pnpm lint` pass; file under ~300 lines. Every `try`/`catch` follows the project exception-handling rule.

- [x] **Task 3T: File layer tests** (effort: 2)
  - [x] Create `packages/core/tests/schema/sliceDesignFiles.test.ts`. Use temp directories for synthetic files.
  - [x] Real template: load `project-documents/ai-project-guide/project-guides/templates/slice-design.md` (resolve from the repo root). Assert the required list is non-empty and includes `## Overview` and `### Verification Walkthrough`.
  - [x] Real design: `project-documents/user/slices/214-slice.native-slice-design-validation.md` passes against the real template.
  - [x] A copy missing `## Value` fails with exactly that missing heading.
  - [x] A copy without `docType` fails with `reason: 'doctype'`; a copy with quoted `docType: "slice-design"` passes.
  - [x] Multiple files: a failing file followed by a passing one returns both results in order.
  - [x] Errors, each asserting `SliceDesignValidationError`: missing template (message contains `cf guides update`); template with no required markers; a valid file followed by a missing file (no results returned); a directory passed as a file; an unreadable file (`chmod 000` on a temp file), skipped with `it.skipIf` when running as root (`process.getuid?.() === 0`) or on Windows, where the permission bit doesn't block reads.
  - [x] Success: `pnpm --filter @context-forge/core test` passes.

- [x] **Task 3C: Commit** — `feat(core): add slice design file validation`

- [x] **Task 4: `design` subcommand** (effort: 3)
  - [x] Create `packages/cli/src/commands/validateDesign.ts` exporting a register function that takes the `validate` command and adds `design [files...]`. Call it from `registerValidateCommand` in `validate.ts`; add nothing else to `validate.ts`.
  - [x] Apply `withJsonOption` and `withProjectOption`.
  - [x] Empty file list → throw `SliceDesignValidationError` (usage message) so it exits 2. Commander must not reject the empty list itself.
  - [x] Resolve the checkout root the same way the `frontmatter` subcommand does (`resolveProjectWorktree` / `resolveOperationPath`), then build the template path from `GUIDE_RELATIVE_PATH` and `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH`.
  - [x] Human output per the design's API Contracts: `PASS <path>` / `FAIL <path>`, then `  missing: <heading>` per missing heading, or the frontmatter message for `reason: 'doctype'`. Paths are printed exactly as given.
  - [x] `--json` output per the design's JSON contract (`template` absolute, `passed`, `failed`, `files`; `reason` only when set).
  - [x] Exit 1 if any file failed, else 0. All `SliceDesignValidationError`s go through `handleError(err, 2)` with nothing written to stdout, in both modes.
  - [x] Success: `pnpm -r build` passes; `node packages/cli/dist/index.js validate design --help` shows the subcommand; `pnpm lint` passes; new file under ~300 lines.

- [x] **Task 4T: Command tests** (effort: 3)
  - [x] Create `packages/cli/tests/commands/validate-design.test.ts`, following the setup in `validate.test.ts`.
  - [x] Real slice designs: run against several files in `project-documents/user/slices/` that pass the bash script today, including the 214 design. Expect one `PASS` line each and exit 0.
  - [x] Broken copy (missing `## Value`): `FAIL <path>`, `  missing: ## Value`, exit 1.
  - [x] No `docType`: frontmatter message, exit 1.
  - [x] Multiple files with one failing: all results printed in order, exit 1.
  - [x] `--json`: matches the contract for a pass/fail mix, including `reason: "doctype"`.
  - [x] Exit 2 with empty stdout, in human and `--json` mode: no arguments; nonexistent path; a valid file before a missing one; missing template (stderr names `cf guides update`).
  - [x] Worktree-aware template: with `--project` or a worktree checkout fixture, the template is read from that checkout's guide (assert via the `template` field in JSON). Reuse the pattern in `validate-worktree-scope.test.ts`.
  - [x] Success: `pnpm --filter @context-forge/cli test` passes.

- [x] **Task 4C: Commit** — `feat(cli): add cf validate design command`

- [x] **Task 5: Verification walkthrough and parity sweep** (effort: 2)
  - [x] Confirm `project-documents/ai-project-guide/scripts/validate-slice-design` exists. If a guide update removed it, stop and ask the Project Manager; do not skip the sweep.
  - [x] Run `pnpm -r build`, then steps 1–5 of the design's Verification Walkthrough. Each produces the stated output and exit code.
  - [x] Run step 6 (parity sweep against `./project-documents/ai-project-guide/scripts/validate-slice-design`).
  - [x] For every `DIFF` line: confirm it comes from a design leniency decision (quoted `docType`, CRLF, `\r`, real heading syntax). Any other difference is a bug: fix it and add a test in the matching test task's file.
  - [x] Record intended differences, if any, in the slice design's Implementation Notes under a short "Parity differences" list.
  - [x] Success: no unexplained `DIFF` lines.

- [x] **Task 5C: Commit** (only if Task 5 changed files) — `docs: record slice 214 parity sweep results` — not needed: no files changed

- [x] **Task 6: Docs and full validation** (effort: 1)
  - [x] Confirm README's command table still lists `cf validate` without subcommands; if a subcommand list exists anywhere in `README.md` or `packages/cli/README.md`, add `cf validate design <file...>` beside `frontmatter`.
  - [x] Run `pnpm -r build`, `pnpm lint` and `pnpm test` from the repo root. All pass.
  - [x] Confirm every new source file is under ~300 lines and `validate.ts` grew only by the register call and its import.
  - [x] Success: build, lint and full test suite green; working tree clean after commit.

- [x] **Task 6C: Commit** (only if Task 6 changed files) — `docs: add cf validate design to command reference` — not needed: no files changed
