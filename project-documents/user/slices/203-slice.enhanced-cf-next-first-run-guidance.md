---
docType: slice-design
slice: enhanced-cf-next-first-run-guidance
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20260315
dateUpdated: 20260315
status: not_started
---

# Slice 203: Enhanced cf next First-Run Guidance

## Overview

Extend `WorkflowNavigator.getNext()` to detect sparse/fresh project state and return richer, actionable first-run recommendations. The current navigator returns generic terse messages (e.g., "Create architecture document") that are appropriate for experienced users but unhelpful for someone who just ran `cf init` for the first time. This slice adds a detection layer that checks for first-run conditions before the standard state-machine runs.

## Value

Closes the "now what?" gap after `cf init`. New users see actionable guidance with concrete `cf` commands and context about what each step is for. Standard recommendations remain unchanged for established projects.

## Technical Scope

**Included:**
- Add `detectFirstRunContext(project, status)` private method to `WorkflowNavigator`
- Add `isFirstRunState(project, status)` private helper to gate first-run logic
- Override specific `getNext()` return paths with enriched recommendations for first-run states
- Unit tests for each new first-run condition
- No changes to `NextAction` type, `WorkflowStatus` type, or `getStatus()`
- No changes to CLI `cf next` or MCP `workflow_next` — the shape is unchanged

**Excluded:**
- Persisting first-run state or marking a project as "onboarded"
- Interactive prompts or TTY detection
- Changes to `cf status` / `workflow_status` output
- Any UI changes beyond text content of `NextAction` fields

## Architecture

### Approach: Pre-empt at Priority 2

The current state machine has a clear first-run gap at **Priority 2** (no active slice). This is where all fresh projects land. The enhanced logic inserts a first-run context detection pass inside the existing Priority 2 block, before returning generic recommendations.

A first-run condition is defined as: **project has no active slice AND no established artifacts (arch file missing, no slice plan, early phase)**. Once any artifact is present, the project has moved past first-run and standard recommendations apply.

The priority order is preserved:
1. Priority 1: No projectPath — unchanged
2. Priority 2: No active slice → **detect first-run sub-conditions first, then fall through to existing logic**
3. Priority 3–7: unchanged

### First-Run Sub-Conditions (evaluated in order within Priority 2)

| Condition | Detection | Enhanced Recommendation |
|---|---|---|
| **FR-1: No phase set** | `!project.developmentPhase` OR phase is empty string | Welcome message + suggest setting phase or starting a concept discussion |
| **FR-2: Phase 1, no artifacts** | `phase starts with 'Phase 1'` AND no arch file AND no slice plan AND no concept doc | Concept phase guidance with `cf build --phase concept` suggestion |
| **FR-3: Phase 2, no arch** | `phase starts with 'Phase 2'` AND no arch file AND no slice plan | Architecture phase guidance + small-project shortcut suggestion |
| **FR-4: Phase 3, no slice plan** | `phase starts with 'Phase 3'` AND no slice plan | Slice planning guidance with `cf build --phase slice-planning` suggestion |
| **FR-5: Has slice plan, no active slice** | `status.slicePlan !== null` AND no active slice | Pick-first-slice guidance with `cf set slice <filename>` |

If no first-run sub-condition matches, fall through to the existing Priority 2 logic unchanged.

**FR-5 replaces the existing "Set active slice" return** with richer text — this is the only case where an existing return value gets new content. FR-1 through FR-4 are new return paths that replace "Create architecture document" / "Create or assign a slice plan" for fresh projects.

### Artifact Detection Helpers

First-run detection needs to check whether files actually exist on disk (same approach as the existing arch-file check in Priority 2). The `isFirstRunState()` helper:

```
isFirstRunState(project, status):
  - no active slice (status.activeSlice?.status === 'no-active-slice' or no activeSlice)
  - AND (no arch file on disk OR no slice plan)
  - Returns: boolean
```

The `detectFirstRunContext()` method:

```
detectFirstRunContext(project, status):
  - Evaluates FR-1 through FR-5 in order
  - Returns: NextAction | null (null = no first-run condition matched)
```

### Phase String Matching

Phase values are free-form strings (e.g., `"Phase 1: Concept"`, `"Phase 2: Architecture"`). Match with `startsWith('Phase 1')`, `startsWith('Phase 2')`, etc. — not exact equality. This tolerates subtitle variations.

### Concept Doc Detection

`fileConcept` is a field on `ProjectData`. If set AND the file exists on disk, the project has a concept doc. Detection: check `project.fileConcept` is truthy and file exists at `resolveArtifactPath('fileConcept', ...)`. If `fileConcept` is not set, treat as no concept doc (consistent with arch file detection pattern).

### Enhanced Recommendation Text

**FR-1 — No phase set:**
```
recommendation: "Welcome to Context Forge! Start by setting your project phase."
rationale: "Your project is registered but no development phase is set. Phases guide what to do next — start with Phase 1 (Concept) to define what you're building."
suggestedCommand: "cf set phase 'Phase 1: Concept'"
summary: "Set a development phase to get started"
```

**FR-2 — Phase 1, no artifacts:**
```
recommendation: "Your project is in Phase 1 (Concept). Start by describing what you want to build."
rationale: "Use a concept prompt to guide a conversation with your AI agent about the project idea. This produces a concept document that drives the architecture phase."
suggestedCommand: "cf build --phase concept"
summary: "Start Phase 1 — generate a concept prompt with cf build --phase concept"
```

**FR-3 — Phase 2, no arch:**
```
recommendation: "Your project is in Phase 2 (Architecture). Create an architecture document."
rationale: "Use an architecture prompt to define the high-level structure. For small projects, you can skip architecture and go straight to a slice plan."
suggestedCommand: "cf build --phase architecture"
summary: "Start Phase 2 — generate an architecture prompt with cf build --phase architecture"
```

**FR-4 — Phase 3, no slice plan:**
```
recommendation: "Your project is in Phase 3 (Slice Planning). Create a slice plan from your architecture."
rationale: "A slice plan breaks the architecture into deliverable increments. Use a slice-planning prompt to guide the conversation."
suggestedCommand: "cf build --phase slice-planning"
summary: "Start Phase 3 — generate a slice-planning prompt with cf build --phase slice-planning"
```

**FR-5 — Slice plan, no active slice:**
```
recommendation: "You have a slice plan but no active slice. Pick your first slice to begin."
rationale: "Choose the first foundation slice from your plan. Usually this is the first unchecked entry."
suggestedCommand: "cf set slice <index>"
summary: "Pick your first slice — cf set slice <index>"
```

Note: FR-5's `suggestedCommand` uses `<index>` as a placeholder since the navigator doesn't know the first slice index without parsing the plan. The existing Priority 2 "Set active slice" path already has this limitation — consistency is fine here.

## File Changes

| File | Change |
|---|---|
| `packages/core/src/introspection/WorkflowNavigator.ts` | Add `detectFirstRunContext()` + `isFirstRunState()` private methods; modify Priority 2 block to call them |
| `packages/core/tests/introspection/WorkflowNavigator.test.ts` | Add `describe('first-run conditions')` block with tests for each FR-1–FR-5 case |

No other files change.

## Integration Points

### Consumes
- `ProjectData.developmentPhase`, `ProjectData.fileConcept`, `ProjectData.fileArch`, `ProjectData.fileSlicePlan`, `ProjectData.fileSlice` — all already read in the navigator
- `resolveArtifactPath()` — already imported
- `existsSync` — already imported

### Provides
- Same `NextAction` shape — `recommendation`, `rationale`, `suggestedCommand`, `summary`
- `workflow_next` MCP tool and `cf next` CLI consume this unchanged

## Success Criteria

1. Phase 1 project (no concept, no arch, no slice plan) → `recommendation` contains "Phase 1 (Concept)" and `suggestedCommand` is `cf build --phase concept`
2. Phase 2 project (no arch, no slice plan) → `recommendation` contains "Phase 2 (Architecture)" and `suggestedCommand` is `cf build --phase architecture`
3. Phase 3 project (no slice plan) → `recommendation` contains "Phase 3 (Slice Planning)" and `suggestedCommand` is `cf build --phase slice-planning`
4. Project with slice plan but no active slice → `recommendation` contains "no active slice" and is more informative than "Set active slice"
5. Fresh project with no phase set → `recommendation` contains welcome text and `suggestedCommand` is `cf set phase`
6. Project with arch file on disk → first-run FR-2 does NOT fire; falls through to existing logic
7. Project with established slice → no first-run logic fires; all existing getNext() paths unchanged
8. All existing `WorkflowNavigator` tests pass unchanged
9. New unit tests cover each FR-1–FR-5 condition and the fallthrough case

## Verification Walkthrough

### 1. Fresh project — no phase

```bash
cf init --lite --name "vw-test"
cd /tmp/vw-test   # or wherever init ran
cf next
```

Expected output:
```
Next:      Welcome to Context Forge! Start by setting your project phase.
Rationale: Your project is registered but no development phase is set...
Run:       cf set phase 'Phase 1: Concept'
```

### 2. Phase 1 project — no artifacts

```bash
cf set phase 'Phase 1: Concept'
cf next
```

Expected:
```
Next:      Your project is in Phase 1 (Concept). Start by describing what you want to build.
Run:       cf build --phase concept
```

### 3. Phase 2 project — no arch

```bash
cf set phase 'Phase 2: Architecture'
cf next
```

Expected:
```
Next:      Your project is in Phase 2 (Architecture). Create an architecture document.
Run:       cf build --phase architecture
```

### 4. Phase 3 project — no slice plan

```bash
cf set phase 'Phase 3: Slice Planning'
cf next
```

Expected:
```
Next:      Your project is in Phase 3 (Slice Planning). Create a slice plan from your architecture.
Run:       cf build --phase slice-planning
```

### 5. Project with slice plan, no active slice

```bash
cf set slicePlan user/architecture/some-slices.md   # an existing slice plan
cf next
```

Expected:
```
Next:      You have a slice plan but no active slice. Pick your first slice to begin.
Run:       cf set slice <index>
```

### 6. Regression: established project unchanged

On any project that already has `fileSlice` set and tasks in progress:
```bash
cf next
```

Expected: same output as before this slice (standard "Continue implementation" or similar).

## Implementation Notes

- All detection is read-only and stateless. No writes to project data.
- The `isFirstRunState()` helper must check disk for the arch file (same logic as existing Priority 2) — do not check `project.fileArch` alone (field may be set but file not created yet).
- FR-5 is the least "fresh" scenario (slice plan exists) — it replaces the existing "Set active slice" text with more context. Make sure the existing test "recommends setting slice when no fileSlice but plan exists" is updated to match the new text.
- Keep the first-run detection in a single private method so it can be tested directly or swapped later.

## Effort

2/5 — Additive logic in one file, no schema changes. The main complexity is getting the detection conditions right and writing thorough tests.
