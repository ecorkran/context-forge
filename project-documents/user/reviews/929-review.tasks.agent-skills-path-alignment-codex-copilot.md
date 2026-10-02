---
docType: review
layer: project
reviewType: tasks
slice: agent-skills-path-alignment-codex-copilot
targetKind: slice
rulesSource: project
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20261002
dateUpdated: 20261002
reviewedSha: aee871eb772c80670c85a41d139863e3b778376d
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 16
turns: 8
promptTokens: 281591
cachedTokens: 220928
completionTokens: 19479
reasoningTokens: 17198
durationSeconds: 156.8
squadronVersion: 0.17.0
findings:
  - id: F001
    severity: pass
    category: traceability
    summary: "Success criteria are fully traced to tasks"
    location: "project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md"
  - id: F002
    severity: note
    category: verification
    summary: "Criterion 6 (setup-ide / init parity) verified only transitively"
    location: "project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md"
  - id: F003
    severity: note
    category: docs
    summary: "Task 7's README search for `.codex/skills` will match nothing"
    location: "README.md:116"
  - id: F004
    severity: note
    category: test-coverage
    summary: "Task 2 (descriptor field) has no test-with pair"
    location: "packages/cli/src/commands/commandInstaller.ts:20-30"
  - id: F005
    severity: note
    category: performance
    summary: "No NFR or load-test requirement in the slice"
    location: "project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md"
---

# Review: tasks — slice 929

**Verdict:** PASS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [PASS] Success criteria are fully traced to tasks

Every functional criterion maps to at least one task: criterion 1 (install to `~/.agents/skills`, print path) → Tasks 1/1a/4; criterion 2 (sweep legacy + separate line) → Tasks 3/3a/4/4a; criterion 3 (leave `.system`/user/hand-made `cf-*` untouched) → Task 3a case 1; criterion 4/4a (uninstall sweeps both dirs; same-dir guard) → Tasks 3/5/5a/3a case 3; criterion 5 (`--local`/`--target` untouched) → Tasks 4a case 3 / 5a case 4; criterion 7 (copilot propagation) → Tasks 6/6a/14. Technical requirements likewise: `resolveInstallDir` test → 1a; the full sweep test matrix → 3a/4a/5a; setup-ide cpSync assertion → 6a; "no duplicated removal logic" → Task 3; no-`any`/build+test → Task 11; the four docs items → Tasks 1/7/8/9. The design's Integration Point instruction to seed 930's plan entry is honored by Task 10. No success criterion lacks a corresponding task, and no task is scope creep.

### [NOTE] Criterion 6 (setup-ide / init parity) verified only transitively

Slice criterion 6 requires `cf setup-ide codex` and `cf init --ide codex` to produce the same result as criteria 1–2. Task 4 addresses this in prose ("Don't change call sites. `setup-ide.ts:294` and `init.ts:141` use the default scope, so they pick this up automatically"), and the existing `setup-ide.test.ts` ("installs skills globally after codex setup") and `init.test.ts` ("installs commands globally for the resolved IDE target") pin the call sites passing the default scope. Because both files mock `installCommandsForTarget`/`installCommandsAction`, the real sweep path for these two entry points is exercised only indirectly through Task 4a. This is adequate but not a dedicated assertion; consider an explicit note in Task 4a or Task 11 confirming the `setup-ide`/`init` default-scope path reaches the sweep. Not blocking.

### [NOTE] Task 7's README search for `.codex/skills` will match nothing

Task 7's second bullet instructs searching the README for `.codex/skills` and changing any machine-level Codex path to `~/.agents/skills`. A grep of the README shows the Codex layout line already reads `.agents/skills/<name>/SKILL.md` and there is no `~/.codex/skills` occurrence, so this bullet is a no-op guard. The first bullet (copilot layout at `.github/{instructions,prompts}/`) is the real change. Harmless, but the task could state that the Codex line is already correct so a reader does not hunt for a missing edit.

### [NOTE] Task 2 (descriptor field) has no test-with pair

Task 2 adds `legacyGlobalDir?: () => string` to `CommandTargetDescriptor` with no immediately following test task, unlike Tasks 1/3/4/5/6 which each pair with an `a` task. This is acceptable: the field's behavior is exercised by Task 3a (sweep uses the descriptor's legacy path) and Task 4a, and Task 2's own success criterion ("no code branches on the target name to find the legacy path") is a code-shape check. No action required.

### [NOTE] No NFR or load-test requirement in the slice

The slice design restates no non-functional requirement and adds no load test, so the load-test-task and CI-gating checks are not applicable. Confirmed by reading the design's Success Criteria (all functional/technical/integration) — nothing requires a `tests/load/` task or CI wiring.

### Run Digest

- Response length: 4053 chars
- Response is newline-free: no
- Tool calls made: 16
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 67478
- Effort: backend default
- Turns: 8
- Tokens — prompt / cached / completion / reasoning: 281591 / 220928 / 19479 / 17198
- Duration: 156.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

---

## Debug: Prompt & Response

### System Prompt

You are a task plan reviewer. Your task is to verify that a task breakdown
covers all success criteria from the parent slice design and that tasks are
correctly sequenced, properly scoped, and independently completable.

Evaluation criteria:
- Cross-reference each success criterion from the slice design against tasks
- Identify success criteria with no corresponding task (gaps)
- Identify tasks that don't trace to any success criterion (scope creep)
- Check task sequencing: dependencies respected, no circular dependencies
- Verify each task is completable by a junior AI with clear success criteria
- Flag tasks that are too large (should be split) or too granular (should be merged)
- Check that test tasks immediately follow their implementation tasks (test-with pattern)
- Verify commit checkpoints are distributed throughout, not batched at end
- If the parent slice restates an NFR, a load test task exists in `tests/load/` covering that NFR (or this task breakdown adds one)
- If a load test task exists, a CI wiring task exists to gate on it; CI gating is not left implicit


CRITICAL: Your verdict and findings MUST be consistent.
- If verdict is CONCERNS or FAIL, include at least one finding with that severity.
- If no CONCERN or FAIL findings exist, verdict MUST be PASS.
- Every finding MUST use the exact format: ### [SEVERITY] Title
- Every finding MUST include a `location:` tag on its own line immediately
  after the title. This applies to PASS findings too.

Choose the `location:` value (most specific form you can verify):
1. Code `path:line` or `path:start-end` — preferred when the issue
   lives in a specific code location. Cite where the issue *lives*,
   not the task ID.
2. `path#symbol` — when the issue is at a named function/class but
   a precise line is awkward.
3. `path` — when the issue spans the whole file.
4. `unverified` — the explicit "I don't know" token. Use this when
   you cannot pin the finding to a code path you are certain exists.
   **A hallucinated path is worse than `unverified`** because it looks
   authoritative; the parser will normalize missing/blank/`-`/`global`
   to `unverified` automatically.

Note: `task_ref:` (linking findings back to specific task IDs) is **not**
currently part of the finding schema. Reference task IDs in prose only.

Report your findings using severity levels:

Use exactly this structure; do not repeat this block in your response.

```markdown
## Summary
[overall assessment: PASS | CONCERNS | FAIL]

## Findings

### [PASS|CONCERN|FAIL] Finding title
location: <path:line | path:start-end | path#symbol | path | unverified>
Description with specific references.
```


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


## Document Paths

Paths written inside project documents (frontmatter fields and body references)
that start with `user/` are relative to `project-documents/`, not the repository root.
Prefix them with `project-documents/` when reading or listing them.


### User Prompt

Review the following task breakdown for completeness and quality:

**Task file:**
<task_file>
project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md
</task_file>
**Slice design:**
<slice_design>
project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md
</slice_design>

Read both documents, then cross-reference success criteria from the slice design
against the tasks. Identify gaps, scope creep, sequencing issues, and tasks that
are too large or too granular.
Report your findings using the severity format described in your instructions.


## File Contents

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

None

### Raw Response

## Summary
PASS — the task breakdown covers every functional and technical success criterion in the slice design, sequences dependencies correctly, and pairs each implementation task with a test task and a commit checkpoint. Only minor informational observations follow.

## Findings

### [PASS] Success criteria are fully traced to tasks
category: traceability
location: project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md
Every functional criterion maps to at least one task: criterion 1 (install to `~/.agents/skills`, print path) → Tasks 1/1a/4; criterion 2 (sweep legacy + separate line) → Tasks 3/3a/4/4a; criterion 3 (leave `.system`/user/hand-made `cf-*` untouched) → Task 3a case 1; criterion 4/4a (uninstall sweeps both dirs; same-dir guard) → Tasks 3/5/5a/3a case 3; criterion 5 (`--local`/`--target` untouched) → Tasks 4a case 3 / 5a case 4; criterion 7 (copilot propagation) → Tasks 6/6a/14. Technical requirements likewise: `resolveInstallDir` test → 1a; the full sweep test matrix → 3a/4a/5a; setup-ide cpSync assertion → 6a; "no duplicated removal logic" → Task 3; no-`any`/build+test → Task 11; the four docs items → Tasks 1/7/8/9. The design's Integration Point instruction to seed 930's plan entry is honored by Task 10. No success criterion lacks a corresponding task, and no task is scope creep.

### [NOTE] Criterion 6 (setup-ide / init parity) verified only transitively
category: verification
location: project-documents/user/tasks/929-tasks.agent-skills-path-alignment-codex-copilot.md
Slice criterion 6 requires `cf setup-ide codex` and `cf init --ide codex` to produce the same result as criteria 1–2. Task 4 addresses this in prose ("Don't change call sites. `setup-ide.ts:294` and `init.ts:141` use the default scope, so they pick this up automatically"), and the existing `setup-ide.test.ts` ("installs skills globally after codex setup") and `init.test.ts` ("installs commands globally for the resolved IDE target") pin the call sites passing the default scope. Because both files mock `installCommandsForTarget`/`installCommandsAction`, the real sweep path for these two entry points is exercised only indirectly through Task 4a. This is adequate but not a dedicated assertion; consider an explicit note in Task 4a or Task 11 confirming the `setup-ide`/`init` default-scope path reaches the sweep. Not blocking.

### [NOTE] Task 7's README search for `.codex/skills` will match nothing
category: docs
location: README.md:116
Task 7's second bullet instructs searching the README for `.codex/skills` and changing any machine-level Codex path to `~/.agents/skills`. A grep of the README shows the Codex layout line already reads `.agents/skills/<name>/SKILL.md` and there is no `~/.codex/skills` occurrence, so this bullet is a no-op guard. The first bullet (copilot layout at `.github/{instructions,prompts}/`) is the real change. Harmless, but the task could state that the Codex line is already correct so a reader does not hunt for a missing edit.

### [NOTE] Task 2 (descriptor field) has no test-with pair
category: test-coverage
location: packages/cli/src/commands/commandInstaller.ts:20-30
Task 2 adds `legacyGlobalDir?: () => string` to `CommandTargetDescriptor` with no immediately following test task, unlike Tasks 1/3/4/5/6 which each pair with an `a` task. This is acceptable: the field's behavior is exercised by Task 3a (sweep uses the descriptor's legacy path) and Task 4a, and Task 2's own success criterion ("no code branches on the target name to find the legacy path") is a code-shape check. No action required.

### [NOTE] No NFR or load-test requirement in the slice
category: performance
location: project-documents/user/slices/929-slice.agent-skills-path-alignment-codex-copilot.md
The slice design restates no non-functional requirement and adds no load test, so the load-test-task and CI-gating checks are not applicable. Confirmed by reading the design's Success Criteria (all functional/technical/integration) — nothing requires a `tests/load/` task or CI wiring.
