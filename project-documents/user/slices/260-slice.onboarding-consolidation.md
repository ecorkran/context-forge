---
docType: slice-design
slice: onboarding-consolidation
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies: []
interfaces: [261, 265]
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
---

# Slice Design: onboarding-consolidation

## Overview

Context Forge has three hand-written copies of one onboarding recipe:

- `packages/cli/commands/cf/onboard.md`, the Claude Code `/cf:onboard` command
- `packages/cli/commands/codex/cf-onboard/SKILL.md`, the Codex `$cf-onboard` skill
- `ONBOARD_GUIDE` in `packages/mcp-server/src/tools/agentOnboardTool.ts`, returned by the `agent_onboard` MCP tool

Their wording has already drifted. All three also contain methodology: they open the concept conversation themselves ("Begin by asking the user to describe what they want to build"), carry a "later phase" note, and offer `/setup-ci`.

This slice replaces the three copies with one cf-owned source in core that is rendered to each surface. The recipe shrinks to setup followed by a handoff to `cf build` (or `context_build`). The guide's concept prompt now opens the conversation itself (v0.22.0+). The `/setup-ci` offer moves to `cf next`. CI recognition stops keying on the single filename `.github/workflows/ci.yml`.

## Value

- **One source.** A wording change is made once. A test fails if a rendered copy differs from the source.
- **No methodology in onboarding.** Once the recipe says only "set up, then run `cf build`", slice 261 can route a brownfield repo to the brownfield prompt without touching onboarding. This is the arch's "setup, then hand off" decision (PM 20261020).
- **A better CI offer.** `cf next` knows the project's state on every run, so the offer appears when a stack exists rather than only during onboarding. A project with CI under another filename or provider no longer gets a duplicate offer.
- **A reusable CI recognizer.** Slice 261's detection report includes CI. This slice provides the recognizer it reuses.

## Technical Scope

**Included:**
- A core module holding the onboarding recipe and a renderer for three surfaces: Claude command, agent skill, and MCP tool.
- Rendered `onboard.md` and `cf-onboard/SKILL.md` committed under `packages/cli/commands/`, a script that regenerates them, and a test that fails when they differ from the renderer's output.
- `agent_onboard` returns the rendered MCP text from core. Its inline `ONBOARD_GUIDE` constant is deleted.
- The new recipe content: a registration check, then `cf init` (or the MCP `project_create`/`guide_install` fallback), then a handoff to `cf build` / `context_build`.
- A core CI recognizer covering several providers and any GitHub workflow filename.
- A core stack detector for the stacks the `setup-ci` skill supports.
- A `setup-ci` offer on `cf next` and `workflow_next`, with a stable id, and a config key that suppresses it.
- README and CLI/MCP README updates for the changed onboarding behavior and the new config key.

**Excluded:**
- Detection of brownfield, greenfield or already-planned projects, adoption state, and profile selection (slice 261).
- Any change to `cf build` / `context_build` output.
- Any change to the command installer's copy/prune logic. Rendered files are ordinary bundled assets.
- Rendering other commands (`next`, `build`, ...) from a shared source. Only onboarding has three hand-written copies.
- Changes to the guide's `setup-ci` skill.

## Dependencies

### Prerequisites
- None in this repo.
- **ai-project-guide ≥ v0.22.0:** the concept prompt opens by asking the PM what they want to build. With the opener removed from onboarding, this is what keeps the greenfield conversation unchanged. Verified in the guide's CHANGELOG (0.22.0, "Changed").

### Interfaces Required
- `cf build` / `context_build`, unchanged. In a fresh project they build the Phase 0 concept prompt, because `cf init` sets `developmentPhase` to `Phase 0: Concept` (`project-defaults.ts`).
- `ConfigManager.get` and the `ConfigKeys` registry, for the new suppression key.
- `gitExec(['rev-parse', '--show-toplevel'])`, already used in `checkoutReadiness.ts`, to find the repository root for CI recognition.

## Architecture

### Component Structure

```
packages/core/src/onboarding/
  onboardRecipe.ts        recipe steps + ONBOARD_SURFACES table + renderOnboardRecipe(surface)
packages/core/src/detection/
  ciDetection.ts          recognizeCi(projectPath) → CiRecognition
  stackDetection.ts       detectStacks(projectPath) → SetupCiStack[]
  setupCiOffer.ts         evaluateSetupCiOffer(project, config) → NextOffer | null

packages/cli/scripts/render-onboard.mjs   writes the two CLI assets from the renderer
packages/cli/commands/cf/onboard.md                 (rendered, committed)
packages/cli/commands/codex/cf-onboard/SKILL.md     (rendered, committed)
packages/mcp-server/src/tools/agentOnboardTool.ts   returns renderOnboardRecipe('mcp-tool')
packages/core/src/introspection/WorkflowNavigator.ts  getNext attaches offers
packages/cli/src/commands/next.ts                     prints offers
```

`detection/` is new. Slice 261 adds its detection report there and reuses `recognizeCi`.

### Data Flow

**Onboarding (all surfaces):**

```
onboardRecipe.ts ──render('claude-command')──► scripts/render-onboard.mjs ──► commands/cf/onboard.md ──install-commands──► ~/.claude/commands/cf/
                 ──render('agent-skill')─────► scripts/render-onboard.mjs ──► commands/codex/cf-onboard/SKILL.md ──► ~/.agents/skills/
                 ──render('mcp-tool')────────► agent_onboard (at call time)
```

At run time, the agent follows the recipe: registration check → `cf init` (or the MCP fallback) → `cf build` / `context_build` → it follows the returned prompt. The guide prompt, not the recipe, decides what conversation follows.

**CI offer:**

```
cf next / workflow_next
  └─ WorkflowNavigator.getNext(project)
       ├─ computeNext(project)                 (today's logic, unchanged)
       └─ evaluateSetupCiOffer(project, config)
            ├─ config workflow.setup_ci_offer ─ false → no offer
            ├─ detectStacks(projectPath) ─────── empty → no offer
            ├─ recognizeCi(projectPath) ──────── recognized → no offer
            └─ release skill present ─────────── yes → no offer
          → NextAction.offers = [{ id: 'setup-ci', ... }]
```

### State Management

The only new persisted state is the config key `workflow.setup_ci_offer` (boolean, default `true`, shared scope). Everything else is derived from the filesystem on each run.

## Technical Decisions

### D1 — The single source is a TypeScript module in core with a typed surface table
Status: decided
- `packages/core/src/onboarding/onboardRecipe.ts` exports `type OnboardSurface = 'claude-command' | 'agent-skill' | 'mcp-tool'`, a `ONBOARD_SURFACES: Record<OnboardSurface, OnboardSurfaceProfile>` table, and `renderOnboardRecipe(surface: OnboardSurface): string`. The step text is written once. Wherever the surfaces differ, the text reads from the profile: frontmatter, how registration is checked, the build command, and how `cf next` is invoked. The `Record` annotation makes the compiler reject a surface without a profile. This is the same pattern as `COMMAND_TARGETS`.
- Core is the only package that both the CLI and the MCP server depend on.
- Rejected: a markdown template with a token syntax. It adds a mini-templating language and gives no type check that every surface supplies every slot.
- Rejected: keeping the source in the CLI package. The MCP server does not depend on the CLI.

### D2 — CLI assets are committed rendered files, guarded by a byte-for-byte drift test
Status: decided
- `packages/cli/scripts/render-onboard.mjs` imports the renderer from `@context-forge/core` and writes both CLI assets. It runs as `pnpm --filter @context-forge/cli render:onboard`. It is not part of `build`, so a build never changes tracked files.
- `packages/cli/tests/onboardRender.test.ts` renders each CLI surface and compares the result to the committed file. On a mismatch it fails with a message naming the file and the regenerate command.
- Each rendered file gets one HTML comment directly after its frontmatter: `<!-- Generated from @context-forge/core onboardRecipe.ts. Edit the source, then run: pnpm --filter @context-forge/cli render:onboard -->`. This discourages hand edits.
- The installer is unchanged. The rendered files are ordinary bundled assets, copied and pruned like the other commands.
- Rejected: rendering at install time. It special-cases one asset inside `installFlatMd`/`installSkillDirs`, and leaves no readable copy in the repo or the npm tarball.
- Rejected: regenerating during `build`. A build that dirties the working tree is surprising, and it hides drift instead of reporting it.

### D3 — Recipe content: setup, then hand off
Status: decided

The recipe keeps:
1. **Detect registration.** `cf project list` on the CLI, or `project_list` (matching `projectPath` against the current directory) on MCP. If the project is registered, go to step 3.
2. **Set up.** Ask for a name (the argument if one was given, else the directory name if the user declines). Run `cf init <name>`. Keep the existing warning not to infer git status from environment context. MCP fallback: `project_create` and then `guide_install`, plus the existing note that this path cannot run `git init`.
3. **Hand off.** Run `cf build` (or call `context_build`) and follow the prompt it returns as your working context. Do not open with questions of your own: the prompt starts the conversation. Then one line: `cf next` (or that surface's equivalent) shows what to do next at any time.

The recipe drops:
- "Begin by asking the user to describe what they want to build" and the concept framing in step 3. The guide's concept prompt now carries the opener.
- The "later phase" note. `cf build` already builds the current phase's prompt, so a registered project in a later phase is handled by step 3.
- The `/setup-ci` offer (D6).
- "If an MCP tool call fails, fall back to the CLI equivalent" stays on the two surfaces that have both. It is tool mechanics, not methodology.

Surface differences:
- `claude-command` lists both the MCP and CLI forms at each step, as today. Its frontmatter keeps the current `description`, `argument-hint` and `allowed-tools` list.
- `agent-skill` is CLI-first, with the MCP fallback in step 2 only. Its frontmatter keeps `name: cf-onboard` and the current description.
- `mcp-tool` is MCP-first with `cf init` preferred when a shell is available, as today. It has no frontmatter. `agent_onboard` still appends `**Project name provided:** {name}` when `projectName` is given.

### D4 — CI recognition covers several providers and any GitHub workflow filename
Status: decided
- `recognizeCi(projectPath): Promise<CiRecognition>` returns `{ recognized: boolean; matches: string[] }`. `matches` lists the paths that matched, relative to the directory they were found in, so 261 can report them.
- Signatures are one exported constant, `CI_SIGNATURES`:
  - `.github/workflows/`: any `*.yml` or `*.yaml` file
  - `.gitlab-ci.yml`
  - `.circleci/config.yml`
  - `azure-pipelines.yml`
  - `bitbucket-pipelines.yml`
  - `Jenkinsfile`
  - `.travis.yml`
  - `.buildkite/`: any `*.yml` or `*.yaml` file
- Directories checked: `projectPath`, plus the git top-level when it differs (a CF project in a monorepo subdirectory, whose CI lives at the repository root). If `projectPath` is not in a git repository, only `projectPath` is checked. That is the correct scope, not a fallback.
- Rejected: parsing workflow contents to tell CI apart from other automation. A repository with any workflow file has chosen its automation. Offering `setup-ci` there invites a duplicate, which is the bug being fixed.

### D5 — Stack detection mirrors the setup-ci skill's detection table
Status: decided
- `detectStacks(projectPath): SetupCiStack[]` reads one constant, `SETUP_CI_STACKS`: `python` when `pyproject.toml` exists, and `typescript` when both `package.json` and `tsconfig.json` exist. These are the two languages the guide's `setup-ci` skill has baselines for. Its step 1 table uses the same markers.
- A comment on the constant names the skill file it mirrors. When the guide adds a baseline, the constant changes in one place.
- Detection is scoped to `projectPath`, because the manifest belongs to the project folder.
- Rejected: offering for any manifest (`Cargo.toml`, `go.mod`, ...). For a stack with no baseline, `setup-ci` says so and stops, so the offer would be a dead end.
- Rejected: discovering languages by listing the guide's `project-guides/ci/*/` at run time. cf would still need its own manifest-to-language table, and the offer would silently depend on the guide's layout.

### D6 — The offer is an additive `offers` field on NextAction with a stable id
Status: decided
- `NextAction` gains `offers?: NextOffer[]`, where `NextOffer` is `{ id: NextOfferId; message: string; declineCommand: string }` and `NextOfferId` is a union with one member, `'setup-ci'`, defined as a constant. Consumers key on `id`, never on `message`. This follows the rule already applied to `pendingDecisions`.
- `WorkflowNavigator.getNext` becomes a thin wrapper. Today's body moves unchanged into a private `computeNext`. `getNext` calls it, then `evaluateSetupCiOffer`, and sets `offers` when the result is non-null. Every return path, including gates and blocks, gets the offer, and no early return is touched. The offer logic itself lives in `detection/setupCiOffer.ts`, because `WorkflowNavigator.ts` is already over 1000 lines.
- The offer is evaluated only when the navigator has a `ConfigManager` (both `cf next` and `workflow_next` pass one) and `project.projectPath` is set. Without either, the suppression key or the project files can't be read. Existing navigator tests that construct it without config see no `offers`.
- Conditions, all required: `workflow.setup_ci_offer` is `true`; `detectStacks` is non-empty; `recognizeCi` is not recognized; and no release skill exists at `.claude/skills/release/SKILL.md` or `.agents/skills/release/SKILL.md` under `projectPath`. The release-skill condition keeps today's rule that the offer is made only when neither exists.
- `message`: "No CI detected for this {stack} project. The setup-ci skill can add CI and a release skill." `declineCommand`: `cf config set workflow.setup_ci_offer false`.
- CLI rendering in `next.ts`: after the `Run:` line, `Offer:     {message}`, then a dim line `           Not wanted? {declineCommand}`. JSON output carries the field as is.
- `workflow_next`'s description adds `offers?` to its response shape.
- Rejected: putting the offer in `warnings`. Warnings report configuration problems. A missing CI is not one.
- Rejected: replacing the recommendation with the offer. CI is optional, and it must never displace the workflow's next step.

### D7 — A shared config key records "don't ask again"
Status: decided
- New key in `ConfigKeys.ts`: `workflow.setup_ci_offer`, type boolean, default `true`, scope `ConfigScope.Shared`. Description: "When true, `cf next` offers the setup-ci skill for a project with a supported stack and no recognized CI or release skill. Set to false to stop the offer."
- It is shared because whether a project wants cf to suggest CI is a project decision, not a per-developer one.
- The navigator reads it with the same type guard as `isDecisionGateEnabled`. A non-boolean value is an error, never treated as `true`.
- Rejected: offering on every run with no way to stop it. `cf next` runs constantly, and the old recipe's "offer once; if declined, don't ask again" would be lost.
- Rejected: leaving "once" to the agent. Agents don't keep memory across sessions.

### Patterns and Conventions
- Comparison values are defined once: `OnboardSurface`, `CI_SIGNATURES`, `SETUP_CI_STACKS`, the `'setup-ci'` offer id and the config key name are each constants, referenced everywhere.
- Detection functions are synchronous filesystem checks, except for the one `git rev-parse` call. They throw on unexpected I/O errors. A missing file means "not present", never an error.
- Rendered prose follows the existing recipes' voice. The renderer emits no surface-specific text outside the profile table.

## Implementation Details

### Migration Plan

| Source | Destination | Consumer updates |
|---|---|---|
| `packages/cli/commands/cf/onboard.md` (hand-written) | Rendered from `onboardRecipe.ts` (`claude-command`), same path | None. The installer copies it as before. |
| `packages/cli/commands/codex/cf-onboard/SKILL.md` (hand-written) | Rendered (`agent-skill`), same path | None. Same skill directory name, so the prune logic is unaffected. |
| `ONBOARD_GUIDE` in `agentOnboardTool.ts` | `renderOnboardRecipe('mcp-tool')` imported from `@context-forge/core` | `agentOnboardTool.ts` only. Tool name, schema and annotations are unchanged. `serverLifecycle.test.ts` asserts only registration. |
| `/setup-ci` offer text in the three recipes | `evaluateSetupCiOffer` → `NextAction.offers` | `next.ts` rendering, `workflow_next` description |

**Behavior verification:**
- Paths and names are unchanged, so `cf install-commands` / `cf init` install the same entries, and nothing is pruned.
- Greenfield: `cf init` sets Phase 0. `cf build` emits the concept prompt, which with guide ≥ v0.22.0 opens by asking what the PM wants to build. The user sees the same sequence as today: setup, then the concept question.
- A registered project in a later phase: the recipe goes to step 3, and `cf build` emits that phase's prompt. Previously the agent was told to "suggest `cf next`". The new path lands in the right phase directly.
- No user data or stored format changes. The new config key has a default, so existing projects need nothing.

### API Contracts

**Core exports** (`@context-forge/core`):
```ts
type OnboardSurface = 'claude-command' | 'agent-skill' | 'mcp-tool';
function renderOnboardRecipe(surface: OnboardSurface): string;

interface CiRecognition { recognized: boolean; matches: string[] }
function recognizeCi(projectPath: string): Promise<CiRecognition>;

type SetupCiStack = 'python' | 'typescript';
function detectStacks(projectPath: string): SetupCiStack[];
```

**`NextAction` addition** (`introspection/types.ts`):
```ts
type NextOfferId = 'setup-ci';
interface NextOffer { id: NextOfferId; message: string; declineCommand: string }
// NextAction gains: offers?: NextOffer[]
```

**`cf next` output** (offer present):
```
Next:      Your project is in Phase 0 (Concept). Start by describing what you want to build.
Rationale: ...
Run:       cf build
Offer:     No CI detected for this python project. The setup-ci skill can add CI and a release skill.
           Not wanted? cf config set workflow.setup_ci_offer false
```

## Integration Points

### Provides to Other Slices
- **261:** `recognizeCi` and `CI_SIGNATURES` for the detection report's CI fact, and the `detection/` module as the home for the rest of the report. The onboarding recipe needs no changes for 261, because profile selection happens inside `cf build`.
- **264:** `NextAction.offers` is a general channel. 264 doesn't need it, but it shouldn't add a second one.
- **265:** the documented onboarding flow and config key, which the end-to-end runs and docs build on.

### Consumes from Other Slices
- Nothing from 261–267.
- From the guide: the concept-prompt opener (v0.22.0). With an older guide, the handoff still produces the concept prompt, but the agent may not ask the opening question unprompted. This is covered by the declared minimum guide version, not by a runtime check in this slice.

## Success Criteria

### Functional Requirements
- `onboard.md`, `cf-onboard/SKILL.md` and `agent_onboard`'s text all come from `renderOnboardRecipe`.
- No surface contains a concept opener, a phase-specific note or a `setup-ci` offer. Each contains the registration check, `cf init` or the MCP fallback, and the `cf build` / `context_build` handoff.
- A greenfield run in an empty directory goes: setup, then `cf build`, then the concept prompt's opening question. The order is the same as today.
- `cf next` and `workflow_next` include an `offers` entry with id `setup-ci` when `pyproject.toml` (or `package.json` + `tsconfig.json`) exists and there is no recognized CI and no release skill. They include none when any condition fails.
- A project with `.github/workflows/test.yml` (no `ci.yml`), `.gitlab-ci.yml`, or another `CI_SIGNATURES` entry is recognized and gets no offer.
- A CF project in a monorepo subdirectory whose CI is at the repository root is recognized.
- `cf config set workflow.setup_ci_offer false` stops the offer. A non-boolean value makes `cf next` fail with a named error.

### Technical Requirements
- Drift test: changing the source without re-rendering (or editing a rendered file) fails `pnpm -r test`, and the failure names the file and the regenerate command.
- Unit tests for `recognizeCi` (each signature, the `.github/workflows` and `.buildkite` extension filters, the git top-level case, the non-git case), `detectStacks` (each stack, `package.json` without `tsconfig.json` → none), and `evaluateSetupCiOffer` (each condition on and off, a bad config value).
- A navigator test confirms `offers` is attached on a gate-blocked result as well as a normal one.
- A test confirms `agent_onboard` returns the `mcp-tool` rendering plus the project-name line.
- Format, lint and typecheck pass. New files stay within the ~300-line guideline.
- `README.md`, `packages/cli/README.md` and `packages/mcp-server/README.md` describe onboarding as setup plus handoff, and document `workflow.setup_ci_offer`.

### Integration Requirements
- `cf install-commands` (Claude and agents targets) installs the rendered files with no stale-entry removals.
- Slice 261 can import `recognizeCi` from core without changes to it.

### Verification Walkthrough

All commands use the local build (`node packages/cli/dist/index.js`, written `cf` below). The global `cf` is the published npm package.

1. **Single source and drift guard**
   ```bash
   pnpm -r build
   pnpm --filter @context-forge/cli render:onboard
   git status --short packages/cli/commands     # expect: no changes (committed files match)
   echo "drift" >> packages/cli/commands/cf/onboard.md
   pnpm --filter @context-forge/cli test -- onboardRender   # expect: FAIL naming onboard.md and the render command
   git checkout packages/cli/commands/cf/onboard.md
   ```
2. **Recipe content.** Open `packages/cli/commands/cf/onboard.md`. Expect three steps (registration, setup, hand off to `cf build` / `context_build`). Expect no "describe what you want to build" and no `setup-ci`. `cf-onboard/SKILL.md` has the same steps in CLI-first form.
3. **Greenfield run (manual).** In an empty temp directory, start Claude Code and run `/cf:onboard demo`. Expect: `cf init demo` runs, then `cf build` runs, and the agent asks what you want to build. Repeat with Codex and `$cf-onboard`.
4. **MCP surface.** Call `agent_onboard` with `projectName: "demo"`. Expect the `mcp-tool` rendering, ending with `**Project name provided:** demo`.
5. **CI offer appears**
   ```bash
   mkdir /tmp/cf260 && cd /tmp/cf260 && git init -q && touch pyproject.toml
   cf init cf260
   cf next            # expect: Offer: No CI detected for this python project... + decline line
   cf next --json     # expect: "offers": [{ "id": "setup-ci", ... }]
   ```
6. **CI under another name is recognized**
   ```bash
   mkdir -p .github/workflows && touch .github/workflows/test.yml
   cf next            # expect: no Offer line
   rm -r .github && touch .gitlab-ci.yml && cf next   # expect: no Offer line
   rm .gitlab-ci.yml
   ```
7. **Decline persists**
   ```bash
   cf config set workflow.setup_ci_offer false
   cf next            # expect: no Offer line
   ```
8. **Monorepo subdirectory.** In a repository with `.github/workflows/ci.yml` at the root and a CF project registered at `packages/app/` (with `pyproject.toml`), run `cf next` from `packages/app/`. Expect no Offer line.

## Implementation Notes

### Development Approach
1. `detection/ciDetection.ts` and `stackDetection.ts`, with tests.
2. Config key and `setupCiOffer.ts`, with tests.
3. The `NextAction.offers` type, the `getNext` → `computeNext` wrapper, `next.ts` rendering, and the `workflow_next` description, with the navigator test.
4. `onboarding/onboardRecipe.ts` with the three profiles. Render and review each output against D3.
5. The render script, the committed rendered files and the drift test.
6. Switch `agentOnboardTool.ts` to the renderer, with its test.
7. README updates.

Each step leaves the build green. Steps 1–3 and 4–6 are independent.

### Special Considerations
- The rendered recipes are prompts. Keep the wording close to the current recipes wherever a step survives, and don't put an example value next to an instruction to read one (for example, the project name).
- Run `cf install-commands` after rendering to confirm that the installed `/cf:onboard` is the new text. The installer overwrites existing files.
