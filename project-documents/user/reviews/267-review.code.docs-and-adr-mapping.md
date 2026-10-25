---
docType: review
layer: project
reviewType: code
slice: docs-and-adr-mapping
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/267-slice.docs-and-adr-mapping.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261024
dateUpdated: 20261024
reviewedSha: bc115cb983609e8cd9622118818bc4c04115011f
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
turns: 1
promptTokens: 47118
cachedTokens: 3232
cacheWriteTokens: 43884
completionTokens: 2247
durationSeconds: 19.0
costUsd: 0.201443
costBasis: provider
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Link destinations are only escaped for spaces"
    location: "packages/core/src/docs-map/renderDocsMap.ts:19-22"
  - id: F002
    severity: concern
    category: correctness
    summary: "New-map frontmatter interpolates the project name unquoted"
    location: "packages/core/src/docs-map/docsMapFile.ts:45-52"
  - id: F003
    severity: concern
    category: parsing
    summary: "Marker matching is strict about trailing whitespace"
    location: "packages/core/src/docs-map/docsMapFile.ts:70-72"
  - id: F004
    severity: concern
    category: testing
    summary: "Test contains branching logic that duplicates its own condition"
    location: "packages/core/tests/docs-map/discoverDocs.test.ts:51-57"
  - id: F005
    severity: note
    category: performance
    summary: "Titles are read sequentially"
    location: "packages/core/src/docs-map/discoverDocs.ts:131-135"
  - id: F006
    severity: note
    category: simplicity
    summary: "Redundant not-found check in the CLI command"
    location: "packages/cli/src/commands/docs.ts:24-26"
  - id: F007
    severity: pass
    category: error-handling
    summary: "Error handling, structure and test coverage"
    location: "packages/core/src/docs-map/docsMapError.ts"
---

# Review: code — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Link destinations are only escaped for spaces

`entryLine` builds `[title](link)` and escapes only spaces in the link. A filename containing `(`, `)`, `#`, `%` or `<` produces a broken or misdirected Markdown link. A title containing `[` or `]` can also break the link text. Both come from user-controlled filenames and H1 text and are written verbatim into the managed block. Percent-encode the path segments (for example `encodeURI` per segment, plus `(` and `)`), and escape brackets in titles. Add a test with such a filename.

### [CONCERN] New-map frontmatter interpolates the project name unquoted

`project: ${projectName}` is written raw. A project name containing `: `, `#`, or a leading YAML special character yields invalid or misparsed frontmatter. The file name also embeds the name, so a path separator in the name would change the path. Quote or validate the name before writing it. The tests only use simple names such as `acme`.

### [CONCERN] Marker matching is strict about trailing whitespace

`indicesOf` compares `lineText(line) === marker` exactly. If an editor adds trailing spaces to a marker, the block is treated as absent and the command fails with "no BEGIN block found". The project's parsing rule asks for lenient matching of formatting variations. Compare against `trimEnd()`. The comment on `locateBlock` says "whole lines", so trimming trailing whitespace stays consistent with that.

### [CONCERN] Test contains branching logic that duplicates its own condition

The `DOC_PATHS` test evaluates `candidate.includes('.') || candidate === 'README'` twice to decide whether a candidate is a file or a directory. This is fragile, and it duplicates the logic that decides it. A new extensionless file entry in `DOC_PATHS` would silently take the wrong branch. Derive the kind once, or classify the candidates explicitly in the test data.

### [NOTE] Titles are read sequentially

`readTitle` is awaited one file at a time. This is acceptable for typical doc trees, but a bounded `Promise.all` would speed up large `docs/` directories. The sequential order does keep output deterministic.

### [NOTE] Redundant not-found check in the CLI command

`resolveProjectWorktree` may already throw for an unknown project. The test expects the message "Project 'nope' not found", which differs from the text in this branch. The `!project` branch is therefore probably only reachable on a race. I did not confirm this by reading `resolveProjectWorktree`.

### [PASS] Error handling, structure and test coverage

- **Error handling:** filesystem errors are narrowed with `isFsError` and wrapped in `DocsMapError` with path and code. Each swallowed ENOENT carries a justifying comment. Discovery runs before any write, so a discovery failure leaves the map untouched.
- **Design:** the module is split into rendering, discovery and file handling. Magic values are centralized as constants. There is no `any`, and `as const` is used instead of enums.
- **Tests:** they live in the centralized `tests/` directories. They cover byte preservation, CRLF, broken markers, permission failures, symlink loops and the out-of-tree link regression.

### Run Digest

- Response length: 3749 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 1
- Tokens — prompt / cached / cache write / completion / reasoning: 47118 / 3232 / 43884 / 2247 / not computed
- Duration: 19.0 s
- Cost: $0.20 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
