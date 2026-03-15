---
docType: tasks
slice: enhanced-cf-next-first-run-guidance
project: context-forge
lld: user/slices/203-slice.enhanced-cf-next-first-run-guidance.md
dependencies: []
dateCreated: 20260315
dateUpdated: 20260315
status: in_progress
---

# Tasks: Slice 203 — Enhanced cf next First-Run Guidance

## Context Summary

Extend `WorkflowNavigator.getNext()` with a first-run detection layer. When a fresh project has no active slice, the navigator currently returns generic messages ("Create architecture document", "Set active slice"). This slice inserts a `detectFirstRunContext()` private method into the Priority 2 block that checks five ordered conditions (FR-1 through FR-5) and returns enriched `NextAction` values with concrete `cf` commands when matched.

**Files to modify:**
- `packages/core/src/introspection/WorkflowNavigator.ts`
- `packages/core/tests/introspection/WorkflowNavigator.test.ts`

**Branch:** `203-slice.enhanced-cf-next-first-run-guidance`

---

## Section 1: Setup

- [x] **1.1** Verify branch
  - [x] Run `git branch` — confirm on `main`
  - [x] Create and switch: `git checkout -b 203-slice.enhanced-cf-next-first-run-guidance`

---

## Section 2: Add isFirstRunState() Helper

- [x] **2.1** Add private `isFirstRunState(project, status)` method to `WorkflowNavigator`
  - [x] Signature: `private isFirstRunState(project: ProjectData, archFileExists: boolean, status: WorkflowStatus): boolean`
  - [x] Returns `true` when: active slice status is `'no-active-slice'` AND (`archFileExists === false` OR `status.slicePlan === null`)
  - [x] Returns `false` for any other condition
  - [x] Note: `archFileExists` is passed in (already computed in Priority 2 block) — no duplicate disk reads

- [x] **2.2** Add private `conceptDocExists(project)` helper method
  - [x] Signature: `private conceptDocExists(project: ProjectData): boolean`
  - [x] Returns `true` if `project.fileConcept` is truthy AND the resolved file exists on disk
  - [x] Use `resolveArtifactPath('fileConcept', project.fileConcept)` + `existsSync(join(project.projectPath!, resolvedPath))`
  - [x] Returns `false` if `project.fileConcept` is falsy or file does not exist

- [x] **2.3** Test: `isFirstRunState()` via `getNext()` integration
  - [x] Test: project with no fileSlice + no arch + no plan → `isFirstRunState` path is entered (verified by FR-1/FR-2 behavior in later tests)
  - [x] Test: project with established fileSlice set to in-progress fixture → standard `getNext()` paths unchanged (no first-run interference)

---

## Section 3: Add detectFirstRunContext() — FR-1 and FR-2

- [x] **3.1** Add `detectFirstRunContext()` method stub
  - [x] Signature: `private detectFirstRunContext(project: ProjectData, archFileExists: boolean, status: WorkflowStatus): NextAction | null`
  - [x] Returns `null` by default (filled in by subsequent tasks)
  - [x] Call site: inside Priority 2 block in `getNext()`, after computing `archFileExists` and before existing arch/plan checks. If result is non-null, return it immediately.

- [x] **3.2** Implement FR-1: No phase set
  - [x] Condition: `!project.developmentPhase || project.developmentPhase.trim() === ''`
  - [x] Return:
    ```
    recommendation: "Welcome to Context Forge! Start by setting your project phase."
    rationale: "Your project is registered but no development phase is set. Phases guide what to do next — start with Phase 1 (Concept) to define what you're building."
    suggestedCommand: "cf set phase 'Phase 1: Concept'"
    summary: "Set a development phase to get started"
    ```
  - [x] This is the first check — evaluated before any phase-specific conditions

- [x] **3.3** Test: FR-1
  - [x] Test: project with no `developmentPhase` field → recommendation contains "Welcome to Context Forge" and `suggestedCommand` is `cf set phase 'Phase 1: Concept'`
  - [x] Test: project with `developmentPhase: ''` (empty string) → same FR-1 response

- [x] **3.4** Implement FR-2: Phase 1, no artifacts
  - [x] Condition: `phase.startsWith('Phase 1')` AND `!archFileExists` AND `status.slicePlan === null` AND `!this.conceptDocExists(project)`
  - [x] Return:
    ```
    recommendation: "Your project is in Phase 1 (Concept). Start by describing what you want to build."
    rationale: "Use a concept prompt to guide a conversation with your AI agent about the project idea. This produces a concept document that drives the architecture phase."
    suggestedCommand: "cf build --phase concept"
    summary: "Start Phase 1 — generate a concept prompt with cf build --phase concept"
    ```

- [x] **3.5** Test: FR-2
  - [x] Test: Phase 1 project, no arch file, no plan, no concept doc → recommendation contains "Phase 1 (Concept)" and `suggestedCommand` is `cf build --phase concept`
  - [x] Test: Phase 1 project WITH arch file on disk → FR-2 does NOT fire; falls through to existing "Create or assign a slice plan" logic
  - [x] Test: Phase 1 project WITH concept doc on disk → FR-2 does NOT fire; falls through to existing logic

**Commit:** `feat(core): add first-run detection FR-1 and FR-2 to WorkflowNavigator`

---

## Section 4: Add FR-3, FR-4, and FR-5

- [x] **4.1** Implement FR-3: Phase 2, no arch
  - [x] Condition: `phase.startsWith('Phase 2')` AND `!archFileExists` AND `status.slicePlan === null`
  - [x] Return:
    ```
    recommendation: "Your project is in Phase 2 (Architecture). Create an architecture document."
    rationale: "Use an architecture prompt to define the high-level structure. For small projects, you can skip architecture and go straight to a slice plan."
    suggestedCommand: "cf build --phase architecture"
    summary: "Start Phase 2 — generate an architecture prompt with cf build --phase architecture"
    ```

- [x] **4.2** Test: FR-3
  - [x] Test: Phase 2 project, no arch file, no plan → recommendation contains "Phase 2 (Architecture)" and `suggestedCommand` is `cf build --phase architecture`
  - [x] Test: Phase 2 project WITH arch file on disk → FR-3 does NOT fire; falls through to existing "Create or assign a slice plan" logic

- [x] **4.3** Implement FR-4: Phase 3, no slice plan
  - [x] Condition: `phase.startsWith('Phase 3')` AND `status.slicePlan === null`
  - [x] Note: arch file presence is irrelevant for FR-4 — Phase 3 projects should have an arch by now (or chose to skip it); the missing artifact is the slice plan
  - [x] Return:
    ```
    recommendation: "Your project is in Phase 3 (Slice Planning). Create a slice plan from your architecture."
    rationale: "A slice plan breaks the architecture into deliverable increments. Use a slice-planning prompt to guide the conversation."
    suggestedCommand: "cf build --phase slice-planning"
    summary: "Start Phase 3 — generate a slice-planning prompt with cf build --phase slice-planning"
    ```

- [x] **4.4** Test: FR-4
  - [x] Test: Phase 3 project, no slice plan → recommendation contains "Phase 3 (Slice Planning)" and `suggestedCommand` is `cf build --phase slice-planning`
  - [x] Test: Phase 3 project WITH slice plan set → FR-4 does NOT fire; falls through to FR-5 (or existing "Set active slice" if FR-5 also doesn't apply)

- [x] **4.5** Implement FR-5: Has slice plan, no active slice
  - [x] Condition: `status.slicePlan !== null` (plan loaded successfully) — evaluated last within `detectFirstRunContext()`
  - [x] Return:
    ```
    recommendation: "You have a slice plan but no active slice. Pick your first slice to begin."
    rationale: "Choose the first foundation slice from your plan. Usually this is the first unchecked entry."
    suggestedCommand: "cf set slice <index>"
    summary: "Pick your first slice — cf set slice <index>"
    ```
  - [x] Note: `<index>` is a literal placeholder — consistent with existing "Set active slice" limitation

- [x] **4.6** Test: FR-5
  - [x] Test: project with `fileSlicePlan` set to valid fixture, no active slice → recommendation contains "slice plan but no active slice" and `suggestedCommand` contains `cf set slice`
  - [x] Update existing test `"recommends setting slice when no fileSlice but plan exists"` → match new FR-5 recommendation text (this test will fail without the update)

- [x] **4.7** Test: fallthrough — no first-run condition matches
  - [x] Test: project with no phase, no arch, no plan BUT with `fileSlice` set to in-progress fixture → `detectFirstRunContext()` not entered at Priority 2 (slice IS active), standard Priority 5 "Continue implementation" returned

**Commit:** `feat(core): add first-run detection FR-3, FR-4, FR-5 to WorkflowNavigator`

---

## Section 5: Build & Verify

- [x] **5.1** Build all packages
  - [x] `pnpm build` from repo root — no errors

- [x] **5.2** Run full test suite
  - [x] `pnpm --filter @context-forge/core test` — all pass
  - [x] `pnpm test` from repo root — all packages pass

- [x] **5.3** Smoke test (manual)
  - [x] `cf init --lite --name "fr-test" && cf next` — confirm FR-1 output (welcome message, no phase set)
  - [x] `cf set phase 'Phase 1: Concept' && cf next` — confirm FR-2 output
  - [x] `cf set phase 'Phase 2: Architecture' && cf next` — confirm FR-3 output
  - [x] `cf set phase 'Phase 3: Slice Planning' && cf next` — confirm FR-4 output

**Commit:** `chore: verify build and tests for slice 203`

---

## Section 6: Wrap-up

- [ ] **6.1** Update slice and slice plan status
  - [ ] `203-slice.enhanced-cf-next-first-run-guidance.md` → `status: complete`, `dateUpdated: today`
  - [ ] `200-slices.developer-onboarding.md` → check off slice 203 entry, `dateUpdated: today`

- [ ] **6.2** Write DEVLOG entry

- [ ] **6.3** Final commit
  - [ ] `git add` all changed files
  - [ ] `git commit -m "docs: complete slice 203 enhanced cf next first-run guidance"`

- [ ] **6.4** Merge to main
  - [ ] `git checkout main && git merge 203-slice.enhanced-cf-next-first-run-guidance --no-ff`
