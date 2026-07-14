---
docType: review
layer: project
reviewType: code
slice: config-key-scope-classification-shared-vs-personal
project: squadron
verdict: PASS
sourceDocument: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260714
dateUpdated: 20260714
findings:
  - id: F001
    severity: note
    category: project-convention
    summary: "`scope` string literals scattered across multiple files"
    location: packages/core/src/config/ConfigKeys.ts
  - id: F002
    severity: note
    category: test-coverage
    summary: "Missing test for `needsNewline` code path in `ensurePersonalConfigGitignored`"
    location: packages/cli/src/commands/init.ts
  - id: F003
    severity: note
    category: test-coverage
    summary: "No test for `getRawProjectFileValues()` error path when `projectPath` is unset"
    location: packages/core/src/config/ConfigManager.ts
  - id: F004
    severity: note
    category: typescript-style
    summary: "`as` type assertions in `getRawProjectFileValues` and `get` lack explanatory comments"
    location: packages/core/src/config/ConfigManager.ts:236
  - id: F005
    severity: pass
    category: correctness
    summary: "Migration command correctly bypasses auto-routed `delete()`"
    location: packages/cli/src/commands/config.ts:179
  - id: F006
    severity: pass
    category: typescript-patterns
    summary: "Discriminated union `Outcome` type with exhaustiveness"
    location: packages/cli/src/commands/config.ts:166
  - id: F007
    severity: pass
    category: software-design
    summary: "Consistency Rule 15 is intentionally non-fixable with clear suggested action"
    location: packages/core/src/introspection/ConsistencyChecker.ts:1090
---

# Review: code — slice 915

**Verdict:** PASS
**Model:** z-ai/glm-5.1

## Findings

### [NOTE] `scope` string literals scattered across multiple files

The project convention states: *"Never scatter comparison values across code. If a value is used in conditionals, switch cases, or lookups, define it once (enum, constant, or config) and reference that definition everywhere."* The string literals `'shared'` and `'personal'` appear in `ConfigKeyDefinition`'s type annotation, every `CONFIG_KEYS` entry, `ConfigManager.ts` (`def.scope === 'personal'`), `config.ts` (`def.scope === 'personal'`), and `ConsistencyChecker.ts` (`def.scope !== 'personal'`). TypeScript's union type `'shared' | 'personal'` provides compile-time safety, so this isn't a runtime risk, but a `const` object (per the TypeScript rules' `as const` pattern) would let a rename touch one place instead of many:

```typescript
const ConfigScope = { Shared: 'shared', Personal: 'personal' } as const;
type ConfigScope = (typeof ConfigScope)[keyof typeof ConfigScope];
```

### [NOTE] Missing test for `needsNewline` code path in `ensurePersonalConfigGitignored`

The function handles the edge case where an existing `.gitignore` doesn't end with a newline (`const needsNewline = content.length > 0 && !content.endsWith('\n')`), but none of the three test cases exercise this path. The "appends" test uses `'node_modules\n'` (ends with newline). A test with content like `'node_modules'` (no trailing newline) would verify the extra newline is inserted before the new entry, preventing accidental concatenation like `node_modules.context-forge.local.toml`.

### [NOTE] No test for `getRawProjectFileValues()` error path when `projectPath` is unset

`deleteFromSharedProjectFile()` has a test verifying it throws when no `projectPath` is provided, but the parallel guard in `getRawProjectFileValues()` (`throw new Error('Cannot read project-scoped config: no projectPath provided')`) has no corresponding test. Minor symmetry gap in test coverage.

### [NOTE] `as` type assertions in `getRawProjectFileValues` and `get` lack explanatory comments

The TypeScript rules state: *"If you must assert, document why in a comment."* The `as string | boolean | number | undefined` assertions on `resolveKey()` return values are consistent with the existing `as string | boolean | number` in `get()`, but neither has a comment. Since `resolveKey` returns a loosely-typed value from parsed TOML, a brief comment like `// resolveKey returns unknown; safe because key is validated against CONFIG_KEYS` would satisfy the rule and aid future readers.

### [PASS] Migration command correctly bypasses auto-routed `delete()`

The `migrate-personal` command uses `deleteFromSharedProjectFile()` instead of `delete()`, which would auto-route personal keys to the personal file and silently wipe the value just written. The test explicitly asserts `expect(mockDelete).not.toHaveBeenCalled()` with a clear regression comment. Well-designed.

### [PASS] Discriminated union `Outcome` type with exhaustiveness

The local `Outcome` type uses a discriminated union on `status: 'moved' | 'skipped' | 'failed'` with an optional `detail` field only for non-moved statuses. This makes illegal states unrepresentable and is a good application of the TypeScript rules' discriminated union pattern.

### [PASS] Consistency Rule 15 is intentionally non-fixable with clear suggested action

The rule detects personal keys in the shared file but correctly declines auto-fix since a cross-file move doesn't fit the checkbox/frontmatter fixAction shape. The `suggestedFix` points users to `cf config migrate-personal`. Good separation of concerns.
