---
docType: review
layer: project
reviewType: code
slice: review-artifact-discovery-and-config-keys
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/240-slice.review-artifact-discovery-and-config-keys.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260702
dateUpdated: 20260702
findings:
  - id: F001
    severity: concern
    category: bug
    summary: "Empty string `reviewType` produces malformed match prefix in `detectDocuments`"
    location: packages/core/src/introspection/parsers/documentDetector.ts:82-87
  - id: F002
    severity: concern
    category: naming
    summary: "Inconsistent enum value 'concern' vs 'concerns' across related config keys"
    location: packages/core/src/config/ConfigKeys.ts:45-54
  - id: F003
    severity: note
    category: dry
    summary: "Repetitive per-gate config key definitions could be generated"
    location: packages/core/src/config/ConfigKeys.ts:57-102
  - id: F004
    severity: pass
    category: api-design
    summary: "Backward-compatible optional `reviewType` parameter design"
    location: packages/core/src/introspection/parsers/documentDetector.ts:49
  - id: F005
    severity: pass
    category: testing
    summary: "Thorough test coverage for new config keys and document detection"
    location: packages/core/tests/config/ConfigManager.test.ts:236-351
---

# Review: code — slice 240

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Empty string `reviewType` produces malformed match prefix in `detectDocuments`

When `reviewType` is `''` (empty string), the guard `reviewType !== undefined` passes, and the match prefix becomes `${idx}-review..` (e.g., `100-review..`). This is a malformed pattern that won't match real files but could match oddly-named ones. More importantly, every per-gate config key `review_type` defaults to `''`, so any caller that passes the config value directly will hit this path. The function should treat `''` the same as `undefined` — skip review detection. A simple fix:

```typescript
if (reviewType !== undefined && reviewType !== '') {
```

There is also no test for this edge case in `documentDetector.test.ts`, which should include a test verifying that an empty-string `reviewType` returns `review: null`.

### [CONCERN] Inconsistent enum value 'concern' vs 'concerns' across related config keys

`workflow.review_threshold` uses `'concerns'` (plural, matching the CONCERNS verdict), while `workflow.review_unknown_as` uses `'concern'` (singular) to represent the same conceptual level. The description for `review_unknown_as` even says `"concern" treats as CONCERNS`, making the mapping explicit but inconsistent. When slice 241 implements gate logic, developers will need to remember that `unknown_as='concern'` maps to `threshold='concerns'`, which is error-prone. Per the project convention *"Never scatter comparison values across code… Changing a value should require editing exactly one place"*, both keys should use the same string for the same conceptual level. Recommend changing `review_unknown_as` enum from `['fail', 'concern', 'pass']` to `['fail', 'concerns', 'pass']` to align with the verdict naming.

### [NOTE] Repetitive per-gate config key definitions could be generated

The four gate transition key pairs (`pre_advance`, `pre_slice_plan`, `pre_tasks`, `pre_implementation`) are structurally identical — same type, default, description pattern, and enum — differing only in the gate name. This is a DRY concern, though config definitions are often inherently declarative and a loop or helper may reduce readability for a config file. Flagging as informational; no action required unless more gates are added.

### [PASS] Backward-compatible optional `reviewType` parameter design

The optional `reviewType` parameter preserves the existing two-arg call signature, and the `review: null` default when omitted means no existing callers are affected. The "don't guess" semantics are well-documented in the inline comment and validated by the test suite.

### [PASS] Thorough test coverage for new config keys and document detection

Tests cover defaults, valid values, invalid values with error message assertions, round-trip persistence with TOML rendering, and exhaustive per-gate defaults verification. The `documentDetector.test.ts` additions cover null-when-omitted, single match, last-match-wins for multiple reviews, non-matching type/index, and missing directory. The `WorkflowNavigator.test.ts` regression test guards against unintended behavioral changes from the comment rename.
