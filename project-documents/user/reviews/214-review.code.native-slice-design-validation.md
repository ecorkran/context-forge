---
docType: review
layer: project
reviewType: code
slice: native-slice-design-validation
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/214-slice.native-slice-design-validation.md
aiModel: claude-opus-5-5
aiProfile: sdk
status: complete
dateCreated: 20261012
dateUpdated: 20261012
reviewedSha: 3d1268e86aeaab225fe123ae6ffcc7bdd9e0b181
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
diffTruncated: false
durationSeconds: 46.6
squadronVersion: 0.21.5
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Fence tracking can count example headings and give a false PASS"
    location: "packages/core/src/schema/sliceDesignValidator.ts:61-73"
  - id: F002
    severity: note
    category: error-handling
    summary: "Each file is read twice, and a frontmatter read error is reported as a docType failure"
    location: "packages/core/src/schema/sliceDesignFiles.ts:92-106"
  - id: F003
    severity: note
    category: correctness
    summary: "A required template heading that normalizes to empty text matches every heading at its level"
    location: "packages/core/src/schema/sliceDesignValidator.ts:33-42"
  - id: F004
    severity: note
    category: correctness
    summary: "The heading pattern rejects ATX headings indented 1–3 spaces"
    location: "packages/core/src/schema/sliceDesignValidator.ts:22"
  - id: F005
    severity: note
    category: testing
    summary: "Tests use live slice documents as fixtures"
    location: "packages/cli/tests/commands/validate-design.test.ts:47-53"
  - id: F006
    severity: pass
    category: design
    summary: "Layering and exports"
    location: "packages/core/src/schema/sliceDesignFiles.ts"
  - id: F007
    severity: pass
    category: error-handling
    summary: "All-or-nothing error contract and exit codes"
    location: "packages/cli/src/commands/validateDesign.ts:61-87"
  - id: F008
    severity: pass
    category: testing
    summary: "Test coverage"
    location: "packages/core/tests/schema/sliceDesignValidator.test.ts"
---

# Review: code — slice 214

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [CONCERN] Fence tracking can count example headings and give a false PASS

`documentHeadingKeys` flips `inFence` on any line that starts with exactly three backticks at column 0. Three kinds of input slip past it:
- **Tilde fences (`~~~`):** these never toggle, so a `## Value` inside one counts as a real heading.
- **Indented fences** (for example, inside a list item): these never toggle either, so headings inside them count.
- **Longer fences wrapping a three-backtick block** (` ```` ` around ` ``` `): the inner fence lines flip the state, so the inner block's lines are treated as outside a fence.

Slice designs often include markdown examples. In all three cases a document that lacks the section can still pass. CLAUDE.md asks for lenient parsing of semantic content, and the real risk here is a silent pass, not a loud fail. Track the opening fence's character and length, allowing up to 3 spaces of indent and both `` ` `` and `~`. Close only on a line with the same character and at least the same length. Add a test for each of the three cases.

### [NOTE] Each file is read twice, and a frontmatter read error is reported as a docType failure

`validateFile` calls `parseFrontmatter(file)`, which reads the file, then calls `readFile` on it again. `parseFrontmatter` swallows every error and returns `{ data: {} }` (`frontmatterParser.ts:63-65`). If the file becomes unreadable after `preflight`, the user gets a `doctype` FAIL instead of the `SliceDesignValidationError` that the second read would throw. This only happens in a race, but you could read once and parse the frontmatter from the text. That fixes the misreport and drops the second read.

### [NOTE] A required template heading that normalizes to empty text matches every heading at its level

A heading like `## {placeholder}` or `## (optional)` normalizes to `text: ''`. `missingHeadings` then passes any same-level heading, because `startsWith('')` is always true. The current template doesn't hit this (`# Slice Design: {slice-name}` becomes `slice design:`). A guard in `requiredHeadings`, or a throw from `loadRequiredHeadings` when a key is empty, would make it fail loudly if a future template does.

### [NOTE] The heading pattern rejects ATX headings indented 1–3 spaces

`^(#{1,6})\s+(.*)$` requires the `#` at column 0, but CommonMark allows up to three leading spaces. This matches the ported bash script, so it may be on purpose. If so, a short comment saying so would stop a later reader from "fixing" it out of step with the script.

### [NOTE] Tests use live slice documents as fixtures

`PASSING_DESIGNS` lists the 212, 213, 214 and 928 slice designs, and `brokenCopy` relies on 214 having `## Value` right before `## Technical Scope`. CLAUDE.md asks for real-world input, so this is reasonable. The downside is that editing or archiving any of those docs will break CLI tests that have nothing to do with the edit. `packages/core/tests/schema/sliceDesignFiles.test.ts` depends on 214 in the same way.

### [PASS] Layering and exports

The pure heading logic (`sliceDesignValidator.ts`, exported from `index.ts`) is kept apart from the fs-dependent layer (`sliceDesignFiles.ts`, exported only from `node.ts`). The template path is a single constant, `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH` in `guides/types.ts`. `DesignFailureReason` follows the `as const` pattern, and `DOC_TYPE_FAILURE_MESSAGE` is built from `SLICE_DESIGN_DOC_TYPE`, so neither value is repeated elsewhere.

### [PASS] All-or-nothing error contract and exit codes

Template loading and `preflight` both run before any result is produced, so callers never get partial output alongside an error. Exit codes are 0, 1 and 2 as documented. The `[files...]` argument is declared optional on purpose, with a comment explaining that this lets an empty list exit 2. The catch blocks either rethrow wrapped with `cause` or sit at the process boundary in `handleError`.

### [PASS] Test coverage

The tests cover:
- CRLF line endings
- marker whitespace
- each normalization rule
- level mismatches
- fenced headings
- missing, directory and unreadable files (the unreadable case is skipped correctly under root and on Windows)
- template-missing and no-marker errors
- JSON contract shape
- template resolution from the worktree the command runs in

The CLI suite mocks only the project store and runs everything else for real.

### Run Digest

- Response length: 5084 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 46.6 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
