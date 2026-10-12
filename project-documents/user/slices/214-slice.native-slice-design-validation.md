---
docType: slice-design
slice: native-slice-design-validation
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20261011
dateUpdated: 20261012
status: complete
---

# Slice Design: Native Slice-Design Validation

## Overview

Add `cf validate design <file...>`: a native port of the guide's `scripts/validate-slice-design` (168 lines of bash). It checks a Phase 4 slice design against the sections the guide's slice-design template marks required, and prints PASS or FAIL per file with each missing heading named.

The ai-project-guide is becoming docs only (PM decision 20261011). Every script in its `scripts/` folder is being removed, and anything the methodology still needs moves into cf. The Phase 4 prompt, the slice-design guide, the template and the guide readme all call this script by path today. Once a cf release ships this command, the guide repoints those references and removes the script in its next release.

## Value

- **Methodology users:** the Phase 4 structure gate keeps working after the guide drops its scripts. Agents run one cf command instead of a path into the guide checkout.
- **Guide:** one less executable in client repos, which is the reason for the docs-only move (less obtrusive, fewer false positives from corporate agents).
- **cf:** structural checks on methodology documents live in one place, beside `cf validate frontmatter`.

## Technical Scope

**Included:**
- `cf validate design <file...>` with `--json` and `--project`.
- A core validator: parse the required headings from the template, extract a document's headings, and report what's missing.
- Reading the template from the installed guide at run time. cf hard-codes no section list.
- The script's output and exit contract: `PASS <path>` / `FAIL <path>` lines, `  missing: <heading>` per missing section, and exit 0 (all pass), 1 (any fail), 2 (usage or template error).
- Unit tests for the validator, and command tests that run it against the real template and real slice designs.

**Excluded:**
- Running the check from `cf check`. It could be added later as a check rule if wanted. Phase 4 already calls it explicitly, and wiring it into `cf check` means deciding how it interacts with `--fix` and scoping, which this slice doesn't need.
- Guide-side edits (prompt, guide, template, readme). The ai-project-guide session makes those after the cf release.
- Content-quality checks. Like the script, this checks structure only.

## Dependencies

### Prerequisites
- None. The template with its `<!-- required -->` markers already ships in the installed guide (`project-guides/templates/slice-design.md`).

### Interfaces Required
- `GUIDE_RELATIVE_PATH` from `packages/core/src/guides/types.ts`, for locating the guide in a checkout.
- `resolveProjectWorktree` and `resolveOperationPath` (`packages/cli/src/utils/`), so the template comes from the invoking checkout's guide, the same way `cf validate frontmatter` resolves its document root.
- `parseFrontmatter` (`packages/core/src/introspection/parsers/frontmatterParser.ts`) for the `docType` check.
- `withJsonOption`, `withProjectOption` and `handleError` from the CLI's shared option and error helpers.

## Architecture

### Component Structure

- **`packages/core/src/schema/sliceDesignValidator.ts`** (new, pure, no file I/O):
  - `requiredHeadings(templateText): RequiredHeading[]`: every heading line whose next line, trimmed, is `<!-- required -->`. Each keeps its original text, for messages, and its normalized key.
  - `documentHeadingKeys(docText): HeadingKey[]`: every heading outside fenced code blocks, normalized.
  - `missingHeadings(required, docKeys): RequiredHeading[]`: the required headings with no match.
- **`packages/core/src/schema/sliceDesignFiles.ts`** (new, node-only, exported from `@context-forge/core/node`): reads the template and each file, and checks `docType` through `parseFrontmatter`. Returns one `DesignValidationResult` per file. Throws a typed error for template problems.
- **`packages/cli/src/commands/validateDesign.ts`** (new): the `design` subcommand. Resolves the template path, calls core, prints the output or JSON, and sets the exit code. It's registered from `validate.ts`, which is already 258 lines.
- **`packages/core/src/guides/types.ts`**: add `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH = 'project-guides/templates/slice-design.md'` beside `GUIDE_RELATIVE_PATH`, so the location is defined once.

### Data Flow

1. The CLI resolves the checkout root (worktree-aware). The template path is `<root>/GUIDE_RELATIVE_PATH/SLICE_DESIGN_TEMPLATE_RELATIVE_PATH`.
2. Core reads the template. A missing or unreadable template, or one with no required headings, is a template error (exit 2).
3. **Preflight, before anything is validated:**
   - Every file argument must exist, be a regular file and be readable.
   - The first that isn't is a usage error (exit 2) that names it, and stdout gets nothing, in either human or JSON mode.
   - So exit 2 never comes with partial results. This differs from the script, which printed results for earlier files before failing.
4. For each file argument, in order:
   - A document whose frontmatter has no `docType: slice-design` fails with the frontmatter message.
   - Otherwise its heading keys are matched against the required list.
   - A failing file doesn't stop the run; later files are still checked.
5. The CLI prints all results, or JSON with `--json`. Exit 1 if any file failed, else 0.

Core signals usage and template problems with one typed error, `SliceDesignValidationError`, which carries the message. The CLI sends it through `handleError(err, 2)`. An `fs` error the preflight didn't anticipate is wrapped in it too, so every I/O failure exits 2, never with some other code.

### State Management

None. The command only reads files.

## Technical Decisions

### Technology Choices

- **No new dependencies.** It's line scanning and string normalization.
- **Pure core plus a thin file layer**, the same split as `frontmatterSchema.ts` and `frontmatterFileValidator.ts`. The pure part is unit-tested with inline strings; the file layer is tested against the real template.
- **Reuse `parseFrontmatter` for `docType`.** It's slightly more lenient than the script's awk: it accepts a quoted `docType: "slice-design"`, which the script rejects. That follows the project rule to parse lenient over strict.

### Patterns and Conventions

**Heading normalization**, ported from the script's `heading_key`, with leniency kept or widened:
- A heading is a line matching `^(#{1,6})\s+(.*)$`. The script counted any line starting with `#` that contains a space anywhere. Requiring real markdown heading syntax only drops lines that aren't headings.
- Level is the number of `#`.
- Text: remove `<!--.*-->` comments, remove `\([^)]*\)` parentheticals, cut at the first `{`, trim, lowercase.
- Match: same level, and the document's text starts with the template's text. This prefix match is what lets `# Slice Design: {slice-name}` match `# Slice Design: Store Foundation`.

**Line handling:**
- `\r` is stripped before matching. The script kept it, which made CRLF files fail.
- A code fence toggles on any line starting with three backticks, as in the script.
- The `<!-- required -->` marker is compared after trimming.

**Paths:** file paths are printed exactly as given, the same as the script, so agents see the path they passed.

**Errors:** template and usage errors go to stderr through `handleError(err, 2)`, the same exit code `cf validate frontmatter` uses for errors. A missing template says to run `cf guides update`.

**Naming:** the subcommand is `design` because it validates a slice design. That keeps room for other document types later without a rename.

## Implementation Details

### API Contracts

**Human output** (stdout), unchanged from the script. Agents and the guide prompt key on `PASS` / `FAIL`:

```
PASS user/slices/214-slice.native-slice-design-validation.md
FAIL user/slices/999-slice.example.md
  missing: ## Value
  missing: ### Verification Walkthrough
FAIL user/slices/998-slice.no-doctype.md
  frontmatter must declare 'docType: slice-design' (see file-naming-conventions.md)
```

**`--json`** (stdout):

```json
{
  "template": "<absolute template path>",
  "passed": 1,
  "failed": 1,
  "files": [
    { "path": "user/slices/214-slice.native-slice-design-validation.md", "pass": true, "missing": [] },
    { "path": "user/slices/999-slice.example.md", "pass": false, "missing": ["## Value"] },
    { "path": "user/slices/998-slice.no-doctype.md", "pass": false, "missing": [], "reason": "doctype" }
  ]
}
```

`reason` appears only when a file fails for something other than missing headings. Its one value is `doctype`.

**Exit codes:** 0 all pass, 1 at least one fails, 2 usage or template error (no file arguments; a file argument that is missing, not a regular file or unreadable; template missing or unreadable; template with no required headings), always with empty stdout. Commander's own usage error exits 1. To keep "no files" at exit 2, the argument is declared optional (`[files...]`) and the action checks for an empty list.

## Integration Points

### Provides to Other Slices
- `requiredHeadings` / `missingHeadings` in core. A later `cf check` rule can reuse them.

### Consumes from Other Slices
- The guide's template format: a heading followed by a `<!-- required -->` line. If a future guide changes the marker, the command fails loudly with "template declares no required headings" (exit 2) rather than passing everything.

- Slice 212's `PROTECTED_GUIDE_PATHS`: `guide.exclude` refuses to exclude `project-guides/` and its `templates/`, so a tarball install can't remove the template this command reads.

### Guide coupling
- The ai-project-guide session repoints these references to `cf validate design <path>` after the cf release that ships it:
  - `prompt.ai-project.system.md:291`
  - `guide.ai-project.process.md:118`
  - `guide.ai-project.004-slice-design.md` (lines 84, 93, 177, 191)
  - `templates/slice-design.md:15`
  - `readme.md:68`
- The guide then removes `scripts/validate-slice-design` in its next release. I report the release version and the exact command to that session.

## Success Criteria

### Functional Requirements
- `cf validate design <file>` prints `PASS <file>` and exits 0 for every existing slice design that passes the bash script today.
- A design missing required sections prints `FAIL <file>` and one `  missing: <heading>` line per missing section, written as in the template, and exits 1.
- A file without `docType: slice-design` fails with the frontmatter message.
- Several files are checked in order. The exit is 1 if any fails, and later files are still checked.
- No arguments, a missing, non-regular or unreadable file, a missing or unreadable template, or a template with no required headings each exit 2 with a message on stderr and nothing on stdout, including under `--json`. A test covers a run where a valid file comes before a missing one: exit 2 and empty stdout. The missing-template message names `cf guides update`.
- `--json` emits the contract above.
- The template is read from the invoking checkout's guide, so a worktree uses its own guide copy.

### Technical Requirements
- Unit tests for normalization and matching:
  - case, extra whitespace, HTML comments, parentheticals, placeholder prefix
  - level mismatch fails
  - headings inside a fenced block are ignored
  - CRLF input
- A file-level test against the real installed template (`project-documents/ai-project-guide/project-guides/templates/slice-design.md`). It checks that the parsed required list is non-empty and includes `## Overview` and `### Verification Walkthrough`, so a change in the template format surfaces as a test failure, not a silent pass.
- A command test running real slice designs from `project-documents/user/slices/` that pass the bash script today, including this document.
- Build, lint and the full test suite pass. New files stay under ~300 lines.

### Integration Requirements
- The guide can replace every `scripts/validate-slice-design` reference with `cf validate design` and remove the script.

### Verification Walkthrough

From the context-forge repo root, after `pnpm -r build`. Commands use the local build; the global `cf` is the published package and won't have this command until release. Verified 20261012.

Caveat for zsh: don't store the command in a variable (`CF="node packages/cli/dist/index.js"; $CF ...`), because zsh doesn't word-split it and every call fails with exit 127. Spell it out, or use a function.

1. This design passes:
   ```bash
   node packages/cli/dist/index.js validate design project-documents/user/slices/214-slice.native-slice-design-validation.md
   # PASS project-documents/user/slices/214-slice.native-slice-design-validation.md
   echo $?   # 0
   ```
2. Same result as the bash script on a broken copy:
   ```bash
   sed '/^## Value$/,/^## Technical Scope$/{/^## Technical Scope$/!d;}' \
     project-documents/user/slices/214-slice.native-slice-design-validation.md > /tmp/broken-design.md
   node packages/cli/dist/index.js validate design /tmp/broken-design.md
   # FAIL /tmp/broken-design.md
   #   missing: ## Value
   echo $?   # 1
   ./project-documents/ai-project-guide/scripts/validate-slice-design /tmp/broken-design.md
   # same two lines, exit 1
   ```
3. Doctype check:
   ```bash
   sed '/^docType:/d' project-documents/user/slices/214-slice.native-slice-design-validation.md > /tmp/nodoc-design.md
   node packages/cli/dist/index.js validate design /tmp/nodoc-design.md
   # FAIL /tmp/nodoc-design.md
   #   frontmatter must declare 'docType: slice-design' (see file-naming-conventions.md)
   echo $?   # 1
   ```
4. Usage errors (message on stderr, nothing on stdout):
   ```bash
   node packages/cli/dist/index.js validate design
   # Error: no files given. Usage: cf validate design <file...>
   echo $?   # 2
   node packages/cli/dist/index.js validate design /tmp/does-not-exist.md
   # Error: no such file: /tmp/does-not-exist.md
   echo $?   # 2
   ```
5. JSON:
   ```bash
   node packages/cli/dist/index.js validate design --json project-documents/user/slices/214-slice.native-slice-design-validation.md
   # { "template": "<repo>/project-documents/ai-project-guide/project-guides/templates/slice-design.md",
   #   "passed": 1, "failed": 0,
   #   "files": [ { "path": "project-documents/user/slices/214-slice.native-slice-design-validation.md", "pass": true, "missing": [] } ] }
   echo $?   # 0
   ```
6. Parity sweep. Every design gets the same first word (PASS/FAIL) from both:
   ```bash
   for f in project-documents/user/slices/*-slice.*.md; do
     a=$(./project-documents/ai-project-guide/scripts/validate-slice-design "$f" | head -1 | cut -d' ' -f1)
     b=$(node packages/cli/dist/index.js validate design "$f" | head -1 | cut -d' ' -f1)
     [ "$a" = "$b" ] || echo "DIFF $f: script=$a cf=$b"
   done
   # no output
   ```
   On 20261012 this printed nothing across 102 slice files. See "Parity differences" below.

## Implementation Notes

### Development Approach
1. Add the `SLICE_DESIGN_TEMPLATE_RELATIVE_PATH` constant, and the pure validator with its unit tests.
2. Add the file layer and its real-template test.
3. Add the `design` subcommand (`validateDesign.ts`), register it, and add the command tests.
4. Run the parity sweep from the walkthrough and note any intended differences.
5. Update the CLI command reference docs if they list `cf validate` subcommands.

### Parity differences
- None found. The 20261012 sweep over 102 slice files in `project-documents/user/slices/` gave the same PASS/FAIL as the bash script for every file. The leniency decisions (quoted `docType`, CRLF, real heading syntax) don't affect any existing document.

### Special Considerations
- Release coupling: after release, send the ai-project-guide session the cf version and the exact command string.
- The bash script's `SLICE_DESIGN_TEMPLATE` environment override existed for its own tests. It's not ported; tests pass the template path to core directly.
