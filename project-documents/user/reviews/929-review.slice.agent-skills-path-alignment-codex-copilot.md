---
docType: review
layer: project
reviewType: slice
slice: agent-skills-path-alignment-codex-copilot
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20261002
dateUpdated: 20261002
reviewedSha: 3a9ab36c1da5799baf258a521636f5403cfd138b
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 35
turns: 16
promptTokens: 875443
cachedTokens: 766848
completionTokens: 65983
reasoningTokens: 61605
durationSeconds: 430.4
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "Scope, boundaries, and decisions align with the maintenance architecture"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:84-97"
  - id: F002
    severity: concern
    category: uncategorized
    summary: "Legacy sweep has no guard against the legacy dir aliasing the new install dir"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:69-82"
  - id: F003
    severity: concern
    category: uncategorized
    summary: "Copilot propagation criterion and walkthrough step 4 are not demonstrable with the guide as designed"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:188-199"
  - id: F004
    severity: concern
    category: uncategorized
    summary: "Uninstall-side sweep output is unspecified and would misattribute the removed paths"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:76"
  - id: F005
    severity: note
    category: uncategorized
    summary: "The ownership guard now applies to a directory cf has left, and removal is unrecoverable"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:210-211"
  - id: F006
    severity: note
    category: uncategorized
    summary: "Mid-sweep failure leaves a partially cleaned legacy dir with no stated semantics"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md:97"
---

# Review: slice — slice 929

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [PASS] Scope, boundaries, and decisions align with the maintenance architecture

The parent architecture's principles are satisfied: the slice is themed ("Agent Skills Path Alignment") rather than one-fix-per-file, it changes no behavior without tests (the Technical Requirements enumerate tests for the sweep, the ownership rule, scope-flag skipping, uninstall, missing dir, and install-failure ordering), and it has concrete success criteria rather than open-ended cleanup. It stays inside the descriptor-driven boundaries the architecture's scope permits ("Developer experience improvements", "Hard-coded values → configuration or constants"): no new module, no new dependency edge, no change to `--local`/`--target` resolution or the `claude` target. It also closes both questions the 900 slice plan explicitly required the design to settle — (a) sweep on every default-scope run with reporting only when something was removed (D2), and (b) copilot keeps `.github/prompts` in `propagateDirs` (D4).

### [CONCERN] Legacy sweep has no guard against the legacy dir aliasing the new install dir

The data flow is "install into `~/.agents/skills` first, then sweep `~/.codex/skills`", and D2 makes the sweep unconditional on every default-scope install. Nothing in the design establishes that the two paths are distinct. If a user has aliased them — `~/.codex/skills` symlinked to `~/.agents/skills`, or `~/.agents` symlinked to `~/.codex` — a plausible migration step for someone consolidating two skill roots, the sweep's `readdir` target resolves to the same directory that was just written, and `removeManagedSkillDirs(legacyDir, keep = ∅)` deletes the freshly installed `cf-*` skills. The user is left with the install reported as successful and no skills on disk. This is the same class of self-targeting bug this project has already hit twice in this exact area (the `propagateToWorktrees` path that had to filter a worktree whose resolved path equals the project root, and the `cpSync` onto itself). The design should state an explicit same-directory check (resolve both paths and compare, and fail loudly or skip the sweep) rather than leave it implicit. The stated ownership guard does not help here: `cf-*` plus `SKILL.md` is exactly what was just written.

### [CONCERN] Copilot propagation criterion and walkthrough step 4 are not demonstrable with the guide as designed

Success criterion 7 and walkthrough step 4 assume a root `.agents/skills` containing "skills written by the guide", and assert that before this slice the worktree path "fails with 'No such file or directory'". I verified the guide vendored in this repo (`project-documents/ai-project-guide/`): `scripts/setup-ide` gates every skill copy on `[ -d "$SKILLS_SOURCE_DIR" ]`, `project-guides/skills/` does not exist in the tree, and the guide's own CHANGELOG at 0.18.1 states the `analyze` skill "was the only shipped skill, so `setup-ide` currently installs no skills on any target." On that guide, `cf setup-ide copilot` never creates `.agents/skills` at the root, `propagateToWorktrees` skips the missing source dir, and `ls ../scratch-wt/.agents/skills` fails identically before and after the change — the step cannot distinguish the fixed behavior from the bug it fixes. I could not verify whether the guide version this slice targets (v0.19.0, per the 930 plan entry) ships skills again, so this may resolve itself; but the design should either name the guide version whose skill source makes the step meaningful or seed the fixture explicitly (e.g. create a `.agents/skills/<name>/SKILL.md` at the scratch root before `cf setup-ide copilot`, or use a `--local` cf skill install as the source).

### [CONCERN] Uninstall-side sweep output is unspecified and would misattribute the removed paths

For the install path the design specifies exactly what is printed and when ("If the sweep removed anything, add one line naming the legacy dir and the removed skills", criterion 2). For the uninstall path it says only that the same sweep runs, "so an uninstall after upgrading leaves nothing behind in either place". The existing uninstall report is a single line of the form "Removed N skills from <dir>", where `<dir>` is the resolved install directory — if the sweep's removals are folded into that count, the command will report removals from `~/.agents/skills` that actually came from the legacy `~/.codex/skills`, which is the same "output must match what actually happened" defect this repo has already fixed elsewhere. Success criterion 4 states the outcome but not the reporting contract. Specify whether the legacy removals are reported on their own line (as on the install path) or merged, and what the count/`<dir>` pair means in each case.

### [NOTE] The ownership guard now applies to a directory cf has left, and removal is unrecoverable

The design discloses this honestly and argues the exposure equals the pre-existing stale-prune exposure. That argument is weaker than stated: stale-prune only ever removed directories inside the directory cf actively manages, whereas this sweep deletes from a directory cf is abandoning, one that by construction also holds content it does not own (`.system`) and that a user may reasonably consider theirs. `cf-something/SKILL.md` placed there by hand is removed with no backup and no dry-run. Accepted-risk-by-disclosure is a legitimate outcome; if it is accepted, a `--dry-run`-style escape hatch or a one-line backup before removal would remove the asymmetry. Not blocking.

### [NOTE] Mid-sweep failure leaves a partially cleaned legacy dir with no stated semantics

"An unreadable legacy dir fails the command with its real error" covers the initial `readdir`. It does not cover a per-entry removal failure partway through the loop (a read-only child, an EPERM, a concurrent second `cf` run): the command exits non-zero *after* the install already succeeded, with some legacy skills gone and some not. This is a new filesystem-I/O path, so the failure-mode handling should be stated rather than implied by "errors propagate" — even if the chosen answer is simply "propagate; the next run is idempotent and completes the sweep", which is consistent with D2's self-healing rationale.

### Run Digest

- Response length: 7499 chars
- Response is newline-free: no
- Tool calls made: 35
- Tool calls failed: 1
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 251982
- Effort: backend default
- Turns: 16
- Tokens — prompt / cached / completion / reasoning: 875443 / 766848 / 65983 / 61605
- Duration: 430.4 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6
