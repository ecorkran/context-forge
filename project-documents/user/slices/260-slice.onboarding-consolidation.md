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
status: in_progress
turns: 94
promptTokens: 5361469
cachedTokens: 5211539
cacheWriteTokens: 149826
completionTokens: 50509
durationSeconds: 473.9
costUsd: 3.251839
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

# Slice Design: onboarding-consolidation

## Overview

Context Forge has three hand-written copies of one onboarding recipe:

- `packages/cli/commands/cf/onboard.md`, the Claude Code `/cf:onboard` command
- `packages/cli/commands/codex/cf-onboard/SKILL.md`, the Codex `$cf-onboard` skill
- `ONBOARD_GUIDE` in `packages/mcp-server/src/tools/agentOnboardTool.ts`, returned by the `agent_onboard` MCP tool

Their wording has already drifted. All three also contain methodology: they open the concept conversation themselves ("Begin by asking the user to describe what they want to build"), carry a "later phase" note, and offer `/setup-ci`.

This slice replaces the three copies with one cf-owned source in core that is rendered to each surface. The recipe shrinks to setup followed by a handoff to `cf build` (or `context_build`). The guide's concept prompt now opens the conversation itself (the opener shipped in v0.22.0, and the initiative's minimum is v0.22.2). The `/setup-ci` offer moves to `cf next`. CI recognition stops keying on the single filename `.github/workflows/ci.yml`.

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
- An exported core build-manifest check (`BUILD_MANIFESTS`, `hasBuildManifest`) that 261 reuses as its manifest signal.
- A `setup-ci` offer on `cf next` and `workflow_next`, with a stable id, and a config key that suppresses it.
- A minimum-guide-version check: one core constant and a warning from `cf build` / `context_build` when the installed guide is older than the minimum or its version is unknown (D8).
- In the root `README.md`: one updated onboarding section (setup plus handoff, the guide minimum, `cf guides update`) and one line documenting the new config key.

**Excluded:**
- Detection of brownfield, greenfield or already-planned projects, adoption state, and profile selection (slice 261).
- Any change to the prompt `cf build` / `context_build` assembles. D8 adds a warning beside it, never inside it.
- Any change to the command installer's copy/prune logic. Rendered files are ordinary bundled assets.
- Rendering other commands (`next`, `build`, ...) from a shared source. Only onboarding has three hand-written copies.
- Changes to the guide's `setup-ci` skill.

## Dependencies

### Prerequisites
- None in this repo.
- **ai-project-guide ≥ v0.22.2,** the initiative's minimum (arch, Dependencies). Since v0.22.0 the concept prompt opens by asking the PM what they want to build. With the opener removed from onboarding, this is what keeps the greenfield conversation unchanged. A new `cf init` installs the current guide, so only existing projects with an older installed guide are affected. For those, `cf build` / `context_build` warn explicitly and name `cf guides update` (D8). The regression is never silent. The README's onboarding section also states the minimum.

### Interfaces Required
- `cf build` / `context_build`, unchanged. In a fresh project they build the Phase 0 concept prompt, because `cf init` sets `developmentPhase` to `Phase 0: Concept` (`project-defaults.ts`).
- `ConfigManager.get` and the `ConfigKeys` registry, for the new suppression key.

## Architecture

### Component Structure

```
packages/core/src/onboarding/
  onboardRecipe.ts        recipe steps + ONBOARD_SURFACES table + renderOnboardRecipe(surface)
packages/core/src/detection/
  index.ts                re-exports the detection facts (exported from node.ts)
  pathPresent.ts          shared missing-file rule: ENOENT → false, other errors throw (internal)
  ciDetection.ts          recognizeCi(projectPath) → CiRecognition   (sync)
  buildManifest.ts        BUILD_MANIFESTS + hasBuildManifest(projectPath) → boolean   (sync)
packages/core/src/introspection/
  setupCiOffer.ts         evaluateSetupCiOffer(projectPath, config) → Promise<OfferEvaluation>
packages/core/src/guides/
  guideMinimum.ts         MIN_GUIDE_VERSION + checkGuideMinimum(projectPath) → Promise<string | null>
packages/cli/src/commands/build.ts                    writes the D8 warning to stderr
packages/mcp-server/src/tools/contextTools.ts         adds the D8 warning as a second text item

packages/cli/scripts/render-onboard.mjs   writes the two CLI assets from the renderer
packages/cli/commands/cf/onboard.md                 (rendered, committed)
packages/cli/commands/codex/cf-onboard/SKILL.md     (rendered, committed)
packages/mcp-server/src/tools/agentOnboardTool.ts   returns renderOnboardRecipe('mcp-tool')
packages/core/src/introspection/WorkflowNavigator.ts  getNext attaches offers
packages/cli/src/commands/next.ts                     prints offers
```

`detection/` is new and holds facts only. Slice 261 adds its detection report there and reuses `recognizeCi` and `hasBuildManifest`. Policy built on those facts, such as the CI offer, lives in `introspection/` beside the navigator.

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
          → I/O error in any check → NextAction.warnings += path + error, no offer
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
2. **Set up.** Ask for a name (the argument if one was given, else the directory name if the user declines). Run `cf init --name <name>` (the CLI takes the name as a flag, not an argument). Keep the existing warning not to infer git status from environment context. MCP fallback: `project_create` and then `guide_install`, plus the existing note that this path cannot run `git init`.
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
- `recognizeCi(projectPath): CiRecognition` is synchronous. It returns `{ recognized: boolean; matches: string[] }`, where `matches` holds the absolute paths of the matched files. Absolute paths are unambiguous whichever directory they were found in. If 261 needs more detail, it extends the result then.
- Signatures are one exported constant, `CI_SIGNATURES`:
  - `.github/workflows/`: any `*.yml` or `*.yaml` file
  - `.gitlab-ci.yml`
  - `.circleci/config.yml`
  - `azure-pipelines.yml`
  - `bitbucket-pipelines.yml`
  - `Jenkinsfile`
  - `.travis.yml`
  - `.buildkite/`: any `*.yml` or `*.yaml` file
- Directories checked: `projectPath`, and the repository root when it differs from `projectPath`. When they are the same directory, it is checked once. The repository root is the nearest directory at or above `projectPath` that contains a `.git` entry. That entry can be a directory or a file, so worktrees and submodules resolve to their own checkout. If no ancestor has one, the project is not in a repository, and only `projectPath` is checked.
- **Deliberate exception to the arch's project-folder rule.** The arch scopes detection to the project's own folder. CI is the exception: every provider in `CI_SIGNATURES` reads its config from the repository root by default. A project-folder-only check would report "no CI" for every monorepo subproject. 261 uses `recognizeCi` as is for its CI fact. Its other facts keep the project-folder scope.
- Rejected: `git rev-parse --show-toplevel` to find the repository root. It is async, spawns a process, and fails for reasons other than "not a repository" (dubious ownership, a missing `git` binary). The design would then have to tell those failures apart.
- Rejected: parsing workflow contents to tell CI apart from other automation. A repository with any workflow file has chosen its automation. Offering `setup-ci` there invites a duplicate, which is the bug being fixed.

### D5 — "A stack is detected" means any build manifest exists
Status: decided
- The slice plan gates the offer on a detected stack. cf reads that as "the project has a build manifest", not "the project uses a language the guide supports". An exported `hasBuildManifest(projectPath)` in `detection/buildManifest.ts` checks one exported constant, `BUILD_MANIFESTS`. It is core's single "has a build manifest" fact, owned by `detection/`. Slice 261 reuses it rather than defining its own, as it does `recognizeCi`. The manifests: `package.json`, `pyproject.toml`, `setup.py`, `Cargo.toml`, `go.mod`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `Gemfile`, `composer.json`. The check is scoped to `projectPath`, because the manifest belongs to the project folder.
- This is cf's own definition of "has code", not a copy of the guide's list of supported languages. Whether the `setup-ci` skill has a baseline for the stack is still the skill's decision: for a stack it doesn't support, it says so and stops. The user can then stop the offer with the decline key (D7). When the guide adds a baseline, cf needs no change.
- The offer message names no stack, so a project with several manifests needs no special case.
- Rejected: mirroring the skill's python/typescript table. That copies guide content into cf, with nothing to catch drift.
- Rejected: no manifest gate at all. A fresh Phase 0 project would get a CI offer before it has any code. The slice plan and the old recipe both rule that out.

### D6 — The offer is an additive `offers` field on NextAction with a stable id
Status: decided
- `NextAction` gains `offers?: NextOffer[]`, where `NextOffer` is `{ id: string; message: string }`. The only id is the constant `SETUP_CI_OFFER_ID = 'setup-ci'`. Consumers key on `id`, never on `message`. This follows the rule already applied to `pendingDecisions`.
- `WorkflowNavigator.getNext` becomes a thin wrapper. Today's body moves unchanged into a private `computeNext`. `getNext` calls it, then `evaluateSetupCiOffer`, and sets `offers` when the result has an offer. Every return path, including gates and blocks, gets the offer, and no early return is touched. The offer logic itself lives in `introspection/setupCiOffer.ts`, beside the navigator but outside it, because `WorkflowNavigator.ts` is already over 1000 lines.
- Sync/async shape: `getNext` is already `async getNext(project): Promise<NextAction>`, so its signature and its callers (`next.ts`, `workflow_next`) don't change. `evaluateSetupCiOffer(projectPath, config): Promise<OfferEvaluation>`, where `OfferEvaluation` is `{ offer: NextOffer | null; warning: string | null }`, is async only because `ConfigManager.get` is. The filesystem checks inside it (`recognizeCi`, `hasBuildManifest`, the release-skill check) are synchronous.
- The offer is evaluated only when the navigator has a `ConfigManager` (both `cf next` and `workflow_next` pass one) and `project.projectPath` is set. Without either, the suppression key or the project files can't be read. The constructor parameter is already optional, so existing navigator tests that construct it without config compile unchanged and see no `offers`.
- Conditions, all required: `workflow.setup_ci_offer` is `true`; `hasBuildManifest` is true; `recognizeCi` is not recognized; and no release skill exists at `.claude/skills/release/SKILL.md` or `.agents/skills/release/SKILL.md` under `projectPath`. The release-skill condition keeps today's rule that the offer is made only when neither exists.
- Failures: the offer is advisory, so its errors never fail `cf next` or `workflow_next`. A missing file means "not present". Any other filesystem error from the offer's checks is caught by `evaluateSetupCiOffer` and returned as a warning: the ancestor `.git` walk, the repository-root CI scan, the manifest check and the release-skill check. Examples are permission denied on an ancestor, `ENOTDIR` when `.github/workflows` is a file, a broken symlink, or an unreadable `.git` entry. The warning names the path and the error, and no offer is made. `evaluateSetupCiOffer` returns `{ offer: NextOffer | null; warning: string | null }`, and `getNext` appends a non-null warning to `NextAction.warnings`. It's explicit, never silent, and never displaces the recommendation. A non-boolean config value (D7) is still an error, because it's a configuration problem, not an I/O one.
- `message`: "No CI detected for this project. The setup-ci skill can add CI and a release skill. Not wanted? Run: cf config set workflow.setup_ci_offer false"
- CLI rendering in `next.ts`: after the `Run:` line, `Offer:     {message}`. JSON output carries the field as is.
- `workflow_next`'s description adds `offers?` to its response shape.
- Rejected: putting the offer in `warnings`. Warnings report configuration problems. A missing CI is not one.
- Rejected: replacing the recommendation with the offer. CI is optional, and it must never displace the workflow's next step.

### D7 — A shared config key records "don't ask again"
Status: decided
- New key in `ConfigKeys.ts`: `workflow.setup_ci_offer`, type boolean, default `true`, scope `ConfigScope.Shared`. Description: "When true, `cf next` offers the setup-ci skill for a project with a build manifest and no recognized CI or release skill. Set to false to stop the offer."
- It is shared because whether a project wants cf to suggest CI is a project decision, not a per-developer one.
- The navigator reads it with the same type guard as `isDecisionGateEnabled`. A non-boolean value is an error, never treated as `true`. `cf config set` already rejects one, so the guard only matters for hand-edited config, and it gets no test of its own.
- Rejected: offering on every run with no way to stop it. `cf next` runs constantly, and the old recipe's "offer once; if declined, don't ask again" would be lost.
- Rejected: leaving "once" to the agent. Agents don't keep memory across sessions.

### D8 — A minimum-guide-version warning replaces the silent greenfield regression
Status: decided
- `packages/core/src/guides/guideMinimum.ts` exports `MIN_GUIDE_VERSION = '0.22.2'`, the initiative's minimum and the one place it is written. It also exports `checkGuideMinimum(projectPath): Promise<string | null>`. The function reads the installed version with `GuideDetector.detectLocal`, the existing local, no-network detection path, and compares it with `isNewerVersion`.
- Results:
  - installed version at or above the minimum → `null`
  - below the minimum → "Installed ai-project-guide is v{installed}; context-forge needs v{MIN} or newer. Run: cf guides update"
  - version unknown (`null` from detection) → "Installed ai-project-guide version is unknown; context-forge needs v{MIN} or newer. Run: cf guides update"
  - version `local` (`LOCAL_VERSION_MARKER`, a local-archive install) → treated as unknown, because it is not a release version and `isNewerVersion` reports it as older than any release
  - no guide installed: no warning from this check. The build's existing missing-guide error already covers it.
- Delivery, beside the prompt and never inside it. `cf build` writes `Warning: {message}` to stderr, the same channel as its existing warnings, so stdout stays clean for piping. `context_build` returns the warning as a second text content item after the prompt. The build still succeeds: an old guide degrades the conversation but doesn't break it.
- It runs on every build, in every phase, because the minimum covers the whole initiative, not just Phase 0. Slice 261 reuses `MIN_GUIDE_VERSION` and raises it if its own guide needs change.
- Why not the reviewer's suggested fallback line in the recipe ("if the prompt doesn't open, ask what they want to build")? That puts a methodology instruction back into onboarding, which the arch's setup-plus-handoff decision removes. It would also only cover onboarding runs, not every `cf build`.
- Rejected: failing the build. The opener is a conversation nicety, not correctness. A hard stop on every phase would be out of proportion.

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
- Greenfield: `cf init` sets Phase 0. `cf build` emits the concept prompt, which with guide ≥ v0.22.2 opens by asking what the PM wants to build. The user sees the same sequence as today: setup, then the concept question.
- A registered project in a later phase: the recipe goes to step 3, and `cf build` emits whatever it emits for the project's current settings (walkthrough step 4). Previously the agent was told to "suggest `cf next`". `cf next` is still named in step 3.
- No user data or stored format changes. The new config key has a default, so existing projects need nothing.

### API Contracts

**Core exports** (`@context-forge/core`):
```ts
type OnboardSurface = 'claude-command' | 'agent-skill' | 'mcp-tool';
function renderOnboardRecipe(surface: OnboardSurface): string;

interface CiRecognition { recognized: boolean; matches: string[] }  // absolute paths
function recognizeCi(projectPath: string): CiRecognition;

const BUILD_MANIFESTS: readonly string[];
function hasBuildManifest(projectPath: string): boolean;

const MIN_GUIDE_VERSION = '0.22.2';
function checkGuideMinimum(projectPath: string): Promise<string | null>;  // warning text or null
```

**`NextAction` addition** (`introspection/types.ts`):
```ts
const SETUP_CI_OFFER_ID = 'setup-ci';
interface NextOffer { id: string; message: string }
// NextAction gains: offers?: NextOffer[]
```

**`cf next` output** (offer present):
```
Next:      Your project is in Phase 0 (Concept). Start by describing what you want to build.
Rationale: ...
Run:       cf build
Offer:     No CI detected for this project. The setup-ci skill can add CI and a release skill. Not wanted? Run: cf config set workflow.setup_ci_offer false
```

## Integration Points

### Provides to Other Slices
- **261:** `recognizeCi` and `CI_SIGNATURES` for the detection report's CI fact, and the `detection/` module as the home for the rest of the report.
  - `recognizeCi` owns the repository-root exception to project-folder scoping (D4). 261 consumes it and doesn't re-implement CI detection. The exception is also recorded in the arch's detection section.
  - `hasBuildManifest` / `BUILD_MANIFESTS` are core's one manifest fact, owned by `detection/`. 261's report uses them as its manifest signal and adds its other code signals around them, rather than defining a second manifest check. If 261 extends the list, it edits that one constant, and the offer picks the change up automatically.
  - `MIN_GUIDE_VERSION` is the initiative's single minimum; 261 raises it if its guide needs change.
  - The onboarding recipe needs no changes for 261, because profile selection happens inside `cf build`.
- **265:** the documented onboarding flow and config key, which the end-to-end runs and docs build on.

### Consumes from Other Slices
- Nothing from 261–267.
- From the guide: the concept-prompt opener, at the declared minimum v0.22.2 (Prerequisites gives the mechanism).

## Success Criteria

### Functional Requirements
- `onboard.md`, `cf-onboard/SKILL.md` and `agent_onboard`'s text all come from `renderOnboardRecipe`.
- No surface contains a concept opener, a phase-specific note or a `setup-ci` offer. Each contains the registration check, `cf init` or the MCP fallback, and the `cf build` / `context_build` handoff.
- A greenfield run in an empty directory goes: setup, then `cf build`, then the concept prompt's opening question. The order is the same as today.
- `cf next` and `workflow_next` include an `offers` entry with id `setup-ci` when a `BUILD_MANIFESTS` file exists and there is no recognized CI and no release skill. They include none when any condition fails.
- A project with `.github/workflows/test.yml` (no `ci.yml`), `.gitlab-ci.yml`, or another `CI_SIGNATURES` entry is recognized and gets no offer.
- A CF project in a monorepo subdirectory whose CI is at the repository root is recognized.
- `cf config set workflow.setup_ci_offer false` stops the offer.

### Technical Requirements
- Drift test: changing the source without re-rendering (or editing a rendered file) fails `pnpm -r test`, and the failure names the file and the regenerate command.
- Unit tests for `recognizeCi`:
  - each signature, and the `.github/workflows` and `.buildkite` extension filters
  - a match at the repository root, reported by absolute path
  - `projectPath` equal to the repository root, checked once
  - a `.git` file (worktree) as the repository marker
  - no repository
- Unit tests for `hasBuildManifest`: each `BUILD_MANIFESTS` entry, and none.
- Unit tests for `evaluateSetupCiOffer`: each condition on and off. Each I/O failure class returns a warning naming the path, with no offer and no throw: an unreadable ancestor, `.github/workflows` as a file (`ENOTDIR`), a broken symlink, and an unreadable `.git` entry.
- A navigator test confirms that an offer I/O error reaches `NextAction.warnings` while the recommendation is unchanged.
- Unit tests for `checkGuideMinimum`: at the minimum, above it, below it, unknown version, and no guide.
- A `cf build` test confirms the warning goes to stderr and stdout is the unchanged prompt. A `context_build` test confirms the warning is a second content item.
- A navigator test confirms `offers` is attached on a gate-blocked result as well as a normal one.
- A test confirms `agent_onboard` returns the `mcp-tool` rendering plus the project-name line.
- Format, lint and typecheck pass. New files stay within the ~300-line guideline.
- The root `README.md`'s onboarding section describes setup plus handoff and states the guide minimum (v0.22.2) with `cf guides update`. One line documents `workflow.setup_ci_offer`.

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
   pnpm --filter @context-forge/cli exec vitest run tests/onboardRender.test.ts   # expect: FAIL: "...onboard.md has drifted from the core renderer. Edit onboardRecipe.ts, then run: pnpm --filter @context-forge/cli render:onboard"
   pnpm --filter @context-forge/cli render:onboard   # restore (or git checkout once the file is committed)
   ```
2. **Recipe content.** Open `packages/cli/commands/cf/onboard.md`. Expect three steps (registration, setup, hand off to `cf build` / `context_build`). Expect no "describe what you want to build" and no `setup-ci`. `cf-onboard/SKILL.md` has the same steps in CLI-first form.
3. **Greenfield run (manual).** In an empty temp directory, start Claude Code and run `/cf:onboard demo`. Expect: `cf init --name demo` runs, then `cf build` runs, and the agent asks what you want to build. Repeat with Codex and `$cf-onboard`.
4. **Mid-project run (manual).** In this repository (registered, Phase 4 with slice 260 set), run `/cf:onboard`. Expect: registration is found, setup is skipped, `cf build` runs, and the agent works from its output, which is identical to running `cf build` by hand. No concept question is asked.
5. **MCP surface.** Call `agent_onboard` with `projectName: "demo"`. Expect the `mcp-tool` rendering, ending with `**Project name provided:** demo`.
6. **CI offer appears**
   ```bash
   export CONTEXT_FORGE_DATA_DIR=$(mktemp -d)   # keep the test project out of your real store
   W=$(mktemp -d) && cd $W && git init -q
   cf init --name cf260
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
   ```bash
   M=$(mktemp -d) && cd $M && git init -q && mkdir -p .github/workflows packages/app
   touch .github/workflows/ci.yml packages/app/pyproject.toml
   cd packages/app && cf init --lite --name app
   rm -rf .git      # caveat: cf init creates a nested .git here, which makes packages/app its own repository root
   cf next          # expect: no Offer line
   rm -rf $M/.github && cf next   # expect: the Offer line (control)
   ```

**Caveats found while running it.** `cf init` takes `--name <name>`, not a positional name (the recipe was wrong and is fixed). `cf init` run by a *global published* `cf` re-installs that version's bundled commands over a local `install-commands`; re-run `node packages/cli/dist/index.js install-commands` (and `--ide agents`) before a live run. Steps 3 and 4 were run headless with `claude -p` (greenfield: setup, `cf build`, then "What do you want to build?"; mid-project: registration found, `context_build`, no concept question). The Codex half of step 3 could not run on the reference machine: its configured model was rejected for a ChatGPT account.

## Implementation Notes

### Development Approach
1. `detection/ciDetection.ts` and `detection/buildManifest.ts`, with tests.
2. The config key and `introspection/setupCiOffer.ts`, including I/O-error warnings, with tests.
3. The `NextAction.offers` type, the `getNext` → `computeNext` wrapper, `next.ts` rendering, and the `workflow_next` description, with the navigator test.
4. `onboarding/onboardRecipe.ts` with the three profiles. Render and review each output against D3.
5. The render script, the committed rendered files and the drift test.
6. Switch `agentOnboardTool.ts` to the renderer, with its test.
7. `guides/guideMinimum.ts` and the warning in `cf build` / `context_build`, with tests.
8. README updates.

Each step leaves the build green. Steps 1–3, 4–6 and 7 are independent.

### Special Considerations
- The rendered recipes are prompts. Keep the wording close to the current recipes wherever a step survives, and don't put an example value next to an instruction to read one (for example, the project name).
- Run `cf install-commands` after rendering to confirm that the installed `/cf:onboard` is the new text. The installer overwrites existing files.

## Review Resolution

Slice review `260-review.slice.onboarding-consolidation.md` (round 2, CONCERNS) was resolved in this revision:
- **F001**: offer I/O errors become `NextAction.warnings` entries and never fail `cf next` / `workflow_next` (D6, tests).
- **F002**: `hasBuildManifest` / `BUILD_MANIFESTS` are exported from `detection/buildManifest.ts` as core's one manifest fact, reused by 261 (D5, Integration Points).
- **F003**: a minimum-guide-version warning from `cf build` / `context_build` replaces the silent regression (D8). This deliberately differs from the reviewer's suggested recipe fallback line, for the reasons given in D8.
- **F004**: `setupCiOffer.ts` moved to `introspection/`, so `detection/` holds facts only.
