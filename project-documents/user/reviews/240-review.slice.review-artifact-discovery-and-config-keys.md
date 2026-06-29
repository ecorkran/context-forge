---
docType: review
layer: project
reviewType: slice
slice: review-artifact-discovery-and-config-keys
project: squadron
verdict: PASS
sourceDocument: project-documents/user/slices/240-slice.review-artifact-discovery-and-config-keys.md
aiModel: minimax/minimax-m2.7
status: complete
dateCreated: 20260626
dateUpdated: 20260628
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "Correct slice plan assignment"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#Overview
  - id: F002
    severity: pass
    category: uncategorized
    summary: "Architecture open item correctly resolved"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#TD-1
  - id: F003
    severity: pass
    category: uncategorized
    summary: "Conservative defaults match architecture intent"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#TD-3
  - id: F004
    severity: pass
    category: uncategorized
    summary: "Scope correctly bounded — no gate logic"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#Technical-Scope
  - id: F005
    severity: pass
    category: uncategorized
    summary: "No-behavioral-change commitment honors \"Extend, don't replace\""
    location: 240-slice.review-artifact-discovery-and-config-keys.md#Overview
  - id: F006
    severity: pass
    category: uncategorized
    summary: "Detection rule design aligns with architecture"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#TD-2
  - id: F007
    severity: pass
    category: uncategorized
    summary: "No new dependencies to 160 interfaces"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#Dependencies
  - id: F008
    severity: concern
    category: uncategorized
    summary: "TOML key spelling deviation documentation gap"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#TD-1
    resolution: "Resolved 20260628. Slice 243 added to interfaces; TD-1 and a new 'Provides to Other Slices' bullet capture the underscore-spelling documentation obligation explicitly."
  - id: F009
    severity: concern
    category: uncategorized
    summary: "File-read failure modes deferred without explicit acknowledgment"
    location: 240-slice.review-artifact-discovery-and-config-keys.md#Integration-Points
    resolution: "Resolved 20260628. New 'Deferred to Other Slices' section states file-read/parse-failure handling (UNKNOWN per arch) is owned by slice 241; this slice only locates the file and never opens it."
---

# Review: slice — slice 240

**Verdict:** PASS _(was CONCERNS; both concerns resolved 20260628 — see resolution notes on F008/F009)_
**Model:** minimax/minimax-m2.7

## Findings

### [PASS] Correct slice plan assignment

The slice correctly identifies itself as the "Review artifact discovery and config keys" foundation slice from the arch's "Anticipated Slices" section. The three deliverables (review slot, config keys, branch renaming) map precisely to the arch's description.

### [PASS] Architecture open item correctly resolved

The arch explicitly flagged "Config schema for `review_gates`" as an open decision requiring resolution at slice design time. The slice resolves it with a flat dotted-key namespace, providing a sound rationale: fits existing `ConfigManager` machinery with zero changes, avoids disproportionate complexity for a four-row map, and still renders as a nested TOML table to users. This is appropriate.

### [PASS] Conservative defaults match architecture intent

The three global config keys correctly implement the arch's "Conservative by default" principle:
- `review_enabled = false` (gating off by default)
- `review_threshold = "concerns"` (passes PASS or CONCERNS)
- `review_unknown_as = "fail"` (UNKNOWN blocks by default)

The enum/validate enforcement aligns with the arch's "Fail-fast on configuration errors" principle.

### [PASS] Scope correctly bounded — no gate logic

The explicit exclusions are correct and align with the arch's "Anticipated Slices" assignment:
- No `SliceStatus` enum changes, no `deriveSliceStatus()` changes (→ 241)
- No verdict reading or threshold comparison (→ 241)
- No `ConsistencyChecker` rule (→ 242)
- No initiative-level gating (→ 244)
- No documentation beyond config descriptions (→ 243)

### [PASS] No-behavioral-change commitment honors "Extend, don't replace"

"After this slice, `cf next` / `workflow_next` behave **identically to today**" directly satisfies the arch's "Extend, don't replace" principle. The branch renaming is comment-only, the new config keys default to off, and the success criteria include a regression test asserting unchanged recommendations.

### [PASS] Detection rule design aligns with architecture

The optional `reviewType` parameter with explicit null-return when omitted honors the arch's "Do not guess" principle. The lexicographically-last selection (`at(-1)`) is correctly differentiated from the sibling detectors' first-match (`[0]`) with a documented rationale. The `reviews/` directory path matches the arch's specification.

### [PASS] No new dependencies to 160 interfaces

"None. This slice is purely additive to initiative 160's infrastructure" is correct. The slice reuses `detectDocuments`, `CONFIG_KEYS`, and `ConfigManager` without changing their signatures in backward-incompatible ways (the `reviewType?` parameter is optional).

### [RESOLVED] TOML key spelling deviation documentation gap

_Originally CONCERN. Resolved 20260628._

The arch uses hyphenated names in its illustrative TOML (`pre-slice-plan`, `pre-advance`) while TOML bare keys prohibit hyphens, requiring underscores (`pre_advance`, `pre_slice_plan`). The slice correctly documents this technical constraint. However, the statement "This is the one deviation from the arch doc's illustrative `pre-advance` spelling and must be reflected in slice 243 docs" places the remediation in slice 243 (documentation) without confirming that slice 243 is aware of this requirement. Given that interfaces: [241, 242, 244] are listed but 243 is not, this cross-slice documentation commitment should be explicitly captured in a dependency or interface note so it is not lost.

**Resolution:** Slice 243 was added to the slice's `interfaces` list (`[241, 242, 243, 244]`). TD-1 now states the underscore spelling is a documentation obligation handed to 243, cross-referencing a new explicit bullet under "Provides to Other Slices" that directs 243 to document the underscore keys and the deviation from the arch's illustrative hyphenated form. The commitment is now captured in a place 243's author will see.

### [RESOLVED] File-read failure modes deferred without explicit acknowledgment

_Originally CONCERN. Resolved 20260628._

The architecture states: "A review file that exists but cannot be parsed (malformed YAML, unreadable encoding, permission error) must not silently pass. It is treated as `UNKNOWN` and `review_unknown_as` applies." The slice correctly defers parsing to slice 241 since this is a foundation layer. However, the slice does not explicitly acknowledge this gap — it does not say "file-read failures during review artifact parsing are handled in slice 241 per arch §Technical Considerations." This is acceptable for a foundation slice but creates an implicit dependency on 241 to handle the arch's explicit failure mode enumeration. Consider adding a note under "Provides to Other Slices" or "Special Considerations" that documents this expectation.

**Resolution:** A new "Deferred to Other Slices" subsection under Integration Points now states explicitly that file-read/parse-failure handling (treating an existing-but-unparseable review as `UNKNOWN`, per arch §Technical Considerations) is gate logic owned by slice 241. It clarifies that this foundation slice only *locates* the file via `detectDocuments` and never opens it — so it neither partially handles nor silently swallows the failure modes; 241 owns the full enumeration.
