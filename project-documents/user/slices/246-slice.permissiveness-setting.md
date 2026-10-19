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
A per-project config key, `workflow.permissiveness`, sets how readily AI work waits on the Project Manager. `cf setup-ide` reads it and appends the matching rule text to the generated rules block in CLAUDE.md, AGENTS.md and copilot-instructions.md. Issue #122.

## Value
Agents and pipelines invent confirmation gates ("shall I proceed?") that stall unattended runs. The guide's baseline rule already says such gates are invalid and gives a `BLOCKED:` marker for real stops. That one setting does not fit every project. A utilitarian project wants fewer questions; a high-stakes one wants more. This slice lets each project pick, without forking the guide.

## Technical Scope
Included:
- Config key `workflow.permissiveness` with three levels.
- `cf setup-ide` appends a level fragment, supplied by ai-project-guide, to the generated rules block for all three compiled targets.
- Clear failure when a selected level has no fragment in the installed guide.
- README and config reference docs.

Excluded:
- The wording of the fragments. ai-project-guide owns it, as it owns general.md. cf ships no level text.
- Any `cf next` or `cf check` behavior. cf does not read `BLOCKED:` markers or enforce waiting. The setting only changes the rules the AI is given.
- Per-phase config. Phase scope lives in the fragment wording.

## Dependencies
### Prerequisites
- Slice 245 is complete. It introduced the pattern of one `workflow.*` config key for one gate.
- ai-project-guide ships the `cautious` and `autonomous` fragments (see D2). The code can be built and tested against fixture fragments before that release; the feature cannot be used for real until it ships.

### Interfaces Required
- `ConfigManager` reads the key per checkout, as `setup-ide` already does for `rules.exclude`.
- Guide path resolution (`GuidePaths`) locates the fragment directory.

## Architecture
### Component Structure
- `ConfigKeys.ts`: new key `workflow.permissiveness` and a `PERMISSIVENESS_LEVELS` const, defined once and used by the validator, the default and the fragment lookup.
- `ideInstall/permissiveness.ts` (new): given the level and the guide's rules directory, returns the fragment text to append, or an empty string for `standard`. Throws on a missing fragment.
- `ideInstall/rules.ts`: `compileClaudeRules` gains the same `trailing` parameter `compileAlwaysOnRules` already has. All three targets pass the fragment as trailing content, inside the managed block.
- `commands/setup-ide.ts`: reads the level per checkout, next to `rules.exclude`, and passes it into the install context.

### Data Flow
`cf config set workflow.permissiveness autonomous` → `cf setup-ide <target>` reads the key → `permissiveness.ts` loads `<guide rules>/permissiveness/autonomous.md` → compile functions append it after the always-on rules → written into the managed block.

### State Management
One config value per checkout, stored like every other `workflow.*` key. Each git worktree has its own value. Nothing is persisted elsewhere. The generated files carry the result, so changing the key takes effect on the next `cf setup-ide`.

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
- The subdirectory is invisible to current rule handling. `listMarkdownFiles` reads one directory level and keeps only files, so the fragments are never installed as scoped rules or treated as alwaysApply. A test pins this.
- Rejected: wording inside cf (splits rule text across two repos); markers inside general.md (every raw consumer of general.md would see all levels). Chosen by the PM.

### D3 — `standard` needs no fragment
Status: decided
- `standard` appends nothing. The baseline rule in general.md already is the standard behavior, so a project on the default level, or on an older guide, installs exactly as before.
- Only `cautious` and `autonomous` need a fragment from the guide.

### D4 — Fragment goes inside the managed block, after the rules
Status: decided
- The fragment is generated content, so it belongs inside the managed block with the rules, where re-running setup-ide replaces it. Appending it outside the block would leave stale text when the level changes.
- A section heading is the fragment's own concern (guide-owned); cf adds none.

### D5 — A missing fragment is an error
Status: decided
- If the level is `cautious` or `autonomous` and the installed guide has no matching fragment, `cf setup-ide` aborts with a message naming the level, the expected path and the need to update the guide (`cf guides update`).
- No silent fallback to `standard`: a project that asked for autonomous work must not quietly get the default.

### D6 — cf does not enforce waiting
Status: decided
- `BLOCKED:` is a convention for the AI and the PM. Recognizing it in task files or surfacing it in `cf next` is separate work and is not in this slice. If wanted, it becomes its own issue.

## Integration Points
### Provides to Other Slices
- A stable key and fragment path convention (`rules/permissiveness/<level>.md`) that the guide and Squadron can target.

### Consumes from Other Slices
- Guide fragments from ai-project-guide. If the guide lacks them, D5 applies.

## Success Criteria
### Functional Requirements
- `cf config set workflow.permissiveness <level>` accepts the three levels and rejects anything else with a message listing them.
- With the default, generated CLAUDE.md, AGENTS.md and copilot-instructions.md are byte-identical to today's output.
- With `cautious` or `autonomous` and a fragment present, all three files contain that fragment inside the managed block, after the rules.
- Changing the level and rerunning `cf setup-ide` replaces the fragment; it never accumulates.
- A missing fragment aborts with the D5 message and leaves existing files unchanged.
- A worktree with its own value gets its own fragment.

### Technical Requirements
- Level names defined once (`PERMISSIVENESS_LEVELS`); no repeated string literals.
- Tests cover: validator, each level on each of the three targets, level change, missing fragment, and the subdirectory not being picked up as a rule.
- Tests use a fragment fixture in the shape the guide will ship.
- Existing setup-ide tests pass unchanged.

### Integration Requirements
- Dry-run (`--dry-run`) previews the fragment too.

### Verification Walkthrough
1. `cf config get workflow.permissiveness` prints `standard`.
2. `cf setup-ide claude` on a clean copy; save CLAUDE.md. Rerun with no change; confirm it is identical.
3. Put a test fragment at `<guide>/project-guides/rules/permissiveness/autonomous.md`. Run `cf config set workflow.permissiveness autonomous`, then `cf setup-ide claude`. Confirm the fragment appears at the end of the managed block in CLAUDE.md. Repeat for `agents` and `copilot`.
4. `cf config set workflow.permissiveness cautious` with no `cautious.md` present, then `cf setup-ide claude`. Confirm it aborts naming the missing path and CLAUDE.md is unchanged.
5. `cf config set workflow.permissiveness bogus` is rejected, listing the valid levels.
6. Set the level back to `standard`, rerun, and confirm the fragment is gone.

## Implementation Notes
### Development Approach
1. Config key, constant and validator, with tests.
2. `permissiveness.ts` with tests, including the missing-fragment error.
3. Add `trailing` to `compileClaudeRules`; wire all three targets and the dry-run path.
4. Docs: README and config reference.
5. File an issue or note on ai-project-guide for the two fragments, with the phase-scope wording from #122.

### Special Considerations
- Slice 246 ships cf support only. The feature goes live when ai-project-guide releases the fragments. Releasing cf first is safe: default users see no change.
