---
docType: review
layer: project
reviewType: code
slice: guide-exclude-globs-for-tarball-installs
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261004
dateUpdated: 20261004
reviewedSha: e811d9b90f53fc5b82bd152642ad478f2693af16
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
durationSeconds: 31.3
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Staging directory is not cleaned up when extraction fails"
    location: "packages/core/src/guides/strategies/TarballStrategy.ts#extractAndSwap"
  - id: F002
    severity: concern
    category: error-handling
    summary: "The restore in the swap `catch` can hide the original error"
    location: "packages/core/src/guides/strategies/TarballStrategy.ts#extractAndSwap"
  - id: F003
    severity: concern
    category: correctness
    summary: "Overlapping exclude patterns can produce false \"matched nothing\" warnings"
    location: "packages/core/src/guides/strategies/TarballStrategy.ts#isSkippedTarballEntry"
  - id: F004
    severity: note
    category: error-handling
    summary: "`readExcludeRecord` re-validates the on-disk record through the config parser"
    location: "packages/core/src/guides/strategies/TarballStrategy.ts#readExcludeRecord"
  - id: F005
    severity: note
    category: design
    summary: "List comparison is duplicated"
    location: "packages/cli/src/commands/guides.ts:77-80"
  - id: F006
    severity: note
    category: typing
    summary: "`guideExcludeNotices` takes a loose inline parameter type"
    location: "packages/core/src/guides/types.ts#guideExcludeNotices"
  - id: F007
    severity: note
    category: testing
    summary: "Test hygiene"
    location: "packages/core/tests/guides/strategies/TarballStrategy.test.ts"
  - id: F008
    severity: pass
    category: design
    summary: "Exclude parsing, validation and shared definitions"
    location: "packages/core/src/config/guideExclude.ts"
---

# Review: code — slice 212

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Staging directory is not cleaned up when extraction fails

`extractAndSwap` removes leftovers from earlier crashes at the start of a run, but it does not clean up when `downloadAndExtract` or the `writeFileSync` calls throw. A failed download, such as a rate limit or a broken archive, leaves a partial `project-documents/.ai-project-guide.staging` directory in the user's repo. That directory is untracked and not ignored until the next successful run. The existing guide is safe, which is the main goal. Wrap the pre-swap work in `try/catch` and `rmSync(staging)` before rethrowing, and add a test for it. The "leaves the guide untouched when the download fails" test currently checks only that the target is untouched, not that staging is removed.

### [CONCERN] The restore in the swap `catch` can hide the original error

If `renameSync(staging, targetDir)` fails and the restore `renameSync(previous, targetDir)` also throws, the restore error replaces the original and the root cause is lost. In that state the guide only exists at `.previous`. Catch the restore failure and report both errors, including where the backup is, for example by throwing an error that names `previous` and chains the original with `cause`.

### [CONCERN] Overlapping exclude patterns can produce false "matched nothing" warnings

`isExcludedGuidePath` returns only the first matching pattern, and `matched` records only that one. With `tool-guides` and `tool-guides/x` both configured, the parent matches first (sorted order), so the child is reported as matching nothing. A user entry equal to a built-in entry such as `.gitignore` is also reported as unmatched, because the built-in match wins. The built-in pattern is also added to `matched`. Record every user pattern that matches an entry, or record only user-list matches.

### [NOTE] `readExcludeRecord` re-validates the on-disk record through the config parser

Parsing the record with `parseGuideExclude` makes it compare directly with config. But if the protected-path list grows in a later release, an old record that is still valid on disk would make `status()` and `update()` throw a `GuideExcludeError` that blames `guide.exclude` config, not the record file. Consider wording the error to name the record file. A corrupt record is also not covered by a test.

### [NOTE] List comparison is duplicated

Both the CLI (`excludeConfigured.join(',') !== excludeApplied.join(',')`) and `TarballStrategy.update` compare sorted exclude lists with `join(',')`. This is safe because entries cannot contain commas, but it is two copies of the same logic. A small `sameExcludeList` helper in `guideExclude.ts` would give one definition. The matching rule `path === p || path.startsWith(p + '/')` also appears in both `protectedConflict` and `isExcludedGuidePath`.

### [NOTE] `guideExcludeNotices` takes a loose inline parameter type

The inline object type mixes install fields (`version`) with update fields (`newVersion`) and declares an unused `exclude` field. A named interface that `InstallResult` and `UpdateResult` both satisfy would be clearer. The CLI's `Parameters<typeof guideExcludeNotices>[0]` workaround would then not be needed.

### [NOTE] Test hygiene

The new `afterEach` blocks call `mockReset()` on the shared `fs` mocks. This strips the default implementations for any later test that relies on `beforeEach`-time setup. It also uses `require('stream')` inside ESM-style test files. Both work only if the surrounding setup allows them, so a top-level `import { PassThrough } from 'stream'` would be safer. Otherwise coverage is good: the swap order, the restore path, the record comparison, `status` and the CLI output are all tested. The exclude parser tests use the real pattern forms, as the parsing guidelines require.

### [PASS] Exclude parsing, validation and shared definitions

The parser is lenient on layout (whitespace, doubled commas, `./`, trailing `/` or `/**`) and strict on meaning. It rejects absolute paths, `..`, and unsupported wildcards, with errors that name the key and the entry. Protected paths are defined once in `PROTECTED_GUIDE_PATHS`. The config validator, `GuideManager` and the strategy all use the same parser, so there is no scattered logic. An invalid value fails explicitly on `install`, `update` and `status` instead of falling back silently. The `catch` in `ConfigKeys` narrows to `GuideExcludeError` and rethrows anything else, which follows the exception-handling rules. No `any` was introduced.

### Run Digest

- Response length: 5271 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 31.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
