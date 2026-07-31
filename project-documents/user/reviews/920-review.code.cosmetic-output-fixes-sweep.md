---
docType: review
layer: project
reviewType: code
slice: cosmetic-output-fixes-sweep
project: context-forge
verdict: PASS
sourceDocument: project-documents/user/slices/920-slice.cosmetic-output-fixes-sweep.md
aiModel: z-ai/glm-5.2
status: complete
dateCreated: 20260730
dateUpdated: 20260730
findings:
  - id: F001
    severity: pass
    category: correctness
    summary: "Worktree sync flag correctly threaded from core to CLI"
    location: packages/core/src/guides/GuideManager.ts:82
  - id: F002
    severity: pass
    category: correctness
    summary: "TemplateProcessor brace-preservation fix is correct and well-tested"
    location: packages/core/src/services/TemplateProcessor.ts:53
  - id: F003
    severity: pass
    category: testing
    summary: "Test updates for FileProjectStore reflect intentional contract change"
    location: packages/core/tests/storage/FileProjectStore.test.ts:81
  - id: F004
    severity: note
    category: typescript
    summary: "resolveInitiativePlanPath mock uses unknown[] args"
    location: packages/cli/tests/commands/list.test.ts:40
  - id: F005
    severity: pass
    category: testing
    summary: "list.test.ts properly mocks new resolveInitiativePlanPath dependency"
    location: packages/cli/tests/commands/list.test.ts:40
---

# Review: code — slice 920

**Verdict:** PASS
**Model:** z-ai/glm-5.2

## Findings

### [PASS] Worktree sync flag correctly threaded from core to CLI

The `worktreeSynced` flag is added to `UpdateResult` only when a submodule sync actually occurs, and the CLI branch in `guides.ts` correctly checks it to produce a more accurate user-facing message. The type annotation on `UpdateResult.worktreeSynced` is optional boolean, which is appropriate since it's absent in the non-sync path. Tests cover both the synced and non-synced cases.

### [PASS] TemplateProcessor brace-preservation fix is correct and well-tested

Returning `_match` instead of `expression` preserves the literal braces for unrecognized template tokens. This is the right fix — `expression` was the captured group content (braces stripped), while `_match` is the full match including braces. The updated tests verify single-brace literals, mixed content, multi-line realistic input, and the `worktreeRange` edge case. Comments explain the rationale clearly.

### [PASS] Test updates for FileProjectStore reflect intentional contract change

The removed migration tests are replaced with a clear comment explaining that `getAll()` now returns stored records verbatim and migration was intentionally removed (commit 8da8cc8). The remaining idempotent pass-through test validates the new contract. The comment references `buildProjectGetView()` and `PROJECT_FIELDS` for the schema-filtered view path, which is good documentation for future maintainers.

### [NOTE] resolveInitiativePlanPath mock uses unknown[] args

The mock uses `(...args: unknown[]) => mockResolveInitiativePlanPath(...args)` which is fine for test code, but the actual `resolveInitiativePlanPath` signature could be imported and used for type safety. This is a minor test-code observation and doesn't warrant action.

### [PASS] list.test.ts properly mocks new resolveInitiativePlanPath dependency

The mock for `resolveInitiativePlanPath` returning `null` is set up in both `beforeEach` blocks (initiatives and arch alias), ensuring the tests exercise the `buildModel`-driven fallback path. Comments explain why `null` is returned. This is a good test-with pattern — the mock was added alongside the dependency introduction.
