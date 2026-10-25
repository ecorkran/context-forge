---
docType: slice-design
slice: agent-scoped-rule-marker
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [266]
interfaces: []
dateCreated: 20261025
dateUpdated: 20261025
status: complete
---

# Slice Design: Agent-Scoped Rule Marker

## Overview

Fixes GitHub #123, cf half. `cf setup-ide` builds every composite file from the same rule set. `compileClaudeRules` and `compileAlwaysOnRules` (`packages/cli/src/ideInstall/rules.ts`) compile every `alwaysApply` rule into CLAUDE.md, AGENTS.md and copilot-instructions.md. Each target copies every scoped rule into its own directory: `.claude/rules/`, `.cursor/rules/*.mdc` or `.github/instructions/`. AGENTS.md also lists the scoped rules in an index. Nothing can say "this rule is for Claude only", so Claude-specific instructions such as peer messaging between Claude sessions either leak into AGENTS.md, where Codex, Cursor and Copilot read them, or cannot ship at all.

ai-project-guide signed off on the marker: rule frontmatter `agents: [claude]`, written inline and never as a block list. When the key is absent, the rule goes to every agent. It will appear on very few rules. The PM accepted the risk that Cursor meets an unknown frontmatter key. That risk applies only to a rule whose list includes `cursor`, because a rule without `cursor` never reaches `.cursor/rules/`. This slice makes setup-ide honor the marker. Once it ships, the guide writes the marker convention into its rules docs and adds a Claude-only agent-communication rule, as one patch.

**Scope fit.** The 900 plan holds setup-ide parity and port work (911, 924, 929–931). This is the same kind of item: one new frontmatter key, read in the places that already decide which rule goes where. The parts of #123 beyond the marker are not in scope. Auditing which rules are Claude-specific is guide work. "Rework how CLAUDE.md and AGENTS.md are created" is not needed once a per-output filter exists, and it is dropped. Patch release.

## Value

- The guide can ship Claude-only rules, starting with the agent-communication rule, without other agents reading them.
- AGENTS.md, copilot-instructions.md and the Cursor and Copilot scoped files stop carrying instructions their readers cannot act on.
- Rule reconciliation stays correct. A resolution renders only in the blocks its guide rule reaches, and the inventory shows where each rule goes, so the reconciliation prompt does not compare AGENTS.md text against a rule AGENTS.md never receives.

## Technical Scope

### Included

- Parsing the `agents:` frontmatter key of a guide rule.
- A fixed set of audiences, one per output file family.
- Filtering every rule-to-output path by audience: the three composite compilers, the AGENTS.md scoped index, and the three scoped-rule copiers.
- Reporting rules skipped by audience, the way excluded rules are reported.
- One warning per run for each unknown audience value.
- Per-audience `delivered`, per-audience resolution sections, and an `agents` field in `cf rules inventory --json`.
- README and CLI reference text for the marker. CHANGELOG entry.

### Excluded

- Which rules get the marker, and the agent-communication rule itself. Both belong to ai-project-guide.
- Filtering skills (`.claude/skills/`, `.agents/skills/`) or Claude agents (`.claude/agents/`). Those are per-target directories already. Skills have their own frontmatter format, and #123 is about rules.
- A per-target (rather than per-output) audience. See Technical Decisions.
- Any change to `rules.exclude`. The two filters are independent.

## Dependencies

### Prerequisites

- **266 (conventions reconciliation):** `guideRuleEntries`, `delivered` (`ideInstall/guideRules.ts`), `classifyResolutions` and `renderResolutions` (`ideInstall/resolutions.ts`), and `InstallContext.resolutionsSection`. The `delivered` comment already names #123 as the issue that extends it.

### Interfaces Required

- `ideInstall/frontmatter.ts`: the rule frontmatter readers. The new reader follows their conventions: the first `---` block only, and a `---\r` line is not a fence.
- `ideInstall/manifest.ts`: unchanged. Its prune step deletes scoped files an earlier run wrote and this run does not, as long as they are unedited. A rule that becomes Claude-only therefore disappears from `.cursor/rules/` and `.github/instructions/` with no new code.

## Architecture

### Component Structure

New module `packages/cli/src/ideInstall/ruleAudience.ts`:

```ts
export const RULE_AUDIENCE = {
  Claude: 'claude',   // CLAUDE.md block, .claude/rules/
  Agents: 'agents',   // AGENTS.md block and its scoped index
  Copilot: 'copilot', // copilot-instructions.md block, .github/instructions/
  Cursor: 'cursor',   // .cursor/rules/
} as const;
export type RuleAudience = (typeof RULE_AUDIENCE)[keyof typeof RULE_AUDIENCE];

/** The rule's declared audiences: null when the key is absent (every audience). */
export function ruleAudiences(text: string): AudienceList | null;

/** True when a rule with this text reaches the given audience. */
export function reachesAudience(text: string, audience: RuleAudience): boolean;

/** Unknown values across the rules directory, for the once-per-run warning. */
export function unknownAudienceValues(rulesDir: string): { rule: string; value: string }[];
```

`AudienceList` holds the known audiences and the unknown raw values separately (`{ known: RuleAudience[]; unknown: string[] }`). There is one parser, `ruleAudiences`, and one predicate, `reachesAudience`, built on it. Every call site, the warning scan and `guideRuleEntries` go through those two functions, so the audience rule is defined once even though each call site evaluates it. The call sites do not consume `GuideRuleEntry` for three reasons. `guideRuleEntries` is built only when resolutions exist. The entry carries no rule text, which the compilers and copiers need. And each call site already reads the file in its own loop, so threading a shared list through all seven would restructure every copier without changing behavior. The rules directory is small, so no cache is added.

Call sites that change:

| Path | File | Audience |
|---|---|---|
| CLAUDE.md block | `rules.ts` `compileClaudeRules` | `claude` |
| AGENTS.md block | `rules.ts` `compileAlwaysOnRules` via `emitAgentsMd` | `agents` |
| copilot-instructions.md block | `rules.ts` `compileAlwaysOnRules` via `setupCopilot` | `copilot` |
| AGENTS.md scoped index | `targets/agents.ts` `scopedRuleIndex` | `agents` |
| `.claude/rules/` | `targets/claude.ts` `copyClaudeModularRules` | `claude` |
| `.cursor/rules/` | `targets/cursor.ts` `copyCursorRules` | `cursor` |
| `.github/instructions/` | `targets/copilot.ts` `emitCopilotInstructionFiles` | `copilot` |

`compileAlwaysOnRules` gains an `audience: RuleAudience` option. `compileClaudeRules` always uses `claude`. The private `alwaysOnRules(rulesDir)` helper becomes `alwaysOnRules(rulesDir, audience)` and filters on `reachesAudience`.

### Data Flow

1. `installIde` runs `unknownAudienceValues(guide.rules)` once, before the target runs, and prints one stderr warning per unknown value (format below). One `installIde` call installs one target, so "once per run" means once per target. A multi-target `setup-ide` invocation warns once per target, the same way the existing exclusion warnings repeat. The scan does nothing when the rules directory is missing, because the target's `requireRulesDir` aborts first. An unreadable rule file makes `readFileSync` throw, and `installIde`'s existing filesystem-error path reports it and exits 1. The scan adds no handling of its own, so it has no silent skip.
2. `classifyForInstall` builds one resolution section per audience (see State Management).
3. Each target compiles and copies as today, passing its audience at every call site in the table above.
4. A scoped rule skipped by audience prints `⊘ Skipped <file> (agents: <list>)`, in the same yellow as the excluded message. The always-on compilers skip silently, like non-alwaysApply rules today, and their closing count (`📋 Embedded N alwaysApply rules`) counts only the rules written.
5. The manifest's prune step removes scoped files from earlier runs that are no longer written.

### State Management

`InstallContext.resolutionsSection: string` becomes `resolutionSections: Readonly<Record<CompositeAudience, string>>`, where `CompositeAudience` is `claude | agents | copilot`: the audiences that own a composite block. Cursor has no composite block of its own, since its always-on rules go to AGENTS.md, so it has no entry. Each target reads the section for the block it writes: CLAUDE.md reads `claude`, AGENTS.md reads `agents`, and copilot-instructions.md reads `copilot`. Every entry starts as `''`.

`classifyResolutions` keeps its stale-guide and stale-project lists unchanged, and they stay audience-free: a stale identity is warned about once. `live` becomes the resolutions whose guide rule is delivered to at least one audience. `renderResolutions(live, entries, audience)` keeps only the resolutions whose guide rule is delivered to `audience`.

## Technical Decisions

### Audience is per output file, not per target

AGENTS.md is written by three targets: `agents`, `copilot` and `cursor`. If the audience were the installing target, a rule marked `[cursor]` would be in AGENTS.md after `setup-ide cursor` and gone after `setup-ide copilot`. The same file would then depend on which target ran last. Tying each audience to an output family makes every file's content a function of the rules alone. Readers map naturally: AGENTS.md is the file Codex and other AGENTS.md tools read, and `agents` is already the name of the target that writes only that file. The values match the canonical setup-ide target names on purpose. The aliases `codex` and `openai` are not accepted as audience values; they would make one file family answer to three names.

Consequence, documented in the README: for a Cursor install, always-on rules reach Cursor through AGENTS.md. An always-on rule meant for Cursor must therefore list `agents`; listing only `cursor` makes an always-on rule reach no file. The marker's real use is `[claude]`, so this edge stays in the docs and gets no code.

### Parsing

The guide writes the list inline: `agents: [claude]`. The project rules call for lenient parsing of the content, not the layout, so the inline form tolerates any spacing and optional single or double quotes per item (`agents: [ "claude", cursor ]`), and a bare scalar (`agents: claude`) reads as a one-item list. Values are trimmed and lowercased.

The block-list form is not supported, because the guide's contract rules it out. It still cannot fail silently: if `agents:` were treated as absent, a block-list rule would reach every agent, the leak the marker exists to prevent. So `agents:` with no inline value gets the unknown-value warning path (`agents must be written inline, e.g. agents: [claude]`), and the rule reaches no output. That is the safe direction: the author sees the warning, and nothing leaks.

The key is read the way `getFrontmatterField` reads keys: from the line after the opening `---` up to the closing fence, or to end of file when there is no closing fence. A rule with no frontmatter has no marker. An empty inline list (`agents: []`) parses to no audiences, so the rule reaches no output. That falls out of the parse and is not offered as a feature.

### Unknown audience values

An unknown value, such as a misspelling or an audience a newer guide adds, is ignored for delivery and produces a warning on stderr once per run:

`⚠️  <rule>: unknown agents value '<value>' (known: claude, agents, copilot, cursor) — ignored`

It does not abort, because an older cf must keep installing a newer guide. It is not silent either: the value is named. A rule whose list holds only unknown values reaches no output, which is what its author asked for as far as cf can tell, and the warning says why.

### Inventory field

`GuideRuleEntry` gains `agents: RuleAudience[] | null`. `null` means the key is absent and the rule goes to every audience. Unknown values are left out of the field; the install warning covers them. The field is serialized as-is in `cf rules inventory --json`. This is an additive JSON change. The guide's reconciliation prompt can use it to skip project sources a rule never reaches. The prompt wording is the guide's to change.

`delivered(entry)` becomes `deliveredTo(entry, audience)`: not excluded, and either `agents` is null or it includes `audience`. The no-argument `delivered` is removed, since every caller now has an audience. `rules.exclude` still applies only to scoped rules, as before.

### Patterns and Conventions

- Audience values are defined once in `RULE_AUDIENCE` and referenced everywhere. No string literals at call sites.
- The skip message is a shared helper next to `excludedMessage` (`exclusions.ts`), so all three copiers print the same text.
- The frontmatter reader follows the existing readers in `frontmatter.ts`: line records via `toRecords` and the exact `---` fence.

## Implementation Details

### API Contracts

- `compileAlwaysOnRules(options)`: `AlwaysOnOptions` gains `audience: RuleAudience`. It is required, so a new caller cannot omit it by accident.
- `compileClaudeRules(rulesDir, targetFile, trailing, out)`: signature unchanged. It filters on `claude` internally.
- `emitAgentsMd(ctx, includeScopedIndex)`: unchanged. It passes `agents` and reads `ctx.resolutionSections.agents`.
- `cf rules inventory --json`: each `guideRules[]` item gains `agents` (array of known audience strings, or `null`).
- `setup-ide` output: the new skip line and the unknown-value warning. Exit codes are unchanged.

### Storage

None. The resolutions file format is unchanged.

## Integration Points

### Provides to Other Slices

- The marker contract for ai-project-guide: `agents: [<audience>, ...]` in rule frontmatter, audiences `claude | agents | copilot | cursor`, absent means all. Sent to the guide session when this slice merges, so it can release its paired patch.

### Consumes from Other Slices

- 266: resolution classification and rendering, `GuideRuleEntry`.

## Success Criteria

### Functional Requirements

- An alwaysApply rule with `agents: [claude]` appears in CLAUDE.md's managed block and in neither AGENTS.md's nor copilot-instructions.md's, for every target that writes them.
- A scoped rule with `agents: [claude]` is copied to `.claude/rules/`. It is not written to `.cursor/rules/` or `.github/instructions/`, and it is not listed in AGENTS.md's scoped index. Each copier that skips it prints the skip line.
- A rule without `agents:` behaves exactly as today. Running setup-ide for each target on the real guide with no marked rules produces byte-identical output to before the change.
- A scoped file written by an earlier run, then skipped by audience, is pruned by the manifest when unedited and kept with the manifest's existing warning when edited.
- Inline, quoted and scalar forms parse to the same audiences. A block-list `agents:` warns and reaches no output.
- An unknown value prints one warning per run, naming the rule and the value, and the install exits 0.
- A resolution on a `[claude]` rule renders in CLAUDE.md's block only.
- `cf rules inventory --json` shows `"agents": ["claude"]` for a marked rule and `"agents": null` for an unmarked one.

### Technical Requirements

- Unit tests for the parser covering the inline and scalar forms, case, quoting, the block-list warning, unknown values, and a missing or unclosed frontmatter.
- Unit tests for each call site in the Component Structure table, using a fixture rules directory with one marked alwaysApply rule, one marked scoped rule and one unmarked rule.
- Existing setup-ide snapshot tests pass unchanged. The real guide has no marked rules yet.
- A resolution test for per-audience rendering.
- Lint, typecheck and the full test suite pass.

### Verification Walkthrough

Run from the repo root after `pnpm -r build`, in a scratch copy of a project with the guide installed (`cp -R` of a test project into the scratchpad).

1. Add `agents: [claude]` to the frontmatter of one alwaysApply rule (e.g. `general.md`) and one scoped rule (e.g. `python.md`) in the scratch copy's `project-documents/ai-project-guide/project-guides/rules/`.
2. `node packages/cli/dist/index.js setup-ide claude`: CLAUDE.md contains the general rule's section, and `.claude/rules/python.md` exists.
3. `node packages/cli/dist/index.js setup-ide agents`: AGENTS.md lacks the general rule's section, the scoped index lacks `python.md`, and the output shows `⊘ Skipped python.md (agents: claude)`.
4. `node packages/cli/dist/index.js setup-ide copilot` and `setup-ide cursor`: neither `.github/instructions/python.instructions.md` nor `.cursor/rules/python.mdc` is written, and if a previous unmarked run wrote them, they are removed.
5. Change one marker to `agents: [claude, gemini]` and rerun `setup-ide agents`: one warning names `gemini`, and the exit code is 0.
6. `node packages/cli/dist/index.js rules inventory --json`: the marked rules show `"agents": ["claude"]` and the others show `null`.

**Results (20261025, local build, scratchpad sandbox with guide v0.22.6, isolated `HOME`).** A baseline run without markers wrote `.cursor/rules/python.mdc` and `.github/instructions/python.instructions.md`. Then `agents: [claude]` was added to `general.md` and `python.md`.

1. Step 2: pass. CLAUDE.md has general.md's sections (Core Principles through Document Conventions), and `.claude/rules/python.md` exists.
2. Step 3: pass. AGENTS.md has only Fixes and Git Rules, and the scoped index does not list `python.md`. The index skip is silent, as designed.
3. Step 4: pass. Copilot and cursor printed `⊘ Skipped python.md (agents: claude)`, and the manifest removed both baseline files (`🧹 Removed … (no longer installed by the guide)`). copilot-instructions.md carries only Fixes and Git Rules.
4. Step 5: pass. One `unknown agents value 'gemini'` warning, exit 0.
5. Step 6: pass. `general.md` and `python.md` show `["claude"]` and `git.md` shows `null`. The unknown `gemini` is left out of the field.

## Implementation Notes

### Development Approach

1. `ruleAudience.ts` with parser tests.
2. Compiler and copier filtering, call site by call site, with tests.
3. Per-audience resolutions and the inventory field.
4. Unknown-value warning in `installIde`.
5. Docs: README marker section, CLI reference note on the inventory field, CHANGELOG.

### Special Considerations

- `rules.ts` is 180 lines and stays under 300. The parser lives in its own module, so `frontmatter.ts` does not grow.
- No snapshot churn is expected, because the real guide has no marked rules. Any snapshot diff is a regression.

## Design Review Resolution

Review `935-review.slice.agent-scoped-rule-marker.md` (claude-sonnet-5-5, CONCERNS):

- **F002, parser accepts too much:** cut to the inline form plus a bare scalar. Block lists are not parsed. A valueless `agents:` warns and reaches no output instead of reaching everything, and the "park a rule" feature is gone. See Parsing.
- **F003, per-audience record too wide:** narrowed to `CompositeAudience` (`claude | agents | copilot`), with no permanent empty `cursor` entry. See State Management.
- **F004, warning scope and scan failures:** "once per run" is defined as once per `installIde` call, which is once per target. An unreadable rule file goes through the existing filesystem-error exit 1, so the scan never skips a file silently. See Data Flow.
- **F005, audience re-derived at many call sites:** one parser and one predicate carry the rule. Component Structure explains why call sites do not consume `GuideRuleEntry`.
- **F006, F007 (notes):** no change.

## Code Review Resolution

Review `935-review.code.agent-scoped-rule-marker.md` (claude-sonnet-5-5, CONCERNS):

- **Unknown-value warning said "ignored" even when the rule was dropped:** fixed. When no known value is left, the warning says the rule reaches no output.
- **Parser too strict:** fixed. A trailing YAML comment (`agents: [claude]  # note`) is stripped. The key stays lowercase and at column 0, since YAML keys are case-sensitive and an indented key would be nested.
- **Composite audiences listed by hand:** fixed. `EMPTY_RESOLUTION_SECTIONS` and `renderAllResolutions` are built from `COMPOSITE_AUDIENCES`.
- **Skip block repeated in three targets (note):** fixed. `scopedRuleSkipped` handles both the exclusion skip and the audience skip.
- **Marker parsed more than once per install (note):** kept, for the reason given in Component Structure: one parser and one predicate, and no shared rule list.
- **Test nits (note):** fixed. Added a classify test for a rule that reaches no composite block, clarified the inventory JSON assertion, and fixed the spacing.
