---
docType: review
layer: project
reviewType: code
slice: frontmatter-validate-command-dateupdated-stamp
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/923-slice.frontmatter-validate-command-dateupdated-stamp.md
aiModel: minimax/minimax-m2.7
status: complete
dateCreated: 20260809
dateUpdated: 20260809
reviewedSha: 1976437730e2a0f79ba450f59a4b8386a95c91f9
findings:
  - id: F001
    severity: concern
    category: uncategorized
    summary: "Type mismatch between fixAction.field and fixAction.detail"
    location: packages/cli/src/commands/validate.ts:71
  - id: F002
    severity: note
    category: uncategorized
    summary: "New frontmatter schemas for machine-artifact docTypes"
    location: packages/core/src/schema/frontmatterSchema.ts:115-140
  - id: F003
    severity: pass
    category: uncategorized
    summary: "dateUpdated auto-stamp design is sound"
    location: packages/core/src/introspection/writers/markdownWriter.ts:134-146
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Code refactoring improves reusability"
    location: packages/core/src/schema/frontmatterFileValidator.ts (new file)
  - id: F005
    severity: pass
    category: uncategorized
    summary: "CLI command registration follows existing patterns"
    location: packages/cli/src/index.ts:55
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Error handling with exit codes"
    location: packages/cli/src/utils/errors.ts:42
  - id: F007
    severity: pass
    category: uncategorized
    summary: "Test coverage is comprehensive"
    location: packages/core/tests/introspection/writers/markdownWriter.test.ts
  - id: F008
    severity: pass
    category: uncategorized
    summary: "Explicit path validation is defensive"
    location: packages/core/src/schema/frontmatterFileValidator.ts:54-69
  - id: F009
    severity: pass
    category: uncategorized
    summary: "Variable shadowing in findFrontmatterBounds is intentional and safe"
    location: packages/core/src/introspection/writers/markdownWriter.ts:53
---

# Review: code — slice 923

**Verdict:** CONCERNS
**Model:** minimax/minimax-m2.7

## Findings

### [CONCERN] Type mismatch between fixAction.field and fixAction.detail

In `validateFrontmatterAction`, the code accesses `finding.fixAction?.field` to match against `fixLog` entries. However, based on the `FrontmatterFinding` type shown in `fixAction` access elsewhere in the codebase (e.g., `ConsistencyChecker.ts:232`), the `'update-frontmatter'` variant has properties `type`, `filePath`, and `detail: { key: string; value: string }` — not a `field` property directly on `fixAction`.

This suggests a potential type mismatch that TypeScript should catch if strict mode is enforced. Verify that `FrontmatterFinding.fixAction` actually has a `field` property, or that this code path uses a compatible type.

### [NOTE] New frontmatter schemas for machine-artifact docTypes

The schemas for `review-resolution`, `gate-evidence`, and `devlog` intentionally omit `status` and `dateUpdated` fields. The comment explicitly explains this is correct to avoid manufacturing false claims when backfilling `dateUpdated` from `dateCreated`. Good design decision with clear documentation.

### [PASS] dateUpdated auto-stamp design is sound

The guard `if (key !== 'dateUpdated')` correctly prevents double-writing when explicitly updating `dateUpdated`. The stamping logic is well-structured:
1. Set the primary field
2. Stamp `dateUpdated` unless the primary field IS `dateUpdated`

The integration test `backfills dateUpdated from dateCreated, not the run date stamp` specifically validates this guard behavior.

### [PASS] Code refactoring improves reusability

Extracting `discoverAllDocuments` from `ConsistencyChecker` into a shared module enables the standalone `validateFrontmatterFiles` service used by `cf validate frontmatter`. The comment in `ConsistencyChecker.ruleFrontmatterSchema` explains why the class still uses its injected introspector rather than calling the service directly — this keeps the rule testable via dependency injection.

### [PASS] CLI command registration follows existing patterns

The new `validate` command is registered alongside existing commands using the standard pattern (`registerXxxCommand`).

### [PASS] Error handling with exit codes

The `handleError` function now accepts an optional exit code parameter (defaulting to 1), making it more flexible. The `validate.ts` command correctly uses exit code 2 for user input errors ("unresolvable project") to distinguish from generic errors.

### [PASS] Test coverage is comprehensive

The test suite covers:
- Updating existing fields (with dateUpdated stamp verification)
- Inserting new fields
- Handling quoted values
- Replacing existing dateUpdated
- Skipping stamp when key is dateUpdated
- Error cases (missing frontmatter, unclosed frontmatter)

### [PASS] Explicit path validation is defensive

The `resolveExplicitPaths` function correctly handles edge cases:
- Skips non-.md files
- Resolves relative paths from CWD
- Uses `relative()` + `startsWith('..')` to prevent directory traversal
- Skips nonexistent files without errors

### [PASS] Variable shadowing in findFrontmatterBounds is intentional and safe

The `closingIndex` parameter is shadowed by the return value, and this is correct because:
1. The parameter value is never used after assignment
2. The return value properly represents the closing boundary position

---

## Debug: Prompt & Response

### System Prompt

You are a code reviewer. Review code against Additional Review Rules, known language-specific rules, testing
standards, and project conventions.

Focus areas:
- Additional Review Rules
- Language Rules included in Additional Review Rules
- Software Design Principles (e.g. SOLID, DRY, KISS) included in Additional Review Rules
- Project conventions
- Test coverage patterns (test-with, not test-after)
- Error handling patterns
- Security concerns
- Naming, structure, and documentation quality
- Language-appropriate style and correctness

CRITICAL: Your verdict and findings MUST be consistent.
- If verdict is CONCERNS or FAIL, include at least one finding with that severity.
- If no CONCERN or FAIL findings exist, verdict MUST be PASS.
- Every finding MUST use the exact format: ### [SEVERITY] Title
- Every finding MUST include a `location:` tag on its own line immediately
  after the title. This applies to PASS findings too.

Choosing the `location:` value (use the most specific form you can verify):
1. `path:line` or `path:start-end` — preferred when you can pin the issue
   to a specific line or range in a file under review.
2. `path#symbol` — when the issue is at a named function/class/method but
   a precise line is awkward.
3. `path` — when the issue spans the whole file.
4. `unverified` — the explicit "I don't know" token. Use this when you
   cannot pin the finding to a specific path you are certain exists in
   the code under review. **A hallucinated path is worse than
   `unverified`** because it looks authoritative; the parser will normalize
   missing/blank/`-`/`global` to `unverified` automatically.

For multi-file findings: cite the primary location in `location:` and
describe the others in the prose body. The `location:` field is the
primary anchor for deduplication, not a complete listing.

Report your findings using severity levels:

## Summary
[overall assessment: PASS | CONCERNS | FAIL]

## Findings

### [PASS|CONCERN|FAIL] Finding title
location: <path:line | path:start-end | path#symbol | path | unverified>
Description with specific file and line references in prose.


## Output Structure Requirements

For each finding, include a category tag on the line immediately after the heading:

### [CONCERN] Finding title
category: error-handling

You may also include a location tag:

### [CONCERN] Finding title
category: error-handling
location: src/module.py:45

Valid severity levels: PASS, NOTE, CONCERN, FAIL

Use NOTE for informational observations that don't require action.
Use CONCERN for issues that should be addressed but don't block progress.
Use FAIL for issues that must be fixed before proceeding.


## Additional Review Rules

---
description:   TypeScript strict typing standards, idiomatic patterns, and project conventions. Use for all TypeScript files. Covers type annotations, generics, module patterns, and error handling.
paths: 
  - "**/*.ts"
  - "**/*.tsx"
---

### TypeScript Rules

#### Core Principles

TypeScript's type system is a **compile-time safety net**. The goal is to catch errors before runtime. Every `any` is a hole in that net. Every untyped function boundary is a place where bugs can hide. Write types that make illegal states unrepresentable.

#### Strict Mode & the `any` Ban

- **Strict mode is mandatory.** `tsconfig.json` must include `"strict": true`.
- **`any` is forbidden.** This is not a suggestion. Do not use `any` in type annotations, return types, generic parameters, or type assertions (`as any`).
  - If you are tempted to use `any`, stop and determine the actual type.
  - If the type is complex, define an interface or type alias.
  - If you are working with truly unknown data (e.g., parsing JSON, external API responses), use `unknown` and narrow with type guards.
  - If a library's types are incomplete, write a declaration file (`.d.ts`) rather than using `any`.
- **`as` type assertions are a code smell.** Prefer type guards, discriminated unions, or generics. If you must assert, document why in a comment.

##### When You Encounter `any` in Existing Code

If you encounter `any` in code you are modifying, **replace it** with a proper type as part of your change. Do not propagate `any` to new code. If the fix is non-trivial and outside the scope of your current task, add a `// TODO: Replace any — see [reason]` comment and flag it.

#### Type Design Patterns

##### Discriminated Unions Over String Checks

Use discriminated unions (tagged unions) instead of runtime string matching to distinguish between variants. The compiler enforces exhaustiveness.

```typescript
// GOOD — compiler-enforced, exhaustive
type TemplateExpression =
  | { kind: 'simple'; variableName: string }
  | { kind: 'pipe'; parts: string[] }
  | { kind: 'conditional'; variable: string; trueContent: string; falseContent: string };

function evaluate(expr: TemplateExpression): string {
  switch (expr.kind) {
    case 'simple': return lookupVariable(expr.variableName);
    case 'pipe': return processPipe(expr.parts);
    case 'conditional': return expr.variable ? expr.trueContent : expr.falseContent;
    // TypeScript errors if a case is missing
  }
}

// BAD — runtime guessing, no compiler help
function evaluate(expression: string): string {
  if (expression.includes(' | ')) { /* ... */ }
  else if (expression.startsWith('#if')) { /* ... */ }
  else { /* ... */ }
}
```

##### Use `unknown` Instead of `any` for Untyped Data

When data shape is not known at compile time, use `unknown` and narrow:

```typescript
// GOOD
function parseConfig(raw: unknown): ProjectConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Config must be an object');
  }
  // Narrow further or use a validation library (Zod, etc.)
}

// BAD
function parseConfig(raw: any): ProjectConfig {
  return raw; // no safety at all
}
```

##### Index Signatures and Record Types

When you need dynamic keys, be explicit about the value type:

```typescript
// GOOD — clear contract
type TemplateVariables = Record<string, string | number | boolean>;

// GOOD — when you need to distinguish known from dynamic keys
interface EnhancedContextData extends ContextData {
  [computedKey: string]: string | number | boolean | undefined;
}

// BAD — erases all type information
const data: any = { ...baseData };
```

##### Prefer Interfaces for Object Shapes, Type Aliases for Unions

```typescript
// Interfaces — extendable, good for object shapes
interface ProjectConfig {
  name: string;
  version: string;
}

// Type aliases — good for unions, intersections, mapped types
type BuildTarget = 'electron' | 'mcp-server' | 'core';
type Nullable<T> = T | null;
```

##### Const Assertions and Literal Types

Prefer `as const` objects over TypeScript enums:

```typescript
// GOOD
const LogLevel = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;

type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
// Result: 'debug' | 'info' | 'warn' | 'error'

// AVOID — TypeScript enums have runtime behavior and quirks
enum LogLevel { Debug, Info, Warn, Error }
```

#### Function Signatures

- **Always annotate return types on exported functions.** TypeScript can infer return types, but explicit annotations catch accidental changes and serve as documentation.
- **Use `readonly` for parameters that should not be mutated.**
- **Prefer named parameters (via object destructuring) when a function takes 3+ parameters.**

```typescript
// GOOD
export function buildContext(
  config: Readonly<ProjectConfig>,
  options: { includeMetadata: boolean; format: OutputFormat }
): ContextResult { /* ... */ }

// BAD — positional params are hard to read at call sites
export function buildContext(
  config: ProjectConfig, includeMetadata: boolean, format: string
) { /* ... */ }
```

#### Generics

Use generics to write reusable code without losing type information:

```typescript
// GOOD — caller gets back the type they put in
function getOrDefault<T>(map: Map<string, T>, key: string, fallback: T): T {
  return map.get(key) ?? fallback;
}

// BAD — type information lost
function getOrDefault(map: Map<string, any>, key: string, fallback: any): any {
  return map.get(key) ?? fallback;
}
```

Constrain generics when appropriate:

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

#### Error Handling

- Type your errors. Use discriminated unions for expected error cases rather than throwing strings.
- Use `Result` patterns for operations that can fail predictably:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

- Catch blocks: the caught value is `unknown` in strict mode. Narrow before using:

```typescript
try { /* ... */ } catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  // ...
}
```

#### Project Structure Conventions

- Shared types go in `packages/core/src/types/` (for the monorepo) or `src/lib/types.ts` (for single-package projects).
- Use `tsx` scripts for migrations.
- Reusable logic in `src/lib/utils/shared.ts` or `src/lib/utils/server.ts`.

##### tRPC Routers (when enabled)

- Routers in `src/lib/api/routers`, composed in `src/lib/api/root.ts`.
- Use `publicProcedure` or `protectedProcedure` with Zod for input validation.
- Access from React via `@/lib/trpc/react`.

#### Naming Conventions

- **Types/Interfaces**: PascalCase (`ProjectConfig`, `TemplateExpression`)
- **Variables/Functions**: camelCase (`processTemplate`, `enhancedData`)
- **Constants**: UPPER_SNAKE_CASE for true constants, camelCase for const references
- **Type parameters**: Single uppercase letter for simple cases (`T`, `K`), descriptive PascalCase for complex ones (`TInput`, `TOutput`)
- **Files**: kebab-case (`template-processor.ts`, `context-data.ts`)

#### Advanced Patterns (Use When Appropriate)

These are powerful but add complexity. Use them when they genuinely improve safety or DX, not for their own sake.

##### Conditional Types

Extract or transform types based on conditions:

```typescript
// Extract only the string-valued keys from a type
type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
```

##### Mapped Types

Transform all properties of a type systematically:

```typescript
// Make all properties optional and nullable
type Draft<T> = {
  [K in keyof T]?: T[K] | null;
};
```

##### Template Literal Types

Useful for string patterns:

```typescript
type EventName = `on${Capitalize<string>}`;
type CSSProperty = `--${string}`;
```

#### Quick Reference: What to Use Instead of `any`

| Situation | Use Instead |
|---|---|
| Unknown JSON data | `unknown` + type guard or Zod |
| Object with dynamic keys | `Record<string, ValueType>` |
| Function that works on multiple types | Generics (`<T>`) |
| Third-party lib with bad types | Declaration file (`.d.ts`) |
| Spread into a new shape | Define the target interface explicitly |
| Callback with unknown signature | `(...args: unknown[]) => unknown` |
| "I'll figure out the type later" | `// TODO:` with `unknown`, never `any` |

### User Prompt

Review code in the project at: /Users/manta/source/repos/manta/context-forge

Run `git diff 1976437^1..1976437^2 -- . ':!*.md' ':!*.yaml' ':!*.yml' ':!*.toml' ':!*.json' ':!*.txt' ':!*.lock' ':!*.csv' ':!*.svg' ':!*.png' ':!*.jpg' ':!*.gif' ':!*.ico'` to identify changed source files, then review those files for quality and correctness.

Apply the project conventions from CLAUDE.md and language-specific best practices. Report your findings using the severity format described in your instructions.

## File Contents

### Git Diff

```
diff --git a/packages/cli/src/commands/check.ts b/packages/cli/src/commands/check.ts
index 18a7c9b..271e5dc 100644
--- a/packages/cli/src/commands/check.ts
+++ b/packages/cli/src/commands/check.ts
@@ -9,6 +9,7 @@ import {
   detectDocuments,
   updateFrontmatterField,
 } from '@context-forge/core/node';
+import { formatDateProject } from '@context-forge/core';
 import type {
   ConsistencyCheckResult,
   ConsistencyFixResult,
@@ -155,7 +156,7 @@ async function setReviewNoneAction(indexArg: string, opts: CheckOpts): Promise<v
   }
 
   const filePath = join(project.projectPath, docs.sliceDesign);
-  const entry = await updateFrontmatterField(filePath, 'review', 'none');
+  const entry = await updateFrontmatterField(filePath, 'review', 'none', formatDateProject());
 
   if (opts.json) {
     printJson({ slice: index, filePath: docs.sliceDesign, field: 'review', before: entry.before, after: entry.after });
diff --git a/packages/cli/src/commands/validate.ts b/packages/cli/src/commands/validate.ts
new file mode 100644
index 0000000..74937d8
--- /dev/null
+++ b/packages/cli/src/commands/validate.ts
@@ -0,0 +1,183 @@
+import { Command } from 'commander';
+import {
+  FileProjectStore,
+  validateFrontmatterFiles,
+  updateFrontmatterField,
+} from '@context-forge/core/node';
+import { formatDateProject } from '@context-forge/core';
+import type { FrontmatterFinding } from '@context-forge/core';
+import { resolveProjectWorktree } from '../utils/project.js';
+import { withJsonOption, withProjectOption, withFixOption } from '../options.js';
+import { handleError, UserError } from '../utils/errors.js';
+import { printJson } from '../output/formatter.js';
+import { label, dim, error as errorStyle, warn as warnStyle } from '../output/styles.js';
+
+const SEVERITY_ICON: Record<string, string> = {
+  error: '✗',
+  warning: '⚠',
+};
+
+interface ValidateFrontmatterOpts {
+  json?: boolean;
+  project?: string;
+  fix?: boolean;
+}
+
+interface FixLogRecord {
+  filePath: string;
+  field: string;
+  before: string;
+  after: string;
+}
+
+/** Group findings by file path, preserving first-seen order. */
+function groupByFile(findings: FrontmatterFinding[]): Map<string, FrontmatterFinding[]> {
+  const groups = new Map<string, FrontmatterFinding[]>();
+  for (const finding of findings) {
+    const group = groups.get(finding.filePath) ?? [];
+    group.push(finding);
+    groups.set(finding.filePath, group);
+  }
+  return groups;
+}
+
+function printHumanOutput(
+  findings: FrontmatterFinding[],
+  filesChecked: number,
+  fixLog: FixLogRecord[],
+  fixErrors: string[],
+): void {
+  console.log(label('Frontmatter Validation'));
+  console.log('');
+
+  if (findings.length === 0) {
+    console.log(`  No inconsistencies found (${filesChecked} file${filesChecked !== 1 ? 's' : ''} checked)`);
+    return;
+  }
+
+  const groups = groupByFile(findings);
+  for (const [filePath, fileFindings] of groups) {
+    console.log(label(`  ${filePath}`));
+    for (const finding of fileFindings) {
+      const icon = SEVERITY_ICON[finding.severity] ?? '?';
+      const colorFn = finding.severity === 'error' ? errorStyle : warnStyle;
+      console.log(colorFn(`    ${icon} ${finding.description}`));
+
+      const logEntry = fixLog.find((e) => e.filePath === filePath && e.field === finding.fixAction?.field);
+      if (logEntry) {
+        console.log(dim(`      → Fixed: ${logEntry.before} → ${logEntry.after}`));
+      }
+    }
+    console.log('');
+  }
+
+  const summary = `${findings.length} finding${findings.length !== 1 ? 's' : ''} across ${groups.size} file${groups.size !== 1 ? 's' : ''} (${filesChecked} checked)`;
+  console.log(dim(summary));
+
+  if (fixLog.length > 0) {
+    console.log(label(`Fixed ${fixLog.length} of ${findings.length} findings`));
+  }
+  if (fixErrors.length > 0) {
+    for (const err of fixErrors) {
+      console.log(errorStyle(`  Fix error: ${err}`));
+    }
+  }
+}
+
+async function validateFrontmatterAction(paths: string[], opts: ValidateFrontmatterOpts): Promise<void> {
+  const store = new FileProjectStore();
+  const { id } = await resolveProjectWorktree({ project: opts.project }, store);
+  const project = await store.getById(id);
+
+  if (!project) {
+    throw new UserError(`Project not found: '${id}'. Run cf project list to see available projects.`);
+  }
+  if (!project.projectPath) {
+    throw new UserError('No projectPath configured. Set one with: cf set projectPath /path/to/project');
+  }
+
+  const { findings, filesChecked } = await validateFrontmatterFiles(
+    project.projectPath,
+    paths.length > 0 ? paths : undefined,
+    { projectName: project.name },
+  );
+
+  const fixLog: FixLogRecord[] = [];
+  const fixErrors: string[] = [];
+  let remaining = findings;
+
+  if (opts.fix) {
+    const dateStamp = formatDateProject();
+    const stillBroken: FrontmatterFinding[] = [];
+
+    for (const finding of findings) {
+      if (!finding.fixAction) {
+        stillBroken.push(finding);
+        continue;
+      }
+      try {
+        const entry = await updateFrontmatterField(
+          finding.filePath,
+          finding.fixAction.field,
+          finding.fixAction.value,
+          dateStamp,
+        );
+        fixLog.push({ filePath: finding.filePath, field: finding.fixAction.field, before: entry.before, after: entry.after });
+      } catch (err) {
+        const msg = err instanceof Error ? err.message : String(err);
+        fixErrors.push(`Fix failed for ${finding.filePath} (${finding.fixAction.field}): ${msg}`);
+        stillBroken.push(finding);
+      }
+    }
+
+    remaining = stillBroken;
+  }
+
+  if (opts.json) {
+    const jsonOutput: Record<string, unknown> = {
+      filesChecked,
+      totalFindings: findings.length,
+      errors: findings.filter((f) => f.severity === 'error').length,
+      warnings: findings.filter((f) => f.severity === 'warning').length,
+      findings,
+    };
+    if (opts.fix) {
+      jsonOutput.fixed = fixLog.length;
+      jsonOutput.fixLog = fixLog;
+      jsonOutput.fixErrors = fixErrors;
+    }
+    printJson(jsonOutput);
+  } else {
+    printHumanOutput(findings, filesChecked, fixLog, fixErrors);
+  }
+
+  if (remaining.length > 0 || fixErrors.length > 0) {
+    process.exitCode = 1;
+  }
+}
+
+export function registerValidateCommand(program: Command): void {
+  const validateCmd = program
+    .command('validate')
+    .description('Validate project artifacts against their machine-readable schemas');
+
+  const frontmatterCmd = validateCmd
+    .command('frontmatter [paths...]')
+    .description(
+      'Validate YAML frontmatter against per-docType schema. ' +
+        'With no paths, walks all methodology documents; with paths, validates only ' +
+        'the in-root .md files among them (others are silently skipped). ' +
+        'Unlike cf check --fix, --fix here applies without a confirmation prompt — ' +
+        'findings are per-document and deterministic, and this command is meant for scripts.',
+    );
+  withJsonOption(frontmatterCmd);
+  withProjectOption(frontmatterCmd);
+  withFixOption(frontmatterCmd);
+  frontmatterCmd.action(async (paths: string[], opts: ValidateFrontmatterOpts) => {
+    try {
+      await validateFrontmatterAction(paths, opts);
+    } catch (err) {
+      handleError(err, 2);
+    }
+  });
+}
diff --git a/packages/cli/src/index.ts b/packages/cli/src/index.ts
index 50d74eb..52fc409 100644
--- a/packages/cli/src/index.ts
+++ b/packages/cli/src/index.ts
@@ -19,6 +19,7 @@ import { registerInitCommand } from './commands/init.js';
 import { registerInstallCommandsCommand, registerUninstallCommandsCommand } from './commands/commandInstaller.js';
 import { registerSetupIdeCommand } from './commands/setup-ide.js';
 import { registerUpdateCommand } from './commands/update.js';
+import { registerValidateCommand } from './commands/validate.js';
 import { handleError, setJsonMode } from './utils/errors.js';
 import { buildCommandCatalog } from './utils/commandCatalog.js';
 import { BREAKING_CHANGES } from './utils/breaking-changes.js';
@@ -52,6 +53,7 @@ registerNextCommand(program);
 registerProjectCommand(program);
 registerPromptCommand(program);
 registerStatusCommand(program);
+registerValidateCommand(program);
 
 // Top-level shortcuts for project get/set/unset
 const getCmd = program
diff --git a/packages/cli/src/utils/errors.ts b/packages/cli/src/utils/errors.ts
index 73cceab..f5a18cc 100644
--- a/packages/cli/src/utils/errors.ts
+++ b/packages/cli/src/utils/errors.ts
@@ -39,11 +39,11 @@ export function isJsonMode(): boolean {
 }
 
 /**
- * Top-level error handler. Prints the message and exits with code 1.
+ * Top-level error handler. Prints the message and exits with the given code.
  * In JSON mode, outputs structured JSON to stderr.
  * Otherwise, UserErrors get a clean message; unexpected errors get a brief summary.
  */
-export function handleError(err: unknown): never {
+export function handleError(err: unknown, exitCode = 1): never {
   if (isJsonMode()) {
     const jsonError: Record<string, unknown> = { error: true };
     if (err instanceof UserError) {
@@ -68,5 +68,5 @@ export function handleError(err: unknown): never {
       console.error(`Error: ${String(err)}`);
     }
   }
-  process.exit(1);
+  process.exit(exitCode);
 }
diff --git a/packages/cli/tests/commands/check.test.ts b/packages/cli/tests/commands/check.test.ts
index 4ae6437..e14d649 100644
--- a/packages/cli/tests/commands/check.test.ts
+++ b/packages/cli/tests/commands/check.test.ts
@@ -317,6 +317,7 @@ describe('cf check --set-review-none', () => {
       expect.stringContaining('100-slice.auth.md'),
       'review',
       'none',
+      expect.any(String),
     );
     // Must never touch the checker/fix pipeline — this is a direct mutation.
     expect(mockCheck).not.toHaveBeenCalled();
diff --git a/packages/cli/tests/commands/validate.test.ts b/packages/cli/tests/commands/validate.test.ts
new file mode 100644
index 0000000..f7c3470
--- /dev/null
+++ b/packages/cli/tests/commands/validate.test.ts
@@ -0,0 +1,206 @@
+import { describe, it, expect, vi, beforeEach } from 'vitest';
+import { Command } from 'commander';
+import { registerValidateCommand } from '../../src/commands/validate.js';
+
+const mockGetAll = vi.fn();
+const mockGetById = vi.fn();
+const mockValidateFrontmatterFiles = vi.fn();
+const mockUpdateFrontmatterField = vi.fn();
+
+vi.mock('@context-forge/core/node', () => ({
+  FileProjectStore: vi.fn().mockImplementation(() => ({
+    getAll: mockGetAll,
+    getById: mockGetById,
+  })),
+  validateFrontmatterFiles: (...args: unknown[]) => mockValidateFrontmatterFiles(...args),
+  updateFrontmatterField: (...args: unknown[]) => mockUpdateFrontmatterField(...args),
+}));
+
+const sampleProject = {
+  id: 'proj_001',
+  name: 'test-project',
+  fileSlice: '100-slice.auth',
+  fileTasks: '100-tasks.auth',
+  projectPath: '/tmp/test',
+};
+
+const cleanResult = { findings: [], filesChecked: 3 };
+
+const statusFinding = {
+  rule: 'frontmatter-schema',
+  severity: 'warning' as const,
+  filePath: '/tmp/test/project-documents/user/slices/100-slice.auth.md',
+  description: "Invalid value 'in-progress' for field 'status' (will fix to 'in_progress')",
+  fixAction: { type: 'update-frontmatter', field: 'status', value: 'in_progress' },
+};
+
+const unfixableFinding = {
+  rule: 'frontmatter-schema',
+  severity: 'warning' as const,
+  filePath: '/tmp/test/project-documents/user/slices/200-slice.other.md',
+  description: "Missing required field 'project'",
+};
+
+function createProgram(): Command {
+  const program = new Command();
+  program.exitOverride();
+  registerValidateCommand(program);
+  return program;
+}
+
+describe('cf validate frontmatter', () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetAll.mockResolvedValue([sampleProject]);
+    mockGetById.mockResolvedValue(sampleProject);
+    vi.spyOn(console, 'log').mockImplementation(() => {});
+    vi.spyOn(console, 'error').mockImplementation(() => {});
+    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
+    process.exitCode = undefined;
+  });
+
+  it('a clean run exits 0', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);
+
+    expect(process.exitCode).toBeUndefined();
+    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
+    expect(output).toContain('No inconsistencies found');
+  });
+
+  it('findings present without --fix exits 1', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);
+
+    expect(process.exitCode).toBe(1);
+    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
+  });
+
+  it('an unresolvable project exits 2', async () => {
+    mockGetAll.mockResolvedValue([]);
+    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'nope']);
+
+    expect(exitSpy).toHaveBeenCalledWith(2);
+  });
+
+  it('--fix that resolves everything exits 0', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
+    mockUpdateFrontmatterField.mockResolvedValue({
+      rule: '',
+      action: 'update-frontmatter',
+      filePath: statusFinding.filePath,
+      field: 'status',
+      before: 'in-progress',
+      after: 'in_progress',
+    });
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);
+
+    expect(process.exitCode).toBeUndefined();
+    expect(mockUpdateFrontmatterField).toHaveBeenCalledWith(
+      statusFinding.filePath,
+      'status',
+      'in_progress',
+      expect.any(String),
+    );
+    // The composed guarantee (#71 + #73): --fix must stamp dateUpdated with
+    // the run's date via the fourth argument to updateFrontmatterField.
+    const dateStampArg = mockUpdateFrontmatterField.mock.calls[0][3];
+    expect(dateStampArg).toMatch(/^\d{8}$/);
+  });
+
+  it('--fix with a fix failure exits 1 and reports the failure', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
+    mockUpdateFrontmatterField.mockRejectedValue(new Error('Permission denied'));
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);
+
+    expect(process.exitCode).toBe(1);
+    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
+    expect(output).toContain('Permission denied');
+  });
+
+  it('a finding without a fixAction remains unfixed after --fix and exits 1', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [unfixableFinding], filesChecked: 1 });
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);
+
+    expect(process.exitCode).toBe(1);
+    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
+  });
+
+  it('--json emits the documented shape with filesChecked and findings', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 5 });
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--json']);
+
+    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
+    const parsed = JSON.parse(raw);
+    expect(parsed.filesChecked).toBe(5);
+    expect(parsed.totalFindings).toBe(1);
+    expect(parsed.warnings).toBe(1);
+    expect(parsed.errors).toBe(0);
+    expect(parsed.findings).toHaveLength(1);
+    expect(parsed.findings[0].filePath).toBe(statusFinding.filePath);
+  });
+
+  it('--json in fix mode includes fixed, fixLog, and fixErrors', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
+    mockUpdateFrontmatterField.mockResolvedValue({
+      rule: '',
+      action: 'update-frontmatter',
+      filePath: statusFinding.filePath,
+      field: 'status',
+      before: 'in-progress',
+      after: 'in_progress',
+    });
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix', '--json']);
+
+    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
+    const parsed = JSON.parse(raw);
+    expect(parsed.fixed).toBe(1);
+    expect(parsed.fixLog).toHaveLength(1);
+    expect(parsed.fixErrors).toEqual([]);
+  });
+
+  it('forwards explicit paths to the service unchanged', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);
+
+    const program = createProgram();
+    await program.parseAsync([
+      'node', 'cf', 'validate', 'frontmatter', 'a.md', 'b.md', '--project', 'proj_001',
+    ]);
+
+    expect(mockValidateFrontmatterFiles).toHaveBeenCalledWith(
+      sampleProject.projectPath,
+      ['a.md', 'b.md'],
+      { projectName: sampleProject.name },
+    );
+  });
+
+  it('passes undefined paths to the service when none are given', async () => {
+    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);
+
+    const program = createProgram();
+    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);
+
+    expect(mockValidateFrontmatterFiles).toHaveBeenCalledWith(
+      sampleProject.projectPath,
+      undefined,
+      { projectName: sampleProject.name },
+    );
+  });
+});
diff --git a/packages/core/src/introspection/ConsistencyChecker.ts b/packages/core/src/introspection/ConsistencyChecker.ts
index f1ddb9d..f221569 100644
--- a/packages/core/src/introspection/ConsistencyChecker.ts
+++ b/packages/core/src/introspection/ConsistencyChecker.ts
@@ -4,6 +4,7 @@ import { readdir } from 'node:fs/promises';
 import type { ProjectData } from '../types/project.js';
 import type { WorktreeInfo } from '../types/git.js';
 import { validateFrontmatter } from '../schema/frontmatterSchema.js';
+import { discoverAllDocuments } from '../schema/frontmatterFileValidator.js';
 import type { IArtifactIntrospector } from './interfaces.js';
 import { STATUS } from './types.js';
 import { normalizeStatus } from './parsers/statusNormalizer.js';
@@ -18,6 +19,7 @@ import type {
 } from './types.js';
 import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
 import { updateCheckbox, updateFrontmatterField } from './writers/markdownWriter.js';
+import { formatDateProject } from '../project-defaults.js';
 import { resolveInitiativePlanPath } from './ArtifactIntrospector.js';
 import type { ConfigManager } from '../config/ConfigManager.js';
 import { CONFIG_KEYS, ConfigScope } from '../config/ConfigKeys.js';
@@ -205,7 +207,10 @@ export class ConsistencyChecker {
   }
 
   /** Apply fixes to a check result — shared by fix() and fixAll(). */
-  async applyFixes(checkResult: ConsistencyCheckResult): Promise<ConsistencyFixResult> {
+  async applyFixes(
+    checkResult: ConsistencyCheckResult,
+    dateStamp: string = formatDateProject()
+  ): Promise<ConsistencyFixResult> {
     const fixLog: ConsistencyFixResult['fixLog'] = [];
     const fixErrors: string[] = [];
     let fixed = 0;
@@ -225,7 +230,7 @@ export class ConsistencyChecker {
           fixed++;
         } else if (finding.fixAction.type === 'update-frontmatter') {
           const { key, value } = finding.fixAction.detail as { key: string; value: string };
-          const entry = await updateFrontmatterField(finding.fixAction.filePath, key, value);
+          const entry = await updateFrontmatterField(finding.fixAction.filePath, key, value, dateStamp);
           entry.rule = finding.rule;
           fixLog.push(entry);
           fixed++;
@@ -1111,42 +1116,21 @@ export class ConsistencyChecker {
 
   // --- Document-wide rules ---
 
-  /** Directories under project-documents/user/ to scan for methodology documents. */
-  private static readonly DOC_SCAN_DIRS = [
-    'architecture',
-    'slices',
-    'tasks',
-    'project-guides',
-    'reviews',
-    'analysis',
-  ];
-
-  /** Discover all .md documents across methodology directories. */
-  private async discoverAllDocuments(projectPath: string): Promise<string[]> {
-    const userDir = join(projectPath, 'project-documents/user');
-    const allPaths: string[] = [];
-
-    for (const subdir of ConsistencyChecker.DOC_SCAN_DIRS) {
-      const dir = join(userDir, subdir);
-      try {
-        const files = await readdir(dir);
-        for (const f of files) {
-          if (f.endsWith('.md')) {
-            allPaths.push(join(dir, f));
-          }
-        }
-      } catch {
-        // Directory may not exist — skip
-      }
-    }
-
-    return allPaths;
-  }
-
-  /** Rule 12: Validate frontmatter against per-docType schema. */
+  /**
+   * Rule 12: Validate frontmatter against per-docType schema.
+   *
+   * Discovery (DOC_SCAN_DIRS / discoverAllDocuments) is shared with the
+   * standalone `validateFrontmatterFiles` service (`cf validate frontmatter`).
+   * Per-file parsing here goes through the injected `IArtifactIntrospector`
+   * rather than calling into the service directly, so this rule stays
+   * testable via dependency injection like every other rule in this class;
+   * `ArtifactIntrospector.parseFrontmatter` is a pass-through to the same
+   * underlying `frontmatterParser` the service uses, so results are
+   * identical in production.
+   */
   private async ruleFrontmatterSchema(projectPath: string, projectName?: string): Promise<ConsistencyFinding[]> {
     const findings: ConsistencyFinding[] = [];
-    const documents = await this.discoverAllDocuments(projectPath);
+    const documents = await discoverAllDocuments(projectPath);
 
     for (const docPath of documents) {
       let fm;
diff --git a/packages/core/src/introspection/writers/markdownWriter.ts b/packages/core/src/introspection/writers/markdownWriter.ts
index bc69018..5ab81b0 100644
--- a/packages/core/src/introspection/writers/markdownWriter.ts
+++ b/packages/core/src/introspection/writers/markdownWriter.ts
@@ -46,34 +46,34 @@ export async function updateCheckbox(
 }
 
 /**
- * Update a YAML frontmatter field value in a markdown file.
- * Finds the key in the frontmatter block and replaces its value.
+ * Locate the closing `---` of a YAML frontmatter block.
+ * Throws if the file has no opening or closing delimiter.
  */
-export async function updateFrontmatterField(
-  filePath: string,
-  key: string,
-  value: string
-): Promise<FixLogEntry> {
-  const content = await readFile(filePath, 'utf-8');
-  const lines = content.split('\n');
-
+function findFrontmatterBounds(lines: string[], filePath: string): number {
   if (lines.length === 0 || lines[0].trim() !== '---') {
     throw new Error(`File does not contain YAML frontmatter: ${filePath}`);
   }
 
-  let closingIndex = -1;
   for (let i = 1; i < lines.length; i++) {
     if (lines[i].trim() === '---') {
-      closingIndex = i;
-      break;
+      return i;
     }
   }
 
-  if (closingIndex === -1) {
-    throw new Error(`Frontmatter not closed in: ${filePath}`);
-  }
+  throw new Error(`Frontmatter not closed in: ${filePath}`);
+}
 
-  // Find the key within frontmatter bounds
+/**
+ * Replace a key's value within the frontmatter bounds, inserting it before
+ * the closing `---` if absent. Mutates `lines` in place and returns the
+ * previous value (empty string if the key was inserted new).
+ */
+function setFrontmatterField(
+  lines: string[],
+  closingIndex: number,
+  key: string,
+  value: string
+): { before: string; closingIndex: number } {
   let keyLineIndex = -1;
   let beforeValue = '';
   for (let i = 1; i < closingIndex; i++) {
@@ -100,15 +100,7 @@ export async function updateFrontmatterField(
   if (keyLineIndex === -1) {
     // Key doesn't exist — insert before closing ---
     lines.splice(closingIndex, 0, `${key}: ${value}`);
-    await writeFile(filePath, lines.join('\n'), 'utf-8');
-    return {
-      rule: '',
-      action: 'update-frontmatter',
-      filePath,
-      field: key,
-      before: '',
-      after: value,
-    };
+    return { before: '', closingIndex: closingIndex + 1 };
   }
 
   // Replace the value, preserving the key and any leading whitespace
@@ -116,6 +108,37 @@ export async function updateFrontmatterField(
   const colonIdx = originalLine.indexOf(':');
   lines[keyLineIndex] = originalLine.slice(0, colonIdx + 1) + ' ' + value;
 
+  return { before: beforeValue, closingIndex };
+}
+
+/**
+ * Update a YAML frontmatter field value in a markdown file, and stamp
+ * `dateUpdated` with the write date (unless `key` itself is `dateUpdated`,
+ * in which case the caller's write is the stamp and no double-write occurs).
+ */
+export async function updateFrontmatterField(
+  filePath: string,
+  key: string,
+  value: string,
+  dateUpdated: string
+): Promise<FixLogEntry> {
+  const content = await readFile(filePath, 'utf-8');
+  const lines = content.split('\n');
+
+  let closingIndex = findFrontmatterBounds(lines, filePath);
+
+  const { before, closingIndex: closingIndexAfterField } = setFrontmatterField(
+    lines,
+    closingIndex,
+    key,
+    value
+  );
+  closingIndex = closingIndexAfterField;
+
+  if (key !== 'dateUpdated') {
+    setFrontmatterField(lines, closingIndex, 'dateUpdated', dateUpdated);
+  }
+
   await writeFile(filePath, lines.join('\n'), 'utf-8');
 
   return {
@@ -123,7 +146,7 @@ export async function updateFrontmatterField(
     action: 'update-frontmatter',
     filePath,
     field: key,
-    before: beforeValue,
+    before,
     after: value,
   };
 }
diff --git a/packages/core/src/node.ts b/packages/core/src/node.ts
index 26cbdfb..2c7f3c3 100644
--- a/packages/core/src/node.ts
+++ b/packages/core/src/node.ts
@@ -19,6 +19,12 @@ export * from './guides/index.js';
 // Schema — fs-dependent helpers (index-based file resolution)
 export { resolveFileByIndex, resolveArtifactPath, deriveArtifactStem, resolveSlicePlanPathByIndex } from './schema/resolveFileByIndex.js';
 export { normalizeArtifactValue } from './schema/normalizeArtifactValue.js';
+export {
+  validateFrontmatterFiles,
+  discoverAllDocuments,
+  DOC_SCAN_DIRS,
+  type FrontmatterFileValidationResult,
+} from './schema/frontmatterFileValidator.js';
 
 // Introspection — artifact parsing and document detection (fs dependent)
 export { ArtifactIntrospector, resolveInitiativePlanPath } from './introspection/ArtifactIntrospector.js';
diff --git a/packages/core/src/schema/frontmatterFileValidator.ts b/packages/core/src/schema/frontmatterFileValidator.ts
new file mode 100644
index 0000000..9f8f825
--- /dev/null
+++ b/packages/core/src/schema/frontmatterFileValidator.ts
@@ -0,0 +1,101 @@
+import { join, resolve, relative, isAbsolute } from 'node:path';
+import { readdir } from 'node:fs/promises';
+import { existsSync } from 'node:fs';
+import { validateFrontmatter, type FrontmatterFinding } from './frontmatterSchema.js';
+import { parseFrontmatter } from '../introspection/parsers/frontmatterParser.js';
+
+/** Directories under project-documents/user/ to scan for methodology documents. */
+export const DOC_SCAN_DIRS = [
+  'architecture',
+  'slices',
+  'tasks',
+  'project-guides',
+  'reviews',
+  'analysis',
+];
+
+export interface FrontmatterFileValidationResult {
+  findings: FrontmatterFinding[];
+  filesChecked: number;
+}
+
+/** Discover all .md documents across the methodology scan directories. */
+export async function discoverAllDocuments(projectPath: string): Promise<string[]> {
+  const userDir = join(projectPath, 'project-documents/user');
+  const allPaths: string[] = [];
+
+  for (const subdir of DOC_SCAN_DIRS) {
+    const dir = join(userDir, subdir);
+    try {
+      const files = await readdir(dir);
+      for (const f of files) {
+        if (f.endsWith('.md')) {
+          allPaths.push(join(dir, f));
+        }
+      }
+    } catch {
+      // Directory may not exist — skip
+    }
+  }
+
+  return allPaths;
+}
+
+/**
+ * Resolve an explicit path list to the in-root, existing .md files it
+ * contains. Everything else — out-of-root, non-.md, nonexistent — is
+ * silently skipped (a staged-file list legitimately contains deletions).
+ * Containment is checked against the document root, not the scan-dir list,
+ * so a file under e.g. user/notes/ is kept even though the default walk
+ * would not visit it.
+ */
+function resolveExplicitPaths(paths: string[], documentRoot: string): string[] {
+  const resolvedRoot = resolve(documentRoot);
+  const kept: string[] = [];
+
+  for (const p of paths) {
+    if (!p.endsWith('.md')) continue;
+    const absolute = isAbsolute(p) ? p : resolve(process.cwd(), p);
+    const rel = relative(resolvedRoot, absolute);
+    if (rel.startsWith('..') || isAbsolute(rel)) continue;
+    if (!existsSync(absolute)) continue;
+    kept.push(absolute);
+  }
+
+  return kept;
+}
+
+/**
+ * Validate frontmatter across a project's methodology documents.
+ *
+ * No paths: walks the six scan directories under project-documents/user/,
+ * exactly as `cf check` Rule 12 does.
+ * Explicit paths: kept only if they resolve to an existing .md file inside
+ * the document root (project-documents/user/); everything else is silently
+ * skipped.
+ * Files whose frontmatter is absent or unparseable are skipped (matching
+ * Rule 12) and are not counted in filesChecked.
+ */
+export async function validateFrontmatterFiles(
+  projectPath: string,
+  paths?: string[],
+  options?: { projectName?: string },
+): Promise<FrontmatterFileValidationResult> {
+  const documentRoot = join(projectPath, 'project-documents/user');
+  const documents = paths
+    ? resolveExplicitPaths(paths, documentRoot)
+    : await discoverAllDocuments(projectPath);
+
+  const findings: FrontmatterFinding[] = [];
+  let filesChecked = 0;
+
+  for (const docPath of documents) {
+    const fm = await parseFrontmatter(docPath);
+    if (!fm.found) continue;
+
+    filesChecked++;
+    findings.push(...validateFrontmatter(docPath, fm.data, { projectName: options?.projectName }));
+  }
+
+  return { findings, filesChecked };
+}
diff --git a/packages/core/src/schema/frontmatterSchema.ts b/packages/core/src/schema/frontmatterSchema.ts
index b2f6027..1582767 100644
--- a/packages/core/src/schema/frontmatterSchema.ts
+++ b/packages/core/src/schema/frontmatterSchema.ts
@@ -115,6 +115,30 @@ export const FRONTMATTER_SCHEMAS: Record<string, DocTypeSchema> = {
       dateUpdated: { required: true },
     },
   },
+  // Squadron machine-artifact docTypes (#73): append-only records of a moment
+  // with no lifecycle, so no `status` and no `project`. `dateUpdated` is
+  // deliberately NOT required — a single-file validator has no evidence an
+  // edit occurred after creation, and requiring the field would make the
+  // existing backfill (below) manufacture a false claim by copying
+  // dateCreated into it. Do not "fix" this by adding dateUpdated here.
+  'review-resolution': {
+    fields: {
+      docType: { required: true, values: ['review-resolution'] },
+      dateCreated: { required: true },
+    },
+  },
+  'gate-evidence': {
+    fields: {
+      docType: { required: true, values: ['gate-evidence'] },
+      dateCreated: { required: true },
+    },
+  },
+  devlog: {
+    fields: {
+      docType: { required: true, values: ['devlog'] },
+      dateCreated: { required: true },
+    },
+  },
 };
 
 /** Map filename segment (from NNN-segment.name.md) to docType. */
diff --git a/packages/core/tests/introspection/ConsistencyChecker.applyFixesIntegration.test.ts b/packages/core/tests/introspection/ConsistencyChecker.applyFixesIntegration.test.ts
new file mode 100644
index 0000000..5bc8991
--- /dev/null
+++ b/packages/core/tests/introspection/ConsistencyChecker.applyFixesIntegration.test.ts
@@ -0,0 +1,95 @@
+import { join } from 'node:path';
+import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
+import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
+import type { ProjectData } from '../../src/types/project.js';
+import type { FrontmatterResult } from '../../src/introspection/types.js';
+
+/**
+ * Slice 923 design section B1's central guard, proven end-to-end against the
+ * real (unmocked) writer rather than at the unit level: a document missing
+ * `dateUpdated` but carrying `dateCreated` must, after applyFixes(), end up
+ * with `dateUpdated` equal to its `dateCreated` value — not the run's date
+ * stamp. This is what protects the backfill fixAction from the stamp
+ * clobbering it.
+ */
+
+let tmpDir: string;
+let projectPath: string;
+
+beforeEach(async () => {
+  tmpDir = await mkdtemp(join(tmpdir(), 'cc-applyfixes-'));
+  projectPath = tmpDir;
+});
+
+afterEach(async () => {
+  await rm(tmpDir, { recursive: true, force: true });
+});
+
+function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
+  return {
+    id: 'test-1',
+    name: 'test-project',
+    template: 'default',
+    fileSlice: '900-slice.scratch',
+    fileTasks: undefined,
+    fileSlicePlan: undefined,
+    instruction: 'implementation',
+    createdAt: '2026-01-01',
+    updatedAt: '2026-01-01',
+    projectPath,
+    ...overrides,
+  };
+}
+
+/** Minimal introspector: only parseFrontmatter reads the real file; everything else no-ops. */
+function makeIntrospector(): IArtifactIntrospector {
+  return {
+    parseSlicePlan: async () => ({ filePath: '', entries: [], totalSlices: 0, completedSlices: 0 }),
+    parseTaskFile: async () => ({ filePath: '', items: [], totalTasks: 0, completedTasks: 0 }),
+    parseFrontmatter: async (filePath: string): Promise<FrontmatterResult> => {
+      const content = await readFile(filePath, 'utf-8');
+      const match = content.match(/^---\n([\s\S]*?)\n---/);
+      if (!match) return { filePath, found: false, data: {} };
+      const data: Record<string, string> = {};
+      for (const line of match[1].split('\n')) {
+        const colonIdx = line.indexOf(':');
+        if (colonIdx === -1) continue;
+        data[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
+      }
+      return { filePath, found: true, data };
+    },
+  } as unknown as IArtifactIntrospector;
+}
+
+describe('ConsistencyChecker.applyFixes — dateUpdated stamp integration', () => {
+  it('backfills dateUpdated from dateCreated, not the run date stamp', async () => {
+    const slicesDir = join(projectPath, 'project-documents', 'user', 'slices');
+    await mkdir(slicesDir, { recursive: true });
+    const filePath = join(slicesDir, '900-slice.scratch.md');
+    await writeFile(
+      filePath,
+      '---\ndocType: slice-design\nslice: scratch\nproject: test-project\nstatus: complete\ndateCreated: 20250601\n---\n\n# Scratch\n',
+      'utf-8'
+    );
+
+    const checker = new ConsistencyChecker(makeIntrospector());
+    const project = makeProject();
+    const checkResult = await checker.checkAll(project);
+
+    const finding = checkResult.findings.find(
+      (f) => f.rule === 'frontmatter-schema' && f.fixAction?.detail && (f.fixAction.detail as { key?: string }).key === 'dateUpdated'
+    );
+    expect(finding).toBeDefined();
+
+    // Run date stamp deliberately differs from dateCreated, so the assertion
+    // below is only true if the guard fires — not by coincidence.
+    await checker.applyFixes(checkResult, '20260809');
+
+    const result = await readFile(filePath, 'utf-8');
+    expect(result).toContain('dateUpdated: 20250601');
+    expect(result).not.toContain('dateUpdated: 20260809');
+  });
+});
diff --git a/packages/core/tests/introspection/ConsistencyChecker.test.ts b/packages/core/tests/introspection/ConsistencyChecker.test.ts
index f994bb8..9138cf4 100644
--- a/packages/core/tests/introspection/ConsistencyChecker.test.ts
+++ b/packages/core/tests/introspection/ConsistencyChecker.test.ts
@@ -745,6 +745,19 @@ describe('ConsistencyChecker', () => {
         expect(typeof entry.rule).toBe('string');
       }
     });
+
+    it('applyFixes passes its date stamp through to updateFrontmatterField', async () => {
+      vi.mocked(updateFrontmatterField).mockClear();
+      const checker = new ConsistencyChecker(makeMockIntrospector());
+      const checkResult = await checker.check(makeProject());
+      await checker.applyFixes(checkResult, '20260215');
+
+      const frontmatterCalls = vi.mocked(updateFrontmatterField).mock.calls;
+      expect(frontmatterCalls.length).toBeGreaterThan(0);
+      for (const call of frontmatterCalls) {
+        expect(call[3]).toBe('20260215');
+      }
+    });
   });
 
   describe('checkAll()', () => {
diff --git a/packages/core/tests/introspection/writers/markdownWriter.test.ts b/packages/core/tests/introspection/writers/markdownWriter.test.ts
index f3f37ea..d52afa5 100644
--- a/packages/core/tests/introspection/writers/markdownWriter.test.ts
+++ b/packages/core/tests/introspection/writers/markdownWriter.test.ts
@@ -67,10 +67,10 @@ describe('updateFrontmatterField', () => {
   it('updates an existing field value', async () => {
     const content = '---\nstatus: in-progress\nproject: test\n---\n# Content\n';
     const filePath = await writeTempFile('slice.md', content);
-    const entry = await updateFrontmatterField(filePath, 'status', 'complete');
+    const entry = await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
 
     const result = await readFile(filePath, 'utf-8');
-    expect(result).toBe('---\nstatus: complete\nproject: test\n---\n# Content\n');
+    expect(result).toBe('---\nstatus: complete\nproject: test\ndateUpdated: 20260809\n---\n# Content\n');
     expect(entry.before).toBe('in-progress');
     expect(entry.after).toBe('complete');
     expect(entry.field).toBe('status');
@@ -80,10 +80,10 @@ describe('updateFrontmatterField', () => {
   it('handles quoted values', async () => {
     const content = '---\nname: "My Project"\nstatus: in-progress\n---\n';
     const filePath = await writeTempFile('slice.md', content);
-    const entry = await updateFrontmatterField(filePath, 'name', 'New Name');
+    const entry = await updateFrontmatterField(filePath, 'name', 'New Name', '20260809');
 
     const result = await readFile(filePath, 'utf-8');
-    expect(result).toBe('---\nname: New Name\nstatus: in-progress\n---\n');
+    expect(result).toBe('---\nname: New Name\nstatus: in-progress\ndateUpdated: 20260809\n---\n');
     expect(entry.before).toBe('My Project');
     expect(entry.after).toBe('New Name');
   });
@@ -91,7 +91,7 @@ describe('updateFrontmatterField', () => {
   it('throws when frontmatter is missing', async () => {
     const content = '# No frontmatter here\nJust content.\n';
     const filePath = await writeTempFile('doc.md', content);
-    await expect(updateFrontmatterField(filePath, 'status', 'complete')).rejects.toThrow(
+    await expect(updateFrontmatterField(filePath, 'status', 'complete', '20260809')).rejects.toThrow(
       'does not contain YAML frontmatter'
     );
   });
@@ -99,10 +99,10 @@ describe('updateFrontmatterField', () => {
   it('inserts new key when not found in frontmatter', async () => {
     const content = '---\nproject: test\n---\n# Content\n';
     const filePath = await writeTempFile('slice.md', content);
-    const entry = await updateFrontmatterField(filePath, 'status', 'in-progress');
+    const entry = await updateFrontmatterField(filePath, 'status', 'in-progress', '20260809');
 
     const result = await readFile(filePath, 'utf-8');
-    expect(result).toBe('---\nproject: test\nstatus: in-progress\n---\n# Content\n');
+    expect(result).toBe('---\nproject: test\nstatus: in-progress\ndateUpdated: 20260809\n---\n# Content\n');
     expect(entry.before).toBe('');
     expect(entry.after).toBe('in-progress');
     expect(entry.field).toBe('status');
@@ -111,17 +111,67 @@ describe('updateFrontmatterField', () => {
   it('preserves rest of file', async () => {
     const content = '---\nstatus: in-progress\nproject: test\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n';
     const filePath = await writeTempFile('slice.md', content);
-    await updateFrontmatterField(filePath, 'status', 'complete');
+    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
 
     const result = await readFile(filePath, 'utf-8');
-    expect(result).toBe('---\nstatus: complete\nproject: test\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n');
+    expect(result).toBe(
+      '---\nstatus: complete\nproject: test\ndateUpdated: 20260809\n---\n\n# Title\n\nParagraph one.\n\nParagraph two.\n'
+    );
   });
 
   it('throws when frontmatter is not closed', async () => {
     const content = '---\nstatus: in-progress\nproject: test\n';
     const filePath = await writeTempFile('broken.md', content);
-    await expect(updateFrontmatterField(filePath, 'status', 'complete')).rejects.toThrow(
+    await expect(updateFrontmatterField(filePath, 'status', 'complete', '20260809')).rejects.toThrow(
       'not closed'
     );
   });
+
+  it('replaces an existing dateUpdated line with the stamp', async () => {
+    const content = '---\nstatus: in-progress\ndateUpdated: 20260101\n---\n';
+    const filePath = await writeTempFile('slice.md', content);
+    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
+
+    const result = await readFile(filePath, 'utf-8');
+    expect(result).toBe('---\nstatus: complete\ndateUpdated: 20260809\n---\n');
+  });
+
+  it('inserts dateUpdated when the field is absent', async () => {
+    const content = '---\nstatus: in-progress\n---\n';
+    const filePath = await writeTempFile('slice.md', content);
+    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
+
+    const result = await readFile(filePath, 'utf-8');
+    expect(result).toBe('---\nstatus: complete\ndateUpdated: 20260809\n---\n');
+  });
+
+  it('writes the caller value when key is dateUpdated, without a second stamp write', async () => {
+    const content = '---\nstatus: in-progress\ndateCreated: 20250101\n---\n';
+    const filePath = await writeTempFile('slice.md', content);
+    const entry = await updateFrontmatterField(filePath, 'dateUpdated', '20250101', '20260809');
+
+    const result = await readFile(filePath, 'utf-8');
+    expect(result).toBe('---\nstatus: in-progress\ndateCreated: 20250101\ndateUpdated: 20250101\n---\n');
+    expect(entry.field).toBe('dateUpdated');
+    expect(entry.after).toBe('20250101');
+  });
+
+  it('stamps dateUpdated even when dateCreated is absent', async () => {
+    const content = '---\nstatus: in-progress\n---\n';
+    const filePath = await writeTempFile('slice.md', content);
+    await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
+
+    const result = await readFile(filePath, 'utf-8');
+    expect(result).toContain('dateUpdated: 20260809');
+  });
+
+  it('reports the primary field before/after unchanged by the stamp', async () => {
+    const content = '---\nstatus: in-progress\nproject: test\n---\n';
+    const filePath = await writeTempFile('slice.md', content);
+    const entry = await updateFrontmatterField(filePath, 'status', 'complete', '20260809');
+
+    expect(entry.field).toBe('status');
+    expect(entry.before).toBe('in-progress');
+    expect(entry.after).toBe('complete');
+  });
 });
diff --git a/packages/core/tests/schema/frontmatterFileValidator.test.ts b/packages/core/tests/schema/frontmatterFileValidator.test.ts
new file mode 100644
index 0000000..a6eb000
--- /dev/null
+++ b/packages/core/tests/schema/frontmatterFileValidator.test.ts
@@ -0,0 +1,112 @@
+import { join } from 'node:path';
+import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
+import { tmpdir } from 'node:os';
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import { validateFrontmatterFiles } from '../../src/schema/frontmatterFileValidator.js';
+
+let tmpDir: string;
+let projectPath: string;
+let userDir: string;
+
+beforeEach(async () => {
+  tmpDir = await mkdtemp(join(tmpdir(), 'fmfv-test-'));
+  projectPath = tmpDir;
+  userDir = join(projectPath, 'project-documents', 'user');
+});
+
+afterEach(async () => {
+  await rm(tmpDir, { recursive: true, force: true });
+});
+
+async function writeDoc(relDir: string, name: string, content: string): Promise<string> {
+  const dir = join(userDir, relDir);
+  await mkdir(dir, { recursive: true });
+  const filePath = join(dir, name);
+  await writeFile(filePath, content, 'utf-8');
+  return filePath;
+}
+
+const VALID_SLICE = '---\ndocType: slice-design\nslice: test\nproject: test-project\nstatus: complete\ndateCreated: 20260101\ndateUpdated: 20260102\n---\n\n# Test\n';
+const INVALID_STATUS_SLICE = '---\ndocType: slice-design\nslice: bad\nproject: test-project\nstatus: in-progress\ndateCreated: 20260101\ndateUpdated: 20260102\n---\n\n# Bad\n';
+const NO_FRONTMATTER = '# No frontmatter\nJust content.\n';
+
+describe('validateFrontmatterFiles', () => {
+  it('no-paths walk finds documents across multiple scan dirs', async () => {
+    await writeDoc('slices', '900-slice.a.md', VALID_SLICE);
+    await writeDoc('tasks', '900-tasks.a.md', VALID_SLICE.replace('slice-design', 'tasks'));
+    await writeDoc('architecture', '900-arch.a.md', VALID_SLICE.replace('slice-design', 'architecture'));
+
+    const result = await validateFrontmatterFiles(projectPath);
+    expect(result.filesChecked).toBe(3);
+  });
+
+  it('validates an explicit in-root .md path', async () => {
+    const filePath = await writeDoc('slices', '901-slice.b.md', VALID_SLICE);
+
+    const result = await validateFrontmatterFiles(projectPath, [filePath]);
+    expect(result.filesChecked).toBe(1);
+  });
+
+  it('silently skips an out-of-root .md path', async () => {
+    const outsidePath = join(tmpDir, 'outside.md');
+    await writeFile(outsidePath, VALID_SLICE, 'utf-8');
+
+    const result = await validateFrontmatterFiles(projectPath, [outsidePath]);
+    expect(result.filesChecked).toBe(0);
+    expect(result.findings).toHaveLength(0);
+  });
+
+  it('silently skips a non-.md path', async () => {
+    const tsPath = join(tmpDir, 'file.ts');
+    await writeFile(tsPath, 'export const x = 1;\n', 'utf-8');
+
+    const result = await validateFrontmatterFiles(projectPath, [tsPath]);
+    expect(result.filesChecked).toBe(0);
+    expect(result.findings).toHaveLength(0);
+  });
+
+  it('silently skips a nonexistent path with no error', async () => {
+    const missingPath = join(userDir, 'slices', 'does-not-exist.md');
+
+    const result = await validateFrontmatterFiles(projectPath, [missingPath]);
+    expect(result.filesChecked).toBe(0);
+    expect(result.findings).toHaveLength(0);
+  });
+
+  it('a mixed list of all four kinds validates exactly the valid ones', async () => {
+    const inRoot = await writeDoc('slices', '902-slice.c.md', VALID_SLICE);
+    const outOfRoot = join(tmpDir, 'outside2.md');
+    await writeFile(outOfRoot, VALID_SLICE, 'utf-8');
+    const nonMd = join(tmpDir, 'notes.txt');
+    await writeFile(nonMd, 'hi', 'utf-8');
+    const missing = join(userDir, 'slices', 'missing.md');
+
+    const result = await validateFrontmatterFiles(projectPath, [inRoot, outOfRoot, nonMd, missing]);
+    expect(result.filesChecked).toBe(1);
+  });
+
+  it('skips a file with no frontmatter and does not count it', async () => {
+    await writeDoc('slices', '903-slice.d.md', NO_FRONTMATTER);
+
+    const result = await validateFrontmatterFiles(projectPath);
+    expect(result.filesChecked).toBe(0);
+  });
+
+  it('validates an explicitly named file outside the scan dirs but inside the document root', async () => {
+    const filePath = await writeDoc('notes', 'scratch.md', VALID_SLICE);
+
+    const result = await validateFrontmatterFiles(projectPath, [filePath]);
+    expect(result.filesChecked).toBe(1);
+  });
+
+  it('produces a finding with a fixAction for an invalid status value', async () => {
+    await writeDoc('slices', '904-slice.e.md', INVALID_STATUS_SLICE);
+
+    const result = await validateFrontmatterFiles(projectPath);
+    const statusFinding = result.findings.find(
+      (f) => f.fixAction?.field === 'status'
+    );
+    expect(statusFinding).toBeDefined();
+    expect(statusFinding!.fixAction!.value).toBe('in_progress');
+  });
+});
diff --git a/packages/core/tests/schema/frontmatterSchema.test.ts b/packages/core/tests/schema/frontmatterSchema.test.ts
index fc9739e..d67f78f 100644
--- a/packages/core/tests/schema/frontmatterSchema.test.ts
+++ b/packages/core/tests/schema/frontmatterSchema.test.ts
@@ -27,9 +27,10 @@ describe('FRONTMATTER_SCHEMAS', () => {
     }
   });
 
-  it('every schema requires docType, status, dateCreated, dateUpdated', () => {
+  it('every canonical docType schema requires docType, status, dateCreated, dateUpdated', () => {
     const universalFields = ['docType', 'status', 'dateCreated', 'dateUpdated'];
-    for (const [docType, schema] of Object.entries(FRONTMATTER_SCHEMAS)) {
+    for (const docType of EXPECTED_DOC_TYPES) {
+      const schema = FRONTMATTER_SCHEMAS[docType];
       for (const field of universalFields) {
         expect(schema.fields[field], `${docType} missing ${field}`).toBeDefined();
         expect(schema.fields[field].required, `${docType}.${field} not required`).toBe(true);
@@ -37,13 +38,23 @@ describe('FRONTMATTER_SCHEMAS', () => {
     }
   });
 
-  it('status field on every schema uses VALID_STATUSES as values constraint', () => {
-    for (const [docType, schema] of Object.entries(FRONTMATTER_SCHEMAS)) {
-      const statusField = schema.fields.status;
+  it('status field on every canonical docType schema uses VALID_STATUSES as values constraint', () => {
+    for (const docType of EXPECTED_DOC_TYPES) {
+      const statusField = FRONTMATTER_SCHEMAS[docType].fields.status;
       expect(statusField.values, `${docType} status has no values constraint`).toBeDefined();
       expect(statusField.values).toEqual([...VALID_STATUSES]);
     }
   });
+
+  it('squadron machine-artifact docTypes (#73) require only docType and dateCreated', () => {
+    for (const docType of ['review-resolution', 'gate-evidence', 'devlog']) {
+      const schema = FRONTMATTER_SCHEMAS[docType];
+      expect(schema, `${docType} missing from FRONTMATTER_SCHEMAS`).toBeDefined();
+      expect(Object.keys(schema.fields).sort()).toEqual(['dateCreated', 'docType']);
+      expect(schema.fields.docType.required).toBe(true);
+      expect(schema.fields.dateCreated.required).toBe(true);
+    }
+  });
 });
 
 describe('VALID_STATUSES', () => {
@@ -314,6 +325,77 @@ describe('validateFrontmatter', () => {
   });
 });
 
+describe('validateFrontmatter — squadron machine-artifact docTypes (#73)', () => {
+  it('review-resolution missing dateCreated produces a finding', () => {
+    const findings = validateFrontmatter('/test.md', { docType: 'review-resolution' });
+    expect(findings).toHaveLength(1);
+    expect(findings[0].description).toContain("'dateCreated'");
+  });
+
+  it('review-resolution with docType and dateCreated, no dateUpdated or status, validates clean', () => {
+    const findings = validateFrontmatter('/test.md', {
+      docType: 'review-resolution',
+      dateCreated: '20260809',
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  it('gate-evidence missing dateCreated produces a finding', () => {
+    const findings = validateFrontmatter('/test.md', { docType: 'gate-evidence' });
+    expect(findings).toHaveLength(1);
+    expect(findings[0].description).toContain("'dateCreated'");
+  });
+
+  it('gate-evidence with docType and dateCreated, no dateUpdated or status, validates clean', () => {
+    const findings = validateFrontmatter('/test.md', {
+      docType: 'gate-evidence',
+      dateCreated: '20260809',
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  it('devlog missing dateCreated produces a finding', () => {
+    const findings = validateFrontmatter('/test.md', { docType: 'devlog' });
+    expect(findings).toHaveLength(1);
+    expect(findings[0].description).toContain("'dateCreated'");
+  });
+
+  it('devlog with docType and dateCreated, no dateUpdated or status, validates clean', () => {
+    const findings = validateFrontmatter('/test.md', {
+      docType: 'devlog',
+      dateCreated: '20260809',
+    });
+    expect(findings).toHaveLength(0);
+  });
+
+  it('a wrong docType literal is still caught by the value-constraint logic', () => {
+    // docType: devlog validated as-is — the literal itself doesn't match any
+    // *other* schema's required value, so this proves the values constraint
+    // on docType (not just presence) is enforced for these three schemas too.
+    const findings = validateFrontmatter('/test.md', {
+      docType: 'devlog',
+      dateCreated: '20260809',
+    });
+    expect(findings).toHaveLength(0);
+
+    const mismatched = validateFrontmatter('/test.md', {
+      docType: 'gate-evidence',
+      dateCreated: '20260809',
+    });
+    expect(mismatched).toHaveLength(0);
+
+    // An unregistered literal masquerading as one of the three schemas is
+    // simply a different (unknown) docType and passes through unvalidated —
+    // proving the docType `values` constraint, not just key lookup, is what
+    // ties a document to its schema.
+    const unknownDocType = validateFrontmatter('/test.md', {
+      docType: 'not-a-real-doctype',
+      dateCreated: '20260809',
+    });
+    expect(unknownDocType).toHaveLength(0);
+  });
+});
+
 describe('inferDocTypeFromPath', () => {
   it.each([
     ['140-arch.context-forge.md', 'architecture'],

```

### CLAUDE.md (project conventions)

```
### Project Guidelines for Claude

[//]: # (context-forge:managed)

#### Core Principles

- Always resist adding complexity. Ensure it is truly necessary.
- Never use silent fallback values. Fail explicitly with errors or obviously-placeholder values.
- Never use cheap hacks or well-known anti-patterns.
- Never include credentials, API keys, or secrets in source code or comments. Load from environment variables; ensure .env is in .gitignore. Raise an issue if violations are found.
- Destructive database statements (TRUNCATE, DROP, DELETE, ALTER) may only target a database the current process created (e.g. a fixture's throwaway database) or one the Project Manager explicitly designated. Tests never read the production database URL variable. Full rules: `sql.md` ("Production Database Protection") in the modular rules directory.
- When debugging a failure, get the actual error message before attempting any fix. Never apply more than one speculative fix without first obtaining concrete evidence (logs, error text, stack trace) that diagnoses the root cause. If you cannot get the evidence yourself, ask the Project Manager for it.

#### Code Structure

- Keep source files to ~300 lines, functions to ~50 lines (excluding whitespace) where practical.
- Program to interfaces (contracts).  Maintain clear separation between components.
- Do not duplicate logic.  Respect DRY (don't repeat yourself).
- Provide meaningful but concise comments in relevant places.

- Never scatter comparison values across code. If a value is used in conditionals, switch cases, or lookups, define it once (enum, constant, or config) and reference that definition everywhere. Changing a value should require editing exactly one place.
- Do not hard-code magic defaults.  In the example below, the defaults for model and n are both wrong.  If such defaults are needed they should be centralized at the config level.  This applies in all languages.
```python
  async def _model_start(promt:str) -> str {
    model = self._config.model or "gpt-5.3-codex"
    n = self._config.index or 1234
  }
```
- NEVER use user-accessible labels as logical structure.  They are fragile.

##### Exception Handling
- Every try/except must either: (a) re-raise after logging at ERROR level with logger.exception, (b) handle a specific exception with a comment explaining why swallowing is correct (e.g., ConnectionClosed: pass for normal teardown), or (c) be a top-level handler at a process boundary. Bare except: and except Exception: pass are bugs by definition.

#### Source Control and Builds
- Keep commits semantic; build after all changes.
- Git add and commit from project root at least once per task.
- Confirm your current working directory before file/shell commands.

#### Parsing & Pattern Matching
- Prefer lenient parsing over strict matching. A regex that silently fails on valid input (e.g. requiring exact whitespace counts or line-ending positions) is a bug. Parse the semantic content, not the formatting.
- When parsing structured text (YAML, key-value pairs, etc.), handle common format variations (compact vs multi-line, varying indent levels, trailing whitespace) rather than requiring one exact layout.
- When writing a parser, the test fixture must include the actual format that parser will consume in production.  A test that only passes on a format the real data never uses only provides false confidence.
- If a parser returns empty/default on bad input, add at least one test using real-world input (e.g. the actual file it will parse) to catch silent failures.
  
#### Hallucination traps in prompts
If an instruction tells a reader to retrieve a value from some source, and
that source might return empty, do not place a hardcoded example of an
acceptable value nearby. When the source is empty, a model will reach for
the nearest plausible token — and the example is it. This is a
hallucination trap.

##### Bad

    Print the filename (from stderr, e.g. `squadron-P4.md`).

##### Good

    Print the filename. The CLI emits it on a line prefixed with
    `Using: ` on stderr. If no such line is present, stop with an error.


#### Project Navigation
- Follow `guide.ai-project.process` and its links for workflow.
- Follow `file-naming-conventions` for all document naming and metadata.
- Project guides: `project-documents/ai-project-guide/project-guides/`
- Tool guides: `project-documents/ai-project-guide/tool-guides/`
- Modular rules for specific technologies may exist in 
  `project-documents/ai-project-guide/project-guides/rules/`.

#### Document Conventions

- All markdown files must include YAML frontmatter as specified in `file-naming-conventions.md`
- Use checklist format for all task files.  Each item and subitem should have a `[ ]` "checkbox".
- After completing a task or subtask, delegate checklist updates to the `task-checker` agent rather than editing task files inline. This keeps the main agent's context focused on implementation. If task-checker is unavailable, check off tasks directly.
- Preserve sections titled "## User-Provided Concept" exactly as 
  written — never modify or remove.
- Keep success summaries concise and minimal.

#### Git Rules

##### Branch Naming
A branch corresponds to one unit of work: slice implementation (Phase 6). Planning work (Phases 0–5: concept, initiative plan, architecture, slice plan, slice design, task breakdown, and reviews of those artifacts) does not get its own branch — it commits directly to the current integration target (see below).

- **Slice work** → `{index}-slice.{name}`, where `{index}` is the slice's index and `{name}` is the document name without the `.md` extension.

###### Integration branch
A project may configure an **optional** integration branch that work forks from and merges into, instead of `main`. Read it with `cf config get git.integration_branch`. This key is optional and defaults to empty:

- **Unset (default):** no change from plain historical behavior. Work branches fork from `main` and merge into `main`, named exactly `{index}-{type}.{name}` — no prefix.
- **Set** (e.g. `dev/erik`):
  - Work branches are named the same as when unset — `{index}-{type}.{name}` (e.g. `910-slice.foo`), with no prefix.
  - Work branches fork **from** `{integration_branch}`, not `main`.
  - Work branches merge **into** `{integration_branch}`, not `main`.
  - **Hard rule: never merge to `main` when `integration_branch` is set.** Syncing `{integration_branch}` from `main`, and eventually merging `{integration_branch}` into `main`, are PM-only actions outside automation scope — never perform either as part of normal slice/planning workflow, only if the Project Manager explicitly instructs it as a standalone action.

The integration branch affects **git topology only** (fork point and merge target) — not the branch name. It does not move documents or change where artifacts resolve — the `project-documents/user/...` layout under the branch is unchanged. The configured value is relative and contained (never absolute, never `..`, no trailing slash, no Windows drive/`\`); `cf` rejects invalid values when the key is set.

Before starting work:
1. read `cf config get git.integration_branch`; call its value (or `main` if empty) the **target**

**If committing planning work (Phases 0–5):**
2. ensure you are on the target. Do not create or switch to a work branch. Commit directly.

**If starting slice implementation (Phase 6):**
2. determine the branch name per the rules above (no prefix, regardless of target)
3. verify you are on the target or the expected slice branch
4. if the expected slice branch does not exist, create it from the target: `git checkout -b {branch-name} {target}`
5. if the branch already exists, switch to it: `git checkout {branch-name}`
6. never start work from another unit's branch unless explicitly instructed
7. if in doubt, STOP and ask the Project Manager

A slice branch merges into the target when its implementation is done. Do not hold a branch open across units. Do not delete branches unless specifically instructed to do so.

##### Commit Messages
Use semantic commit prefixes. The goal is a readable `git log --oneline`.

Format: `{type}: {short imperative summary}`

Types:
- `feat` — New functionality or capability
- `fix` — Bug fix
- `refactor` — Code restructuring without behavior change
- `test` — Adding or updating tests
- `style` — Formatting, whitespace, linting (no logic change)
- `guides` - Update or addition to project guides (system/project level)
- `docs` — Update or addition to user/ guides or documentation (slices, readme, etc)
- `review` — Code review, design review, or audit documentation
- `package` - Updates related to packaging, npm, package.json, PyPi, etc
- `chore` — Build config, dependencies, tooling, CI

Actions (optional, use if applicable):
- `update`: primarily update/edit to existing information
- `add`: primarily addition of new code or information
- `extract`: primarily used in refactoring
- `reduce`: if primary work involves reduction or streamlining

##### Guidelines:
- Summary is imperative mood ("add X" not "added X" or "adds X")
- Keep to ~72 characters
- No period at end
- Scope is optional but useful in monorepos: `feat(core): add template variable resolution`

##### Examples:
feat: add context_build MCP tool
fix: update to handle missing template directory gracefully
refactor(core): extract service instantiation into shared helper
docs: add MCP server installation instructions to README
test: add unit tests for prompt_list tool handler
chore: update @modelcontextprotocol/server to v2.1


```

### Rules Injected

---
description:   TypeScript strict typing standards, idiomatic patterns, and project conventions. Use for all TypeScript files. Covers type annotations, generics, module patterns, and error handling.
paths: 
  - "**/*.ts"
  - "**/*.tsx"
---

### TypeScript Rules

#### Core Principles

TypeScript's type system is a **compile-time safety net**. The goal is to catch errors before runtime. Every `any` is a hole in that net. Every untyped function boundary is a place where bugs can hide. Write types that make illegal states unrepresentable.

#### Strict Mode & the `any` Ban

- **Strict mode is mandatory.** `tsconfig.json` must include `"strict": true`.
- **`any` is forbidden.** This is not a suggestion. Do not use `any` in type annotations, return types, generic parameters, or type assertions (`as any`).
  - If you are tempted to use `any`, stop and determine the actual type.
  - If the type is complex, define an interface or type alias.
  - If you are working with truly unknown data (e.g., parsing JSON, external API responses), use `unknown` and narrow with type guards.
  - If a library's types are incomplete, write a declaration file (`.d.ts`) rather than using `any`.
- **`as` type assertions are a code smell.** Prefer type guards, discriminated unions, or generics. If you must assert, document why in a comment.

##### When You Encounter `any` in Existing Code

If you encounter `any` in code you are modifying, **replace it** with a proper type as part of your change. Do not propagate `any` to new code. If the fix is non-trivial and outside the scope of your current task, add a `// TODO: Replace any — see [reason]` comment and flag it.

#### Type Design Patterns

##### Discriminated Unions Over String Checks

Use discriminated unions (tagged unions) instead of runtime string matching to distinguish between variants. The compiler enforces exhaustiveness.

```typescript
// GOOD — compiler-enforced, exhaustive
type TemplateExpression =
  | { kind: 'simple'; variableName: string }
  | { kind: 'pipe'; parts: string[] }
  | { kind: 'conditional'; variable: string; trueContent: string; falseContent: string };

function evaluate(expr: TemplateExpression): string {
  switch (expr.kind) {
    case 'simple': return lookupVariable(expr.variableName);
    case 'pipe': return processPipe(expr.parts);
    case 'conditional': return expr.variable ? expr.trueContent : expr.falseContent;
    // TypeScript errors if a case is missing
  }
}

// BAD — runtime guessing, no compiler help
function evaluate(expression: string): string {
  if (expression.includes(' | ')) { /* ... */ }
  else if (expression.startsWith('#if')) { /* ... */ }
  else { /* ... */ }
}
```

##### Use `unknown` Instead of `any` for Untyped Data

When data shape is not known at compile time, use `unknown` and narrow:

```typescript
// GOOD
function parseConfig(raw: unknown): ProjectConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Config must be an object');
  }
  // Narrow further or use a validation library (Zod, etc.)
}

// BAD
function parseConfig(raw: any): ProjectConfig {
  return raw; // no safety at all
}
```

##### Index Signatures and Record Types

When you need dynamic keys, be explicit about the value type:

```typescript
// GOOD — clear contract
type TemplateVariables = Record<string, string | number | boolean>;

// GOOD — when you need to distinguish known from dynamic keys
interface EnhancedContextData extends ContextData {
  [computedKey: string]: string | number | boolean | undefined;
}

// BAD — erases all type information
const data: any = { ...baseData };
```

##### Prefer Interfaces for Object Shapes, Type Aliases for Unions

```typescript
// Interfaces — extendable, good for object shapes
interface ProjectConfig {
  name: string;
  version: string;
}

// Type aliases — good for unions, intersections, mapped types
type BuildTarget = 'electron' | 'mcp-server' | 'core';
type Nullable<T> = T | null;
```

##### Const Assertions and Literal Types

Prefer `as const` objects over TypeScript enums:

```typescript
// GOOD
const LogLevel = {
  Debug: 'debug',
  Info: 'info',
  Warn: 'warn',
  Error: 'error',
} as const;

type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];
// Result: 'debug' | 'info' | 'warn' | 'error'

// AVOID — TypeScript enums have runtime behavior and quirks
enum LogLevel { Debug, Info, Warn, Error }
```

#### Function Signatures

- **Always annotate return types on exported functions.** TypeScript can infer return types, but explicit annotations catch accidental changes and serve as documentation.
- **Use `readonly` for parameters that should not be mutated.**
- **Prefer named parameters (via object destructuring) when a function takes 3+ parameters.**

```typescript
// GOOD
export function buildContext(
  config: Readonly<ProjectConfig>,
  options: { includeMetadata: boolean; format: OutputFormat }
): ContextResult { /* ... */ }

// BAD — positional params are hard to read at call sites
export function buildContext(
  config: ProjectConfig, includeMetadata: boolean, format: string
) { /* ... */ }
```

#### Generics

Use generics to write reusable code without losing type information:

```typescript
// GOOD — caller gets back the type they put in
function getOrDefault<T>(map: Map<string, T>, key: string, fallback: T): T {
  return map.get(key) ?? fallback;
}

// BAD — type information lost
function getOrDefault(map: Map<string, any>, key: string, fallback: any): any {
  return map.get(key) ?? fallback;
}
```

Constrain generics when appropriate:

```typescript
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

#### Error Handling

- Type your errors. Use discriminated unions for expected error cases rather than throwing strings.
- Use `Result` patterns for operations that can fail predictably:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

- Catch blocks: the caught value is `unknown` in strict mode. Narrow before using:

```typescript
try { /* ... */ } catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  // ...
}
```

#### Project Structure Conventions

- Shared types go in `packages/core/src/types/` (for the monorepo) or `src/lib/types.ts` (for single-package projects).
- Use `tsx` scripts for migrations.
- Reusable logic in `src/lib/utils/shared.ts` or `src/lib/utils/server.ts`.

##### tRPC Routers (when enabled)

- Routers in `src/lib/api/routers`, composed in `src/lib/api/root.ts`.
- Use `publicProcedure` or `protectedProcedure` with Zod for input validation.
- Access from React via `@/lib/trpc/react`.

#### Naming Conventions

- **Types/Interfaces**: PascalCase (`ProjectConfig`, `TemplateExpression`)
- **Variables/Functions**: camelCase (`processTemplate`, `enhancedData`)
- **Constants**: UPPER_SNAKE_CASE for true constants, camelCase for const references
- **Type parameters**: Single uppercase letter for simple cases (`T`, `K`), descriptive PascalCase for complex ones (`TInput`, `TOutput`)
- **Files**: kebab-case (`template-processor.ts`, `context-data.ts`)

#### Advanced Patterns (Use When Appropriate)

These are powerful but add complexity. Use them when they genuinely improve safety or DX, not for their own sake.

##### Conditional Types

Extract or transform types based on conditions:

```typescript
// Extract only the string-valued keys from a type
type StringKeys<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];
```

##### Mapped Types

Transform all properties of a type systematically:

```typescript
// Make all properties optional and nullable
type Draft<T> = {
  [K in keyof T]?: T[K] | null;
};
```

##### Template Literal Types

Useful for string patterns:

```typescript
type EventName = `on${Capitalize<string>}`;
type CSSProperty = `--${string}`;
```

#### Quick Reference: What to Use Instead of `any`

| Situation | Use Instead |
|---|---|
| Unknown JSON data | `unknown` + type guard or Zod |
| Object with dynamic keys | `Record<string, ValueType>` |
| Function that works on multiple types | Generics (`<T>`) |
| Third-party lib with bad types | Declaration file (`.d.ts`) |
| Spread into a new shape | Define the target interface explicitly |
| Callback with unknown signature | `(...args: unknown[]) => unknown` |
| "I'll figure out the type later" | `// TODO:` with `unknown`, never `any` |

### Raw Response

Looking at this commit, I need to review the code changes for quality and correctness. Let me analyze the diff systematically.

## Summary
[CONCERNS]

## Findings

### [CONCERN] Type mismatch between fixAction.field and fixAction.detail
location: packages/cli/src/commands/validate.ts:71

In `validateFrontmatterAction`, the code accesses `finding.fixAction?.field` to match against `fixLog` entries. However, based on the `FrontmatterFinding` type shown in `fixAction` access elsewhere in the codebase (e.g., `ConsistencyChecker.ts:232`), the `'update-frontmatter'` variant has properties `type`, `filePath`, and `detail: { key: string; value: string }` — not a `field` property directly on `fixAction`.

This suggests a potential type mismatch that TypeScript should catch if strict mode is enforced. Verify that `FrontmatterFinding.fixAction` actually has a `field` property, or that this code path uses a compatible type.

### [NOTE] New frontmatter schemas for machine-artifact docTypes
location: packages/core/src/schema/frontmatterSchema.ts:115-140

The schemas for `review-resolution`, `gate-evidence`, and `devlog` intentionally omit `status` and `dateUpdated` fields. The comment explicitly explains this is correct to avoid manufacturing false claims when backfilling `dateUpdated` from `dateCreated`. Good design decision with clear documentation.

### [PASS] dateUpdated auto-stamp design is sound
location: packages/core/src/introspection/writers/markdownWriter.ts:134-146

The guard `if (key !== 'dateUpdated')` correctly prevents double-writing when explicitly updating `dateUpdated`. The stamping logic is well-structured:
1. Set the primary field
2. Stamp `dateUpdated` unless the primary field IS `dateUpdated`

The integration test `backfills dateUpdated from dateCreated, not the run date stamp` specifically validates this guard behavior.

### [PASS] Code refactoring improves reusability
location: packages/core/src/schema/frontmatterFileValidator.ts (new file)

Extracting `discoverAllDocuments` from `ConsistencyChecker` into a shared module enables the standalone `validateFrontmatterFiles` service used by `cf validate frontmatter`. The comment in `ConsistencyChecker.ruleFrontmatterSchema` explains why the class still uses its injected introspector rather than calling the service directly — this keeps the rule testable via dependency injection.

### [PASS] CLI command registration follows existing patterns
location: packages/cli/src/index.ts:55

The new `validate` command is registered alongside existing commands using the standard pattern (`registerXxxCommand`).

### [PASS] Error handling with exit codes
location: packages/cli/src/utils/errors.ts:42

The `handleError` function now accepts an optional exit code parameter (defaulting to 1), making it more flexible. The `validate.ts` command correctly uses exit code 2 for user input errors ("unresolvable project") to distinguish from generic errors.

### [PASS] Test coverage is comprehensive
location: packages/core/tests/introspection/writers/markdownWriter.test.ts

The test suite covers:
- Updating existing fields (with dateUpdated stamp verification)
- Inserting new fields
- Handling quoted values
- Replacing existing dateUpdated
- Skipping stamp when key is dateUpdated
- Error cases (missing frontmatter, unclosed frontmatter)

### [PASS] Explicit path validation is defensive
location: packages/core/src/schema/frontmatterFileValidator.ts:54-69

The `resolveExplicitPaths` function correctly handles edge cases:
- Skips non-.md files
- Resolves relative paths from CWD
- Uses `relative()` + `startsWith('..')` to prevent directory traversal
- Skips nonexistent files without errors

### [PASS] Variable shadowing in findFrontmatterBounds is intentional and safe
location: packages/core/src/introspection/writers/markdownWriter.ts:53

The `closingIndex` parameter is shadowed by the return value, and this is correct because:
1. The parameter value is never used after assignment
2. The return value properly represents the closing boundary position
