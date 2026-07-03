---
docType: review
layer: project
reviewType: slice
slice: gate-logic-in-workflownavigator
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/241-slice.gate-logic-in-workflownavigator.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260702
dateUpdated: 20260702
findings:
  - id: F001
    severity: concern
    category: scope-creep
    summary: "Pre-slice-plan gate included despite architecture's v1 deferral"
    location: 241-slice.gate-logic-in-workflownavigator.md#Overview
  - id: F002
    severity: concern
    category: error-handling
    summary: "Failure modes for ConfigManager.get() not enumerated"
    location: 241-slice.gate-logic-in-workflownavigator.md#Dependencies
  - id: F003
    severity: concern
    category: error-handling
    summary: "Fail-fast behavior for invalid config values not specified"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Decisions—TD-1
  - id: F004
    severity: note
    category: completeness
    summary: "Priority cascade renumbering not addressed"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Scope
  - id: F005
    severity: note
    category: terminology
    summary: "Terminology: \"concern\" vs \"concerns\" in unknown_as policy"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Decisions—TD-2
  - id: F006
    severity: pass
    category: architectural-alignment
    summary: "Deterministic gating principle implemented as pure functions"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Decisions—TD-1
  - id: F007
    severity: pass
    category: architectural-alignment
    summary: "Conservative-by-default guarantee is structural, not behavioral"
    location: 241-slice.gate-logic-in-workflownavigator.md#Config-Injection
  - id: F008
    severity: pass
    category: architectural-alignment
    summary: "Artifact-first truth and frontmatter contract principles followed"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Decisions—TD-2
  - id: F009
    severity: pass
    category: architectural-alignment
    summary: "Extend-don't-replace principle followed"
    location: 241-slice.gate-logic-in-workflownavigator.md#Technical-Decisions—TD-3
  - id: F010
    severity: pass
    category: integration
    summary: "Integration points and dependency directions are correct"
    location: 241-slice.gate-logic-in-workflownavigator.md#Integration-Points
---

# Review: slice — slice 241

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Pre-slice-plan gate included despite architecture's v1 deferral

The architecture document states in two separate places that initiative-level gating is deferred: "Initiative-level gating (v1 deferred)" and "The gate logic for it — checking for `NNN-review.arch.*.md` before recommending slice plan creation — is a later slice within 240. V1 implements only the four slice-level transitions." The slice design nonetheless folds the `arch` boundary into its four-unit-of-work table and explicitly retires slice 244 ("the separately-planned slice 244 is folded in here"). While the engineering rationale (position-derived reviewType makes `arch` just another boundary case) is sound and PM-approved, this still exceeds what the architecture authorizes for v1 scope. The architecture should be updated to reflect this scope change, or the `arch` boundary should be deferred to its own slice as the architecture prescribes.

### [CONCERN] Failure modes for ConfigManager.get() not enumerated

The slice design explicitly handles `parseFrontmatter` failure modes (never throws, returns `{ found: false, data: {} }`) and review-artifact read failures (UNKNOWN → unknownAs policy). However, it does not enumerate failure modes for the new `ConfigManager.get()` I/O path: what happens if the config file is corrupted, unreadable (permission error), or the call throws? The `resolveGateConfig` function reads config values, but the slice does not state whether `ConfigManager.get()` can throw, what `deriveSliceStatus()` does if it does, or whether a config-read failure should silently skip gating (potentially violating conservative-by-default) or surface an error. Each new I/O path requires an explicit handling strategy, not implicit behavior.

### [CONCERN] Fail-fast behavior for invalid config values not specified

The architecture principle states: "An invalid `workflow.review_threshold` value or an unrecognized per-gate config is a config error surfaced immediately, not a silent pass or silent block." The slice's `resolveGateConfig()` reads `review_enabled`, `review_threshold`, and `review_unknown_as` from `ConfigManager`, but does not specify what happens when these values are invalid (e.g., `review_threshold = "foobar"`). Without explicit fail-fast logic, an invalid threshold could silently default or be misinterpreted, violating the architecture's requirement. The slice should specify how `resolveGateConfig` validates values and surfaces config errors.

### [NOTE] Priority cascade renumbering not addressed

The architecture's Technical Considerations states: "The slice implementing the gate logic should renumber the full cascade (or convert to named stages) as part of the same change." The slice design does not mention priority renumbering. If slice 240 already performed this as part of its foundation work (reserving the branch), this is fine; otherwise, it is an omission. The slice should at least confirm that renumbering is already handled by 240 or specify that it will be done here.

### [NOTE] Terminology: "concern" vs "concerns" in unknown_as policy

The architecture's Technical Considerations section uses the singular form `"concern"` when describing `review_unknown_as` interaction (`"concern"`), while the slice design consistently uses the plural `"concerns"` in its `UnknownPolicy` type (`'fail' | 'concerns' | 'pass'`), which aligns with the verdict vocabulary `CONCERNS`. This discrepancy originates in the architecture document itself. The slice's plural choice is more internally consistent, but both documents should agree on the canonical token form.

### [PASS] Deterministic gating principle implemented as pure functions

The architecture requires "deterministic gating" with "no model reasoning; no probabilistic inference." The slice's `reviewGate.ts` is a standalone module of pure, side-effect-free functions over `(verdict, threshold, unknownAs)` with explicit type unions and a decision matrix. This fully satisfies the deterministic gating goal.

### [PASS] Conservative-by-default guarantee is structural, not behavioral

The architecture requires "Conservative by default — review gating is off unless `workflow.review_enabled = true`." The slice makes this structural: `ConfigManager` is an optional constructor parameter. When absent (or when `review_enabled = false`), the gate is skipped and behavior is byte-for-byte identical to today. This is stronger than a runtime check — it is an compile-time-enforced fallback. Fully aligned.

### [PASS] Artifact-first truth and frontmatter contract principles followed

Review state is derived from disk artifacts (no declared status). The slice reads only the `verdict` field from frontmatter per the Squadron 300 contract; it does not extend or reinterpret the schema. An unparseable/absent verdict surfaces as `UNKNOWN` with explicit `unknownAs` policy resolution — never silently cleared. Both architecture principles are satisfied.

### [PASS] Extend-don't-replace principle followed

The gate inserts into the reserved `LIFECYCLE: review-gate` branch rather than restructuring the existing cascade. Status derivation remains the single source of truth; `getNext()` only routes the new statuses to `review`/`blocked` recommendations. Existing call paths and the `NextAction` return type are unchanged (additive vocabulary only). Fully aligned.

### [PASS] Integration points and dependency directions are correct

Dependency direction is correct: `ConfigManager` (config layer) is injected into `WorkflowNavigator` (core introspection), not the reverse. `reviewGate.ts` is standalone with no navigator dependency, enabling slice 242 to import it without coupling. The slice provides well-defined interfaces to downstream slices (242, 910) and consumes only from its prerequisite (240). No hidden dependencies or circular imports.
