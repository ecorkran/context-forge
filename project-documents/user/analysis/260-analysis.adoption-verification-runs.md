---
layer: user
docType: analysis
topic: adoption-verification-runs
project: context-forge
dateCreated: 20261023
dateUpdated: 20261023
status: in_progress
---

# Adoption Verification Runs — context-forge

End-to-end runs of the adoption flow (slices 260–264) on real repositories, recorded by slice 265. Home-directory paths are written as `~`.

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

**Setup:** _pending_

| Check | Result |
|---|---|
| 1. Hand-off chain | _pending_ |
| 2. No escape to Phase 1 | _pending_ |
| 3. Real marker | _pending_ |
| 4. Completion | _pending_ |
| 5. First new slice | _pending_ |
| Source count: Adoption Facts vs `cloc` | _pending_ |
| Adoption Facts JSON equals `sq probe --json` in the same folder | _pending_ |
| `/understand` asked once; probe-listed steps run for the surface | _pending_ |
| `Comprehension:` line present after `/sq:analysis understand`; PM confirms squadron-written concept | _pending_ |
| Monorepo: no stall, architecture not written for the whole monorepo | _pending_ |
| MCP PATH: `context_build` with `sq` on PATH equals `cf build`; with `sq` off PATH states unavailable | _pending_ |

**Defects:** _pending_
