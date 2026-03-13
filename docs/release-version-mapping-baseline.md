# Release Version Mapping Baseline

This document resolves the MVP mapping between Git revisions, build artifacts, and deployed environments. The goal is traceable rollback and restore decisions across web, API, and worker surfaces.

## Canonical release anchor

For MVP, the canonical release anchor is the full Git commit SHA merged to `main`.

- Every deployable artifact must be attributable to one repository commit SHA.
- Short SHAs are display helpers only; full SHA is the durable identifier.
- A deploy should never be considered valid if its source SHA cannot be identified.

## Surface-to-artifact mapping

### Web (`paretoproof-web` on Cloudflare Pages)

- source of truth: Git commit SHA
- deploy artifact: Pages deployment id
- required mapping: `git_sha -> pages_deployment_id -> hostnames`
- hostnames in scope: `paretoproof.com`, `www.paretoproof.com`, `auth.paretoproof.com`, `portal.paretoproof.com`

### API (`ParetoProof API` service on Railway)

- source of truth: Git commit SHA
- deploy artifact: Railway deployment id (and runtime image digest if container-based deployment is used)
- required mapping: `git_sha -> railway_deployment_id -> api.paretoproof.com`

### Worker (GHCR image + Modal deployment config)

- source of truth: Git commit SHA
- deploy artifact: GHCR image digest plus human-readable tags
- required mapping: `git_sha -> ghcr_digest (+ tags) -> modal worker deployment target`

For workers, digest is authoritative. Tags are convenience pointers and may move.

## Tagging policy

Worker images should carry both immutable and convenience tags.

- immutable tag: `sha-<full_git_sha>`
- optional convenience tags:
  - `main-latest`
  - environment tags such as `staging` or `production` when promoted

Rules:

- never overwrite `sha-*` tags with different content
- promotions move environment tags to an already-built digest, not rebuild from a different commit
- rollback should prefer prior known-good digest, not ad-hoc rebuild from local state

## Environment mapping record

Each environment should have one latest-known-good mapping entry per surface:

- environment: `staging` or `production`
- surface: `web`, `api`, `worker`
- git SHA
- deploy artifact id:
  - Pages deployment id for web
  - Railway deployment id for API
  - GHCR digest (+ Modal target reference) for worker
- deployed-at timestamp (UTC)
- deployed-by actor (human or workflow id)

This record can live in release notes, a checked-in ops log, or workflow-produced metadata, but it must be queryable without dashboard archaeology.

## Promotion and rollback rules

- Promote by selecting an existing mapped artifact from a known SHA, not by rebuilding during promotion.
- Roll back by restoring the previous mapping entry for the same surface and environment.
- Cross-surface rollback should only happen when contract compatibility requires it; otherwise roll back only the affected surface.
- If schema compatibility is uncertain, API rollback must be blocked pending data-compatibility confirmation.

## Minimum workflow requirements

CI/CD or manual release steps should emit enough metadata to reconstruct mapping:

- resolved Git SHA
- surface identifier (`web`/`api`/`worker`)
- produced artifact id (deployment id or digest)
- target environment

If any field is missing, treat the deploy as non-traceable and do not mark it as release-complete.

## Out of scope

- introducing semantic versioning for MVP
- implementing full release automation in this issue
- defining final production approval workflow gates (covered by downstream issue `#116`)
