---
docType: review
layer: project
reviewType: slice
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
dateCreated: 20261011
dateUpdated: 20261011
reviewedSha: 282698f2e28a2af4658358972f3187e25419ad6a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
durationSeconds: 36.2
squadronVersion: 0.21.4
findings:
  - id: F001
    severity: concern
    category: scope
    summary: "Architecture doc doesn't cover the docs-only guide decision this slice depends on"
    location: "project-documents/user/architecture/200-arch.developer-onboarding.md"
  - id: F002
    severity: concern
    category: error-handling
    summary: "Behavior on a missing file in a multi-file run is unclear and conflicts with the requirements"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md:68-72"
  - id: F003
    severity: note
    category: error-handling
    summary: "Other file-read failures are not listed"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md:137"
  - id: F004
    severity: pass
    category: architecture
    summary: "Layering and dependency direction"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md#component-structure"
  - id: F005
    severity: pass
    category: conventions
    summary: "No hard-coded section list; one constant for the template path; fails loudly"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md:62-67"
  - id: F006
    severity: pass
    category: integration
    summary: "Guide coupling is safe from `guide.exclude`"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md:44"
  - id: F007
    severity: pass
    category: scope
    summary: "Scope matches the slice-plan entry"
    location: "project-documents/user/slices/214-slice.native-slice-design-validation.md#technical-scope"
  - id: F008
    severity: note
    category: nfr
    summary: "No NFR applies"
    location: "unverified"
---

# Review: slice — slice 214

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [CONCERN] Architecture doc doesn't cover the docs-only guide decision this slice depends on

The 200 architecture is about onboarding: smart `cf init`, `project_create`, the onboarding skill and first-run `cf next`. Its principles are "composability preserved" and "composition over new infrastructure". Slice 214's whole reason to exist is the PM decision of 20261011 that the ai-project-guide becomes docs only and its scripts move into cf (slice doc lines 19 and 23–25). That decision does not appear in the architecture doc at all: not in its Design Goals, Current State, Dependencies or Anticipated Slices. The slice plan does list 214 (plan line 262), so it is approved work, and this isn't a fault in the slice design itself. But it does change the architecture: cf now owns logic that used to live in the guide, and cf and the guide are now coupled by release. The architecture doc's `dateUpdated` is 20261011, yet it still describes the guide as an external install step that cf only composes (line 237). Add a short section or Dependencies entry recording the docs-only boundary. It should say that cf owns executable methodology tooling and the guide owns content and templates, plus the release-coupling rule. Slice 215 needs the same section, and it carries much more risk.

### [CONCERN] Behavior on a missing file in a multi-file run is unclear and conflicts with the requirements

Data Flow says a missing file is a usage error and that "cf stops at the first missing file" (exit 2). Functional Requirements (line 162) say "later files are still checked" when a file fails. Neither section says what happens to results for files already checked when a later file is missing. Line 60 says `sliceDesignFiles.ts` returns results per file and throws only for template problems. So it's unclear:
- whether a missing file is thrown as a typed error or returned as a result
- whether the `PASS`/`FAIL` lines for earlier files print before the exit-2 error (the bash script prints as it goes)
- what `--json` emits in that case: nothing, or a partial `files` array

Pick one behavior and state it. For example: check all paths exist before validating anything, so exit 2 never comes with partial stdout. Or: print earlier results, then error, with JSON emitting no document. Then add a test for it.

### [NOTE] Other file-read failures are not listed

Line 137 lists the exit-2 cases as: no arguments, file not found, template missing, and template with no required headings. It doesn't cover a path that exists but is a directory or can't be read (EACCES), or a template that exists but can't be read. These are probably exit 2 through `handleError`. Say so in one line, so the implementer doesn't let an unhandled `fs` error escape with a different exit code.

### [PASS] Layering and dependency direction

The work is split three ways: a pure core validator (no I/O), a file layer exported only from `@context-forge/core/node`, and a thin CLI subcommand. Dependencies point from cli to core and never the other way. This copies the existing `frontmatterSchema.ts`/`frontmatterFileValidator.ts` pattern. The new subcommand gets its own file because `validate.ts` is already 258 lines, which respects the ~300-line guideline.

### [PASS] No hard-coded section list; one constant for the template path; fails loudly

The template path is defined once (`SLICE_DESIGN_TEMPLATE_RELATIVE_PATH`, next to `GUIDE_RELATIVE_PATH`). The required sections come from the installed template, not from cf. A missing template, or one that declares no required headings, exits 2 instead of passing everything (line 145). This follows the project's rules against silent fallbacks and scattered values. A real-template test (line 173) catches format drift.

### [PASS] Guide coupling is safe from `guide.exclude`

The command needs `project-guides/templates/slice-design.md` to be present at run time. Slice 212's `PROTECTED_GUIDE_PATHS` already refuses excludes that cover `project-guides` and its `templates/` folder, so a tarball install with excludes can't remove the template. Nothing more is needed. A brief cross-reference to 212 would document why this is safe.

### [PASS] Scope matches the slice-plan entry

The slice plan left two questions to the design: the command name and whether `cf check` runs it. Both are settled: `design`, and excluded from `cf check` with a reason. Guide-side edits are correctly left out and assigned to the guide session. The leniency choices (accepting a quoted `docType`, stripping CRLF, using real markdown heading syntax) follow the lenient-parsing rule, and the parity sweep will record where they differ from the script.

### [NOTE] No NFR applies

The architecture's only stated NFR is "from `npm install` to useful output in under two minutes" for onboarding. This slice doesn't touch that path, so it doesn't need to restate a target.

### Run Digest

- Response length: 5842 chars
- Response is newline-free: no
- Tool calls made: 6
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 36.2 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
