---
docType: review
layer: project
reviewType: code
slice: guide-update-branch-guard
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/916-slice.guide-update-branch-guard.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260713
dateUpdated: 20260713
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Silent catch in `evaluateBranchGuard` violates project exception-handling rules"
    location: packages/core/src/guides/branchGuard.ts:82-84
  - id: F002
    severity: concern
    category: test-coverage
    summary: "Missing test for config read failure fallback path in `evaluateBranchGuard`"
    location: packages/core/tests/guides/branchGuard.test.ts
  - id: F003
    severity: note
    category: maintainability
    summary: "Duplicated error class definitions in test files are a DRY/maintenance risk"
    location: packages/cli/tests/commands/guides.test.ts:13-36
  - id: F004
    severity: note
    category: type-safety
    summary: "Type assertions in test mocks reduce type safety"
    location: packages/core/tests/guides/branchGuard.test.ts:49
  - id: F005
    severity: pass
    category: type-design
    summary: "Discriminated union design for `BranchGuardVerdict` is excellent"
    location: packages/core/src/guides/branchGuard.ts:8-11
  - id: F006
    severity: pass
    category: type-design
    summary: "Error classes are well-structured with proper typing and messages"
    location: packages/core/src/guides/branchGuard.ts:46-85
  - id: F007
    severity: pass
    category: api-design
    summary: "Two-call confirmation flow for MCP tool is well-documented and correctly implemented"
    location: packages/mcp-server/src/tools/guideTools.ts:130-166
---

# Review: code — slice 916

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Silent catch in `evaluateBranchGuard` violates project exception-handling rules

The `catch` block silently swallows all errors from `configManager.get()`, falling through to the default `'main'` trunk. The comment only describes the *behavior* ("Fall through to default 'main'") but does not explain *why* swallowing is correct, as required by CLAUDE.md:

> Every try/except must either: (a) re-raise after logging at ERROR level, (b) handle a specific exception with a comment explaining why swallowing is correct, or (c) be a top-level handler at a process boundary.

A config read failure could indicate a corrupted config file, filesystem permissions issue, or other problem the user should know about. Silently falling back to `'main'` may cause the guard to evaluate against the wrong trunk branch, potentially blocking legitimate updates or allowing updates on the wrong branch. At minimum, add a comment explaining why silent fallback is the correct behavior here (e.g., "config read failure is non-fatal: the guard degrades gracefully to the conventional default trunk"), or log a warning before falling through.

```typescript
} catch {
  // Fall through to default 'main'
}
```

### [CONCERN] Missing test for config read failure fallback path in `evaluateBranchGuard`

The `evaluateBranchGuard` function has a `try/catch` around `configManager.get()` that silently falls back to `'main'` when the read fails, but no test verifies this behavior. If the fallback logic changes or breaks, there is no test to catch the regression. Add a test where `configManager.get` rejects (e.g., throws an error) and assert that the function still returns a valid verdict using the default trunk `'main'`.

For example:
```typescript
it('configManager.get rejects -> falls back to trunk=main, evaluates normally', async () => {
  mockCurrentBranch('main');
  const badConfig = {
    get: vi.fn().mockRejectedValue(new Error('config corrupted')),
  } as unknown as ConfigManager;
  const verdict = await evaluateBranchGuard('/repo', badConfig);
  expect(verdict).toEqual({ outcome: 'proceed' });
});
```

### [NOTE] Duplicated error class definitions in test files are a DRY/maintenance risk

Both `packages/cli/tests/commands/guides.test.ts` and `packages/mcp-server/tests/guideTools.test.ts` duplicate `BranchGuardBlockedError` and `BranchGuardWarnError` inside `vi.hoisted()` instead of importing them from the real module. If the real classes' constructors, properties, or `instanceof` behavior change, these duplicates must be manually updated — a silent drift risk.

The `GuideManager.test.ts` file demonstrates a better pattern: it uses `vi.importActual` for `branchGuard.js` to get the real error classes while still mocking `evaluateBranchGuard`. This approach could potentially be adapted for the CLI and MCP server tests as well, by importing the error classes directly from the `branchGuard` module path rather than relying on the fully-mocked `@context-forge/core/node` barrel export. This may require adjusting the mock structure, but would eliminate the duplication.

### [NOTE] Type assertions in test mocks reduce type safety

The test uses `(callback as Function)` and `return undefined as never` to work around mock typing limitations:

```typescript
mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
  (callback as Function)(null, '', '');
  return undefined as never;
});
```

The `as Function` cast erases all type safety on the callback invocation. While common in test code and pragmatically necessary with `vi.fn()` mocking of Node.js APIs, consider using `util.promisify` in the source `isAncestor` function instead of the callback pattern — this would make the function testable with simpler mock patterns and eliminate the need for these casts.

### [PASS] Discriminated union design for `BranchGuardVerdict` is excellent

The `BranchGuardVerdict` type uses a discriminated union on the `outcome` field, making illegal states unrepresentable and enabling exhaustive checking in consumers. This is exactly the pattern recommended by the TypeScript rules and ensures the compiler will flag any missing case handling.

### [PASS] Error classes are well-structured with proper typing and messages

Both `BranchGuardBlockedError` and `BranchGuardWarnError` extend `Error` properly, set `this.name` correctly, use `readonly` properties, and provide context-sensitive messages (e.g., the detached HEAD case gets distinct remediation advice). This is clean, idiomatic TypeScript.

### [PASS] Two-call confirmation flow for MCP tool is well-documented and correctly implemented

The MCP tool's description clearly explains the two-call confirmation pattern, the `confirm` parameter schema is self-documenting, and the implementation correctly distinguishes between `BranchGuardBlockedError` (hard block, always returns error) and `BranchGuardWarnError` (soft block, retriable with confirmation). The `confirm: true` flag does not override a block verdict — only a warn verdict — which is the correct security posture.
