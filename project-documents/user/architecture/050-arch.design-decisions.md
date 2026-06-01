---
docType: architecture
layer: project
project: context-forge
archIndex: 50
component: governance
relatedSlices: []
riskLevel: low
dateCreated: 20260531
dateUpdated: 20260531
status: in_progress
---

# Design Decisions

Project-level decision log for cross-cutting choices that are not tied to a single
feature initiative. Each entry records the decision, the alternatives weighed, and
the reasoning — so the same question doesn't get relitigated from memory.

Add new decisions as `## NNN. {Title}` sections in chronological order.

---

## 001. CLAUDE.md handling on `setup-ide` / `init` — replace-with-backup, not merge

**Decision:** When `cf setup-ide` (also invoked by `cf init`) writes `CLAUDE.md`, it
replaces an existing file rather than appending to or merging with it. Safety comes
from a managed-marker check plus a non-destructive backup, not from preserving the
old content in place.

**Current behavior** (`packages/cli/src/commands/setup-ide.ts`):

- A file containing the marker `[//]: # (context-forge:managed)` in its first 20
  lines is treated as context-forge's own output and regenerated silently — no
  prompt, no backup. This makes re-running `init`/`setup-ide` idempotent.
- An existing **unmanaged** file (one the user authored) triggers a warning and a
  confirmation prompt (unless `--yes`), then is copied to `CLAUDE.md.bak` before
  being replaced. An existing `.bak` is preserved, never overwritten.
- The same managed-marker pattern guards the Copilot target's files
  (`.github/copilot-instructions.md`, `AGENTS.md`).

**Alternatives considered:**

1. **Append a managed block** into the user's existing file, leaving their content
   intact.
2. **Prompt at setup time** for replace / append / skip.

**Why replace-with-backup wins:**

- **Rule conflicts are the real risk.** CLAUDE.md is an instruction set the agent
  obeys literally. Appending our rules onto a user's rules can produce direct
  contradictions (e.g. our "keep files ~300 lines" vs. their "no line limits") that
  the agent has no principled way to resolve. A clean replace yields one coherent
  rule set; the `.bak` lets the user merge by hand if they genuinely want both.
- **The managed-marker already solves the case append was meant to protect.**
  Re-runs don't clobber work — managed files regenerate silently, unmanaged files
  prompt and back up.
- **Determinism matters for client/CI processes.** Replace produces a known file
  every run. Append produces output that depends on prior content, which is harder
  to reason about and to support.
- **Append is added complexity the project guidelines tell us to resist** when a
  simpler, safe option exists — and the backup is that safety net.

**Revisit if:** users report that the `.bak` round-trip is too manual in practice
(e.g. they routinely want both their rules and ours), at which point a structured
merge with an explicit conflict-resolution story — not a naive append — would be
the thing to design.
