# R2 Retention and Restore Baseline

This document defines the MVP retention, versioning, and recovery ownership policy for artifact storage in Cloudflare R2.

## Scope and ownership

Cloudflare R2 is the canonical store for large run artifacts and generated export bundles. Artifact durability is owned by the R2 platform and bucket lifecycle policy. Restore authorization and incident ownership remain with the ParetoProof repository owner.

- Platform mechanism owner: Cloudflare R2
- Restore decision owner: ParetoProof repository owner
- Post-restore validation owner: ParetoProof repository owner

## Bucket layout baseline

R2 buckets are environment-scoped and separated by purpose:

- artifacts buckets:
  - `paretoproof-dev-artifacts`
  - `paretoproof-staging-artifacts`
  - `paretoproof-production-artifacts`
- exports buckets:
  - `paretoproof-dev-exports`
  - `paretoproof-staging-exports`
  - `paretoproof-production-exports`

Prefix layout is stable and must not be changed without a migration plan:

- `runs/<run_id>/artifacts/`
- `runs/<run_id>/logs/`
- `runs/<run_id>/traces/`
- `runs/<run_id>/bundles/`
- `benchmarks/<benchmark_version_id>/source/`
- `benchmarks/<benchmark_version_id>/reports/`

## Retention baseline

Retention is environment-aware so development cleanup does not weaken production auditability.

- `dev`:
  - default retention target: 30 days
  - intended for fast iteration and low-cost cleanup
- `staging`:
  - default retention target: 90 days
  - intended for release rehearsal and restore-drill evidence
- `production`:
  - default retention target: 365 days for run artifacts, logs, and traces
  - release bundles and benchmark reports may be retained longer when tied to published results or incident records

Retention policy is enforced via bucket lifecycle rules and periodic owner review, not by ad-hoc manual deletion.

## Versioning and mutability rules

MVP artifact objects are treated as immutable once written for a completed run attempt.

- object keys should include stable run or benchmark identifiers so a later write does not overwrite prior evidence
- retry attempts should write to a distinct attempt path rather than rewriting prior run outputs
- production objects should not be deleted or replaced outside a documented retention action or incident response
- export/report rewrites require a new object key version and an audit note in the related run or release record

## Restore ownership and process

When data loss or corruption occurs, recovery follows one owner-led path:

1. The owner declares the restore scope (environment, bucket, prefixes, time window).
2. The owner executes or supervises the R2 restore/recovery action.
3. The owner validates recovered object integrity against run metadata (checksums, expected counts, and key prefixes).
4. The owner records the incident summary, restored scope, and remaining gaps in the project ops log.

If complete restoration is not possible, missing-object gaps must be documented explicitly and the affected runs marked accordingly instead of silently backfilling from unverifiable local copies.

## Security and access constraints

- Workers and API processes receive only runtime-scoped credentials.
- No long-lived R2 credentials are baked into container images or committed in repository files.
- Non-production principals must not receive production bucket privileges.
- Restore-capable credentials remain owner-managed and are not part of standard contributor access.

## Downstream dependencies

This policy is an input for:

- issue #107 (restore drill checklist)
- issue #125 (artifact retention and access policy)
- release and incident runbooks that require artifact recovery evidence
