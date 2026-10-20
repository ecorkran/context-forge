---
docType: slice-design
slice: onboarding-consolidation
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies: []
interfaces:
- 261
- 265
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
turns: 64
promptTokens: 3838620
cachedTokens: 3709803
cacheWriteTokens: 128733
completionTokens: 40700
durationSeconds: 390.1
costUsd: 2.586488
usageRounds: 2
pricedRounds: 2
revision_number: 1
---

# Slice Design: onboarding-consolidation

## Overview

Context Forge has three hand-written copies of one onboarding recipe:

- `packages/cli/commands/cf/onboard.md`, the Claude Code `/cf:onboard` command
- `packages/cli/commands/codex/cf-onboard/SKILL.md`, the Codex `$cf-onboard` skill
- `ONBOARD_GUIDE` in `packages/mcp-server/src/tools/agentOnboardTool.ts`, returned by the `agent_onboard` MCP tool

Their wording has already drifted. All three also contain methodology: they open the concept conversation themselves ("Begin by asking the user to describe what they want to build"), carry a "later phase" note, and offer `/setup-ci`.

This slice replaces the three copies with one cf-owned source in core that is rendered to each surface. The recipe shrinks to setup followed by a handoff to `cf build` (or `context_build`). The guide's concept prompt now opens the conversation itself (the opener shipped in v0.22.0, and the initiative's minimum is v0.22.1). The `/setup-ci` offer moves to `cf next`. CI recognition stops keying on the single filename `.github/workflows/ci.yml`.

## Value

- **One source.** A wording change is made once. A test fails if a rendered copy differs from the source.
- **No methodology in onboarding.** Once the recipe says only "set up, then run `cf build`", slice 261 can route a brownfield repo to the brownfield prompt without touching onboarding. This is the arch's "setup, then hand off" decision (PM 20261020).
- **A better CI offer.** `cf next` knows the project's state on every run, so the offer appears once the project has a build manifest rather than only during onboarding. A project with CI under another filename or provider no longer gets a duplicate offer.
- **A reusable CI recognizer.** Slice 261's detection report includes CI. This slice provides the recognizer it reuses.

## Technical Scope

**Included:**
- A core module holding the onboarding recipe and a renderer for three surfaces: Claude command, agent skill, and MCP tool.
- Rendered `onboard.md` and `cf-onboard/SKILL.md` committed under `packages/cli/commands/`, a script that regenerates them, and a test that fails when they differ from the renderer's output.
- `agent_onboard` returns the rendered MCP text from core. Its inline `ONBOARD_GUIDE` constant is deleted.
- The new recipe content: a registration check, then `cf init` (or the MCP `project_create`/`guide_install` fallback), then a handoff to `cf build` / `context_build`.
- A core CI recognizer covering several providers and any GitHub workflow filename.
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
- **ai-project-guide ≥ v0.22.1,** the initiative's minimum (arch, Dependencies). Since v0.22.0 the concept prompt opens by asking the PM what they want to build. With the opener removed from onboarding, this is what keeps the greenfield conversation unchanged. cf has no runtime minimum-guide check, and this slice doesn't add one. The minimum is declared in the release's CHANGELOG entry and in the README's onboarding section, each with the update command, `cf guides update`. A new `cf init` installs the current guide, so only existing projects with an older installed guide need it. With an older guide, onboarding still reaches the concept prompt, but nobody asks the opening question until the user speaks.

### Interfaces Required
- `cf build` / `context_build`, unchanged. In a fresh project they build the Phase 0 concept prompt, because `cf init` sets `developmentPhase` to `Phase 0: Concept` (`project-defaults.ts`).
- `ConfigManager.get` and the `ConfigKeys` registry, for the new suppression key.

## Architecture

### Component Structure

```
packages/core/src/onboarding/
  onboardRecipe.ts        recipe steps + ONBOARD_SURFACES table + renderOnboardRecipe(surface)
packages/core/src/detection/
  ciDetection.ts          recognizeCi(projectPath) → CiRecognition   (sync)
  setupCiOffer.ts         evaluateSetupCiOffer(projectPath, config) → Promise<SetupCiOfferResult>

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
            ├─ hasBuildManifest(projectPath) ─── false → no offer
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
- The "later phase" note. For a registered project, step 3 runs `cf build`, which builds from the project's current phase and settings. The result is the same as running it by hand, including when those settings are incomplete.
- The `/setup-ci` offer (D6).
- "If an MCP tool call fails, fall back to the CLI equivalent" stays on the two surfaces that have both. It is tool mechanics, not methodology.

Surface differences:
- `claude-command` lists both the MCP and CLI forms at each step, as today. Its frontmatter keeps the current `description`, `argument-hint` and `allowed-tools` list.
- `agent-skill` is CLI-first, with the MCP fallback in step 2 only. Its frontmatter keeps `name: cf-onboard` and the current description.
- `mcp-tool` is MCP-first with `cf init` preferred when a shell is available, as today. It has no frontmatter. `agent_onboard` still appends `**Project name provided:** {name}` when `projectName` is given.

### D4 — CI recognition covers several providers and any GitHub workflow filename
Status: decided
- `recognizeCi(projectPath): CiRecognition` is synchronous. It returns `{ recognized: boolean; matches: CiMatch[] }`, where `CiMatch` is `{ root: CiRoot; path: string }`, `CiRoot` is `'project' | 'repository'`, and `path` is relative to that root. 261 can report each match with its location.
- Signatures are one exported constant, `CI_SIGNATURES`:
  - `.github/workflows/`: any `*.yml` or `*.yaml` file
  - `.gitlab-ci.yml`
  - `.circleci/config.yml`
  - `azure-pipelines.yml`
  - `bitbucket-pipelines.yml`
  - `Jenkinsfile`
  - `.travis.yml`
  - `.buildkite/`: any `*.yml` or `*.yaml` file
- Directories checked: `projectPath` (root `'project'`), and the repository root (root `'repository'`) when it differs from `projectPath`. When they are the same directory, it is checked once, as `'project'`. The repository root is the nearest directory at or above `projectPath` that contains a `.git` entry. That entry can be a directory or a file, so worktrees and submodules resolve to their own checkout. If no ancestor has one, the project is not in a repository, and only `projectPath` is checked.
- **Deliberate exception to the arch's project-folder rule.** The arch scopes detection to the project's own folder. CI is the exception: every provider in `CI_SIGNATURES` reads its config from the repository root by default. A project-folder-only check would report "no CI" for every monorepo subproject. 261 uses `recognizeCi` as is for its CI fact. Its other facts keep the project-folder scope.
- Rejected: `git rev-parse --show-toplevel` to find the repository root. It is async, spawns a process, and fails for reasons other than "not a repository" (dubious ownership, a missing `git` binary). The design would then have to tell those failures apart.
- Rejected: parsing workflow contents to tell CI apart from other automation. A repository with any workflow file has chosen its automation. Offering `setup-ci` there invites a duplicate, which is the bug being fixed.

### D5 — "A stack is detected" means any build manifest exists
Status: decided
- The slice plan gates the offer on a detected stack. cf reads that as "the project has a build manifest", not "the project uses a language the guide supports". A private `hasBuildManifest(projectPath)` in `setupCiOffer.ts` checks one constant, `BUILD_MANIFESTS`: `package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `Gemfile`, `composer.json`. The check is scoped to `projectPath`, because the manifest belongs to the project folder.
- This is cf's own definition of "has code", not a copy of the guide's list of supported languages. Whether the `setup-ci` skill has a baseline for the stack is still the skill's decision: for a stack it doesn't support, it says so and stops. The user can then stop the offer with the decline key (D7). When the guide adds a baseline, cf needs no change.
- The offer message names no stack, so a project with several manifests needs no special case.
- Rejected: mirroring the skill's python/typescript table. That copies guide content into cf, with nothing to catch drift.
- Rejected: no manifest gate at all. A fresh Phase 0 project would get a CI offer before it has any code. The slice plan and the old recipe both rule that out.

### D6 — The offer is an additive `offers` field on NextAction with a stable id
Status: decided
- `NextAction` gains `offers?: NextOffer[]`, where `NextOffer` is `{ id: NextOfferId; message: string; declineCommand: string }` and `NextOfferId` is a union with one member, `'setup-ci'`, defined as a constant. Consumers key on `id`, never on `message`. This follows the rule already applied to `pendingDecisions`.
- `WorkflowNavigator.getNext` becomes a thin wrapper. Today's body moves unchanged into a private `computeNext`. `getNext` calls it, then `evaluateSetupCiOffer`, and sets `offers` when the result has an offer. Every return path, including gates and blocks, gets the offer, and no early return is touched. The offer logic itself lives in `detection/setupCiOffer.ts`, because `WorkflowNavigator.ts` is already over 1000 lines.
- Sync/async shape: `getNext` is already `async getNext(project): Promise<NextAction>`, so its signature and its callers (`next.ts`, `workflow_next`) don't change. `evaluateSetupCiOffer(projectPath, config): Promise<SetupCiOfferResult>` is async only because `ConfigManager.get` is. The filesystem checks inside it (`recognizeCi`, `hasBuildManifest`, the release-skill check) are synchronous.
- The offer is evaluated only when the navigator has a `ConfigManager` (both `cf next` and `workflow_next` pass one) and `project.projectPath` is set. Without either, the suppression key or the project files can't be read. The constructor parameter is already optional, so existing navigator tests that construct it without config compile unchanged and see no `offers`.
- Conditions, all required: `workflow.setup_ci_offer` is `true`; `hasBuildManifest` is true; `recognizeCi` is not recognized; and no release skill exists at `.claude/skills/release/SKILL.md` or `.agents/skills/release/SKILL.md` under `projectPath`. The release-skill condition keeps today's rule that the offer is made only when neither exists.
- Failures. The offer is advisory, so it never decides whether `cf next` succeeds. The one exception is a misconfiguration:
  - A non-boolean `workflow.setup_ci_offer` throws, and `cf next` / `workflow_next` fail, the same as with `workflow.decision_gate_enabled`. The user set a bad value and must see it.
  - A filesystem error during the checks (any error carrying a Node `code`, such as `EACCES` on an unreadable `.github/`, other than the `ENOENT`/`ENOTDIR` that mean "not present") is caught in `evaluateSetupCiOffer`. The result is `{ offer: null, warning }`, with `warning` = `setup-ci offer skipped: {error message}`, and `getNext` appends it to `warnings`. The catch names the error type and has a comment saying why swallowing is correct, as the exception-handling rule requires.
  - Any other error propagates.
- `SetupCiOfferResult` is `{ offer: NextOffer | null; warning?: string }`.
- `message`: "No CI detected for this project. The setup-ci skill can add CI and a release skill." `declineCommand`: `cf config set workflow.setup_ci_offer false`.
- CLI rendering in `next.ts`: after the `Run:` line, `Offer:     {message}`, then a dim line `           Not wanted? {declineCommand}`. JSON output carries the field as is.
- `workflow_next`'s description adds `offers?` to its response shape.
- Rejected: putting the offer in `warnings`. Warnings report configuration problems. A missing CI is not one.
- Rejected: replacing the recommendation with the offer. CI is optional, and it must never displace the workflow's next step.

### D7 — A shared config key records "don't ask again"
Status: decided
- New key in `ConfigKeys.ts`: `workflow.setup_ci_offer`, type boolean, default `true`, scope `ConfigScope.Shared`. Description: "When true, `cf next` offers the setup-ci skill for a project with a build manifest and no recognized CI or release skill. Set to false to stop the offer."
- It is shared because whether a project wants cf to suggest CI is a project decision, not a per-developer one.
- The navigator reads it with the same type guard as `isDecisionGateEnabled`. A non-boolean value is an error, never treated as `true`.
- Rejected: offering on every run with no way to stop it. `cf next` runs constantly, and the old recipe's "offer once; if declined, don't ask again" would be lost.
- Rejected: leaving "once" to the agent. Agents don't keep memory across sessions.

### Patterns and Conventions
- Comparison values are defined once: `OnboardSurface`, `CI_SIGNATURES`, `BUILD_MANIFESTS`, the `'setup-ci'` offer id and the config key name are each constants, referenced everywhere.
- Detection functions are synchronous filesystem checks, with no process spawns. A missing file means "not present", never an error. Other I/O errors are thrown, and the offer path handles them as D6 describes.
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
- Greenfield: `cf init` sets Phase 0. `cf build` emits the concept prompt, which with guide ≥ v0.22.1 opens by asking what the PM wants to build. The user sees the same sequence as today: setup, then the concept question.
- A registered project in a later phase: the recipe goes to step 3, and `cf build` emits whatever it emits for the project's current settings (walkthrough step 4). Previously the agent was told to "suggest `cf next`". `cf next` is still named in step 3.
- No user data or stored format changes. The new config key has a default, so existing projects need nothing.

### API Contracts

**Core exports** (`@context-forge/core`):
```ts
type OnboardSurface = 'claude-command' | 'agent-skill' | 'mcp-tool';
function renderOnboardRecipe(surface: OnboardSurface): string;

type CiRoot = 'project' | 'repository';
interface CiMatch { root: CiRoot; path: string }
interface CiRecognition { recognized: boolean; matches: CiMatch[] }
function recognizeCi(projectPath: string): CiRecognition;
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
Offer:     No CI detected for this project. The setup-ci skill can add CI and a release skill.
           Not wanted? cf config set workflow.setup_ci_offer false
```

## Integration Points

### Provides to Other Slices
- **261:** `recognizeCi` and `CI_SIGNATURES` for the detection report's CI fact, and the `detection/` module as the home for the rest of the report. The onboarding recipe needs no changes for 261, because profile selection happens inside `cf build`.
- **265:** the documented onboarding flow and config key, which the end-to-end runs and docs build on.

### Consumes from Other Slices
- Nothing from 261–267.
- From the guide: the concept-prompt opener, at the declared minimum v0.22.1 (Prerequisites gives the mechanism).

## Success Criteria

### Functional Requirements
- `onboard.md`, `cf-onboard/SKILL.md` and `agent_onboard`'s text all come from `renderOnboardRecipe`.
- No surface contains a concept opener, a phase-specific note or a `setup-ci` offer. Each contains the registration check, `cf init` or the MCP fallback, and the `cf build` / `context_build` handoff.
- A greenfield run in an empty directory goes: setup, then `cf build`, then the concept prompt's opening question. The order is the same as today.
- `cf next` and `workflow_next` include an `offers` entry with id `setup-ci` when a `BUILD_MANIFESTS` file exists and there is no recognized CI and no release skill. They include none when any condition fails.
- An unreadable CI directory doesn't fail `cf next`. It drops the offer and adds a `setup-ci offer skipped: ...` warning.
- A project with `.github/workflows/test.yml` (no `ci.yml`), `.gitlab-ci.yml`, or another `CI_SIGNATURES` entry is recognized and gets no offer.
- A CF project in a monorepo subdirectory whose CI is at the repository root is recognized.
- `cf config set workflow.setup_ci_offer false` stops the offer. A non-boolean value makes `cf next` fail with a named error.

### Technical Requirements
- Drift test: changing the source without re-rendering (or editing a rendered file) fails `pnpm -r test`, and the failure names the file and the regenerate command.
- Unit tests for `recognizeCi`:
  - each signature, and the `.github/workflows` and `.buildkite` extension filters
  - a repository-root match reported with root `'repository'`
  - `projectPath` equal to the repository root, checked once and reported as `'project'`
  - a `.git` file (worktree) as the repository marker
  - no repository
- Unit tests for `evaluateSetupCiOffer`: each condition on and off, each `BUILD_MANIFESTS` entry, a bad config value (throws), and an unreadable `.github/` (no offer, a warning).
- The release's CHANGELOG entry and the README's onboarding section state the guide minimum (v0.22.1) and `cf guides update`.
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
4. **Mid-project run (manual).** In this repository (registered, Phase 4 with slice 260 set), run `/cf:onboard`. Expect: registration is found, setup is skipped, `cf build` runs, and the agent works from its output, which is identical to running `cf build` by hand. No concept question is asked.
5. **MCP surface.** Call `agent_onboard` with `projectName: "demo"`. Expect the `mcp-tool` rendering, ending with `**Project name provided:** demo`.
6. **CI offer appears**
   ```bash
   mkdir /tmp/cf260 && cd /tmp/cf260 && git init -q
   cf init cf260
   cf next            # expect: no Offer line (no build manifest yet)
   touch pyproject.toml
   cf next            # expect: Offer: No CI detected for this project... + decline line
   cf next --json     # expect: "offers": [{ "id": "setup-ci", ... }]
   ```
7. **CI under another name is recognized**
   ```bash
   mkdir -p .github/workflows && touch .github/workflows/test.yml
   cf next            # expect: no Offer line
   rm -r .github && touch .gitlab-ci.yml && cf next   # expect: no Offer line
   rm .gitlab-ci.yml
   ```
8. **Decline persists**
   ```bash
   cf config set workflow.setup_ci_offer false
   cf next            # expect: no Offer line
   ```
9. **Monorepo subdirectory.** In a repository with `.github/workflows/ci.yml` at the root and a CF project registered at `packages/app/` (with `pyproject.toml`), run `cf next` from `packages/app/`. Expect no Offer line.

## Implementation Notes

### Development Approach
1. `detection/ciDetection.ts`, with tests.
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
