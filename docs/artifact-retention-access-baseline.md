# Artifact Retention and Access Policy Baseline

This document defines the MVP retention, visibility, and access policy for ParetoProof artifact outputs stored in Cloudflare R2 and referenced from Postgres.

The goal is to make private run evidence, collaborator review material, and later public benchmark outputs follow one explicit policy instead of ad hoc download rules.

## Core decision

The MVP artifact policy is intentionally conservative:

- raw run-attempt artifacts are private by default
- benchmark publication artifacts are the only class family that may become public in MVP
- export bundles are private by default even when derived from publishable data
- retention follows artifact purpose, not just bucket family

This preserves reproducibility and review evidence without turning worker exhaust or private contributor activity into an accidental public artifact surface.

## Policy summary

- `run_attempt` artifacts are internal review evidence, not public deliverables
- `benchmark_version` artifacts may be public only when they are explicitly designated publication outputs
- `run_export` artifacts remain access-controlled because they can aggregate private evidence even when some source material is publishable
- public visibility is a control-plane policy flag, not something inferred from bucket name or object key alone
- retention must preserve enough evidence to audit benchmark outcomes and restore published results
- signed downloads must enforce the effective visibility and role policy before the API issues any grant

## Visibility model

The MVP uses three visibility tiers:

- `private_internal`
- `approved_contributor`
- `public_release`

### `private_internal`

Visible only to authorized internal roles through the API.

This is the default for:

- all run-attempt artifacts
- all run-export artifacts
- benchmark-source artifacts that are not intentionally published

### `approved_contributor`

Visible to approved contributors and admins through the authenticated portal or equivalent API surface.

This tier exists so later benchmark-source material or review-safe reports can be shared with trusted contributors without making them public on the open web.

The MVP may use it for:

- selected benchmark-source payloads
- selected benchmark reports used for contributor review

The MVP does not require this tier for every class immediately, but the policy model should support it now.

### `public_release`

Visible without contributor authentication once the owner or later release workflow has explicitly published that artifact.

This tier is allowed only for publication-oriented benchmark artifacts:

- benchmark reports
- benchmark-source payloads that are intentionally published as part of a release

No run-attempt or run-export artifact may be `public_release` in MVP.

## Visibility by owner scope and class

### Run-attempt artifacts

All `run_attempt` artifacts remain `private_internal` in MVP.

This includes:

- `run_manifest`
- `package_reference`
- `prompt_package`
- `candidate_source`
- `verdict_record`
- `compiler_output`
- `compiler_diagnostics`
- `verifier_output`
- `environment_snapshot`
- `usage_summary`
- `execution_trace`

Reason:

- these files can reveal unpublished benchmark material, prompt context, internal model behavior, operator decisions, or debugging exhaust
- they are needed for evaluation integrity and contributor review, not public distribution

### Run-export artifacts

All `run_export` artifacts remain `private_internal` in MVP.

This includes:

- downloadable run bundles
- reviewer packages
- owner-generated incident or audit bundles

Reason:

- export bundles may include a mix of public-safe and private evidence
- the bundle boundary is convenience-oriented, not a publication guarantee

### Benchmark-version artifacts

`benchmark_version` artifacts split into two subfamilies:

- `benchmark_source`
- `benchmark_report`

#### `benchmark_source`

Default visibility is `private_internal`.

It may become `approved_contributor` when the source payload is intentionally shared for trusted collaborator review without being made public.

It may become `public_release` only when the benchmark package or source payload is intentionally published for external consumption.

Until then, benchmark-source payloads must not be exposed publicly by default because they may represent:

- hold-out material
- unpublished curation snapshots
- contributor-only source packages

#### `benchmark_report`

Default visibility is `approved_contributor`.

It may become `public_release` when it is an intentionally published results artifact, comparison export, or benchmark release bundle.

The important rule is that published reports become public by explicit release action, not because they happen to live under the `reports/` prefix.

## Effective access by role

The API should enforce access through effective visibility plus caller role.

### Public callers

May read only artifacts with:

- `effectiveVisibility=public_release`
- `lifecycleState=available`

Public callers must not receive signed download grants for any private or contributor-only artifact.

### Approved contributors

May read:

- `approved_contributor`
- `private_internal` artifacts tied to runs or benchmark material they are allowed to inspect

The MVP can stay conservative here and route most private artifact reads through helper-or-higher or admin checks rather than promising full self-service access to every approved contributor.

### Admins

May read all non-deleted artifacts that remain within normal control-plane policy.

Admin access exists for:

- contributor review
- incident response
- restore validation
- release preparation

### Workers

Workers do not receive artifact visibility rights in the human sense.

They may receive:

- upload grants for artifacts on the active assignment
- scoped read grants for required benchmark or control-plane artifacts on that assignment

They must not receive general portal-style artifact browsing rights.

## Policy fields the control plane should own

The artifact row or a closely related policy record should expose these effective policy fields:

- `effectiveVisibility`
  - `private_internal`, `approved_contributor`, or `public_release`
- `retentionClass`
  - `ephemeral_debug`, `review_evidence`, `published_release`, or `restore_critical`
- `legalHold`
  - boolean, default `false`
- `publishedAt`
  - nullable timestamp
- `publicDownloadAllowed`
  - boolean derived from `effectiveVisibility=public_release`, `lifecycleState=available`, and no active legal-hold or incident restriction

The exact schema implementation may normalize these differently, but the policy semantics should remain stable.

## Retention classes

The MVP uses four logical retention classes.

### `ephemeral_debug`

For high-volume or non-essential debug exhaust that is useful during active investigation but not required forever.

Typical artifacts:

- optional execution traces
- bulky tool logs
- debug-oriented intermediate bundles when not tied to an incident

### `review_evidence`

For artifacts needed to understand and verify benchmark outcomes during normal contributor and admin review.

Typical artifacts:

- candidate source
- compiler diagnostics
- verifier outputs
- usage summaries when present

### `published_release`

For artifacts intentionally published as part of benchmark communication or public release packaging.

Typical artifacts:

- published benchmark reports
- released benchmark-source packages

### `restore_critical`

For artifacts whose loss would materially weaken restore, audit, or benchmark lineage reconstruction even if they are not publicly visible.

Typical artifacts:

- run manifests
- artifact manifests
- exported reviewer bundles tied to incidents or formal review

## Retention mapping by artifact class

### Run-attempt classes

| Artifact class | Retention class | Notes |
| --- | --- | --- |
| `run_manifest` | `restore_critical` | Preserves the canonical manifest and digest boundary for one attempt. |
| `package_reference` | `review_evidence` | Needed to connect a run back to the evaluated benchmark package. |
| `prompt_package` | `review_evidence` | Keep for contributor/admin review, but do not publish by default. |
| `candidate_source` | `review_evidence` | Core evidence for what the verifier judged. |
| `verdict_record` | `restore_critical` | Canonical pass/fail artifact. |
| `compiler_output` | `review_evidence` | Needed for failed-run diagnosis. |
| `compiler_diagnostics` | `review_evidence` | Structured failure evidence. |
| `verifier_output` | `review_evidence` | Structured proof-policy evidence. |
| `environment_snapshot` | `restore_critical` | Required for reproducibility and restore validation. |
| `usage_summary` | `review_evidence` | Keep when present for budget analysis and audit. |
| `execution_trace` | `ephemeral_debug` | Useful but optional; not required to preserve a finished verdict. |

### Benchmark-version classes

| Artifact class | Default retention class | Notes |
| --- | --- | --- |
| `benchmark_source` | `published_release` when intentionally published; otherwise `review_evidence` | Publication status changes retention expectations. |
| `benchmark_report` | `published_release` when intentionally published; otherwise `review_evidence` | Same class, different effective policy depending on release state. |

### Run-export class

| Artifact class | Retention class | Notes |
| --- | --- | --- |
| `export_bundle` | `restore_critical` when tied to review or incident evidence; otherwise `review_evidence` | Exports are bundles of existing evidence and should not be treated as permanent public artifacts by default. |

## Retention windows

The retention classes map onto the environment windows already defined in `r2-retention-restore-baseline.md`.

### Dev

- `ephemeral_debug`: 30 days
- `review_evidence`: 30 days
- `restore_critical`: 30 days
- `published_release`: until explicitly superseded or removed by owner action

### Staging

- `ephemeral_debug`: 30 days
- `review_evidence`: 90 days
- `restore_critical`: 90 days
- `published_release`: at least 90 days, longer when it supports a release rehearsal or restore drill

### Production

- `ephemeral_debug`: 90 days
- `review_evidence`: 365 days
- `restore_critical`: 365 days minimum
- `published_release`: retain until intentionally superseded and no longer needed for public result traceability

These are policy minimums. `legalHold=true` or incident handling may extend retention beyond the normal class window.

## Publication rules

An artifact becomes public only through an explicit publication action that:

- sets `effectiveVisibility=public_release`
- records `publishedAt`
- confirms the artifact class is eligible for public release

Eligibility in MVP is limited to:

- `benchmark_source`
- `benchmark_report`

The publication action must not accept:

- `candidate_source`
- `compiler_output`
- `execution_trace`
- `export_bundle`
- any other run-attempt artifact class

This prevents accidental publication of private review evidence.

## Download rules

### Private and contributor-only artifacts

The API may issue signed download grants only after checking:

- caller identity and role
- artifact ownership and intended visibility
- `lifecycleState=available`
- not `deleted`

### Public-release artifacts

The API may issue public signed downloads or redirect-like public download grants only when:

- `effectiveVisibility=public_release`
- `lifecycleState=available`
- no legal hold or incident restriction blocks release

The API must not infer public eligibility from bucket location alone.

## Deletion and hold rules

### Normal expiry

When a retention window expires and no hold applies:

- the object may be deleted from R2
- the metadata row should transition to `deleted`
- audit-relevant metadata must remain in Postgres

### Legal hold or incident hold

If an artifact is part of:

- an incident
- a restore gap investigation
- a release dispute
- a formal benchmark audit

then `legalHold=true` should suspend normal deletion until the owner clears it.

### Missing objects

Missing objects do not become public-safe just because they are missing.

If an artifact is `missing`, the access policy remains the same; the API simply must not issue a download grant until the object returns to `available`.

## Out of scope

- exact SQL or Drizzle schema changes for policy fields
- public website UX for browsing released benchmark reports
- anonymous CDN strategy
- contributor entitlements per benchmark project or future org model
