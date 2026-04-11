<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# I have a dev tool that can install CLAUDE.md, rules, skills, and sub agents for claude code.  I'd like to make it work with copilot in VS Code.  I believe it may use AGENTS.md?  or maybe it has its own structure.

I need to know:

* where can I put the rules I'd normally put in CLAUDE.md?
* where can I put additional rules files I usually split up?
* are there custom "slash commands" or skills?  If so what is their format?
* what are the frontmatter or glob requirements and how do they compare to that used for claude?

I need to instruct my agent on how to update our tool's capabilities

Yes — for VS Code Copilot, you can map most of your Claude-oriented capability model onto a combination of `AGENTS.md`, `.github/copilot-instructions.md`, `*.instructions.md`, prompt files, and custom agents. `AGENTS.md` is the closest analogue to always-on agent guidance, while `.instructions.md` files are the main answer for split rules and glob-scoped behavior.[^1_1][^1_2]

## Rule locations

For rules you would normally put in `CLAUDE.md`, VS Code supports several always-on options: `.github/copilot-instructions.md` for project-wide Copilot instructions, `AGENTS.md` in the workspace root for agent-facing instructions, and it also recognizes `CLAUDE.md` for compatibility.[^1_2][^1_1]
If your goal is “make Copilot in VS Code behave predictably,” the best primary target is usually `.github/copilot-instructions.md`; if your goal is “share one instruction file across multiple agents/tools,” `AGENTS.md` is the stronger compatibility layer.[^1_1]

A practical mapping is:


| Claude-style concept | Best Copilot/VS Code target | Notes |
| :-- | :-- | :-- |
| Root `CLAUDE.md` | `AGENTS.md` and/or `.github/copilot-instructions.md` | Both are always-on in workspace chat. [^1_1] |
| Split rules under `.claude/rules` | `.github/instructions/**/*.instructions.md` | Native Copilot pattern-based instructions. [^1_1] |
| Keep Claude compatibility too | `.claude/rules/*.md` and optional root `CLAUDE.md` | VS Code can also read Claude files. [^1_1] |

## Split rule files

For additional rule files, the native Copilot structure is one or more `*.instructions.md` files, typically under `.github/instructions`, and VS Code searches that folder recursively.[^1_1]
These files can be workspace-level or user-level, and VS Code can also read `.claude/rules` recursively, which is useful if your tool already emits Claude rule files and you want partial reuse.[^1_1]

The key behavior difference versus Claude is that Copilot’s native instruction files use YAML frontmatter with `applyTo`, not Claude Rules `paths`.[^1_1]
For example, this is native Copilot format:

```md
---
name: React rules
description: Conventions for React components
applyTo: "**/*.tsx,**/*.ts"
---
- Use functional components.
- Prefer named exports.
- Keep components focused.
```

By contrast, VS Code notes that Claude-format rule files in `.claude/rules` use a `paths` array and default to `**` when omitted.[^1_1]

## Commands and skills

Yes — Copilot in VS Code has reusable “slash command” style files via prompt files, stored as `*.prompt.md`, typically under `.github/prompts`.[^1_2]
You invoke them in chat with `/name`, and they support YAML frontmatter such as `name`, `description`, `argument-hint`, `agent`, `model`, and `tools`.[^1_2]

Example prompt file:

```md
---
name: create-react-form
description: Generate a React form component
agent: agent
tools: ['search/codebase', 'vscode/askQuestions']
argument-hint: "formName=MyForm fields=name,email"
---
Generate a React form component using project conventions.
Use #tool:vscode/askQuestions if required details are missing.
Reference [React rules](../instructions/frontend/react.instructions.md).
```

On “skills”: VS Code explicitly distinguishes prompt files, custom agents, and agent skills. Prompt files are lightweight task commands; custom agents are persistent personas/tool configs; agent skills are portable capabilities that also surface alongside slash commands in chat.[^1_3][^1_2]
So if your current tool outputs Claude “skills” and “sub agents,” the closest Copilot equivalents are:

- skills/workflows → `*.prompt.md` prompt files,
- sub-agents/personas → custom agents,
- always-on guidance → `AGENTS.md` or instruction files.[^1_3][^1_2][^1_1]


## Frontmatter and globs

For native Copilot instruction files, the frontmatter fields are `name`, `description`, and `applyTo`; only `applyTo` controls automatic file matching, and if you omit it the file is not auto-applied.[^1_1]
`applyTo` uses glob syntax relative to the workspace root, and multiple patterns are given as a comma-separated string such as `**/*.ts,**/*.tsx`.[^1_2][^1_1]

For prompt files, frontmatter is different: `name`, `description`, `argument-hint`, `agent`, `model`, and `tools`. There is no `applyTo` because prompts are manually invoked rather than automatically attached by file match.[^1_2]
For `AGENTS.md`, the VS Code docs describe it as always-on and folder-based rather than frontmatter-driven; nested `AGENTS.md` support is available experimentally with `chat.useNestedAgentsMdFiles`.[^1_1]

A concise comparison:


| File type | Auto-applies? | Matching mechanism | Frontmatter |
| :-- | :-- | :-- | :-- |
| `AGENTS.md` | Yes | Workspace root, or nearest/nested folder behavior depending on support | None required in VS Code docs. [^1_1][^1_2] |
| `.github/copilot-instructions.md` | Yes | Whole workspace | Example shows `applyTo: "**"` but file is project-wide by purpose. [^1_1] |
| `*.instructions.md` | Yes, if `applyTo` present | `applyTo` glob, relative to workspace root | `name`, `description`, `applyTo`. [^1_1] |
| Claude rule file in `.claude/rules` | Yes in compatibility mode | `paths` glob array | Claude-style `paths`, not `applyTo`. [^1_1] |
| `*.prompt.md` | No, manual | Slash command invocation | `name`, `description`, `argument-hint`, `agent`, `model`, `tools`. [^1_2] |

## Tool update guidance

For your installer/generator, I would treat Copilot support as a new backend with this target model: emit `AGENTS.md` for shared agent instructions, emit `.github/copilot-instructions.md` for Copilot-wide project guidance, convert split Claude rules into `.github/instructions/*.instructions.md`, and convert reusable skills/commands into `.github/prompts/*.prompt.md`.[^1_2][^1_1]
If you want backward compatibility, you can dual-write Claude and Copilot formats: keep `.claude/rules` plus `CLAUDE.md`, while also generating native Copilot files so VS Code gets first-class behavior instead of only compatibility behavior.[^1_1]

A good migration policy would be:

- Core global rules → `.github/copilot-instructions.md`
- Multi-agent shared root contract → `AGENTS.md`
- File/folder/language-specific split rules → `.github/instructions/**/*.instructions.md`
- Task workflows / slash commands → `.github/prompts/*.prompt.md`
- Claude compatibility output retained optionally → `CLAUDE.md` and `.claude/rules/*`[^1_2][^1_1]

One subtle but important difference: VS Code says multiple instruction files may be combined with no guaranteed order, so your generated rule files should be narrowly scoped and non-conflicting rather than relying on deterministic layering.[^1_1]
Also, for `AGENTS.md`, GitHub’s Copilot docs say the nearest file in the directory tree can take precedence, which is a stronger folder-locality model than plain `CLAUDE.md` setups usually assume.[^1_2]

Would you like a concrete mapping spec from your current `CLAUDE.md`/rules/skills/subagents model into a proposed Copilot file tree and transformation rules?
<span style="display:none">[^1_10][^1_11][^1_12][^1_13][^1_14][^1_15][^1_4][^1_5][^1_6][^1_7][^1_8][^1_9]</span>

<div align="center">⁂</div>

[^1_1]: https://code.visualstudio.com/docs/copilot/customization/custom-instructions

[^1_2]: https://docs.github.com/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot

[^1_3]: https://code.visualstudio.com/docs/copilot/customization/custom-agents

[^1_4]: https://www.reddit.com/r/GithubCopilot/comments/1lfz0wt/guidance_on_efficient_use_of_copilotinstructionsmd/

[^1_5]: https://www.youtube.com/watch?v=gY_9raUIP6c

[^1_6]: https://www.youtube.com/watch?v=Jt3i1a5tSbM

[^1_7]: https://code.visualstudio.com/docs/copilot/customization/prompt-files

[^1_8]: https://www.nathannellans.com/post/all-about-github-copilot-custom-instructions

[^1_9]: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions

[^1_10]: https://www.youtube.com/watch?v=nNiDplJqU6w

[^1_11]: https://www.mintlify.com/github/awesome-copilot/resources/instructions/overview

[^1_12]: https://github.blog/changelog/2025-08-28-copilot-coding-agent-now-supports-agents-md-custom-instructions/

[^1_13]: https://www.reddit.com/r/GithubCopilot/comments/1p98b7j/how_do_slash_command_prompt_files_interact_with/

[^1_14]: https://www.reddit.com/r/GithubCopilot/comments/1kq4aaf/instructions_files_applyto_glob_patterns/

[^1_15]: https://github.blog/ai-and-ml/github-copilot/a-cheat-sheet-to-slash-commands-in-github-copilot-cli/

