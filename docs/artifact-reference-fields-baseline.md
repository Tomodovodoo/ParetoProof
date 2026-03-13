# Artifact Reference Fields and Checksum Metadata Baseline

This document defines the MVP Postgres field contract for artifact references that point at canonical artifact objects in Cloudflare R2.

The goal is to make later schema, upload, and retention work rely on one explicit metadata model instead of letting worker messages, bundle manifests, and database rows drift apart.

## Why this document exists

Issue `#122` fixed which artifact classes exist and whether their canonical bytes live in Postgres or R2. This document answers the next question: what exact fields must Postgres persist for each R2-backed artifact row?

The field contract must support:

- worker artifact-manifest submission
- offline bundle ingest
- later signed upload and download flows
- run-detail and admin read models
- retention, restore, and checksum validation

## Hard rules

The MVP metadata model follows eight hard rules:

- every artifact row points at one canonical R2 object, not an inline blob in Postgres
- every artifact row must carry a canonical `sha256` checksum and exact `byteSize`
- every artifact row must preserve the artifact class id and bundle-relative path because some classes contain more than one file
- ownership is explicit and exclusive: a row is either run-attempt-owned, benchmark-version-owned, or run-export-owned
- storage locator fields must be allocated before upload finalization so the API can register metadata before or during object transfer
- lifecycle state lives in Postgres and must not be inferred from missing objects on the fly
- R2 provider digests such as ETag are advisory only; the canonical integrity hash is the repository-controlled SHA-256 digest
- the API must not recompress, transcode, or otherwise mutate artifact bytes between checksum registration and final object storage

The last rule is deliberate. The canonical `sha256` and `byteSize` describe the exact object bytes stored in R2. MVP artifact upload should therefore preserve the same bytes that the worker or offline bundle manifest already hashed.

## Canonical row model

The MVP should use one `artifacts` table or an equivalent field set with the same semantics.

The important point is not the table name. The important point is that the database exposes one stable artifact-reference row model with the fields below.

## Required field set

### Identity and ownership fields

| Field | Type shape | Why it exists |
| --- | --- | --- |
| `artifactId` | server-generated string id | Stable primary key for API responses, joins, and audit references. |
| `artifactClassId` | enum from `artifact-class-catalog-baseline.md` | Declares the artifact class without parsing object keys or file names. |
| `ownerScope` | enum: `run_attempt`, `benchmark_version`, `run_export` | Fixes which ownership family the row belongs to. |
| `runId` | nullable string | Required for run-attempt and run-export artifacts. |
| `jobId` | nullable string | Required for run-attempt artifacts so worker token checks and hot-path reads do not need an extra join through attempts. |
| `attemptId` | nullable string | Required for run-attempt artifacts because one run may produce multiple attempts. |
| `benchmarkVersionId` | nullable string | Required for benchmark-version artifacts. |
| `exportId` | nullable string | Required for run-export artifacts so multiple exported bundles for one run stay distinguishable. |
| `relativePath` | string | Preserves the canonical path inside the run bundle, benchmark payload, or export payload. |
| `requiredForIngest` | boolean | Preserves whether this file is part of the ingest-critical subset instead of recomputing that later from class alone. |
| `artifactManifestDigest` | nullable SHA-256 string | Groups run-attempt artifacts under the manifest that registered them. |

### Storage locator fields

| Field | Type shape | Why it exists |
| --- | --- | --- |
| `storageProvider` | enum, MVP value `cloudflare_r2` | Leaves the locator explicit instead of assuming R2 forever in code. |
| `bucketName` | string | Stores the exact environment bucket used for restore, audit, and signed URL generation. |
| `objectKey` | string | Stores the full provider object key without requiring path re-derivation. |
| `prefixFamily` | enum: `run_artifacts`, `run_logs`, `run_traces`, `run_bundles`, `benchmark_source`, `benchmark_reports` | Preserves the policy family directly for read models and later retention logic. |

### Integrity and content-description fields

| Field | Type shape | Why it exists |
| --- | --- | --- |
| `sha256` | required SHA-256 string | Canonical integrity checksum for the stored object. |
| `byteSize` | required non-negative integer | Exact stored object size for integrity checks and cost-aware reads. |
| `mediaType` | nullable string | Content type hint for API responses and later download headers. |
| `contentEncoding` | nullable string | Preserves whether the canonical object bytes are encoded as a named media-encoding variant. |
| `providerEtag` | nullable string | Optional provider digest or version hint for low-level debugging only; not authoritative. |

### Lifecycle fields

| Field | Type shape | Why it exists |
| --- | --- | --- |
| `lifecycleState` | enum: `registered`, `available`, `missing`, `quarantined`, `deleted` | Makes object availability and integrity status explicit in Postgres. |
| `registeredAt` | timestamp | Records when the API accepted the metadata row and allocated the storage locator. |
| `finalizedAt` | nullable timestamp | Records when the API verified the object as present and promoted it to `available`. |
| `lastVerifiedAt` | nullable timestamp | Records the most recent successful presence or checksum verification. |
| `missingDetectedAt` | nullable timestamp | Records when the control plane first confirmed the object was expected but absent. |
| `deletedAt` | nullable timestamp | Records intentional deletion or retention expiry without losing metadata history. |

## Ownership rules

Ownership fields are exclusive by scope.

### `run_attempt`

Run-attempt artifacts require:

- `runId`
- `jobId`
- `attemptId`
- `artifactManifestDigest`

Run-attempt artifacts must keep `benchmarkVersionId` null on the artifact row itself even if the related run points at a benchmark version elsewhere.

Run-attempt artifacts must also keep `exportId` null.

### `benchmark_version`

Benchmark-version artifacts require:

- `benchmarkVersionId`

Benchmark-version artifacts must keep these fields null:

- `runId`
- `jobId`
- `attemptId`
- `exportId`
- `artifactManifestDigest`

### `run_export`

Run-export artifacts require:

- `runId`
- `exportId`

Run-export artifacts must keep these fields null:

- `jobId`
- `attemptId`
- `benchmarkVersionId`
- `artifactManifestDigest`

The point is to keep ownership unambiguous. One artifact row must never pretend to belong to both an attempt and a published benchmark payload.

## Mapping from artifact-manifest submission

The worker artifact-manifest contract already defines these entry fields:

- `artifactRole`
- `relativePath`
- `sha256`
- `byteSize`
- `mediaType`
- `contentEncoding`
- `requiredForIngest`

Those fields should map directly into the artifact row as:

- `artifactRole` -> `artifactClassId`
- `relativePath` -> `relativePath`
- `sha256` -> `sha256`
- `byteSize` -> `byteSize`
- `mediaType` -> `mediaType`
- `contentEncoding` -> `contentEncoding`
- `requiredForIngest` -> `requiredForIngest`

The API then adds the control-plane-owned fields:

- `artifactId`
- ownership fields
- `storageProvider`
- `bucketName`
- `objectKey`
- `prefixFamily`
- lifecycle fields

This preserves a clean split: workers describe the artifact file they produced; the API owns the persisted reference row and storage lifecycle.

## Checksum and size policy

### Canonical checksum

`sha256` is mandatory for every artifact row, including text files, JSON manifests, logs, traces, bundles, and benchmark payloads.

It is the only canonical integrity hash for MVP. The system must not treat:

- R2 ETag
- object key naming
- provider response metadata

as a substitute for `sha256`.

### Exact byte-size rule

`byteSize` is the exact size of the stored object body in bytes.

Because MVP artifact handling must preserve canonical bytes between manifest registration and object finalization:

- the manifest `sha256`
- the manifest `byteSize`
- the stored R2 object body

must all refer to the same byte sequence.

### No checksum-driven deduplication

`sha256` exists for integrity, not for global artifact deduplication.

Different runs or benchmark versions may legitimately store different object keys with the same checksum. The control plane should not collapse them into one shared blob reference in MVP, because retention, audit scope, and restore workflows are owner-scoped rather than content-store-scoped.

## Relative-path rule

`relativePath` is required even when the class id is already known.

This is necessary because some classes intentionally cover more than one file:

- `run_manifest` covers both `run-bundle.json` and `artifact-manifest.json`
- `package_reference` covers `package-ref.json` and `benchmark-package.json`
- `prompt_package` may include the normalized prompt package plus exact prompt-layer source files later
- `execution_trace` may include multiple event, transcript, or tool-log files

The natural artifact identity inside one owner scope is therefore class plus relative path, not class alone.

## Lifecycle-state rules

### `registered`

The row exists in Postgres and already has a storage locator, but the API has not yet verified that the R2 object is present and matches the expected checksum.

### `available`

The API has verified that the object exists at `bucketName + objectKey` and matches the stored `sha256` plus `byteSize`.

### `missing`

The row points at an object that should exist but does not currently verify as present. This may happen after an interrupted upload, an accidental deletion, or a restore gap.

### `quarantined`

The object exists, but checksum, size, or contract validation failed and the control plane should not treat it as a trustworthy artifact for ingest or download.

### `deleted`

The object was intentionally removed or expired, but the metadata row remains for audit, run history, and restore accounting.

## Allowed lifecycle transitions

The MVP lifecycle transitions are:

- `registered -> available`
- `registered -> missing`
- `registered -> quarantined`
- `available -> missing`
- `available -> quarantined`
- `missing -> available`
- `quarantined -> available`
- `quarantined -> deleted`
- `available -> deleted`
- `missing -> deleted`

The API should not silently jump from `registered` straight to `deleted` for normal retention behavior. If a row was ever registered, the control plane should first know whether it became available or missing.

## Constraints and indexes

The field contract should enforce these invariants.

### Required uniqueness

- `artifactId` is the primary key
- `storageProvider + bucketName + objectKey` is unique
- within one owner scope, `artifactClassId + relativePath` must be unique for that owner

Because SQL null handling makes one global owner-scope uniqueness rule awkward, the implementation may use partial unique indexes, but the logical rule must stay the same.

### Required validation

- `sha256` must be a 64-character lowercase or case-insensitive hex digest
- `byteSize` must be non-negative
- `bucketName` and `objectKey` must be non-empty before the row leaves `registered`
- `requiredForIngest=true` is valid only for classes allowed by the artifact catalog and run-bundle ingest boundary
- `prefixFamily` must be compatible with `artifactClassId`

### Required read indexes

The implementation should index at least:

- `attemptId, lifecycleState`
- `runId, artifactClassId`
- `benchmarkVersionId, artifactClassId`
- `artifactManifestDigest`
- `sha256`

The `sha256` index is for integrity investigations and restore checks, not because normal product reads should pivot on checksum.

## What must stay out of the artifact row

The artifact reference row must not become a second generic JSON store.

Keep these out of the base artifact row:

- raw artifact body bytes
- large parsed JSON payloads copied from R2
- worker event history
- benchmark verdict summaries that already belong on run, attempt, or evaluation tables
- retention-policy decisions such as public visibility or legal hold flags from issue `#125`

Selected summary fields may still be copied into dedicated run-result or evaluation tables when a read model needs them. The artifact row itself should stay about identity, location, integrity, and lifecycle.

## Downstream implications

### Signed transfer flow

The signed upload and download contract now lives in `artifact-signed-transfer-baseline.md`. That flow should treat:

- `storageProvider`
- `bucketName`
- `objectKey`
- lifecycle state transitions

as the canonical API-owned locator and availability fields.

### Issue `#125`

Retention and access policy should build on:

- `prefixFamily`
- `ownerScope`
- `requiredForIngest`
- `lifecycleState`
- deletion timestamps

without redefining the reference-row shape.

### Worker control and offline ingest

The worker-control artifact-manifest response should return `artifactId` values for rows that already carry this field contract. Offline ingest should populate the same fields even though it skips claim and heartbeat.

## Out of scope

- signed URL request and finalize flow mechanics
- bucket-level retention windows and visibility policy
- exact SQL migration code or Drizzle table definitions
- public download UX and artifact listing API shape
