---
layer: user
docType: analysis
topic: adoption-verification-runs
project: context-forge
dateCreated: 20261023
dateUpdated: 20261024
status: complete
---

# Adoption Verification Runs — context-forge

End-to-end runs of the adoption flow (slices 260–264) on real repositories, recorded by slice 265. Home-directory paths are written as `~`.

**Result:** all three runs passed. Check 5 (first new slice) passes with `workflow.review_enabled` off; with it on, the decided derived-architecture gate stops `cf next` first (#132). Filed: #132, #133 (cf), ecorkran/squadron#264. Guide v0.22.5 was used for both brownfield runs (input to #124).

## Prerequisites

- `cf` (local build): 0.19.17
- ai-project-guide: v0.22.5 (tarball); `guide.ai-project.brownfield-adoption.md` carries the retroactive marker specification
- `sq`: squadron 0.23.7; `sq probe --json` prints `probe_version` 1; `claude-code` surface has `analysis_skill_installed` and `understand_plugin_installed` true

## Greenfield run

**Setup:** `npm create vite@latest` (create-vite 9.3.1, `react-ts` template, project `greenfield` v0.0.0), `git init`, one commit, `cf init --name greenfield-265 --no-ide`. A pre-`cf` copy was used for the `/cf:onboard` session, driven headless with `claude -p` and `cf` shimmed to the local build (`cf --version` 0.19.17). Scratch state lives in the global project registry; this `cf` writes no `.context-forge.toml` into the project.

| Check | Result |
|---|---|
| `cf build` selects the concept prompt, no Adoption Facts section | pass: `grep -c '### Adoption Facts'` printed 0; prompt is "Phase 0: Concept" |
| `adoption.state` stays unset | pass: empty, source default (also after the `/cf:onboard` session) |
| `/cf:onboard` hands off to `cf build` | pass: project registered, context built, agent followed the concept prompt |
| Session opens the concept conversation | pass: agent asked "What do you want to build?" and stopped |

**Defects:** none.

## CF-only brownfield run

**Setup:** `pallets/click` (Python, https://github.com/pallets/click) at `2247b35ea1c47c727d7a06e51fa280e12a863ff6`, cloned `--depth 1`; README, six CI workflows. `cf init --name cf-only-265 --no-ide` and `cf install-commands --local`; `cf` shimmed to the local build (`cf --version` 0.19.17); `sq` hidden from PATH (both `~/.local/bin` and the Python framework `bin` carry one). The session was driven headless with `claude -p` and resumed twice, answering as PM from the repo's own prose (`CHANGES.md` supplied the new work, everything else "unknown"). Guide v0.22.5. `cf init` ran before the session so check 1 could be observed; `/cf:onboard` then skipped to its hand-off step. `workflow.review_enabled` was `true` from this machine's user config.

| Check | Result |
|---|---|
| 1. Hand-off chain | pass: `cf next --json` before the first build gave `cf build`; the first build selected the brownfield prompt, set `adoption.state` to `in_progress`, Adoption Facts states brownfield |
| 2. No escape to Phase 1 | pass for the states observed: `record-completion` (after turn 1) and the post-completion state; neither recommended a phase change. The agent wrote architecture and plan in one turn, so the `architecture` and `existing-state-plan` steps (and the gate before the latter) were not observed live |
| 3. Real marker | pass: `100-arch.cf-only-265.md` has `provenance: derived`; `100-slices.cf-only-265.md` has eight `` `retroactive` `` entries (100-107) accepted by `cf check` (info "Slices 100-107 are retroactive", no `retroactive-entry` finding) plus new entries 108-109; unknowns marked in the concept |
| 4. Completion | pass: the agent's `cf build` recorded completion; `adoption.state` is `complete` |
| 5. First new slice | pass with `workflow.review_enabled=false` (`cf next` gives `cf set slice 108` after `cf set arch 100-arch.cf-only-265`). With it `true` (this machine's setting) `cf next` gives "Review required before creating the slice plan" with no suggested command: decided 263 D7 behavior, filed as #132 |
| Source count | cf: 2341+ non-blank source lines in 18 files (count stopped at the 2000 threshold); `cloc` of `src/`: 6923 code lines in 17 Python files. The capped count cannot exceed the threshold by design; outcome (brownfield) is the same, so no constant-tuning defect |
| CF-only: Adoption Facts says squadron unavailable; no squadron step attempted | pass: Squadron line says unavailable; the session transcript has no `sq` or `/understand` tool call |

**Adoption Facts (verbatim, first build):** the build in the session raced the capture, so this is the first build of a second clone at the same commit with the same PATH, run once right after `cf init`.

```
### Adoption Facts

- Outcome: brownfield: 2341+ non-blank source lines (threshold 2000; count stopped at the threshold)
- adoption.state: in_progress. adoption.state was set to in_progress by this build. To treat the project as new instead: `cf config set adoption.state declined`.
- Source volume: 2341+ non-blank source lines (count stopped at the threshold) in 18 source files
- History: 2 commits (shallow clone: history is truncated)
- Docs: README.md, docs
- ADRs: none found
- Rule files: none found
- CI: .github/workflows/lock.yaml, .github/workflows/nightly.yaml, .github/workflows/pre-commit.yaml, .github/workflows/publish.yaml, .github/workflows/tests.yaml, .github/workflows/zizmor.yaml
- Squadron: unavailable. `sq` was not found on PATH.
```

**Defects:**
- Disposition: issue #132 (design interaction, no code change). With `workflow.review_enabled` on, the derived-arch gate (263 D7) blocks the "Pick slice" end state after adoption; for a CF-only user the gate has no suggested command. Evidence: `{"recommendation":"Review required before creating the slice plan","suggestedCommand":null}`.
- Harness note (not a cf defect): `cf build` prints no prompt to stdout, so captures use `cf build --json | jq -r .context`; the task file was corrected.

## Squadron brownfield run

**Setup:** `tokio-rs/axum` (Rust, https://github.com/tokio-rs/axum) at `86aa6153e47b7862737acdcfe3a0eb3a162b939a`, full clone (2023 commits); cf project registered at the `axum/` package folder; guide v0.22.5; squadron 0.23.7 (`sq probe --json`: `probe_version` 1, surfaces `claude-code` and `codex`); local-build `cf` 0.19.17 via shim; `sq` on PATH. Driven headless with `claude -p`, six turns, PM answers from the repo's own prose (`CHANGELOG.md` supplied the new work, everything else "unknown"); `/understand` approved once. `cf init` in the package folder created a nested git repo (#133); the nested `.git` was deleted in the scratch copy before the session. `workflow.review_enabled` was `true` from this machine's user config.

| Check | Result |
|---|---|
| 1. Hand-off chain | pass: `cf next --json` before the first build gave `cf build`; the first build selected the brownfield prompt, set `adoption.state` to `in_progress`, Adoption Facts states brownfield |
| 2. No escape to Phase 1 | pass for the states observed: `concept`, `record-completion` and the post-completion state; none recommended a phase change. The `architecture` and `existing-state-plan` steps were not observed live (written in one turn) |
| 3. Real marker | pass: `100-arch.squadron-265.md` has `provenance: derived`; `100-slices.squadron-265.md` has seven retroactive entries (100-106) accepted by `cf check`, plus new entries 107-108; gaps and inferences marked `[GAP]` / `[INFERRED]` |
| 4. Completion | pass: the agent's second `cf build` set `adoption.state` to `complete` |
| 5. First new slice | pass with `workflow.review_enabled=false` (`cf set arch 100-arch.squadron-265`, then `cf set slice 107`). With it `true`: gated, `suggestedCommand` null (#132) |
| Source count | cf: 2078+ non-blank source lines in 9 files (count stopped at the threshold); `cloc` of `axum/`: 15908 Rust code lines in 61 files. Outcome (brownfield) is the same, so no constant-tuning defect |
| Adoption Facts JSON equals `sq probe --json` in the same folder | pass: `jq -S` diff of the first build's probe block against `sq probe --json` run in `axum/` is empty |
| `/understand` asked once; probe-listed steps run | pass: the agent asked once (turn 1, before any build of the graph), then ran `/understand` and `/sq:analysis understand` / `concept` as the probe lists for `claude-code` |
| `Comprehension:` line, PM confirms concept | pass: `cf build` shows `Comprehension: user/analysis/940-analysis.codebase-comprehension.md`; the agent showed the derived description and waited for confirmation before writing the concept |
| Monorepo | pass: no stall; the architecture states its scope as the `axum` crate directory and names `axum-core`, `axum-extra`, `axum-macros` as outside the analyzed files. Root CI is recognized (`CI: ../.github/workflows/CI.yml, ...`) and history counts the enclosing repo (878 commits touching the folder) |
| MCP PATH | pass: see below |

**MCP PATH:** `context_build` with `projectId` through the MCP Inspector CLI (`@modelcontextprotocol/inspector --cli -e PATH=... node packages/mcp-server/dist/index.js --method tools/call --tool-name context_build --tool-arg projectId=<id>`), with `adoption.state` set to `in_progress` before each call (the first call completes adoption because the plan exists). With `sq` on the server's PATH, the Adoption Facts probe JSON equals `sq probe --json`; with `sq` removed it states "Squadron: unavailable. `sq` was not found on PATH." No `sq` path-setting issue was needed.

**Adoption Facts (verbatim, first build):** captured from a copy of the clone taken before `cf init` (same commit, same PATH), built once right after `cf init`, because the session's own first build had already changed state.

```
### Adoption Facts

- Outcome: brownfield: 2078+ non-blank source lines (threshold 2000; count stopped at the threshold)
- adoption.state: in_progress. adoption.state was set to in_progress by this build. To treat the project as new instead: `cf config set adoption.state declined`.
- Source volume: 2078+ non-blank source lines (count stopped at the threshold) in 9 source files
- History: 878 commits
- Docs: README.md
- ADRs: none found
- Rule files: none found
- CI: ../.github/workflows/CI.yml, ../.github/workflows/release-plz.yml
- Squadron probe (`sq probe --json`), verbatim:
  ```json
  {"probe_version":1,"sq_version":"0.23.7","surfaces":{"claude-code":{"analysis_skill_installed":true,"entry":"/sq:analysis understand","concept":"/sq:analysis understand concept","understand_plugin_installed":true,"graph_build":"/understand"},"codex":{"analysis_skill_installed":true,"entry":"analysis-understand","concept":"analysis-understand concept","understand_plugin_installed":false,"graph_build":"understand"}},"graph":{"present":false,"path":null,"commit":null,"commits_behind":null},"baseline":{"available":false}}
  ```
- Probe warnings (stderr, verbatim): none
```

**Defects:**
- Disposition: issue ecorkran/squadron#264 (squadron defect). `sq probe` looks for the graph at the git toplevel, while `/understand` wrote it to `axum/.understand-anything/knowledge-graph.json` (the package folder). After the graph was built, `sq probe --json` still printed `"graph":{"present":false,...}` from both folders.
- Disposition: issue #133 (cf defect outside 260-264). `cf init` in a package folder of a git repository runs `git init` there (`git initialized`), so the nested repo's history was 1 commit and CI was "none found" until the nested `.git` was removed.
- Disposition: issue #132 (see CF-only run), confirmed on the squadron path: `{"recommendation":"Review required before creating the slice plan","suggestedCommand":null}`.
