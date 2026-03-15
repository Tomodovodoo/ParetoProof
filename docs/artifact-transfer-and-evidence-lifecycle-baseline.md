# Artifact Transfer And Evidence Lifecycle Baseline

This document defines the canonical lifecycle for benchmark artifacts after the current worker and offline-ingest kernel has registered their metadata.

It answers three separate questions that should not drift together:

- how artifact bytes move into or out of object storage
- how humans and services discover or review artifact evidence
- how retention, quarantine, and deletion affect the artifact record over time

The current repository already has artifact rows, deterministic object keys, and lifecycle enums. This scope makes those pieces authoritative for later transfer, evidence-browser, and cleanup work instead of leaving each follow-on feature to invent its own storage semantics.

## Current baseline

- Worker artifact manifests and offline-ingest imports already create durable `artifacts` rows.
- The current DB lifecycle vocabulary already exists:
  - `registered`
  - `available`
  - `missing`
  - `quarantined`
  - `deleted`
- Artifact rows already distinguish owner scopes:
  - `run_attempt`
  - `benchmark_version`
  - `run_export`
- Object storage is Cloudflare R2 with deterministic bucket and object-key metadata in Postgres.
- Portal run detail already treats artifact metadata as part of the canonical evidence read model.

What is still missing is one source of truth for when bytes are uploaded, how they become downloadable, when they are considered missing or quarantined, and which artifacts may ever escape the private portal boundary.

## Decision

Artifact metadata is the system of record. Artifact bytes live in R2, but any upload, download, review, or release action must go through the control plane first.

The control plane owns:

- artifact row creation
- lifecycle transitions
- authorization and release decisions
- signed upload and download intent issuance
- quarantine and retention decisions

R2 owns object durability, not authorization policy.

## Transfer boundary

### Uploads

Persisted artifact bytes should not stream through the API application server.

Approved upload patterns:

- worker or operator requests an upload intent from the API
- the API authorizes the request against the existing artifact row
- the API issues a short-lived signed upload target for the exact bucket and object key
- the uploader sends bytes directly to R2
- the API verifies object presence plus expected checksum, size, media type, and content encoding before promoting lifecycle state

The only non-signed upload path is a control-plane-owned server-side copy during an import or export workflow that the API itself executes. Even in that case, the destination object must still land on the existing artifact row and use the same verification rules.

### Downloads

Persisted artifact bytes should also not be proxied as a normal API data stream.

Approved download patterns:

- browser or internal caller requests a download intent from the API
- the API evaluates role, run visibility, artifact lifecycle, and release posture
- the API returns a short-lived signed download URL when the caller is allowed to fetch the object

Direct API responses remain the owner of:

- bounded metadata read models
- inline audit or status payloads
- small synthetic responses that are not durable artifact objects

If a CSV, JSON, or bundle becomes durable evidence that should be reused, audited, or released later, it should become an artifact row plus signed download instead of a special proxied blob route.

## Canonical lifecycle

Signed URLs are transient credentials. They are not lifecycle states.

The canonical persisted states remain:

### `registered`

Meaning:

- the artifact identity, storage locator, and expected metadata are durable
- the object may not exist yet, or may exist but has not been verified against the row

How a row reaches `registered`:

- worker artifact-manifest submission
- offline-ingest metadata import
- benchmark-source registration
- reproducibility export reservation before object assembly completes

What `registered` allows:

- portal and operator views may show the artifact metadata row
- upload intent issuance is allowed
- download intent issuance is not allowed

### `available`

Meaning:

- the object exists at the recorded storage locator
- checksum, byte size, media type, and content encoding match the row
- the artifact is safe to reference from portal evidence and, if separately released, from public surfaces

How a row reaches `available`:

- successful upload or server-side copy
- successful verification against the row contract

What `available` allows:

- portal evidence download for authorized private callers
- inclusion in reproducibility bundles
- later public release only if the artifact class and release policy allow it

### `missing`

Meaning:

- the system expected the object to exist, but it does not currently satisfy that expectation

Typical causes:

- upload never completed before the allowed deadline
- a later verification found the object absent
- an export or copy job failed after reserving the artifact row

What `missing` means operationally:

- the row remains durable and auditable
- portal views should show that evidence is incomplete
- download intent issuance is blocked
- the row may return to `available` only if the same artifact contract is later satisfied

### `quarantined`

Meaning:

- the object or its surrounding evidence posture is present but must not be treated as normal evidence

Typical causes:

- checksum, size, media type, or content encoding mismatch
- object bytes do not match the registered artifact contract
- policy hold, legal hold, or operator security incident
- explicit evidence-review hold pending investigation

What `quarantined` means operationally:

- normal caller downloads are blocked
- operator and admin review surfaces must expose the quarantine reason
- public release is blocked
- later disposition may restore `available` or move to `deleted`

### `deleted`

Meaning:

- the object bytes are intentionally removed
- the artifact row survives as a tombstone for audit and lineage

`deleted` is terminal for download and release. Restoring the same logical artifact requires a new managed remediation path, not silent reuse of the tombstoned row.

## Lifecycle transitions

The allowed baseline transitions are:

- `registered -> available`
- `registered -> missing`
- `registered -> quarantined`
- `available -> missing`
- `available -> quarantined`
- `available -> deleted`
- `missing -> available`
- `missing -> quarantined`
- `missing -> deleted`
- `quarantined -> available`
- `quarantined -> deleted`

Disallowed transitions:

- any transition out of `deleted`
- any direct `registered -> deleted` skip that bypasses verification or evidence of why the object never became available

## Idempotency and duplicate handling

Artifact identity is anchored to the existing row:

- owner scope
- owner id tuple
- artifact class
- relative path
- deterministic storage locator
- expected checksum, byte size, media type, and content encoding

The transfer layer must treat uploads and terminal result references as idempotent against that identity.

### Duplicate upload of matching bytes

- same row
- same object contract
- same verified bytes

Result:

- idempotent success
- lifecycle stays or becomes `available`

### Duplicate upload of mismatched bytes

- same row
- different checksum, size, media type, or content encoding

Result:

- do not create a second competing artifact row
- quarantine the row and record the mismatch reason
- block normal download and public release until reviewed

### Late uploads

Late upload is allowed only when:

- the artifact row already exists
- the row is still `registered` or `missing`
- retention policy has not already required deletion
- the same artifact contract is satisfied

Late upload must not create ad hoc post-hoc evidence rows after a run is already terminal. New evidence classes belong in a separate operator-controlled workflow, not in the original run-attempt artifact namespace.

## Terminal result and ingest interaction

This scope keeps the current worker and offline-ingest artifact registration model, but it tightens the interpretation:

- terminal result or failure payloads may reference only artifact rows already registered for that attempt
- referenced artifact ids must stay bound to the submitted artifact manifest digest
- a result is reproducibility-complete only when the required artifact subset is `available`

Two related truths can coexist:

- a run may already be terminal in the execution sense
- some of its evidence rows may still be `registered` or `missing`

That means:

- portal run detail may show a terminal run with incomplete evidence
- public release and reproducibility export must fail closed until the required evidence subset is `available`

## Evidence surfaces

### Portal run detail

`/portal/runs/:runId` remains the canonical private evidence metadata surface.

It should always show the bounded artifact list for authorized portal users, including:

- artifact class
- relative path
- lifecycle state
- size and media metadata
- whether the artifact is required for ingest

It should not embed raw object bytes in the read model.

### Operator evidence review

Later operator review surfaces should live on portal admin or operator-owned routes and add:

- quarantine reason
- release posture
- missing-detection timestamps
- retention class and deletion eligibility
- remediation actions such as reverify, quarantine, release, or delete

These views are broader than normal run detail and remain admin or operator only.

### Reproducibility export bundles

Reproducibility export is its own artifact owner scope: `run_export`.

A reproducibility export bundle should be materialized as a durable artifact row, not as an ad hoc zip stream. The bundle may aggregate run-attempt evidence, but once produced it becomes its own export object with its own lifecycle and retention.

The minimum reproducibility-complete export should contain:

- run manifest identity
- benchmark package reference
- prompt package reference
- candidate source
- verifier verdict record
- compiler diagnostics
- compiler output
- verifier output
- environment snapshot

Optional diagnostics such as `usage_summary` and `execution_trace` may be included when available, but they are not allowed to silently replace the canonical required subset above.

### Public release and report surfaces

The public site must not expose raw private run-attempt evidence by default.

Publicly downloadable artifacts are limited to explicitly released objects such as:

- curated benchmark reports
- benchmark-source artifacts intended for publication
- approved reproducibility exports when a release policy says they may become public

Run-attempt artifacts like raw candidate source, compiler logs, verifier outputs, and traces remain private unless an explicit release object or release decision promotes them into a public-safe export.

## Role and access policy

Artifact visibility and byte download are separate from lifecycle.

### `approved_helper_or_higher`

May:

- read private run-detail artifact metadata for runs they are allowed to inspect
- download `available` private evidence objects when the artifact is not quarantined and not blocked by a stronger release rule

May not:

- inspect quarantine reasons
- override release posture
- download public-release-blocked artifacts through an admin bypass

### `approved_collaborator_or_higher`

Gets the same evidence access as helpers and may later request reproducibility-export generation where the product exposes that workflow.

### `admin_only` or later operator role

May:

- view all private artifact metadata
- inspect quarantine and missing reasons
- issue review decisions
- grant or deny public release posture
- download quarantined evidence when needed for incident handling

### Public anonymous callers

May access only explicitly released public artifacts, and only through a release-aware API decision that returns a signed download intent.

## Retention policy

Retention is a policy dimension layered on top of lifecycle, not another lifecycle enum.

The baseline retention classes are:

- canonical reproducibility evidence
- operational diagnostics
- derived public release artifacts
- quarantined or incident-held evidence

### Canonical reproducibility evidence

Includes:

- run manifest
- package reference
- prompt package
- candidate source
- verdict record
- compiler diagnostics
- compiler output
- verifier output
- environment snapshot

Policy:

- keep by default for any run that may need reproducibility or audit support
- do not delete before any linked public release, active review, or reproducibility export window has expired

### Operational diagnostics

Includes:

- usage summary
- execution trace
- future verbose logs or profiler outputs

Policy:

- may have shorter retention than canonical reproducibility evidence
- must still remain available during active incident review or operator investigation

### Derived public release artifacts

Includes:

- benchmark reports
- public reproducibility exports

Policy:

- retain according to the release lifecycle of the benchmark version or report set they support

### Quarantined or incident-held evidence

Policy:

- never auto-release
- retention clock is suspended while the hold is active
- deletion requires explicit operator or admin disposition

## Explicit out-of-scope decisions

This scope does not:

- implement the signed upload or download endpoints
- build the portal evidence browser UI
- change the current worker artifact-manifest request shape
- decide the full benchmark product object model
- decide public benchmark intake workflow

## Follow-up execution slices

Execution work after this scope should split into:

1. signed upload and download intent routes plus lifecycle enforcement
2. portal run-detail download actions and admin evidence-review surfaces
3. reproducibility export generation and artifact ownership wiring
4. retention, missing-detection, quarantine, and deletion automation
