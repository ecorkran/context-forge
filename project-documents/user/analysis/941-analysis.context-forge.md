---
layer: user
docType: analysis
topic: tech-debt
project: context-forge
dateCreated: 20260518
dateUpdated: 20260518
status: complete
---

# Tech Debt Audit — context-forge
Generated: 2026-05-18

---

## Executive Summary

- **3 failing core tests** with no migration implementation to back them — old-schema field mapping and monorepo field stripping are tests that describe planned behavior that never shipped.
- **`extractSliceIndex` is defined three times** in three separate files (`WorkflowNavigator`, `ConsistencyChecker`, `ArtifactIntrospector`), with the exported version in `WorkflowNavigator` and two private copies that silently drift.
- **`fileConcept` is in the `artifacts` group** in the project schema but absent from `ARTIFACT_DIR_MAP` — `cf set concept 1` throws an inscrutable error with no recoverable path.
- **`ContextGenerator` and the legacy engine path in `ContextIntegrator`** are dead code in the published surface — they implement the same function twice and neither is called outside electron tests.
- **Electron package has 15+ typecheck failures** (missing `downshift` dep, `""` | `ProjectData` union not narrowed, stale test mock shapes) — the typecheck CI step for electron will fail.
- **3 high-severity CVEs** in electron deps (`react-router` XSS ×2, `glob` command injection via electron-builder) — all confined to the Electron package which is already de-prioritized, but unpatched.
- **99 total vulnerabilities** in the audit, 50 high — nearly all in electron. None affect the published CLI/MCP/core packages.
- **`parseInitiativePlanEntries` in `cli/src/commands/project.ts`** re-implements initiative plan parsing that already exists in core via `ArtifactIntrospector` + `resolveInitiativePlanPath` — a maintenance hazard since bugs need fixing in two places.
- **Managed marker string `[//]: # (context-forge:managed)` is hardcoded twice** in `setup-ide.ts` as both the `COPILOT_MANAGED_MARKER` constant and an inline string in `isManagedClaudeMd`.
- **99 bare `catch {}` blocks** across core, CLI, and MCP — most are appropriate silent fallbacks in parser code, but a few in critical storage/fix paths swallow real errors.

---

## Architectural Mental Model

Context Forge is a **TypeScript pnpm monorepo** with five packages: `core` (the engine), `cli` (the `cf` command), `mcp-server` (MCP protocol wrapper), `context-forge` (meta-package), and `electron` (desktop app, secondary priority).

The architecture is clean. `core` has no dependencies on `cli` or `mcp-server`. `cli` and `mcp-server` both consume `core`. `electron` consumes `core`. No circular dependencies were found. The flow is: user invokes CLI or MCP tool → action handler in `cli/src/commands/` or `mcp-server/src/tools/` → delegates to `core` service layer → reads/writes `projects.json` via `FileProjectStore`.

The core has a clear layering: `storage/` → `services/` → `introspection/` (parsers + navigators + checkers). The `introspection/` namespace handles filesystem scanning, frontmatter parsing, slice plan parsing, and workflow state machine logic. The `services/` namespace handles context assembly from templates and project data.

One design wart: there are **two context generation paths** inside `ContextIntegrator` (legacy and new engine) controlled by a boolean toggle. The new engine has been the default for a long time and the legacy path is not exercised by the published interface. The README claims "strict mode, no `any`" — this is largely true for core/cli/mcp-server (zero `any` types found) but the electron package has 7 implicit `any` errors in `combobox.tsx` alone.

---

## Findings

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
|----|----------|-----------|----------|--------|-------------|----------------|
| F001 | Test debt | [packages/core/tests/storage/FileProjectStore.test.ts:108](packages/core/tests/storage/FileProjectStore.test.ts#L108) | Critical | S | 3 failing tests: `should map old-schema fields to new field names`, `should strip legacy monorepo fields`, and related — the implementation (`FileProjectStore.getAll`) does a raw `parsed as ProjectData[]` with zero migration. Tests describe behavior that was never implemented. | Implement field migration in `getAll()`: map `slice→fileSlice`, `taskFile→fileTasks`, `projectDate→dateProject`; strip `isMonorepo`, `isMonorepoEnabled`, and `customData.monorepoNote`. |
| F002 | Consistency rot | [packages/core/src/introspection/ConsistencyChecker.ts:24](packages/core/src/introspection/ConsistencyChecker.ts#L24), [packages/core/src/introspection/ArtifactIntrospector.ts:162](packages/core/src/introspection/ArtifactIntrospector.ts#L162), [packages/core/src/introspection/WorkflowNavigator.ts:20](packages/core/src/introspection/WorkflowNavigator.ts#L20) | High | S | `extractSliceIndex` is defined 3 times identically. `WorkflowNavigator` exports the canonical one; `ConsistencyChecker` and `ArtifactIntrospector` each have private copies. When the pattern changes (e.g. to support 4-digit indices), two copies will be missed. | Delete the private copies. Import from `WorkflowNavigator` in the other two files (it's already exported via `node.ts`). |
| F003 | Architectural decay | [packages/core/src/services/ContextIntegrator.ts:66](packages/core/src/services/ContextIntegrator.ts#L66) | High | M | `ContextIntegrator` contains a legacy template path (`generateWithLegacySystem`, `DEFAULT_TEMPLATE`, `mapProjectToContext`, `getDefaultTemplate`) controlled by `enableNewEngine`. The flag defaults to `true` and is not set to `false` anywhere in CLI or MCP. The legacy code is ~100 lines of live dead code that must be maintained but is never invoked. Same flag exists in `ContextTemplateEngine`. | Delete `generateWithLegacySystem`, `mapProjectToContext`, `DEFAULT_TEMPLATE`, `getDefaultTemplate`, `setNewEngineEnabled`, `isNewEngineEnabled` from both files. Remove the conditional in `generateContextFromProject`. |
| F004 | Architectural decay | [packages/core/src/services/ContextGenerator.ts](packages/core/src/services/ContextGenerator.ts) | High | S | `ContextGenerator` is a 75-line service that duplicates the same basic context template substitution as `ContextIntegrator.generateWithLegacySystem`. It is only referenced from electron's re-export and tests — not from CLI or MCP. It is a second implementation of the same concept, currently exported from the published `core` package. | Remove `ContextGenerator` from `core/src/services/index.ts` and the class itself if electron tests are migrated to `ContextIntegrator`. |
| F005 | Type & contract debt | [packages/cli/src/commands/project.ts:331](packages/cli/src/commands/project.ts#L331) | High | M | Dynamic field access on `ProjectData` and `WorktreeContext` uses `as unknown as Record<string, unknown>` in 5+ locations across `project.ts`, `contextTools.ts`, and `projectTools.ts`. The same pattern appears because `ProjectData` doesn't expose an index signature. Repeated runtime casts are the smell. | Add a typed `getField(key: keyof ProjectData)` accessor to `ProjectData` or expose the underlying record as `Record<keyof ProjectData, unknown>`, eliminating the cast. |
| F006 | Type & contract debt | [packages/electron/src/lib/ui-core/components/form/combobox.tsx:4](packages/electron/src/lib/ui-core/components/form/combobox.tsx#L4) | High | S | `downshift` is imported in `combobox.tsx` but is absent from `packages/electron/package.json` dependencies. This causes `tsc` to fail with TS2307. Either a dep was accidentally removed or the file was copied in without its dep. | Add `downshift` to `packages/electron/package.json` dependencies, or remove the file if it's not used. |
| F007 | Type & contract debt | [packages/electron/src/components/ContextBuilderApp.tsx:71](packages/electron/src/components/ContextBuilderApp.tsx#L71) | High | S | `activeProject` is typed `"" | ProjectData` and accessed as `ProjectData` without narrowing — 3 TS errors. The union arises from `allProjects[0]` when `allProjects` could be empty. | Guard `activeProject` with `if (activeProject && typeof activeProject !== 'string')` or restructure to use `undefined` instead of `""`. |
| F008 | Consistency rot | [packages/cli/src/commands/project.ts:37](packages/cli/src/commands/project.ts#L37) | Medium | S | `parseInitiativePlanEntries` in CLI re-implements initiative plan parsing with its own regex (`INITIATIVE_ENTRY_RE`) and file discovery logic. The same logic exists in `core`: `resolveInitiativePlanPath` + `ArtifactIntrospector.parseSlicePlan`. Different regex = different behavior on edge cases. | Replace `parseInitiativePlanEntries` with a call to `resolveInitiativePlanPath` + `parseSlicePlan` from core. Remove the private CLI implementation. |
| F009 | Consistency rot | [packages/cli/src/commands/setup-ide.ts:27](packages/cli/src/commands/setup-ide.ts#L27) | Medium | S | The managed marker string `'[//]: # (context-forge:managed)'` appears as both `COPILOT_MANAGED_MARKER` and as an inline string inside `isManagedClaudeMd`. Two definitions of the same constant in the same file. | Extract to a single `const MANAGED_MARKER` used by both functions. |
| F010 | Architecture | [packages/core/src/schema/resolveFileByIndex.ts:11](packages/core/src/schema/resolveFileByIndex.ts#L11) | Medium | S | `fileConcept` is declared in `projectSchema.ts:81` as an `artifacts` group field but is absent from `ARTIFACT_DIR_MAP` in `resolveFileByIndex.ts`. When a user runs `cf set concept 1`, the code reaches `resolveFileByIndex` → finds no mapping → returns `null` → falls through to `deriveFromPlan` → fails with "No slice plan is set" or a plan-lookup failure — neither of which explains that `fileConcept` doesn't support index resolution. | Either add `fileConcept` to `ARTIFACT_DIR_MAP` with `{ dir: 'project-documents/user', prefixes: ['concept.'] }`, or detect the missing-mapping case explicitly and emit a better error: `"fileConcept uses direct paths; set with: cf set concept project-documents/user/001-concept.my-project"`. |
| F011 | Consistency rot | [packages/core/src/services/SystemPromptParser.ts:42](packages/core/src/services/SystemPromptParser.ts#L42) | Medium | M | `SystemPromptParser` and `StatementManager` use `fs.readFileSync` on hot paths inside services that are otherwise async. These synchronous reads will block the Node.js event loop if the files are large or on a slow filesystem (NFS, network drive). `resolveFileByIndex.ts:40` also does a `readdirSync`. | Convert `SystemPromptParser.parseFile`, `StatementManager.loadFromFile`, and `resolveFileByIndex.resolveFileByIndex` to `async`/`await` with `readFile`/`readdir` from `node:fs/promises`. |
| F012 | Error handling | [packages/core/src/services/SectionBuilder.ts:82](packages/core/src/services/SectionBuilder.ts#L82) | Medium | S | `SectionBuilder` has 6 catch blocks that `console.error` the error and silently return empty string for each section. A failed `buildToolsSection` or `buildInstructionSection` produces a context with missing content that looks valid to the caller — the error is logged but the output is silently degraded. | Return a typed `Result<string, Error>` from each section builder, or rethrow and let the outer caller decide. At minimum, include a visible marker in the generated context string when a section fails (consistent with `ContextTemplateEngine.getErrorContext`). |
| F013 | Error handling | [packages/core/src/storage/FileProjectStore.ts:49](packages/core/src/storage/FileProjectStore.ts#L49) | Medium | S | `FileProjectStore.getAll()` does `parsed as ProjectData[]` with no runtime validation. A corrupted or schema-mismatched `projects.json` (e.g. after a failed write) returns whatever is in the file cast to `ProjectData[]` — callers get stale or structurally invalid objects with no error indication. | Validate the shape with a Zod schema or a type guard before the cast. At minimum, check for the presence of required fields (`id`, `name`) and filter invalid records out with a warning. |
| F014 | Test debt | [packages/cli/src/commands/arch.ts](packages/cli/src/commands/arch.ts) | Medium | M | `arch.ts` (226 lines, 6 exported functions including `archListAction`, `archListFromPlan`, `archListFromModel`) has no dedicated test file. `arch` is covered via `list.test.ts` but only for the alias path. The `archListFromPlan` vs `archListFromModel` fallback logic is untested. | Add `packages/cli/tests/commands/arch.test.ts` covering `archListFromPlan` (with a fixture initiative plan) and the fallback to `archListFromModel`. |
| F015 | Dependency debt | [packages/electron/package.json](packages/electron/package.json) | Medium | S | `react-router-dom@7.8.2` is vulnerable to XSS via open redirects (GHSA-2w69-qvjg-hvjx) and ScrollRestoration XSS (GHSA-8v8x-cx79-35w7). Both are patched in `>=7.12.0`. `electron@37` is also flagged (GHSA-f37v-82c4-4x64). | Upgrade `react-router-dom` to `^7.12.0` in `packages/electron/package.json`. Evaluate the `electron` advisory separately. |
| F016 | Architectural decay | [packages/core/src/introspection/ConsistencyChecker.ts:716](packages/core/src/introspection/ConsistencyChecker.ts#L716) | Low | M | `ruleInitiativeEntryVsArch` calls `discoverAllSlicePlans` inside a per-entry loop at line 716 — for each initiative plan entry that is checked, it re-scans the architecture directory. If the plan has 20 entries, this is 20 redundant directory scans. | Hoist the `discoverAllSlicePlans` call above the loop and build the lookup map once before iterating entries. |
| F017 | Consistency rot | [packages/core/src/services/ContextIntegrator.ts:271](packages/core/src/services/ContextIntegrator.ts#L271) | Low | S | `detectAvailableTools()` and `detectMCPServers()` in `ContextIntegrator` return hardcoded arrays `['npm', 'git', 'vscode']` and `['context7']`. Both carry "Currently returns placeholder data" comments. These are injected into every generated context prompt, silently lying to the AI agent consuming it. | Either remove these placeholder returns and omit the fields from context output, or implement real detection (check for `node_modules/.bin`, `~/.claude/mcp.json`, etc.). The current behavior is a hallucination seed: the AI will assume these tools are available regardless of the actual environment. |
| F018 | Documentation drift | [packages/core/src/services/ContextIntegrator.ts:41](packages/core/src/services/ContextIntegrator.ts#L41) | Low | S | `ContextIntegrator` constructor JSDoc documents three parameters including `enableNewEngine` which describes a toggle between "new and legacy template systems." Since the legacy system should be removed (F003), this doc will be misleading during cleanup. | Remove the `@param enableNewEngine` doc line when addressing F003; also remove the `readFileFn` parameter if nothing outside tests uses it. |
| F019 | Consistency rot | [packages/mcp-server/src/tools/workflowTools.ts:29](packages/mcp-server/src/tools/workflowTools.ts#L29) | Low | S | `mergeCheckResults` in `workflowTools.ts` has a `// TODO: Extract to @context-forge/core` comment. It's a 15-line dedup function that belongs in `core/introspection/`. Leaving it in MCP means CLI doesn't get it either, and any future `cf check --all` equivalent in the CLI would duplicate it again. | Move `mergeCheckResults` to `core/src/introspection/ConsistencyChecker.ts` or a new `core/src/introspection/utils.ts` and export it. |
| F020 | Error handling | [packages/core/src/storage/FileProjectStore.ts:163](packages/core/src/storage/FileProjectStore.ts#L163) | Low | S | `console.log` in library code (`migrateFromLegacyLocation` and `backupService`) is not appropriate for a published npm package — it will pollute stdout in any context where the library is used non-interactively (e.g., MCP server piping JSON). | Replace `console.log` in core library code with a debug logger or callback. The MCP server uses stdio transport — unexpected stdout will corrupt the protocol stream. |

---

## Top 5: If You Fix Nothing Else, Fix These

### 1. F001 — Implement field migration in `FileProjectStore.getAll()`

Three tests are failing right now. The store does `return parsed as ProjectData[]` with no migration. Any user who upgraded from an old schema (with `slice`, `taskFile`, `projectDate`, `isMonorepo`) will silently get `undefined` for `fileSlice`, `fileTasks`, `dateProject` — their entire workflow navigation breaks.

**Fix sketch** in `packages/core/src/storage/FileProjectStore.ts`, replace:
```typescript
return parsed as ProjectData[];
```
with:
```typescript
return (parsed as Record<string, unknown>[]).map(migrateProjectRecord);
```

And add:
```typescript
function migrateProjectRecord(raw: Record<string, unknown>): ProjectData {
  // Rename old field names
  if (raw.slice !== undefined && raw.fileSlice === undefined) raw.fileSlice = raw.slice;
  if (raw.taskFile !== undefined && raw.fileTasks === undefined) raw.fileTasks = raw.taskFile;
  if (raw.projectDate !== undefined && raw.dateProject === undefined) raw.dateProject = raw.projectDate;
  // Strip removed monorepo fields
  delete raw.isMonorepo;
  delete raw.isMonorepoEnabled;
  if (raw.customData && typeof raw.customData === 'object') {
    delete (raw.customData as Record<string, unknown>).monorepoNote;
  }
  // Apply defaults for missing fields
  raw.fileTasks ??= '';
  raw.instruction ??= 'implementation';
  raw.customData ??= {};
  return raw as unknown as ProjectData;
}
```

### 2. F002 — Delete the two private `extractSliceIndex` copies

This is a 30-second fix with high leverage. The exported version in `WorkflowNavigator.ts:20` is already re-exported via `node.ts:24`. Both `ConsistencyChecker.ts:24` and `ArtifactIntrospector.ts:162` need only:

```typescript
import { extractSliceIndex } from './WorkflowNavigator.js';
```

and their private definitions removed.

### 3. F003 + F004 — Remove the legacy engine path and `ContextGenerator`

These are ~175 lines of dead code that add confusion and maintenance surface. The legacy path in `ContextIntegrator` (`generateWithLegacySystem`, `DEFAULT_TEMPLATE`, `mapProjectToContext`) is never invoked in production. `ContextGenerator` is a separate redundant implementation exported from the public API.

Delete from `ContextIntegrator`: lines 14-30 (DEFAULT_TEMPLATE), 99-130 (generateWithLegacySystem + mapProjectToContext + mapProjectToContextData), 188-209 (mapProjectToContext), 290-308 (isNewEngineEnabled, setNewEngineEnabled, getDefaultTemplate). Remove the `enableNewEngine` boolean field and constructor parameter. Simplify `generateContextFromProject` to call `generateWithTemplateEngine` directly.

### 4. F013 — Add schema validation to `FileProjectStore.getAll()`

The raw `as ProjectData[]` cast means any structural corruption (truncated write, schema mismatch after downgrade) is silently propagated. Combined with F001, a corrupted `projects.json` returns garbage objects that crash commands with inscrutable errors instead of "projects.json appears corrupted at entry N".

Add a minimal type guard:
```typescript
function isValidProject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null &&
    typeof (raw as Record<string, unknown>).id === 'string' &&
    typeof (raw as Record<string, unknown>).name === 'string';
}
```
Filter with it before `migrateProjectRecord`.

### 5. F010 — Handle `fileConcept` in `resolveFileByIndex` or error explicitly

Right now `cf set concept 1` throws "Searched 'undefined' — no entry for index 1. If this index belongs to a different initiative..." — which is wrong and confusing. The actual problem is that `fileConcept` doesn't support index resolution. A one-line guard before the index resolution logic:

```typescript
if (fieldDef?.group === 'artifacts' && /^\d+$/.test(resolvedValue)) {
  const mapping = ARTIFACT_DIR_MAP[resolvedField];
  if (!mapping) {
    throw new UserError(
      `Field '${resolvedField}' does not support index resolution.`,
      'INVALID_ARGUMENT',
      `Provide a full path: cf set ${fieldDef.aliases[0] ?? resolvedField} <relative/path.md>`,
    );
  }
  // ... rest of index resolution
}
```

---

## Quick Wins

- [ ] **F009** — Deduplicate `MANAGED_MARKER` constant in `setup-ide.ts` (2 lines changed)
- [ ] **F002** — Delete two private `extractSliceIndex` copies and add import (10 lines removed)
- [ ] **F006** — Add `downshift` to `packages/electron/package.json` (1 dep added)
- [ ] **F007** — Narrow `"" | ProjectData` union in `ContextBuilderApp.tsx:71` (add type guard)
- [ ] **F019** — Move `mergeCheckResults` to core (improves re-usability for free)
- [ ] **F016** — Hoist `discoverAllSlicePlans` call above loop in `ruleInitiativeEntryVsArch` (10 lines)

---

## Things That Look Bad But Are Actually Fine

- **99 bare `catch {}` blocks**: Nearly all of these are in parser code (`slicePlanParser`, `documentDetector`, `futureWorkParser`) where the correct behavior on any read error is "return empty result." This is a domain-appropriate pattern — the parsers are scanning an arbitrary project directory and partial failures must not abort the whole scan. The few in `ConsistencyChecker.safeParseSlicePlan`, `safeDetectDocuments`, etc. are also intentional resilience wrappers. The only ones worth scrutinizing are in `applyFixes` (F012) and `FileProjectStore.getAll` (F013) — both flagged separately.

- **`as unknown as Record<string, unknown>` casts in project.ts and contextTools.ts**: These look like type safety violations, but they arise from a real architectural constraint: project fields are stored as a flat string dict on `ProjectData`, but TypeScript doesn't allow string-keyed access on a typed interface without an index signature. The pattern is localized to field-update loops and the intent is clear at each site. The right fix (F005) is an index accessor on `ProjectData`, but in the interim these casts are not unsafe — they're reading and writing known field names from the project schema.

- **`MISSING_TEMPLATE` fallback in `ContextTemplateEngine.getErrorContext`**: This looks like a silent default (CLAUDE.md warns against these), but it's inside an error-context function that generates a clearly-labeled `ERROR:` message when the primary path fails. This is the explicit error surface, not a silent fallback. The `MISSING_TEMPLATE` string is diagnostic intent, not a default value.

- **99 vulnerabilities in `pnpm audit`**: Nearly all are electron/electron-builder transitive deps. The published packages (`@context-forge/core`, `@context-forge/cli`, `@context-forge/mcp`) have zero vulnerability findings — the audit result is dominated by the unpublished Electron app. The 3 React Router CVEs (F015) and 1 `glob` CVE should be fixed, but this is not a "the npm package has CVEs" situation.

- **`readdirSync` in `resolveFileByIndex`**: This is called from `cf set` which is a synchronous CLI command, not an async server. Blocking I/O here is fine. The flag for F011 applies to the services context (SectionBuilder, SystemPromptParser, StatementManager) which run inside async pipelines in the MCP server.

- **No circular dependencies**: `madge --circular` returned clean across all three published packages. The monorepo dependency graph is acyclic and unambiguous.

- **`ContextProfileParser` and `SystemPromptParser` overlap**: These look like two parsers doing similar YAML/prompt work, but they operate on different file formats — `SystemPromptParser` handles the full prompt template file (sections, statements), while `ContextProfileParser` handles the `context_profiles:` YAML block within it. They are complementary, not duplicates.

---

## Open Questions for the Maintainer

1. **Field migration tests (F001)**: Were `should map old-schema fields` and `should strip legacy monorepo fields` written as TDD specs for planned-but-unbuilt migration, or did a refactor break existing implementation? If the latter, there may be real users with old `projects.json` files that are silently broken today.

2. **`ContextGenerator`**: Is this class intentionally kept for electron tests, or is it safe to delete? It would need migrating the electron tests to use `ContextIntegrator` instead.

3. **`detectAvailableTools` / `detectMCPServers` placeholders (F017)**: These return `['npm', 'git', 'vscode']` and `['context7']` unconditionally. Is this intentional (always include as suggestions) or are these supposed to detect actual installed tools? If intentional, remove the "Currently returns placeholder data" comment since it suggests they will be enhanced — which creates false expectation and may confuse contributors.

4. **Electron status**: The README says Electron is "relegated to 2nd priority." Given the 15+ typecheck failures, missing `downshift` dep, and stale test mock shapes, is Electron being actively maintained or is it frozen? The failing typecheck will block the CI `pnpm -r typecheck` step.

5. **`fileConcept` path format (F010)**: The field accepts "a relative path directly (not a bare stem)" per `WorkflowNavigator.ts:296`, but the warn logic in `projectSetAction` (line 261) treats it as an artifact field and will warn if the value doesn't look like `NNN-type.name`. Should `fileConcept` be in the `artifacts` group at all, or should it be moved to `workflow` or get a distinct resolution path?
