---
docType: review
layer: project
reviewType: slice
slice: squadron-path
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/262-slice.squadron-path.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 84fe9ef96a4ac0447831857a7ff212a3320985c5
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 256224
cachedTokens: 168484
cacheWriteTokens: 87732
completionTokens: 4502
durationSeconds: 36.8
costUsd: 0.413543
costBasis: provider
runId: run-20261020-slices-plan-a67cc35b
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: under-specification
    summary: "`runSquadronProbe` test approach is under-specified and contradicts D9"
    location: "project-documents/user/slices/262-slice.squadron-path.md:280"
  - id: F002
    severity: pass
    category: architectural-alignment
    summary: "Probe handling matches the architecture's facts-versus-judgement split"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D2 — Classification and the version check"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new process I/O path are enumerated"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D1 — Running the probe"
  - id: F004
    severity: pass
    category: integration
    summary: "Contract field-name test matches the architecture's cross-repo requirement"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D8 — Contract test against a vendored contract example"
  - id: F005
    severity: pass
    category: architectural-alignment
    summary: "`fileComprehension` resolution matches the guide-prompt contract"
    location: "project-documents/user/slices/262-slice.squadron-path.md#D5 — Resolving `fileComprehension`"
  - id: F006
    severity: note
    category: proportionality
    summary: "Proportionality is acceptable"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Implementation Notes"
  - id: F007
    severity: note
    category: risk
    summary: "MCP PATH risk is acknowledged with a deferred mitigation"
    location: "project-documents/user/slices/262-slice.squadron-path.md#Risk Assessment"
---

# Review: slice — slice 262

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] `runSquadronProbe` test approach is under-specified and contradicts D9

Technical Requirements say `runSquadronProbe` is tested "against a small fake executable for not-found, exit codes, stderr capture and a timeout." Two things in the design make that impossible as written.
- **Injection:** D1 fixes the command as the constant `SQUADRON_PROBE_COMMAND = { file: 'sq', … }`, and `runSquadronProbe(checkoutPath)` takes no command argument. The test can therefore only reach a fake by putting it on `PATH`. D9 (lines 209–213) rejects exactly that: "putting a fake `sq` on `PATH` in tests. It mutates process environment across a test file and differs by OS."
- **Timeout:** the 10 s limit is a module constant with no override. A timeout test either waits 10 s or has to inject a smaller limit, and the design names no such parameter.

Fix by giving the wrapper an internal seam, such as an optional command/limits argument or a `runProbeProcess(command, cwd, limits)` core that `runSquadronProbe` calls with the constants. State in D1 that the fake-executable tests use this seam, and say how the fake script is made portable. Otherwise cut the spawn-level tests to the pure `classifyProbeRun` cases and rely on 265's real-repo runs for the process wrapper. The architecture needs only the contract test and the stated-unavailable behavior, not spawn tests.

### [PASS] Probe handling matches the architecture's facts-versus-judgement split

cf reads only `probe_version`. It carries the JSON verbatim and does not interpret `surfaces`, `graph` or `baseline`. This follows the principles "Facts in core, judgement in the prompt" and "Use squadron by capability, never by assumption." cf never touches squadron install paths. The "squadron unavailable" statement with a stated reason covers a missing `sq`, an unknown version and unreadable output, and the build never fails or silently skips. The design also keeps the guide prompt's "Do not run the probe yourself" rule satisfiable.

### [PASS] Failure modes for the new process I/O path are enumerated

D1 and D2 map each failure to an explicit outcome:
- ENOENT
- timeout
- output over `maxBuffer`
- signal kill
- EACCES
- non-zero exit
- non-JSON or non-object stdout
- unsupported or missing `probe_version`

Stderr is carried verbatim on the exited outcomes. The comprehension lookup handles a missing directory as `undefined` and other read errors as `AdoptionError`. No peer or connection semantics apply. The design also notes that a git child holding the pipe could delay the 10 s timeout, and accepts that.

### [PASS] Contract field-name test matches the architecture's cross-repo requirement

The architecture says "CF tests check the field names as a cross-repo contract." D8 does this with a vendored fixture and its provenance README. The field list lives only in the test, so cf's runtime still reads `probe_version` alone. The surface names are not asserted, which respects the architecture's rule that neither the design nor the tests fix the `surfaces` contents.

### [PASS] `fileComprehension` resolution matches the guide-prompt contract

It resolves by filename pattern and `docType`, and a wrong-`docType` file at the highest index falls through to the next. It passes nothing, with no placeholder, when nothing matches. It is a derived value outside `PROJECT_FIELDS`, so it can't be set by hand or go stale. It is gated on the guide profile listing `fileComprehension`, which keeps the guide as the content owner. The exclusion of `--embed` is justified and does not drop any scope the plan assigns.

### [NOTE] Proportionality is acceptable

The effort estimate of 2/5 fits. Two mechanisms are slightly beyond the minimum, but each has a stated reason, so neither needs cutting:
- the dynamic backtick fence in D6
- the monorepo caveat, which is documented as accepted and left to 265

Only the spawn-level tests flagged in the CONCERN above are candidates for trimming.

### [NOTE] MCP PATH risk is acknowledged with a deferred mitigation

The not-found reason names PATH, so the cause is stated in the prompt. An `sq` path setting is deferred until 265's real-setup check shows it is needed. That avoids configuration nothing uses yet.

### Run Digest

- Response length: 5425 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 256224 / 168484 / 87732 / 4502 / not computed
- Duration: 36.8 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7
