---
docType: guide
scope: adoption-primitives
audience: [ai-agent-developers, project-managers]
dateCreated: 20261026
dateUpdated: 20261026
---

# Adoption Primitives

These primitives exist for squadron's `sq onboard`, which runs the adoption of an existing codebase. cf never starts or runs an adoption. It answers read-only questions about a directory and delivers the adoption prompt when asked. The primitives are defined in slice 271 and documented here as the code behaves.

The report types live in `packages/core/src/adoption/detectionReport.ts`: `DetectionReport` (the success shape), `DETECTION_ERROR_CODES` (the error codes), `REPORT_VERSION` for `cf detect` and `INIT_REPORT_VERSION` for `cf init --json`. This document does not repeat their fields.

## `cf detect` and MCP `project_detect`

**Inputs.** CLI: `--path <dir>` (default: the current directory; the directory need not be registered) and `--json`. MCP: `path`, required, absolute. A relative path is refused with the `path-not-found` error, because the MCP server's working directory is not the user's project.

**Output.** With `--json`, stdout carries the `DetectionReport` on success, or the error object on failure. Without `--json`, a successful run prints the outcome and its notices. Without `--json`, an error goes through the CLI's error handler to stderr. MCP returns the same JSON as text; a failure is an `isError` result with the error object as text.

**Exit codes.** 0 on success, 1 on error, with or without `--json`.

**Guarantees.**
- Read-only. The MCP tool is annotated `readOnlyHint: true`, and detection writes nothing.
- It judges the directory it is given. It does not walk up to a registered project or to a git root.
- Every path in the report is relative to the project root with `/` separators, except `projectRoot`, which is absolute.
- A root-level CI file in a monorepo is the one exception to the project-root bound: it is reported with a relative path that climbs out of the directory (for example `../../.github/workflows/ci.yml`).
- `reportVersion` goes up when a field is removed or renamed, a type changes, or an outcome value is added, removed or changes meaning. Adding a field is not breaking.
- The `outcome` values are the kinds of `AdoptionOutcome`, mapped straight through.

A brownfield directory with 2100 non-blank `.ts` lines, one commit and no planning artifacts reports:

```json
{
  "reportVersion": 1,
  "projectRoot": "/path/to/repo",
  "outcome": "brownfield",
  "facts": {
    "source": {
      "measured": true,
      "lines": 2100,
      "files": 1,
      "capped": true
    },
    "history": {
      "known": true,
      "commits": 1,
      "shallow": false
    },
    "docs": [],
    "adrs": [],
    "ci": [],
    "ruleFiles": []
  },
  "artifacts": {
    "concept": null,
    "derivedArchitectures": [],
    "existingStatePlan": null
  },
  "notices": [
    "This project has existing code and no planning artifacts. Adopting an existing codebase arrives with sq onboard. To treat the project as new: cf config set adoption.state declined"
  ]
}
```

A path that does not exist reports:

```json
{
  "reportVersion": 1,
  "error": {
    "code": "path-not-found",
    "message": "Path does not exist: /tmp/does-not-exist"
  }
}
```

## `cf init --json`

**Inputs.** Adds `--json` to `cf init`. The other options (`--name`, `--lite`, `--ide`, `--no-ide`, `--strategy`) are unchanged.

**Output.** With `--json`, stdout carries only the result object: the project id, name and path; `registration` (`created` or `existing`); one result per setup step (`git`, `register`, `gitignore`, `guides`, `commands`, `ide`), each `ok`, `skipped` or `failed` with a message where one applies; `notices`; and `ok`. Progress lines go to stderr, so stdout stays parseable. Its `reportVersion` is `INIT_REPORT_VERSION`, and it follows the same bump rule as `cf detect`.

Every failure before the step results (the worktree refusal, an unreadable store, an unexpected error) is the error object on stdout, as in `cf detect`, with exit 1. A failed step is not an error object: it is the result object with `"ok": false`.

**Exit codes.** 0 when no step failed. 1 when any step failed, with or without `--json`. This is a behavior change: before, a failed guide install, command install, IDE setup or `git init` only printed a warning and exited 0. It is recorded in the CHANGELOG.

**Guarantees.**
- All steps run, even after one fails.
- The worktree refusal without `--json` is unchanged: a warning and exit 0. With `--json` it is the error object with the `worktree-of-registered-project` code and exit 1, and nothing is registered.

## `cf prompt get <phase> --path <dir> --comprehension <file>`

**Inputs.**
- `<phase>`: an instruction key or a shorthand.
- `--path <dir>`: the registered project at that directory, resolved the way the current directory is, worktree-aware. Without `--path`, resolution is unchanged. `--path` with `--project` is an error. A directory with no registered project is the existing project-not-found error.
- `--comprehension <file>`: an absolute path, or a path relative to the project root. It is accepted only for a prompt whose context profile lists the `fileComprehension` variable. Any other prompt rejects it with an error that names the key. It cannot be combined with `--raw`. A missing file, or a directory, is an error that names the path and the reason.

cf does not check that the file is inside the project. It names the path to an agent that can already read the disk. The section shows the path relative to the project root when it is inside the root, and absolute otherwise.

**Output.** On stdout: the prompt with `{project}` substituted. For a prompt whose profile lists `fileComprehension`, the output then ends with an `## Adoption Inputs` section. That section names the comprehension file, or says that no comprehension analysis was provided. It then lists the concept, the derived architectures and the existing-state slice plan. An item that is absent is shown as `none`.

On stderr: a guide-version warning when the installed guide is older than the minimum or its version is unknown. The warning is written before stdout, and stdout and the exit code are the same with or without it, so `sq onboard` still gets the prompt. Errors go to stderr through the CLI's error handler.

**Exit codes.** 0 on success, 1 on error. The `--raw` output is the unrendered template with no section.

**Guarantees.** The section is named `Adoption Inputs`, not `Adoption Facts`. The Adoption Facts section was a build-time block that slice 268 removed. The profile variable is the guide's contract, and cf names no prompt key in its code.

## Opt-out

A project that should be treated as new, even though it holds existing code, opts out with `cf config set adoption.state declined`. The key and its allowed values are defined in `packages/core/src/config/ConfigKeys.ts` (`ADOPTION_OPT_OUT`). The `cf detect` notice names this command.
