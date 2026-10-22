---
docType: notes
layer: project
project: context-forge
audience: [human, ai]
description: Provenance of the vendored squadron probe v1 contract example used by the contract test
dateCreated: 20261022
dateUpdated: 20261022
status: complete
---

# Squadron probe v1 contract example

`v1.json` is the JSON example from the "Shape (probe_version 1)" section of squadron's
`project-documents/user/reference/capability-probe-contract.md`, copied verbatim (the whole
object, reindented only).

- Source branch: `366-slice.dispatcher-routing-and-documentation` in the squadron repository
- Source commit: `9616f9fa9d2139ec167f3f2976452b3403f8e00d`

Update this fixture only together with the contract. `squadronProbe.contract.test.ts` holds the
field names and fails when the fixture and the contract's field list drift apart.
