---
docType: slice-design
slice: conventions-reconciliation
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
interfaces: []
dateCreated: 20261020
dateUpdated: 20261024
status: complete
turns: 19
promptTokens: 1095628
cachedTokens: 1011383
cacheWriteTokens: 84209
completionTokens: 26094
durationSeconds: 301.6
costUsd: 1.3983
usageRounds: 1
pricedRounds: 1
---

# Slice Design: conventions-reconciliation

## Overview

An adopted project usually arrives with its own rules: a hand-written CLAUDE.md or AGENTS.md, `.cursor/rules/*.mdc`, `.claude/rules/*.md`, GEMINI.md and so on. `cf setup-ide` keeps the project's text and appends the guide's rules in a managed block below it. Nothing checks whether the two agree, so a project that says "never commit to main" ends up in the same file as a guide rule that says "commit planning work directly to the target". The agent gets both instructions and no way to tell which one wins.

This slice adds reconciliation in three parts:

1. **Inventory (cf, deterministic).** `cf rules inventory` lists the guide rule files this checkout installs and the project's own rule sources. For a composite file it gives the line range of the managed block so the agent can skip it.
2. **Comparison (agent, guide prompt).** The guide's `conventions-reconciliation` prompt has the agent read both sides, list the conflicts, and put each one to the PM. The PM's decision is recorded with `cf rules resolve`. cf never judges whether two rules contradict.
3. **Application (cf, deterministic).** Resolutions persist in `.context-forge/rule-resolutions.json`, keyed by guide rule file and project source file, never by heading text. Every `setup-ide` run renders them into a "Project Rule Resolutions" section in each composite managed block, so a re-run keeps them in place.

## Value

- **PM:** contradictions in an adopted project come up as explicit decisions, made once, instead of sitting unnoticed in the agent's context.
- **Agents:** each recorded conflict carries a precedence statement inside the instructions the agent loads, so the agent doesn't have to guess.
- **Stability:** a resolution names files, not wording, so guide rewording, heading changes and guide upgrades leave it in force. Changing it is a deliberate PM action.

## Technical Scope

**Included**
- A core module for the persisted resolution format (schema, validation, read, append) and for project rule-source enumeration (D7).
- `cf rules` command group: `inventory`, `resolve`. A resolution is removed by editing the JSON file by hand, and the next read validates the file. A removal command is #126.
- The `setup-ide` change: render resolutions into every composite block (CLAUDE.md, AGENTS.md, `.github/copilot-instructions.md`). Resolutions on scoped rules excluded by `rules.exclude` are skipped.
  - **Scope clarification against the arch:** the arch frames the problem as CLAUDE.md and AGENTS.md composition. This slice deliberately adds `.github/copilot-instructions.md`, because `compileAlwaysOnRules` writes the same always-on rules there. Leaving it out would keep the contradiction in that file. The cost is one more composite in the render tests, and no extra renderer or predicate logic.
  - **Worktrees and dry runs need no new code.** Both already go through `installCheckout`, which reads the resolutions file per checkout root.
- Explicit diagnostics: a malformed file fails the run, and a stale identity on either side of the pair produces a warning (D5).
- The contract for the guide-side prompt (below), and README/CLI reference text for the commands.

**Excluded**
- Any cf judgement of rule meaning (arch: facts in core, judgement in the prompt).
- Editing project-owned text. cf never rewrites anything outside the managed block (arch: additive and reversible).
- Removing or rewriting guide rule text. Guide rules are still compiled as they are, and resolutions sit beside them (D8).
- The prompt's wording. ai-project-guide owns it; this slice specifies only the contract.
- MCP tools, a `cf next` recommendation to reconcile, a "not a conflict" record (#125), a removal command (#126), and issue #123's audience split (D1).

## Dependencies

### Prerequisites
- **Slice 261 (Detection and Adoption State): code and contract dependency.** 266 consumes and modifies 261's rule-file list, and relies on 261's Adoption Facts to route an adopted project to reconciliation. The exact interfaces are listed under Interfaces Required. 261 must land first.
- **ai-project-guide:** a `conventions-reconciliation` prompt section in `prompt.ai-project.system.md`, plus a closing step in the brownfield adoption prompt that points to it when rule files are present. No context profile is needed: `cf prompt get` fetches a prompt by key, and neither `cf build` nor `cf next` selects this prompt. The prompt is pending guide work, tracked in the arch's Dependencies; the cf release that ships 266 names that guide release as its minimum.
  - **If the installed guide lacks the prompt:** `cf prompt get conventions-reconciliation` fails with the existing "No prompt found for 'conventions-reconciliation'" error, and there is no fallback prompt. `cf rules` and `setup-ide`'s rendering work without it, and the user runs `resolve` by hand (walkthrough step 3).

### Interfaces Required

**From slice 261 (consumed and modified):**
- `RULE_FILE_PATHS` in `packages/core/src/detection/presentPaths.ts`. 261 keeps it package-private. 266 changes it in two ways:
  - exports it from core's `detection/index.ts`, so the 266 enumeration (D6) and 261's facts read one list;
  - adds `.github/instructions`.
- `presentPaths(root, candidates)` in the same file, used unchanged to find which candidates exist.
- `pathPresent` / `isEnoent` (`detection/pathPresent.ts`), used unchanged for the missing-file rule.
- **Effect on 261's output:** the `ruleFiles` bullet of Adoption Facts (`renderAdoptionFacts`, 261 D8) lists `.github/instructions` when that directory is present. No other fact changes.
- **Effect on 261's tests:** the `presentPaths` and `renderAdoptionFacts` tests gain a `.github/instructions` case. Existing cases are unchanged, because the list only grows.
- **Effect on the guide:** none. The brownfield prompt reads the rule-file list as presence only and names no entries, so a longer list needs no prompt change.
- 261 lands first, so 266 always edits shipped 261 code. The change is a task in 266, not a revision of 261's design.

**From cf today:**
- The `ideInstall` targets (`claude`, `agents`, `cursor`, `copilot`) and the two compilers in `ideInstall/rules.ts`. Both compilers append a trailing generated section.
- Install manifests (`InstallManifest`, `.context-forge/<target>.manifest`). The cli reads the installed paths and passes them to core's enumeration (D7).
- The marker literals `MANAGED_BEGIN_MARKER`, `MANAGED_END_MARKER`, `GENERATED_MARKER` (`commands/ideTargets.ts`) and `PREMANAGED_BACKUP_SUFFIX` (`ideInstall/paths.ts`). 266 moves their definitions to core and re-exports them from the cli modules, so every literal still appears once (D7).
- `rules.exclude` (`parseRulesExclude`, `RuleExclusions`). An excluded scoped rule is not delivered, so its resolutions don't render.
- `cf prompt get <key>`, unchanged, for delivering the prompt.

## Architecture

### Component Structure

```
packages/core/src/ruleReconciliation/
  markers.ts         marker literals and backup suffix (moved from cli, re-exported there)
  schema.ts          RuleResolution, RuleResolutionsFile (version 1), statement validation
  store.ts           readRuleResolutions(root) / addRuleResolution
                     (validate on read; throws RuleResolutionsError naming file + problem)
  projectSources.ts  projectRuleSources(root, installedPaths) → project-owned sources
                     managedBlockRange(lines) → { beginLine, endLine } | 'none' | 'broken'

packages/cli/src/ideInstall/
  guideRules.ts      guideRuleEntries(guideDir, exclusions) → guide rules with delivery state
                     delivered(rule)
  resolutions.ts     renderResolutions(resolutions, deliveredRules) → markdown section | ''
                     warnStaleResolutions(...)                       → stderr warnings
  rules.ts           compileClaudeRules gains `trailing` (same as compileAlwaysOnRules)
  managedSection.ts  managedState calls core's managedBlockRange for the BEGIN/END check

packages/cli/src/commands/rules.ts   cf rules inventory | resolve
```

`delivered(rule)` is one predicate in `guideRules.ts`. Both the inventory and the renderer call it, and it is the single place #123 changes (D1).

### Data Flow

**Reconciliation (agent-driven, once per adoption or after rule changes)**
1. The agent runs `cf prompt get conventions-reconciliation` (guide prompt).
2. The prompt has the agent run `cf rules inventory --json`, which returns delivered guide rules, project sources and existing resolutions.
3. The agent reads the files and compares them. It reads only the project-owned part of a composite file, outside `managedBlock`. It skips any file pair that already has a resolution.
4. For each conflict, the PM decides, and the agent records the decision with `cf rules resolve <guideRule> <projectSource> --statement "<text>"`. cf validates and appends it.
5. The agent runs `cf setup-ide <target>` to apply.

**Application (every `setup-ide` run, deterministic)**
1. `installCheckout` reads `rule-resolutions.json` for the checkout root, next to `rules.exclude`. A missing file means no resolutions. A malformed file throws before anything is written.
2. Each composite emitter builds `trailing` from the existing trailing content (for example the AGENTS.md scoped index) followed by `renderResolutions(resolutions, deliveredRules)`.
3. `writeManagedSection` merges as it does today. Text outside the block is untouched.
4. `warnStaleResolutions` reports on stderr any resolution whose guide rule is not in the guide or whose project source is not in the checkout (D5).

### State Management
- **Persisted:** `.context-forge/rule-resolutions.json` in the checkout root. It sits next to the install manifests, which are committed, so resolutions reach teammates and propagate to worktrees through git. Each worktree reads its own copy, the same way `rules.exclude` is read per checkout.
- **Writes:** only `cf rules resolve` and hand edits change the file. `setup-ide` only reads it. A write goes to a temp file and is then renamed, the same pattern as `writeManagedSection`. If `.context-forge/` is missing, the write creates it.
- **I/O failures:**
  - **Write or rename fails:** the error propagates as a failure naming the file, with no retry. The rename is atomic, so the stored file is either the old version or the new one. A leftover temp file is overwritten by the next write.
  - **A candidate can't be read during inventory:** the inventory fails naming the file. It never skips the file.
- **Concurrency:** writes take no lock. Running two `cf rules resolve` calls in one checkout at the same time isn't supported, and a lost update is possible. Branches or worktrees that each append a resolution merge like any other committed file. If git reports a conflict, the PM resolves it, and the next read validates the result.
- **Recorded but not applied:** if `setup-ide` doesn't run after `resolve`, or the process stops in between, the resolution waits in the file and the next `setup-ide` applies it. This is accepted, and `resolve` prints the apply command.
- **No in-memory or session state.** Each run reads the file fresh.

## Technical Decisions

### D1 — #123 is neither folded in nor a prerequisite
Status: decided
- **Not folded in:** #123 is a paired guide/cf change whose marker isn't agreed yet. Adding it would push an already high-risk slice further.
- **Not required first:** 266 needs exactly one thing from the audience split, which is to know which composite files a guide rule reaches. That is the single `delivered(rule)` predicate. Today every composite of every target receives every guide rule except a scoped rule excluded by `rules.exclude`, so the predicate is just "not excluded". #123 adds a target parameter and its audience marker to that predicate, and resolutions then follow their rule automatically. Either slice can land first.
- The one constraint this places on #123 (keep the rule basename as identity) is under Provides to Other Slices.

### D2 — Resolution identity is a file pair, never text
Status: decided
- **Key:** `guideRule` (the basename in the guide's `rules/` directory, the same convention as `rules.exclude`) plus `projectSource` (a checkout-relative path with `/` separators). Several resolutions may share a pair. Each is a separate record, kept in file order.
- This meets "a guide wording change doesn't break a stored resolution": rewording, re-heading or reordering `git.md` changes neither key.
- **Rejected:** heading text or anchors (the plan forbids them). Content hashes (a hash breaks on every guide edit). Per-rule IDs inside guide files (a guide-wide authoring burden for one consumer).

### D3 — A resolution is a PM-approved statement
Status: decided
- A record is the file pair plus `statement`: one required line of PM-approved text saying which rule applies and how. cf stores it verbatim and renders it verbatim, and never reads it for meaning. Validation is in D5.
- **No `decision` field.** The statement already carries the precedence, and no consumer needs it as structured data. A field would only pick a label in the rendered line. Removed per review.
- The record exists because the plan requires it: recording is needed for "conflicts are listed for PM decision", the stored file plus rendering for "resolutions persist and survive `setup-ide` re-runs", and the file-pair key for "a guide wording change doesn't break a stored resolution".
- **Rejected:** excluding the guide rule when the project wins. Exclusion is whole-file and isn't allowed for alwaysApply rules (`exclusions.ts`), and dropping all of `git.md` over one conflict loses everything else in it.

### D4 — One section at the end of each composite block
Status: decided
- `renderResolutions` emits a `## Project Rule Resolutions` section as the last thing in the managed block: a one-line precedence sentence, then one bullet per resolution in file order. The format is in API Contracts.
- **Why `compileClaudeRules` gains `trailing`:** the section has to be inside the BEGIN/END pair. The compiler assembles the block content and hands it to `writeManagedSection` in one call, so an emitter has no point after that call where it could append inside the block. `compileAlwaysOnRules` already takes `trailing`, which carries the AGENTS.md scoped index, and the Claude compiler gets the same parameter. No other compiler change.
- **Why the block, not next to each rule:** scoped rules are installed as separate files (`.claude/rules/`, `.cursor/rules/*.mdc`, `.github/instructions/`) tracked by manifest hash. Patching them would change wholesale-copied files and the manifest logic. The composite block is always loaded, so the precedence statement is in context whenever the scoped rule is.
- No resolutions gives an empty string: no heading, and the block is byte-identical to today's. So projects without resolutions see no change.
- The section heading and the precedence sentence are cf structure, like the existing `# Project Guidelines for Claude` H1. They are constants in `resolutions.ts`.

### D5 — Stale identities warn and malformed files fail
Status: decided
- **Malformed file:** `setup-ide` and `cf rules` fail with `RuleResolutionsError` naming the file and the problem. Nothing is written. There is no silent fallback to "no resolutions". These checks run on read and on `resolve`:
  - the file is not valid JSON, or `version` is unknown
  - a statement is missing, contains a newline, or contains any marker string from `markers.ts`. A marker inside the block would make `managedState` report the file as broken, or make the inventory treat it as cf output.
  - `guideRule` or `projectSource` contains a backtick. The renderer wraps both in backticks, so values are rejected rather than escaped.
- **Stale identity, either side of the pair.** The resolution isn't rendered, stderr warns, and the exit code stays 0 (matching `rules.exclude`'s unmatched-pattern warnings):
  - `guideRule` not in the guide: `⚠️  resolution git-old.md vs CLAUDE.md names a guide rule the guide no longer has; re-run reconciliation or edit .context-forge/rule-resolutions.json`. Without the rule its delivery can't be known.
  - `projectSource` not present in the checkout (renamed or deleted, checked with `pathPresent`): `⚠️  resolution git.md vs team-rules.md names a project file that no longer exists; re-run reconciliation or edit .context-forge/rule-resolutions.json`.
  - Both sides are treated alike on purpose. A precedence statement over a file that's gone is a resolution that no longer applies, and rendering it would keep it in agent context unseen.
- **Rule not delivered to this target** (excluded, or out of audience after #123): not rendered, and nothing is printed. That is the expected result.

### D6 — Project-source inventory is deterministic and excludes cf output
Status: decided
- **Candidates:** 261's `RULE_FILE_PATHS`, exported and extended with `.github/instructions` (Interfaces Required).
  - **Composites:** the entries `setup-ide` manages (`CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`). The project-owned part is everything outside the BEGIN/END pair.
  - **Directories:** the directory entries (`.claude/rules`, `.cursor/rules`, `.github/instructions`) expand to every file under them.
  - **Everything else** is a standalone file.
- **Excluded:** files in the caller-supplied `installedPaths` (every `.context-forge/*.manifest`), files carrying `GENERATED_MARKER`, and `*.pre-context-forge` backups. These are cf's own output or copies of project text.
- **Composite with a broken BEGIN/END pair:** the inventory reports it and doesn't guess a range. The agent is told the file's markers need fixing, the same message `setup-ide` gives.
- Scope: the checkout root only. A nested `CLAUDE.md` in a subdirectory is not a source.

### D7 — Core enumerates project rule sources; guide-rule delivery stays in cli
Status: decided
- **In core (`ruleReconciliation/`):** the persisted format and the project rule-source enumeration, including the managed-block range scan. This meets the arch's "Core enumerates rule sources" and "One detection, many consumers": a later MCP tool calls the same function.
  - The enumeration needs the marker literals, so those definitions move to core `markers.ts` and the cli modules re-export them. Each literal still appears once.
  - It needs to know which files cf installed. The manifest format stays cli-owned, so the cli reads the manifests and passes the paths in as `installedPaths`. Core never parses a manifest.
  - `managedBlockRange` is the one BEGIN/END rule. cli's `managedState` calls it, so the rule isn't duplicated.
- **In cli (`guideRules.ts`):** guide rule entries and `delivered(rule)`. Delivery is defined by `setup-ide`'s compilers and `rules.exclude`, which live in `ideInstall/`, and #123 changes it there. This is a stated, narrow deviation from "core enumerates": a later MCP surface that needs delivery state moves `delivered()` and its exclusion input to core at that time. Listing guide rules is not a project-detection fact, so no second detection exists today.
- **Rejected:** a `.context-forge.toml` key. The config system holds scalar strings (`rules.exclude` is comma-separated), and resolutions are a list of records with free text.

### D8 — Precedence is advisory
Status: decided
- **What it guarantees:** after `setup-ide`, every valid, non-stale resolution's statement is inside the managed block of every composite that delivers its guide rule, under one heading that says the resolution applies over the rules above. Re-runs and guide upgrades keep it there. The PM sees each conflict once and decides it.
- **What it doesn't guarantee:** the contradicting guide text stays in the block and in installed scoped rule files. cf doesn't remove or rewrite it, and an agent may still follow it. "Resolved" means "annotated with PM-approved precedence", not "removed". So the arch's "re-running `setup-ide` doesn't re-introduce them" holds for the resolution (it's never lost), not for the conflicting text, which was never removed.
- **If agents ignore the section in real use**, the fallback is per-rule suppression, which needs guide-side rule IDs (rejected for now in D2).

### Technology Choices
- JSON with an explicit `version`: no new dependency, strict to parse, and validation errors are precise. The file is edited through `cf rules`, so hand-editing doesn't need to be easy.
- Commander for the `cf rules` group, following the existing command modules.

### Patterns and Conventions
- Atomic write (temp file, then rename), as in `managedSection.ts`.
- File name, section heading, marker literals and the version constant are each defined once (CLAUDE.md: no scattered comparison values).
- Errors use the existing `UserError` / `handleError` path in the CLI. Core throws a typed `RuleResolutionsError`.

## Implementation Details

### API Contracts

**`cf rules inventory --json [--project <id>]`** (read-only)

```json
{
  "guideRules": [
    { "rule": "git.md", "path": "project-documents/ai-project-guide/project-guides/rules/git.md",
      "kind": "alwaysApply", "excluded": false },
    { "rule": "python.md", "path": "…/rules/python.md", "kind": "scoped", "excluded": false }
  ],
  "projectSources": [
    { "path": "CLAUDE.md", "kind": "composite", "managedBlock": { "beginLine": 41, "endLine": 388 } },
    { "path": ".cursor/rules/team-style.mdc", "kind": "standalone" }
  ],
  "resolutions": [ /* the stored records, see schema */ ]
}
```
- `excluded` is the negation of `delivered()`.
- JSON is the only output. The prompt is the consumer, so there is no human table.

**`cf rules resolve <guideRule> <projectSource> --statement <text>`**
- Validates that `guideRule` exists in the installed guide and that `projectSource` is in the current inventory. Either failing is a `UserError` that lists the valid names. Then it applies D5's validation, appends the record, and prints `Recorded resolution <guideRule> vs <projectSource>. Run cf setup-ide <target> to apply.`
- It doesn't run `setup-ide` itself. Install stays one explicit command.

**Rendered section** (inside the managed block, last):

```markdown
## Project Rule Resolutions
Where a rule above conflicts with the project's own rules, the resolution below applies.

- `git.md` vs `CLAUDE.md`: Slice work merges only through a reviewed PR; never merge locally.
- `python.md` vs `.cursor/rules/team-style.mdc`: Use ruff for formatting; the black instruction in team-style.mdc is superseded.
```

### Database / Storage Schema

`.context-forge/rule-resolutions.json`:

```json
{
  "version": 1,
  "resolutions": [
    { "guideRule": "git.md", "projectSource": "CLAUDE.md",
      "statement": "Slice work merges only through a reviewed PR; never merge locally." }
  ]
}
```
- `version` must equal `RULE_RESOLUTIONS_VERSION` (1). Any other value is an error.
- This is a new format with no migration. An absent file is a valid, empty state.

## Integration Points

### Provides to Other Slices
- No slice in this initiative consumes 266.
- To ai-project-guide: the prompt contract. The prompt is fetched by key `conventions-reconciliation`. It runs `cf rules inventory --json`, compares only project-owned text, skips conflicts that already have a resolution, records each PM decision with `cf rules resolve`, and ends by running `cf setup-ide`.
- To #123: the `delivered(rule, target)` predicate, and one constraint: the audience split must keep the rule basename as identity, or ship a resolution re-key step.
- To slice 261's Adoption Facts: `.github/instructions` in the rule-file list (Interfaces Required).

### Consumes from Other Slices
- **261:** `RULE_FILE_PATHS`, `presentPaths`, `pathPresent`, and the Adoption Facts `ruleFiles` fact the brownfield prompt routes on. Listed with their changes under Interfaces Required.
- **Guide prompt missing:** `cf prompt get conventions-reconciliation` already fails with "No prompt found". There is no fallback prompt (arch: a missing guide prompt is an error).

## Success Criteria

### Functional Requirements
- `cf rules inventory` lists guide rules with their exclusion state, and project sources with cf-installed files, generated-marker files and backups excluded. For composites it gives the managed block's line range, and it reports broken markers.
- `cf rules resolve` records a valid resolution. It rejects an unknown guide rule, an unknown source, a missing or multi-line statement, a statement containing a marker, and a name containing a backtick.
- `setup-ide` for each target renders the resolutions for non-excluded rules into every composite block it writes. Re-running it gives byte-identical files.
- With no resolutions file, `setup-ide` output is byte-identical to today's for every target.
- After a guide rule file's contents change but its basename stays, its resolutions still render unchanged.
- A missing guide rule or a missing project source warns and doesn't render. A malformed file fails before any write.
- Worktree installs render each worktree's own resolutions file. A dry run previews the section.
- 261's Adoption Facts list `.github/instructions` when present.

### Technical Requirements
- Core: unit tests for store validation (markers, backticks), `.context-forge/` creation and atomic write; `projectRuleSources` (installed paths, generated marker, backups, directory expansion, broken markers); `managedBlockRange`. CLI: tests per subcommand. ideInstall: render tests for each composite (CLAUDE.md, AGENTS.md, copilot-instructions.md) covering the excluded-rule skip, both stale-identity warnings and the no-file byte-identity regression.
- 261's `presentPaths` and `renderAdoptionFacts` tests gain a `.github/instructions` case; `managedState` tests still pass unchanged.
- The test fixture for the inventory uses a real CLAUDE.md layout: project text above a managed block written by the current `writeManagedSection`.
- Lint and typecheck pass (the repo has no separate format step). New files stay under about 300 lines.
- README and CLI reference document `cf rules` and the resolutions file.

### Integration Requirements
- The guide's `conventions-reconciliation` prompt can drive the whole loop with the commands above and nothing else. This is verified at integration, once the guide release carrying the prompt exists.
- #123 can extend `delivered()` with a target parameter without touching the renderer or the store.

### Verification Walkthrough

Run in a scratch brownfield project with a hand-written CLAUDE.md containing a rule that contradicts the guide, e.g. "Never commit directly to main; every change goes through a PR." Malformed files, marker injection and guide rewording are covered by unit tests, not repeated here.

**Setup used for the recorded run (isolated, so the real project registry and home directory are untouched):**
```bash
S=$(mktemp -d); mkdir -p $S/home $S/data $S/proj && cd $S/proj && git init -q -b main
printf '# Team rules\n\nNever commit directly to main; every change goes through a PR.\n' > CLAUDE.md
mkdir -p project-documents && cp -R <a checkout of ai-project-guide> project-documents/ai-project-guide   # no network needed
export HOME=$S/home CONTEXT_FORGE_DATA_DIR=$S/data       # setup-ide also installs slash commands into $HOME
cf() { node <repo>/packages/cli/dist/index.js "$@"; }    # the local build; the global cf is the published package
cf init --lite --name scratch
```

1. **Baseline install.**
   ```bash
   cf init --ide claude          # or cf setup-ide claude on a registered project
   grep -n "Project Rule Resolutions" CLAUDE.md   # → no match (grep exits 1)
   ```
   (Recorded run used `cf setup-ide claude --yes`, since the project was registered with `cf init --lite`.)
2. **Inventory.**
   ```bash
   cf rules inventory --json
   ```
   Expect: guide rules (`general.md`, `git.md`, `fixes.md` as alwaysApply, plus scoped rules), `projectSources` holding only `CLAUDE.md` as a composite with its managed-block line range, and `resolutions: []`. Files under `.claude/rules/` that cf installed are absent.
   Recorded run: `"projectSources": [{"path": "CLAUDE.md", "kind": "composite", "managedBlock": {"beginLine": 5, "endLine": 192}}]`; the lines match `grep -n "context-forge -->" CLAUDE.md`.
3. **Agent reconciliation** (needs the guide prompt). Run `cf prompt get conventions-reconciliation` and give the output to the agent. It should report the commit-to-main conflict between `git.md` and `CLAUDE.md` and ask the PM to decide. On "project wins", it runs:
   ```bash
   cf rules resolve git.md CLAUDE.md \
     --statement "Every change goes through a PR; never commit directly to main or the integration branch."
   # → Recorded resolution git.md vs CLAUDE.md. Run cf setup-ide <target> to apply.
   ```
   If the guide prompt isn't released yet, run the `resolve` command by hand. The walkthrough continues the same way.
4. **Apply and re-run.**
   ```bash
   cf setup-ide claude --yes
   sed -n '/Project Rule Resolutions/,/END/p' CLAUDE.md   # → section with the git.md resolution, ending at the END marker line
   cp CLAUDE.md /tmp/a && cf setup-ide claude --yes && cmp CLAUDE.md /tmp/a   # → identical
   ```
   The `cmp` prints nothing when the files are identical.
5. **Other targets.** `cf setup-ide agents --yes`, then confirm the same section at the end of AGENTS.md's block (`sed -n '/Project Rule Resolutions/,/END/p' AGENTS.md`).
6. **Stale identity, both sides.** Hand-edit the JSON so `guideRule` is `git-old.md`, run `cf setup-ide claude --yes`: expect the guide-side warning naming `git-old.md vs CLAUDE.md`, no section, exit 0. Restore it, then change `projectSource` to `team-rules.md` (absent) and re-run: expect the project-side warning, no section, exit 0. Restore it, re-run, and the section is back with no warning.
   Stale warnings go to stderr (`cf setup-ide claude --yes 2>&1 >/dev/null | grep resolution`). The recorded run printed exactly the two messages in D5 and the section count was 0, 0, 1 across the three runs.

## Risk Assessment

### Technical Risks
- **Comparison quality.** The agent might miss conflicts or flag compatible rules. That is guide prompt territory. cf's part is to give it exact inputs (the inventory, with block ranges, so it doesn't compare the guide's rules against themselves).
- **Precedence is advisory** (D8). The contradicting guide text stays loaded beside the statement.

### Mitigation Strategies
- The byte-identity regression for projects with no resolutions keeps the change invisible to everyone who doesn't use it.
- Stale-identity warnings name the file pair and the remedy, so a broken key on either side is visible on the next install.

## Implementation Notes

### Development Approach
1. Core `ruleReconciliation/`: move the marker literals into `markers.ts` with cli re-exports; schema, store and tests.
2. Export `RULE_FILE_PATHS` with `.github/instructions` added, and update 261's tests. Then `managedBlockRange` (with `managedState` calling it) and `projectRuleSources`, with fixtures (real CLAUDE.md layout, installed paths, generated marker, backup).
3. cli `guideRules.ts` (`guideRuleEntries`, `delivered()`), then `cf rules inventory | resolve`.
4. `compileClaudeRules` gains `trailing`. Then `renderResolutions` and `warnStaleResolutions`, wired into `installCheckout` and every composite emitter. Add the per-target, stale and byte-identity tests.
5. Docs: README, CLI reference, and the guide-side prompt contract handed to ai-project-guide.

### Special Considerations
- Statements are PM-approved text placed in agent instructions. cf renders each one as a single markdown list item. Under D5's validation, a statement can't open a new heading, can't contain a line that breaks the block's markers, and can't make the file look like cf-generated output.
- Deferred items (a `cf next` reconcile recommendation, MCP tools) go to the slice plan's Future Work when tasks are created.
