# Staging Promotion Baseline

This document defines how ParetoProof changes enter staging and how a human promotes them manually toward production for the MVP stack. The goal is to give deployment, restore, and approval work one shared release flow without pretending every surface already has full automation.

## Core rules

- The release anchor is always a full Git SHA already merged to `main`.
- Staging and production must refer back to the same anchored SHA. Promotion must not introduce extra commits.
- Promotion is manual. No workflow should auto-promote a staged candidate into production.
- Use GitHub environment scoping to keep staging and production credentials separate even when the workflow code is shared.
- Follow `release-version-mapping-baseline.md` for the authoritative `git_sha -> artifact -> environment` mapping record.
- Use local development as the default pre-production path for unfinished frontend work. Hosted staging is reserved for owner-controlled release validation, not for everyday feature iteration.

## Environment model

The MVP release path has two hosted environments:

- `staging`: owner-controlled validation environment and credential boundary
- `production`: live environment for public and contributor-facing traffic

The repository already reserves both GitHub environments in `github-environment-secrets-baseline.md`. Current workflow wiring uses `production` on automatic `main` deploy jobs, while `staging` remains the manual validation boundary for workflows and platform actions that are intentionally not automatic yet.

No durable public staging hostname exists for the web surface. That is deliberate. The web staging path is a temporary validation deploy or preview tied to the staged SHA, not a second public site that contributors rely on day to day.

## Staging entry rules

A change is eligible for staging only when all of the following are true:

- the source commit is already merged to `main`
- pull-request CI for that merged revision is green, or the equivalent post-merge verification has been run and recorded
- any environment secrets required by the target surface already exist in the `staging` GitHub environment or the corresponding staging platform secret store
- the owner has identified the exact SHA, target surface, and intended validation scope before deployment starts

Staging entry is manual. The owner chooses one merged SHA, deploys it into staging, and records the resulting non-production deployment identifiers so later promotion or rollback does not require dashboard archaeology.

## Surface-specific staging flow

### Web

- Source SHA: merged commit on `main`
- Staging artifact: Pages preview or non-production deployment built from that SHA
- Validation target: owner-accessible preview only, not a durable public staging hostname

Because the MVP intentionally avoids a permanent staging web hostname, staging web validation should be limited to release checks that truly need hosted behavior. Routine UX iteration should stay local.

If Pages produces a separate preview deployment id for staging and a separate production deployment id later, record both ids against the same SHA. The SHA is still the release anchor even if the platform uses different deployment ids per branch or environment.

### API

- Source SHA: merged commit on `main`
- Staging target: Railway staging service or staging deployment target using staging runtime variables
- Data target: staging Neon branch and other non-production backing services

API staging must use staging-only runtime credentials. Production database credentials, production Access audiences, and production-only service tokens must not be reused for staging validation. If a candidate requires schema changes, those changes must be applied to staging first and validated there before any production deployment decision.

### Worker

- Source SHA: merged commit on `main`
- Build artifact: GHCR digest published from that SHA
- Staging target: Modal staging deployment or job target pinned to that existing digest

Worker staging promotion must reuse an already-built digest. Do not rebuild a second image from the same commit just to move into staging. Convenience tags such as `staging` may move, but the digest remains the authoritative worker release identifier.

## Manual promotion to production

Production promotion begins only after staging validation is complete for the affected surfaces.

Minimum promotion checklist:

- confirm the exact staged SHA
- confirm the mapped staging artifact ids or digests for the affected surfaces
- confirm any required schema or secret changes are already present in production-ready form
- confirm no unresolved staging validation finding blocks the release
- confirm the owner is intentionally approving production rollout for that SHA

Promotion rules by surface:

- web: production hostnames must resolve to a Pages deployment that maps back to the approved SHA; if Cloudflare uses a different production deployment id than staging preview did, record both against that same SHA
- api: production deploy uses the approved SHA against the production Railway service and production runtime variables, not an unreviewed follow-up commit
- worker: production promotion points Modal at the already-approved GHCR digest from staging validation; moving a convenience tag is allowed, rebuilding is not

## Roll forward and rollback boundary

- If staging fails, fix forward with a new commit and stage that new SHA. Do not mutate the failed staged release in place.
- If production fails after promotion, follow `deployment-baseline.md` and `release-version-mapping-baseline.md` to restore the prior known-good mapping for the affected surface.
- Cross-surface rollback is required only when contract compatibility demands it.

## Evidence to record per promotion

For each staged or promoted surface, record:

- environment name
- surface name
- full Git SHA
- deployment id or image digest
- timestamp in UTC
- approving human or workflow actor
- link to the validation evidence used for the decision

This record may live in workflow output, release notes, or another owner-maintained ops log, but it must be queryable without reconstructing the release from memory.

## Out of scope

- final production approval gates and sign-off policy beyond the minimum manual checklist in this document
- full API deploy automation
- creating a permanent public staging hostname
