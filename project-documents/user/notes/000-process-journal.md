---
docType: notes
layer: project
project: context-forge
audience: [human, ai]
description: Append-only log of process decisions and design reasoning that has no home in other document types
dateCreated: 20260705
dateUpdated: 20260706
status: in_progress
---

# Overview

Each entry is an h2 heading `## YYYYMMDD — Title`, newest first, followed by
**Context** (what prompted it), **Decision** (what was settled), **Rationale**
(why), and optionally **Follow-ups** (issues/slices/docs affected). Entries are
written in timeless decision language — no session transcripts, no line numbers
that drift. When the file exceeds the standard size limit, split per
file-naming-conventions (`-1`, `-2`, …).

# Entries

## 20260706 — Latent bugs surface when workflow changes make rare states durable

**Context:** Issue #56 appeared "suddenly" after months of daily use — `cf next` / `cf list slices` reported a complete slice as "not started."

**Decision:** Treat the trigger as a workflow-tempo change, not a code regression. The `find first unchecked entry = next unstarted` logic and the binary checked/not-started display were present and unchanged since the commands were first written (2026-03). They were wrong the whole time about the tasks-complete-but-unchecked state — but that state used to last minutes (finish tasks, check the box, same sitting). The review-gate workflow (initiative 240) made it a sanctioned, multi-day state: work pauses between "tasks done" and "signed off" while reviews run.

**Rationale:** Process lesson for future investigations: when a "new" bug appears in mature tooling, ask what made the triggering *state* common or durable before assuming the *code* recently changed. Git history of the logic answers the second question quickly; the first requires looking at workflow changes.

**Follow-ups:** Issue #56; slice 911 fixes the underlying logic.

## 20260706 — Plan checkbox demoted: computed task completion is ground truth

**Context:** Issues #56 and #57. Multiple consumers (`WorkflowNavigator.getNext()`, `cf list slices`) treated the slice-plan checkbox as a full status source, mapping unchecked → "not started."

**Decision:** The plan-entry checkbox is a two-state field and may only answer a two-state question. Its single legitimate authority is asserting *complete* (human/agent sign-off, policed by the `task-vs-plan` consistency rule). Unchecked means **not complete** — never "not started." The three-way progress distinction (complete / in-progress / not-started) derives from task-file checkbox counts (`inferredStatus`), which are the finest-grained, mechanically-countable signal available: task checked == task done is the accepted axiom. Precedence for a derived plan-entry status: `deprecated` (frontmatter) > computed task completion > slice-design frontmatter (no task file yet) > checkbox (nothing on disk).

A corollary that generalizes past this bug: hand-maintained **mirrors of computed state** (plan checkbox, design frontmatter status, task-file frontmatter status) are caches for human readability — validated and auto-fixed by `cf check`, never used as decision inputs when the computed source is available. Set-once **declarations of intent** (like `docType`, or a slice declaring itself docs-only) are legitimate frontmatter, because they record design-time intent and do not drift as work progresses.

**Rationale:** Mirrors are claims written at one moment with three uncoordinated writers (humans, agents, `cf check --fix`) and nothing that updates them when reality changes; one logical state change requires edits across three files, and any partial update leaves the system silently lying. The invariants "any task checked ⇒ task file is not not_started" and "task file beyond not_started ⇒ slice design is not not_started" were unenforced (existing rules police only the complete boundary, not the not-started boundary) — slice 911 adds the missing branches.

**Follow-ups:** Issues #56, #57; slice 911 (derivation helper, missing rule branches, docs-only gate declaration); relates to open issue #54 (`deprecated` in frontmatter carries signal checkboxes cannot).

## 20260705 — pending-review is a workflow position, not a document status

**Context:** The review-gate workflow (initiative 240) created a durable "tasks done, review not cleared" state, prompting the question of adding `pending_review` to the valid frontmatter status values in file-naming-conventions.

**Decision:** Not added. The document-status vocabulary (`not_started | in_progress | complete | deferred | deprecated`) describes the work recorded in that document and is hand-maintained. Workflow positions (`needs-design`, `needs-tasks`, `pending-review`, `review-failed`, …) describe where the toolchain says you are — they are computed from artifacts on disk and are never written to frontmatter.

**Rationale:** `pending-review` is the conjunction of two observable facts — tasks complete ∧ review absent-or-not-clearing — and both facts already live on disk (task checkboxes, review artifact verdict). A frontmatter copy would be a hand-maintained mirror of derived state: someone must flip `in_progress → pending_review → complete` as the review lifecycle moves, which is the same fragility class as the plan-checkbox bug (#56).

**Follow-ups:** ai-project-guide to add a note under Valid Status Values that tool-derived workflow positions are not valid frontmatter values. Same pass should fix the review schema's `reviewType` vocabulary (missing `slice` — four position-derived types exist: arch, slice, tasks, code) and decide how CF normalizes `deferred` (present in the guide vocabulary, absent from CF's NormalizedStatus; nothing broken today).
