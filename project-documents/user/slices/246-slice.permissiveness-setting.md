---
docType: slice-design
slice: permissiveness-setting
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [245]
interfaces: []
dateCreated: 20261019
dateUpdated: 20261019
status: not_started
---

# Slice Design: Permissiveness Setting

## Overview
A per-project config key, `workflow.permissiveness`, sets how readily AI work waits on the Project Manager. `cf build` (and the MCP `context_build` tool, which shares its pipeline) reads the key on every build and adds the matching rule text, supplied by ai-project-guide, to the context prompt. Issue #122.

## Value
Agents and pipelines invent confirmation gates ("shall I proceed?") that stall unattended runs. The guide's baseline rule already says such gates are invalid and gives a `BLOCKED:` marker for real stops. That one setting does not fit every project. A utilitarian project wants fewer questions; a high-stakes one wants more. This slice lets each project pick, and the change takes effect on the next build, with no install step.

## Technical Scope
Included:
- Config key `workflow.permissiveness` with three levels.
- A build-time section in the context prompt carrying the level's fragment from the guide, in the phases where it applies.
- Clear failure when a selected level has no fragment in the installed guide.
- README and config reference docs.

Excluded:
- The wording of the fragments. ai-project-guide owns it, as it owns general.md. cf ships no level text.
- `cf setup-ide` and the generated rules files. They do not change.
- Any `cf next` or `cf check` behavior. cf does not read `BLOCKED:` markers or enforce waiting. The setting only changes the context the AI is given.
- Sessions that do not run `cf build` or `/cf:build`. Running through cf is the supported way to work, and the setting is part of what it provides.

## Dependencies
### Prerequisites
- Slice 245 is complete. It set the pattern of one `workflow.*` key for one gate.
- ai-project-guide ships the `cautious` and `autonomous` fragments (see D2). The code can be built and tested against fixture fragments before that release; the feature cannot be used for real until it ships.
- The guide request is the first task of this slice, not the last. It is an issue on ai-project-guide that states the path convention, the two level meanings from D1, and the baseline-conflict requirement in Special Considerations. The slice records the issue number and the guide version that satisfies it in this section before the slice is closed. Closing the slice with the feature unusable is allowed only if the PM accepts that explicitly.
- **Satisfied:** ai-project-guide#46 (closed). Guide v0.21.9 ships `rules/permissiveness/cautious.md` and `autonomous.md`. v0.21.7 added the baseline bullet to general.md. The fragments carry `name` and `description` frontmatter and a `### Permissiveness: <level>` heading; neither has `alwaysApply`. This project's installed guide is v0.21.9, so the feature can be exercised for real here; tests use verbatim copies of the fragments as fixtures.

### Interfaces Required
- `ConfigManager` reads the key per checkout, as `resolveIntegrationBranchForPrompt` does for `git.integration_branch`.
- The phase constants in `schema/projectSchema.ts` (`SLICE_DESIGN_PHASE`, `TASK_BREAKDOWN_PHASE`, `IMPLEMENTATION_PHASE`).
- The guide's rules directory, located the way `resolvePromptFilePath` locates the guide.

## Architecture
### Component Structure
- `ConfigKeys.ts`: new key `workflow.permissiveness` and a `PERMISSIVENESS_LEVELS` const, defined once and used by the validator, the default and the fragment lookup.
- `services/permissivenessResolver.ts` (new): follows `integrationBranchResolver.ts`. Given a checkout path and the phase, reads the level and returns the fragment text, or an empty string when nothing applies. Throws on a missing fragment.
- `ContextIntegrator`: takes the resolver as one more injected function, as it already takes the integration-branch and task-file resolvers, and puts the result on the enhanced context data. `createContextPipeline` wires it in.
- `ContextTemplateEngine.buildTemplate`: one new conditional section after the instruction section, present only when the resolver returned text.

The CLI `cf build` and the MCP `context_build` both use `createContextPipeline`, so one wiring change covers both.

Why a separate resolver file: the integrator does not read files or config itself; the task-file and integration-branch lookups are injected, Node.js-only functions. The permissiveness lookup reads config and a guide file, so it takes the same route, and it can be tested without constructing an integrator.

### Data Flow
`cf config set workflow.permissiveness autonomous` → next `cf build` → resolver reads the key for the checkout → if the phase is in the applicable set, loads `<guide rules>/permissiveness/autonomous.md` → integrator attaches the text to the context data → engine renders it as its own section after the instruction prompt.

### State Management
One config value per checkout, stored like every other `workflow.*` key. Each git worktree has its own value. Nothing is generated or persisted elsewhere, so there is nothing to refresh when the level changes.

## Technical Decisions
### D1 — Key name and levels
Status: decided
- Key `workflow.permissiveness`, string enum: `cautious`, `standard`, `autonomous`. Default `standard`.
- `cautious` waits readily, including at phase boundaries. `standard` is today's behavior: waits only where the work needs the PM, and invented gates are invalid. `autonomous` suppresses waits in slice design and task breakdown, using `BLOCKED:` for real stops.
- A non-enum value is rejected by the validator, as `workflow.decision_gate_enabled` rejects non-booleans.
- Rejected: two levels (no way to say "like today"); four or five (more wording to maintain than PMs can tell apart). Chosen by the PM.

### D2 — Fragment source is the guide
Status: decided
- ai-project-guide ships fragments in a `permissiveness/` subdirectory of its rules directory: `cautious.md` and `autonomous.md`. cf selects one; it holds no level wording.
- The subdirectory is invisible to `cf setup-ide`. `listMarkdownFiles` reads one directory level and keeps only files, so the fragments are never installed as scoped rules or treated as alwaysApply. A test pins this.
- Rejected: wording inside cf (splits rule text across two repos); markers inside general.md (every raw consumer of general.md would see all levels). Chosen by the PM.

### D3 — Delivery is the build, not setup-ide
Status: decided
- The level reaches the AI through `cf build` / `context_build`, which read config on every call. A change applies at the next build.
- Rejected: compiling the fragment into CLAUDE.md, AGENTS.md and copilot-instructions.md during `cf setup-ide`. Changing a setting would then require a reinstall with wide side effects. Chosen by the PM, who accepts that sessions outside `cf build` / `/cf:build` do not get the setting.

### D4 — `standard` needs no fragment
Status: decided
- `standard` adds nothing. The baseline rule in general.md already is the standard behavior, so a project on the default level, or on an older guide, builds exactly as before.
- Only `cautious` and `autonomous` need a fragment from the guide.

### D5 — The fragment applies in phases 4, 5 and 6
Status: decided
- The section appears when the project is in slice design, task breakdown or implementation, identified by the schema's phase constants. Elsewhere (concept, initiative plan, architecture, slice plan) waiting is allowed at every level, per the issue, so the section is omitted.
- Phase 6 is included because unattended runs spend most of their time there and invented gates stall them most. The set is one constant, so changing it is a one-line edit.
- Phase scoping lives in cf. The fragments stay phase-agnostic and short.
- The phase is the `instruction` value on the enhanced context data. That is the value the integrator already uses to choose the instruction prompt, so the fragment always accompanies the prompt it qualifies. `cf set phase` keeps `instruction` in step, and a worktree's own context supplies its own value.
- An `instruction` that is not one of the schema's phase strings (a custom instruction, or unset) is not an applicable phase: the section is omitted. That is defined behavior, not a fallback, because custom instructions are a supported input and have no phase to scope to. A test pins it.

### D6 — A missing fragment is an error
Status: decided
- If the level is `cautious` or `autonomous` and the phase applies, each of these fails the build with a named error:
  - The guide cannot be located (the existing guide-resolution error propagates).
  - The fragment file is missing. The message names the level and the expected path, says the installed guide may predate this feature, and points to `cf guides update`.
  - The file exists but cannot be read. The message carries the path and the underlying error.
  - The file has no body: it is empty, whitespace-only, or only frontmatter. An empty fragment would otherwise look like `standard`.
- The fragment files begin with YAML frontmatter. The resolver strips it and injects only the body, which opens with its own `### Permissiveness: <level>` heading. The frontmatter is a guide-side file convention, not prompt content. Core's `parseFrontmatterText` returns only the key/values, not the body, and the installer's helper lives in the cli package, so the resolver carries one small leniently-written function that drops a leading `---` block (any line endings, trailing whitespace allowed). A test uses the real v0.21.9 file text as its fixture.
- No silent fallback to `standard`: a project that asked for autonomous work must not quietly get the default. This follows the existing rule that a failing config read propagates.
- Failures are raised only when the phase applies. A project on `autonomous` with a bad fragment can still run `cf build` in the concept phase.

### D7 — cf does not enforce waiting
Status: decided
- `BLOCKED:` is a convention for the AI and the PM. Recognizing it in task files or surfacing it in `cf next` is separate work and is not in this slice. If wanted, it becomes its own issue.

## Integration Points
### Provides to Other Slices
- A stable key and fragment path convention (`rules/permissiveness/<level>.md`) that the guide and Squadron can target.

### Consumes from Other Slices
- Guide fragments from ai-project-guide. If the guide lacks them, D6 applies.

## Success Criteria
### Functional Requirements
- `cf config set workflow.permissiveness <level>` accepts the three levels and rejects anything else with a message listing them.
- With the default level, `cf build` output is byte-identical to today's in every phase.
- With `cautious` or `autonomous` and a fragment present, `cf build` in phases 4, 5 and 6 contains the fragment after the instruction prompt, and in other phases does not.
- Changing the level changes the next build's output, with no other step.
- A missing fragment in an applicable phase fails the build with the D6 message.
- A worktree with its own value gets its own fragment.
- The MCP `context_build` tool produces the same section as the CLI.

### Technical Requirements
- Level names and the applicable-phase set are each defined once; no repeated string literals.
- Resolver tests cover: validator, each level in an applicable and a non-applicable phase, a custom or unset `instruction`, every D6 failure (including the empty file), and the subdirectory not being picked up by setup-ide as a rule.
- One pipeline-level test confirms the section lands after the instruction prompt. CLI and MCP each get a smoke test; both share the pipeline, so no separate parity matrix.
- Tests use a fragment fixture in the shape the guide will ship.
- Existing build and setup-ide tests pass unchanged.

### Integration Requirements
- Squadron and other pipelines that build context through cf receive the section with no changes of their own.

### Verification Walkthrough
1. In a design-phase project, save `cf build` output at the default level (`cf config get workflow.permissiveness` prints `standard`).
2. Put a test fragment at `<guide>/project-guides/rules/permissiveness/autonomous.md`, run `cf config set workflow.permissiveness autonomous`, then `cf build`. The fragment appears after the instruction prompt. The MCP `context_build` tool shows the same section.
3. `cf set phase` to an architecture phase and rebuild. The fragment is absent.
4. Set `cautious` with no `cautious.md` present, return to a design phase and build. The build fails naming the missing path.
5. Set `bogus`. It is rejected and the valid levels are listed.
6. Set `standard` and rebuild. The output matches step 1.

## Implementation Notes
### Development Approach
1. Raise the two fragments with ai-project-guide first, with the phase-scope wording from #122, and record the issue number in Dependencies.
2. Config key, constant and validator, with tests.
3. `permissivenessResolver.ts` with tests, including every D6 failure and the phase set.
4. Wire it through `ContextIntegrator`, `createContextPipeline` and the template engine; add the pipeline test and the CLI and MCP smoke tests.
5. Test that setup-ide ignores the `permissiveness/` subdirectory.
6. Docs: README and config reference (the config key and the fragment path convention; the project documents config keys in one place).
7. Before closing, record the guide version that ships the fragments.

### Special Considerations
- Baseline conflict, for the guide request: general.md calls invented confirmation gates invalid, while `cautious` asks for more waiting. The guide's `cautious` fragment must say plainly that it overrides that baseline rule for the phases it applies in, otherwise the AI sees two contradicting instructions. cf cannot settle this; the guide owns the wording.
- Slice 246 ships cf support only. The feature goes live when ai-project-guide releases the fragments. Releasing cf first is safe: default users see no change.
