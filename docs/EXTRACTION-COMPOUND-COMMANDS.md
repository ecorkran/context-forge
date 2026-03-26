---
docType: extraction-guide
project: context-forge
target: squadron
dateCreated: 20260326
---

# Extraction Guide: Compound Workflow Commands → Squadron

## Overview

Context Forge v0.6.26 removed 7 compound workflow commands that combined `cf set` + `cf build` into single commands. These are being moved to Squadron where they're a better fit as orchestration commands.

## What Was Removed

| Command | What It Did |
|---------|-------------|
| `cf concept` | `cf set phase 0` + `cf build --json` |
| `cf initiatives` | `cf set phase 1` + `cf build --json` |
| `cf arch <index>` | `cf set arch <index>` + `cf set phase 2` + `cf build --json` |
| `cf plan <index>` | `cf set plan <index>` + `cf set phase 3` + `cf build --json` |
| `cf slice <index>` | `cf set slice <index>` + `cf set phase 4` + `cf build --json` |
| `cf tasks <index>` | `cf set tasks <index>` + `cf set phase 5` + `cf build --json` |
| `cf implement <index>` | `cf set slice <index>` + `cf set phase 6` + `cf build --json` |

## CF Primitives Available

Squadron should call these `cf` commands as subprocesses:

- `cf set <field> <value> [--project <id>]` — set a project field (phase, slice, tasks, arch, plan)
- `cf build --json [--project <id>]` — build and return context as JSON `{ project, phase, context }`
- `cf list slices --json` — list slices from active plan
- `cf list tasks --json` — list task files with completion
- `cf list items --json` — list individual task items

All commands support `--json` for structured output and resolve the project from CWD.

## Implementation Pattern

Each compound command follows the same pattern:

```
1. Validate index is numeric (for commands that take an index)
2. Call `cf set <artifact-field> <index>` to set the artifact
3. Call `cf set phase <N>` to set the development phase
4. Optionally detect if artifact already exists and warn
5. Call `cf build --json` to generate context
6. Return the context to the user/agent
```

### Artifact Field Mapping

| Command | Artifact Field | Phase |
|---------|---------------|-------|
| concept | (none) | Phase 0: Concept |
| initiatives | (none) | Phase 1: Initiative Plan |
| arch | arch (fileArch) | Phase 2: Architecture |
| plan | plan (fileSlicePlan) | Phase 3: Slice Planning |
| slice | slice (fileSlice) | Phase 4: Slice Design |
| tasks | tasks (fileTasks) | Phase 5: Task Breakdown |
| implement | slice (fileSlice) | Phase 6: Implementation |

### Numeric Validation

Commands that take `<index>` must validate it's numeric-only (`/^\d+$/`). Reject non-numeric values with an error message like:
```
'sq <command>' requires a numeric index, got '<value>'.
  Use: sq <command> <index>  (e.g. sq <command> 200)
```

### Artifact Existence Warning

For `arch`, `plan`, `slice`, and `tasks` commands, optionally check if the artifact already exists using `cf list <type> --json` and warn the user. This is a nice-to-have, not required.

## Slash Commands

The 7 slash command `.md` files for Claude Code were also removed from CF. If Squadron wants to provide them:

### Format

Each slash command is a markdown file with YAML frontmatter, placed in `~/.claude/commands/sq/` (or wherever Squadron installs its commands):

```markdown
---
description: Set active slice and build prompt
argument-hint: <index>
allowed-tools: Bash(sq:*), Bash(cf:*)
---

Use the following as your working context. Confirm receipt with a one-line summary:
"Context loaded: {project} | {phase} | {slice}" — then follow the instruction prompt.
If the instruction prompt contains a STOP condition, STOP — do not begin work.

!`sq slice $ARGUMENTS`
```

### Key Points

- `allowed-tools` must include `Bash(cf:*)` since Squadron calls CF commands
- The `!` backtick syntax captures stdout from the command
- Commands should use `--json` to get structured output
- The wrapper text tells the AI how to interpret the context

### Slash Command List

| File | Description | Invokes |
|------|-------------|---------|
| `concept.md` | Set phase to Concept and build | `sq concept` |
| `initiatives.md` | Set phase to Initiative Plan and build | `sq initiatives` |
| `arch.md` | Set architecture initiative and build | `sq arch $ARGUMENTS` |
| `plan.md` | Set slice plan and build | `sq plan $ARGUMENTS` |
| `slice.md` | Set active slice and build | `sq slice $ARGUMENTS` |
| `tasks.md` | Set active task file and build | `sq tasks $ARGUMENTS` |
| `implement.md` | Set slice for implementation and build | `sq implement $ARGUMENTS` |

## Example: Implementing `sq slice <index>` in Python

```python
import subprocess
import json
import sys

def sq_slice(index: str, project: str = None):
    """Set active slice and build context."""
    if not index.isdigit():
        print(f"'sq slice' requires a numeric index, got '{index}'.", file=sys.stderr)
        sys.exit(1)

    project_flag = ["--project", project] if project else []

    # Set the artifact
    subprocess.run(["cf", "set", "slice", index] + project_flag, check=True)
    # Set the phase
    subprocess.run(["cf", "set", "phase", "4"] + project_flag, check=True)
    # Build context
    result = subprocess.run(
        ["cf", "build", "--json"] + project_flag,
        capture_output=True, text=True, check=True,
    )
    context = json.loads(result.stdout)
    return context
```

## Notes

- CF's `cf set` is idempotent — setting a value that's already set exits 0 with "already set" to stderr
- All CF `--json` output goes to stdout; status/warnings go to stderr
- CF resolves the project from CWD automatically; `--project` is optional
- The `cf build --json` output format is `{ "project": "name", "phase": "Phase N: ...", "context": "..." }`
