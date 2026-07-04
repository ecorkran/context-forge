---
docType: review
layer: project
reviewType: code
slice: gate-logic-in-workflownavigator
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/241-slice.gate-logic-in-workflownavigator.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260704
dateUpdated: 20260704
findings:
  - id: F001
    severity: concern
    category: naming
    summary: "File naming violates kebab-case convention"
    location: packages/core/src/introspection/reviewGate.ts
  - id: F002
    severity: concern
    category: dry
    summary: "DRY violation — `makeStubConfig` duplicated across two test files"
    location: packages/core/tests/introspection/WorkflowNavigator.test.ts:644
  - id: F003
    severity: concern
    category: error-handling
    summary: "Bare `catch {}` swallows all exceptions without meeting project convention"
    location: packages/cli/src/commands/config.ts:24
  - id: F004
    severity: note
    category: typescript
    summary: "Type assertion patterns in tests bypass type safety"
    location: packages/core/tests/introspection/reviewGate.test.ts:87
  - id: F005
    severity: note
    category: typescript
    summary: "`gateInfo` field could use discriminated union for type safety"
    location: packages/core/src/introspection/types.ts:270
  - id: F006
    severity: pass
    category: typescript
    summary: "STATUS const object follows TypeScript const-assertion pattern correctly"
    location: packages/core/src/introspection/types.ts:1
  - id: F007
    severity: pass
    category: design
    summary: "Conservative-by-default gate behavior preserves backward compatibility"
    location: packages/core/src/introspection/WorkflowNavigator.ts:68
---

# Review: code — slice 241

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] File naming violates kebab-case convention

The TypeScript rules specify "Files: kebab-case (`template-processor.ts`, `context-data.ts`)", but `reviewGate.ts` uses camelCase. It should be `review-gate.ts`. This also affects the import path in `WorkflowNavigator.ts`.

---

### [CONCERN] DRY violation — `makeStubConfig` duplicated across two test files

The `makeStubConfig` helper function is copy-pasted identically into both `WorkflowNavigator.test.ts` and `reviewGate.test.ts`. Per project conventions: "Do not duplicate logic. Respect DRY." This should be extracted to a shared test utility (e.g., `packages/core/tests/helpers/stubConfig.ts`) and imported by both test files.

---

### [CONCERN] Bare `catch {}` swallows all exceptions without meeting project convention

Project conventions require every try/catch to either (a) re-raise after logging, (b) handle a **specific** exception with a comment, or (c) be a top-level handler. The `resolveConfigProjectPath` function catches all exceptions silently:

```typescript
} catch {
  // Registry resolution failed — fall through to the raw-path fallback below.
}
```

The comment explains the *intent*, but the block catches **every** exception type — including `TypeError`, network errors, or file-system permission errors that should not silently fall through. The correct pattern is to catch the specific expected exceptions (e.g., project-not-found or worktree-not-found errors) and let unexpected errors propagate:

```typescript
} catch (err) {
  if (!(err instanceof ProjectNotFoundError || err instanceof WorktreeNotFoundError)) {
    throw err;
  }
  // Registry resolution failed — fall through to the raw-path fallback below.
}
```

---

### [NOTE] Type assertion patterns in tests bypass type safety

`as unknown as ConfigManager` is used in `makeStubConfig` to create test doubles, and `as never` appears in `config.test.ts:142`. The TypeScript rules flag `as` assertions as a code smell. In test stubs this is a common and pragmatic pattern, but consider creating a proper interface for `ConfigManager` that test doubles can implement directly, eliminating the need for double-assertion gymnastics.

---

### [NOTE] `gateInfo` field could use discriminated union for type safety

The `SliceStatus` interface makes `gateInfo` optional on all status values, but the TypeScript rules say to "write types that make illegal states unrepresentable." Currently `gateInfo` can be set when `status` is `'needs-design'`, which is semantically invalid. A discriminated union would enforce the constraint:

```typescript
type SliceStatusBase = { name: string; index: number | null; taskProgress?: ... };
type SliceStatus =
  | SliceStatusBase & { status: 'pending-review' | 'review-failed'; gateInfo: { ... } }
  | SliceStatusBase & { status: Exclude<SliceStatusValues, 'pending-review' | 'review-failed'> };
```

The comment documents the intent, but the type system should enforce it.

---

### [PASS] STATUS const object follows TypeScript const-assertion pattern correctly

The `STATUS` const object with `as const` and the derived `NormalizedStatus` type correctly follow the TypeScript rules' preference for `as const` objects over enums. The existing `taskResult.inferredStatus === STATUS.Complete` comparison at `WorkflowNavigator.ts:563` properly references the centralized constant instead of a magic string.

---

### [PASS] Conservative-by-default gate behavior preserves backward compatibility

The `WorkflowNavigator` constructor makes `config` optional, and `evaluateGate` returns `null` immediately when no config is provided. The `resolveGateConfig` function returns `null` when `review_enabled` is not `true`. This ensures byte-identical behavior to pre-241 when gating is off, which is confirmed by the regression tests. Good design.
