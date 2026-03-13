# Artifact Class Catalog Baseline

This document resolves the MVP artifact class catalog and storage location rules. It answers which artifact classes exist and whether each class is stored as Postgres metadata only or as an R2 object plus Postgres metadata.

The typed source of truth lives in:

- `packages/shared/src/contracts/artifact-catalog.ts`
- `packages/shared/src/schemas/artifact-catalog.ts`
- `packages/shared/src/types/artifact-catalog.ts`

## Storage rule summary

- Postgres stores artifact metadata for every class (ownership, visibility, lifecycle, checksums, and references).
- R2 stores artifact payload bytes for classes marked `r2_object_with_postgres_metadata`.
- No artifact payload blob should be stored directly in Postgres for MVP.

## Class catalog

1. `run_log_chunk`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `artifacts_bucket`
- prefix: `runs/<run_id>/logs/`
- visibility: `private`

2. `run_trace_bundle`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `artifacts_bucket`
- prefix: `runs/<run_id>/traces/`
- visibility: `private`

3. `run_artifact_blob`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `artifacts_bucket`
- prefix: `runs/<run_id>/artifacts/`
- visibility: `private`

4. `run_export_bundle`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `exports_bucket`
- prefix: `runs/<run_id>/bundles/`
- visibility: `restricted`

5. `benchmark_source_bundle`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `artifacts_bucket`
- prefix: `benchmarks/<benchmark_version_id>/source/`
- visibility: `restricted`

6. `benchmark_report_bundle`
- storage mode: `r2_object_with_postgres_metadata`
- bucket class: `exports_bucket`
- prefix: `benchmarks/<benchmark_version_id>/reports/`
- visibility: `public`

7. `problem_attachment`
- storage mode: `postgres_metadata_only`
- bucket class: `none`
- prefix: `null`
- visibility: `restricted`

## Rationale

- The catalog aligns with existing bucket and prefix policy in `docs/operations-baseline.md`.
- Large execution outputs (logs, traces, bundles) are object storage concerns, not relational row payloads.
- `problem_attachment` remains metadata-only in this baseline to keep scope narrow until an explicit payload use case is accepted.

## Execution handoff

Downstream issues can now build on this baseline:

- `#123` can define checksum, size, and reference fields keyed by these artifact classes.
- `#124` can define signed upload/download flows using the bucket class and prefix mapping.
- `#125` can define retention/visibility policy by class without reopening storage-mode decisions.

## Out of scope

- signed URL/token mechanics
- checksum field schema details
- retention windows and purge automation
