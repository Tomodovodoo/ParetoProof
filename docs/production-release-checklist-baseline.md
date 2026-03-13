# Production Release Checklist Baseline

This document defines the MVP production release checklist, approval gates, and rollback handoff for ParetoProof. The goal is to make production rollout a deliberate decision with explicit evidence, not an informal dashboard action.

## Scope

This checklist applies after a candidate SHA has already passed staging entry and validation under `staging-promotion-baseline.md`. It does not replace surface-specific deploy or rollback instructions. It defines the final go/no-go gate for production.

## Core rules

- Production release approval is always tied to one full Git SHA already merged to `main`.
- Approval applies only to the exact staged candidate and its recorded artifacts. If the candidate changes, approval resets.
- The owner is the release approver for MVP.
- A release is not complete until the rollback handoff record exists for every affected surface.
- If any required gate fails or evidence is missing, the release is blocked until fixed or explicitly re-scoped.

## Required release packet

Before approval, assemble one release packet containing:

- target production SHA
- affected surfaces: `web`, `api`, `worker`
- staging evidence links for each affected surface
- staging artifact ids or digests for each affected surface
- intended production deployment window
- named release approver
- named rollback handoff owner for the rollout window

The packet may live in release notes, a GitHub issue comment, or another owner-maintained ops log, but it must be linkable after the fact.

## Approval gates

Every production release must clear all general gates plus the surface-specific gates for the surfaces it changes.

### General gates

- `release_anchor_confirmed`: the exact full Git SHA is recorded and matches the staged candidate
- `staging_validation_complete`: staging checks have passed for every affected surface
- `mapping_record_ready`: the release mapping record can capture `environment`, `surface`, `git_sha`, and deploy artifact ids or digests without dashboard archaeology
- `restore_inputs_ready`: restore drill prerequisites still hold for this release window, including release mappings and artifact inventory references
- `secret_scope_confirmed`: production credentials remain production-scoped and no staging-only secret is required for the release to work
- `rollback_owner_assigned`: one named human owns rollback decisions during the release window
- `open_risk_reviewed`: no unresolved critical risk is being ignored by accident

### Web gates

Required when the release affects `apps/web`, Pages config, public hostnames, portal hostnames, or Access-facing web behavior.

- production Pages deployment maps to the approved SHA
- public and portal hostnames remain attached to the expected Pages-managed surface
- no release step requires creating a permanent public staging hostname
- any portal or auth flow change has been validated against the current API contract

### API gates

Required when the release affects `apps/api`, database compatibility expectations, auth boundary behavior, or API-hosted admin/control-plane logic.

- production Railway deployment target is identified for the approved SHA
- schema compatibility with current production Neon state has been explicitly checked
- runtime variables and Access audience expectations match production, not staging
- health and one authenticated API path are part of the planned post-release verification

### Worker gates

Required when the release affects `apps/worker`, worker contract behavior, or hosted worker image usage.

- production worker target points at an existing approved GHCR digest
- promotion will move a digest or convenience tag, not rebuild from a different commit
- any required Modal secret objects already exist in production-scoped form
- API/worker contract compatibility has been checked if the worker or API changed in the same release family

## Blocking conditions

Do not approve production release when any of the following is true:

- the candidate SHA differs from the SHA that staging validated
- production deploy would require an unreviewed hotfix commit
- rollback target for an affected surface cannot be identified
- schema compatibility is unknown for an API-affecting release
- worker promotion depends on a digest that was never validated or cannot be traced back to the approved SHA
- production secrets or service tokens would need to be copied from staging ad hoc during release

## Release approval decision

The approver must record one of:

- `approved`
- `approved_with_noted_follow_up`
- `blocked`

If the decision is not plain `approved`, the record must include the exact blocker or accepted follow-up risk. `approved_with_noted_follow_up` is allowed only for non-critical items that do not weaken rollback or recovery readiness.

## Rollback handoff

Once production approval is given, record the rollback handoff before or during rollout:

- affected surfaces
- prior known-good mapping for each affected surface
- rollback owner
- rollback trigger signals to watch during the release window
- first verification checks after release

Minimum rollback trigger signals:

- web: broken public load, broken auth entry, or portal bootstrap regression
- api: `/health` failure, authenticated route regression, or production data-compatibility error
- worker: digest mismatch, worker startup failure, or API/worker contract regression

## Post-release verification

After production deployment, record:

- final deployed artifact ids or digests
- UTC deploy time
- verification result for each affected surface
- whether rollback ownership window is still active or closed

Minimum verification set:

- web: confirm the intended Pages-managed surface loads on the affected hostname path
- api: confirm `/health` and one authenticated path
- worker: confirm the intended digest is the active target and that the worker can start or claim work as expected

## Out of scope

- long-term multi-approver change-management policy
- automatic release orchestration
- incident communication templates beyond rollback ownership and trigger capture
