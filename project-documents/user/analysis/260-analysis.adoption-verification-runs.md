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

**Setup:** _pending_

| Check | Result |
|---|---|
| 1. Hand-off chain: `cf next` before first build recommends `cf build`; first build selects the brownfield prompt, sets `adoption.state` to `in_progress`, Adoption Facts states brownfield | _pending_ |
| 2. No escape to Phase 1 | _pending_ |
| 3. Real marker: `100-arch.*` derived, `100-slices.*` accepted by `retroactive-entry`, at least one new entry, unknowns marked | _pending_ |
| 4. Completion: next `cf build` sets `adoption.state` to `complete` and shows the notice | _pending_ |
| 5. First new slice: `register-plan`, then `cf next` recommends the first new slice | _pending_ |
| Source count: Adoption Facts vs `cloc` | _pending_ |
| CF-only: Adoption Facts says squadron unavailable; no squadron step attempted | _pending_ |

**Adoption Facts (verbatim, first build):** _pending_

**Defects:** _pending_

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
