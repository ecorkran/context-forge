---
docType: review
layer: project
reviewType: slice
slice: guide-install-robustness
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/925-slice.guide-install-robustness.md
aiModel: moonshotai/kimi-k3
status: complete
dateCreated: 20260909
dateUpdated: 20260909
reviewedSha: 7882cc42df6bb117a5c28120dd9b885f4b88fe00
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 12
findings:
  - id: F001
    severity: pass
    category: scope-alignment
    summary: "Scope and theming align with the 900 architecture and slice plan entry"
    location: "slices/925-slice.guide-install-robustness.md:30-49"
  - id: F002
    severity: pass
    category: dependency-direction
    summary: "Dependency direction and cross-slice integration are correct"
    location: "slices/925-slice.guide-install-robustness.md:51-62"
  - id: F003
    severity: pass
    category: integration-points
    summary: "Machine-readable output contract and consumer impact are handled"
    location: "slices/925-slice.guide-install-robustness.md:117-121"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Hang/timeout failure class not enumerated for the new network-fetching subprocess path"
    location: "slices/925-slice.guide-install-robustness.md:157-159"
  - id: F005
    severity: note
    category: consistency
    summary: "Terminology drift between checkout-state vocabularies"
    location: "slices/925-slice.guide-install-robustness.md:66-70"
  - id: F006
    severity: note
    category: nfr
    summary: "No NFR restatement obligation"
    location: "architecture/900-arch.maintenance-and-refactoring.md"
---

# Review: slice — slice 925

**Verdict:** CONCERNS
**Model:** moonshotai/kimi-k3

## Findings

### [PASS] Scope and theming align with the 900 architecture and slice plan entry

The slice bundles GitHub issues #80/#81/#82 exactly as slice plan entry 25 prescribes ("bundled because all three live on the guide install/detect path"), satisfying the "slice by theme" principle. Exclusions (default-strategy change, vendored README stub filed upstream as ai-project-guide#19, CI checkout config, out-of-sync auto-correction, clone-strategy changes) mirror the plan entry and D2/D6 reasoning, with the PM default-strategy decision dated consistently (20260909) in both documents. No scope creep beyond what the plan defines; the "No behavior changes without tests" principle is met via an enumerated test matrix (GuideDetector submodule fixtures, ensureCheckout state-machine branches, normalizeGuideMethod rejection cases, CLI pass-through, MCP alias acceptance).

### [PASS] Dependency direction and cross-slice integration are correct

New logic lands in `packages/core/src/guides/` (`GuideManager.ensureCheckout()`, `normalizeGuideMethod()` in `types.ts`, `SubmoduleStrategy.init()`); `packages/cli` and `packages/mcp-server` consume it at their boundaries — no upward dependencies. The declared prerequisite 916 is verified complete, and the non-interference claim is sound: 916's guard wraps only `GuideManager.update()`'s commit path, while `ensureCheckout()` never commits to the host repo. The 0.13.1/0.13.2 `gitExec` error-surfacing dependency (#77/#78) is corroborated by the plan entry ("0.13.2 guide error-surfacing (#77/#78 — shipped)").

### [PASS] Machine-readable output contract and consumer impact are handled

D4 keeps all auto-init notices/warnings on stderr so `cf build --json` stdout stays parseable by squadron, and the one observable JSON change (`method: "manual"` → `"tarball"`) is explicitly called out as user-visible with a CHANGELOG commitment — the same machine-readable-output sensitivity slice 922 had to navigate. `normalizeGuideMethod()` at every input boundary (config, CLI flag, MCP parameter) with `manual` retained in the `ConfigKeys` enum gives existing shared config files a defined compat story rather than an implicit one.

### [CONCERN] Hang/timeout failure class not enumerated for the new network-fetching subprocess path

The slice introduces a new I/O path — `git submodule update --init <path>`, which "fetches from the guide remote" — inside previously read-only commands (`cf build`, `context_build`, `prompt_*`). The Auto-init failure path covers failure-with-error (wrapped by `withNetworkErrorHint`, remediation appended, command fails) and the data flow covers git-unavailable ('error' → throw), but neither addresses the hang/timeout class: a fetch that never returns (credential prompt blocking on stdin, proxy blackholing the connection). Slice 916's design doc explicitly analyzed this class and could dismiss it only because its subprocess calls were "purely local object-database reads... neither can trigger a credential prompt or network hang" — that carve-out does not apply here. The doc should state the strategy explicitly, even if it is "inherits `gitExec`'s no-timeout behavior; accepted because git fails eventually / prompts are disabled via `GIT_TERMINAL_PROMPT=0`" — rather than leaving it implicit, since this fetch now runs on every build against an uninitialized submodule.

### [NOTE] Terminology drift between checkout-state vocabularies

`GuideInfo.checkout` is typed `'initialized' | 'uninitialized' | 'n/a'` while the underlying `checkSyncStatus()` returns `'not_initialized'`, and the success criteria have `cf guides info` printing "Checkout: not initialized". Three spellings for one state (`uninitialized` / `not_initialized` / "not initialized") is a trivial mapping, but defining the display string once (as was done for `GUIDE_MANAGED_NOTICE` in D9) would prevent the help/output text from drifting.

### [NOTE] No NFR restatement obligation

The parent architecture document states no NFRs (no latency/throughput/availability targets), so the NFR-restatement criterion is vacuously satisfied. The only performance-adjacent consideration — auto-init adding a network fetch to `cf build` latency — is acknowledged in the Risk Assessment ("Auto-init performs a network fetch inside a read command") with scoping and notice mitigations.
