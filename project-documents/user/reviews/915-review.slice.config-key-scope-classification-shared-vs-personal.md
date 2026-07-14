---
docType: review
layer: project
reviewType: slice
slice: config-key-scope-classification-shared-vs-personal
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260713
dateUpdated: 20260713
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Missing explicit failure-mode enumeration for new I/O paths"
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md#Migration-Plan
  - id: F002
    severity: concern
    category: error-handling
    summary: "migrate-personal collision semantics undefined"
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md#Migration-Plan
  - id: F003
    severity: concern
    category: interface-compatibility
    summary: "ConfigResult.source union expansion impact on existing consumers understated"
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md#API-Contracts
  - id: F004
    severity: pass
    category: architectural-alignment
    summary: "Themed scoping aligns with architecture's \"slice by theme\" principle"
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md#Overview
  - id: F005
    severity: pass
    category: design-quality
    summary: "Internal routing design prevents a class of caller bugs"
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md#Technical-Decisions
  - id: F006
    severity: note
    category: scope
    summary: "Slice falls within architecture scope despite not being in \"Anticipated Slices\""
    location: project-documents/user/slices/915-slice.config-key-scope-classification-shared-vs-personal.md
---

# Review: slice — slice 915

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Missing explicit failure-mode enumeration for new I/O paths

The slice introduces three new I/O surfaces—reads/writes to `.context-forge.local.toml`, the `migrate-personal` two-file operation, and `.gitignore` mutation in `cf init`—but enumerates no failure modes or handling strategies for any of them. The `migrate-personal` command is the most critical gap: it reads personal keys from the shared file, writes them to the personal file, then deletes them from the shared file. If the write to the personal file fails (permission denied, disk full, TOML serialization error) the operation should abort before the delete; if the delete fails after a successful write, the key exists in both files. The read-time fallback implicitly provides resilience here (personal file takes precedence, ConsistencyChecker re-flags the stale shared-file entry), but this is an *implicit* strategy, not an explicit one. The evaluation criteria require explicit handling strategies, not implicit ones. The design should state: (1) operation ordering and rollback semantics for `migrate-personal`, (2) what happens on `.context-forge.local.toml` write failures during `ConfigManager.set`, and (3) how `.gitignore` append failures are surfaced in `cf init`.

### [CONCERN] migrate-personal collision semantics undefined

The `migrate-personal` command's behavior is undefined when the personal file already contains a value for a key being migrated. If `.context-forge.local.toml` has `git.integration_branch = "dev/alice"` and `.context-forge.toml` has `git.integration_branch = "main"`, does `migrate-personal` overwrite the personal value, skip the key, prompt, or error? The read precedence ensures the personal file's value wins at runtime, so a silent overwrite of a personal-file value with the shared-file's (likely stale) value would be a data loss for the developer's local preference. This collision case must be specified explicitly.

### [CONCERN] ConfigResult.source union expansion impact on existing consumers understated

The `ConfigResult.source` type changes from `'project' | 'user' | 'default'` to `'project-personal' | 'project' | 'user' | 'default'`. The document states "no signature changes to get/set/delete/list" and that existing callers "continue to call these methods exactly as today and needs no changes beyond what's listed in Technical Scope." However, any consumer that switches exhaustively on `source` (e.g., CLI display logic that formats output differently per source, or MCP `configTools.ts` response construction) will need updating to handle the new `'project-personal'` variant. TypeScript will catch this at compile time for exhaustive switches, but the claim that no callers need changes is imprecise—the document should acknowledge which consumers inspect `source` and confirm they are updated or tolerant of the new value.

### [PASS] Themed scoping aligns with architecture's "slice by theme" principle

The slice is cohesively themed around a single concern (config key scope classification and file routing), not a grab-bag of unrelated fixes. It has clear success criteria, a defined migration path, and explicit exclusions. This directly aligns with the architecture's principles of "slice by theme, not by urgency" and "opportunistic but intentional."

### [PASS] Internal routing design prevents a class of caller bugs

The decision to keep `ConfigManager`'s public API unchanged (`scope: 'user' | 'project'`) and route internally based on `CONFIG_KEYS[key].scope` is well-justified. It eliminates an entire class of caller bug (writing a personal key to the shared file by passing the wrong scope) and means no existing call site needs to learn about shared-vs-personal semantics. This is a sound separation-of-concerns decision.

### [NOTE] Slice falls within architecture scope despite not being in "Anticipated Slices"

The architecture document's "Anticipated Slices" list does not include this specific work, but that list is clearly non-exhaustive. This slice falls under two of the architecture's stated scope items: "hard-coded values → configuration or constants" (formalizing an implicit shared/personal distinction into an explicit classification) and "developer experience improvements" (preventing personal-setting leakage). No scope creep.
