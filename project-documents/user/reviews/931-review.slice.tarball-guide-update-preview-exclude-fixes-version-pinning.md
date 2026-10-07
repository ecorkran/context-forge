---
docType: review
layer: project
reviewType: slice
slice: tarball-guide-update-preview-exclude-fixes-version-pinning
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261006
dateUpdated: 20261006
reviewedSha: 42c5f18dae496c448ecfbd62c7790aaf0b926b02
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 25.3
squadronVersion: 0.19.0
findings:
  - id: F001
    severity: note
    category: nfr
    summary: "Parent architecture is thin and defines no NFRs"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md#Technical Requirements"
  - id: F002
    severity: concern
    category: scope
    summary: "New capabilities stretch the 900 maintenance scope"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md:17-27"
  - id: F003
    severity: concern
    category: state-management
    summary: "Pinned version recorded for a local archive can mislead status"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md:107-108"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Failure modes for new I/O paths are incomplete"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md:85-103"
  - id: F005
    severity: concern
    category: security-boundary
    summary: "MCP path handling and unconditional auto-confirm"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md:99, 139, 206"
  - id: F006
    severity: note
    category: architecture
    summary: "Layering and dependency direction are sound"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md#Component Structure"
  - id: F007
    severity: note
    category: documentation
    summary: "Frontmatter `dependencies: []` conflicts with the stated prerequisites"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md:6"
  - id: F008
    severity: pass
    category: scope
    summary: "Exclusions and test strategy are explicit"
    location: "project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md#Technical Scope"
---

# Review: slice — slice 931

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [NOTE] Parent architecture is thin and defines no NFRs

The 900 architecture states no latency, throughput or other NFRs for the guide install and update path. The slice therefore has none to restate. The slice does set its own file-size target of about 300 lines per file, in line with the project guidelines.

### [CONCERN] New capabilities stretch the 900 maintenance scope

The 900 architecture scopes the initiative to consolidation, hard-coded values, dead code, test gaps, dependency updates, and "developer experience improvements (error messages, CLI help text, etc.)". Most of #111 (the exclude protection fix, the accurate error message and the config commit fix) fits that scope. The following do not:
- #93 `--version` pinning.
- A local tarball source.
- A new `--source` flag on `update`.
- A new preview and confirm step on `update`.
- New MCP parameters.

These are new user-facing capabilities. The slice justifies itself only with "belongs in the 900 initiative" because it extends slices 212 and 925. The "Slice by theme" principle is satisfied, since the theme is the tarball path. The scope boundary is not. Either record the PM's decision to widen 900 to small guide-path features, or note in the architecture that such work is accepted here. The slice plan carries the status reopen, but the architecture doc has not been updated.

### [CONCERN] Pinned version recorded for a local archive can mislead status

Local installs record `opts.version ?? 'local'`. A local archive installed with `--version v0.21.0-rc1` writes that tag to the marker, although its contents may differ from the real remote tag. Remote short-circuit (step 4) and `cf guides info` would then treat it as that release. A later `update --version v0.21.0-rc1` against a remote that has the tag would also report "already up to date" without checking the contents. The slice should either always record `local` (optionally with the label) or state why the false match is acceptable.

### [CONCERN] Failure modes for new I/O paths are incomplete

The slice covers decline, kill during the prompt (leftover staging is cleaned at the next stage), a missing tag, a non-archive file and a missing path. It does not give explicit handling for these paths:
- A pinned-tag lookup when `ls-remote` fails or times out. Today's `fetchLatestTag` behavior is not restated for the pinned case.
- A truncated or corrupt local `.tgz`, and a read error from `createReadStream` mid-extract. Staging must be cleaned up and the guide left untouched.
- The multi-top-level-directory check in D5. It can only be detected during or after extraction, so the slice should say whether this is a pre-scan or a post-check that discards staging.
- A failure during the swap or the commit after the swap. The swap is described as "existing" but the commit failure outcome is not.
- A confirm prompt with closed or non-TTY stdin. D2 says it behaves like the branch guard, but does not say whether EOF means decline or an error.
- Failures in `diffGuideTrees` such as unreadable files or symlinks, and the D3 `git show HEAD:` failure on a repo with no commits.

Add a short failure-mode table with the handling for each.

### [CONCERN] MCP path handling and unconditional auto-confirm

MCP `guide_update` swaps the guide with no confirmation, and the preview is reported only after the swap has happened. The MCP `source` parameter now also reads arbitrary local files, resolved against the project root. The slice should say two things:
- Whether paths outside the project root are permitted for the local source.
- Why a preview that cannot block is acceptable for MCP, given that the existing branch guard for MCP uses a throw-and-retry confirmation contract.

D6 says `--yes` answers both prompts. It does not say how MCP interacts with the branch guard's `confirmed` flag, which could leave the contract ambiguous.

### [NOTE] Layering and dependency direction are sound

Core owns resolution, diff and strategy logic. The CLI supplies the prompt as a `confirm` callback and the MCP supplies none, so there is no upward dependency from core. `GuideManager` rejects tarball-only options before they reach submodule or clone, and there is no silent fallback. D1 uses an allowlist constant defined in one place. The split of `TarballStrategy.ts` addresses the file-size guideline. These are all consistent with the project principles.

### [NOTE] Frontmatter `dependencies: []` conflicts with the stated prerequisites

The frontmatter lists no dependencies while the Dependencies section names slices 212, 925 and 916. They are complete, so this is cosmetic. The `parent` field is correctly treated as the slice plan.

### [PASS] Exclusions and test strategy are explicit

The slice names its exclusions (no preview on install, no persisted pin, no coupling of lint to `rules.exclude`, no per-path preview). It also adds test coverage for the changed behavior, which satisfies the "no behavior changes without tests" principle. Local fixture archives make the decline and unchanged paths testable without the network.

### Run Digest

- Response length: 6275 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 25.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8
