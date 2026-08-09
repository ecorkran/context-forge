---
docType: review
layer: project
reviewType: code
slice: frontmatter-validate-command-dateupdated-stamp
project: context-forge
verdict: PASS
sourceDocument: project-documents/user/slices/923-slice.frontmatter-validate-command-dateupdated-stamp.md
aiModel: minimax/minimax-m2.7
status: complete
dateCreated: 20260809
dateUpdated: 20260809
reviewedSha: 6ea6177012f46b1bfb091d6d49d2334581ab68cb
findings:
  - id: F001
    severity: note
    category: uncategorized
    summary: "Test mock typing uses `unknown[]` for variadic args"
    location: packages/cli/tests/commands/validate.test.ts:16
  - id: F002
    severity: note
    category: uncategorized
    summary: "Test output verification indirectness"
    location: packages/cli/tests/commands/validate.test.ts:192-193
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Robust error handling with typed catches"
    location: packages/cli/src/commands/validate.ts:127-132
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Explicit exit codes for semantic distinction"
    location: packages/cli/src/utils/errors.ts:70
  - id: F005
    severity: pass
    category: uncategorized
    summary: "Consistent date stamping pattern"
    location: packages/cli/src/commands/validate.ts:107, packages/cli/src/commands/check.ts:158
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Guard prevents double-write for dateUpdated fix"
    location: packages/core/src/introspection/writers/markdownWriter.ts:136-138
  - id: F007
    severity: pass
    category: uncategorized
    summary: "Intentional schema simplification for machine-artifact docTypes"
    location: packages/core/src/schema/frontmatterSchema.ts:118-142
  - id: F008
    severity: pass
    category: uncategorized
    summary: "Shared discovery logic via `discoverAllDocuments`"
    location: packages/core/src/introspection/ConsistencyChecker.ts:1116-1129
  - id: F009
    severity: pass
    category: uncategorized
    summary: "Proper optional chaining for unfixable findings"
    location: packages/cli/src/commands/validate.ts:67
  - id: F010
    severity: pass
    category: uncategorized
    summary: "Defensive path filtering in `resolveExplicitPaths`"
    location: packages/core/src/schema/frontmatterFileValidator.ts:53-63
---

# Review: code — slice 923

**Verdict:** PASS
**Model:** minimax/minimax-m2.7

## Findings

### [NOTE] Test mock typing uses `unknown[]` for variadic args

The mock setup uses `(...args: unknown[])` for the variadic mock. While `unknown[]` is safer than `any[]`, the project could use a more specific type:

```typescript
// Current
validateFrontmatterFiles: (...args: unknown[]) => mockValidateFrontmatterFiles(...args),

// Could use
validateFrontmatterFiles: mockValidateFrontmatterFiles,
```

This is informational only — the `unknown[]` pattern is TypeScript-safe and the test passes correctly.

### [NOTE] Test output verification indirectness

The JSON output tests mock `process.stdout.write` but the actual `printJson` function (not visible in diff) likely writes via `console.log`. The test still verifies correct behavior by checking the parsed structure:

```typescript
const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
const parsed = JSON.parse(raw);
expect(parsed.filesChecked).toBe(5);
```

This works because the mocked `console.log` is a no-op and the JSON happens to be parseable. For stricter test isolation, `printJson` could be mocked directly. Not a bug — just noting the test trusts the JSON formatting layer.

### [PASS] Robust error handling with typed catches

The fix loop properly narrows caught errors:

```typescript
const msg = err instanceof Error ? err.message : String(err);
fixErrors.push(`Fix failed for ${finding.filePath} (${finding.fixAction.field}): ${msg}`);
stillBroken.push(finding);
```

This follows the strict mode pattern: `err instanceof Error` check before accessing `.message`.

### [PASS] Explicit exit codes for semantic distinction

The `handleError` function now accepts an optional `exitCode` parameter (defaulting to 1), allowing callers to specify semantic exit codes. The validate command correctly uses exit code 2 for project-not-found errors:

```typescript
// In validate.ts
handleError(err, 2);
```

### [PASS] Consistent date stamping pattern

Both commands correctly compute the date stamp once and reuse it for all fixes within a run, preventing inconsistent timestamps:

```typescript
const dateStamp = formatDateProject();
// ... used for all updateFrontmatterField calls
```

### [PASS] Guard prevents double-write for dateUpdated fix

The implementation correctly guards against double-writing when the fix itself is for `dateUpdated`:

```typescript
if (key !== 'dateUpdated') {
  setFrontmatterField(lines, closingIndex, 'dateUpdated', dateUpdated);
}
```

This preserves the intended semantics for the backfill scenario where `dateUpdated` should equal `dateCreated`, not the run timestamp.

### [PASS] Intentional schema simplification for machine-artifact docTypes

The new schemas for `review-resolution`, `gate-evidence`, and `devlog` correctly omit `status`, `project`, and `dateUpdated`. The comment explicitly documents the design rationale:

```typescript
// Squadron machine-artifact docTypes (#73): append-only records of a moment
// with no lifecycle, so no `status` and no `project`. `dateUpdated` is
// deliberately NOT required — a single-file validator has no evidence an
// edit occurred after creation...
```

### [PASS] Shared discovery logic via `discoverAllDocuments`

The refactoring correctly extracts `discoverAllDocuments` into a shared module. The comment explains the design decision:

```typescript
// Discovery (DOC_SCAN_DIRS / discoverAllDocuments) is shared with the
// standalone `validateFrontmatterFiles` service (`cf validate frontmatter`).
// Per-file parsing here goes through the injected `IArtifactIntrospector`
// rather than calling into the service directly, so this rule stays
// testable via dependency injection...
```

### [PASS] Proper optional chaining for unfixable findings

The fix log lookup correctly handles findings without a `fixAction`:

```typescript
const logEntry = fixLog.find((e) => e.filePath === filePath && e.field === finding.fixAction?.field);
```

The test case `unfixableFinding` (which has no `fixAction`) verifies this path works correctly.

### [PASS] Defensive path filtering in `resolveExplicitPaths`

The function correctly handles multiple edge cases:
- Non-`.md` files are skipped
- Paths outside the document root are rejected via `relative()` check
- Non-existent files are silently skipped

The tests in `frontmatterFileValidator.test.ts` comprehensively verify each case.
