# Offline Ingest Operator Auth Baseline

This document defines the later-scope unattended auth lane for Problem 9 offline run-bundle ingest.

It does not replace the current MVP path:

- human admins may ingest through `POST /portal/admin/offline-ingest/problem9-run-bundles`
- that route stays bound to a normal Access-backed `admin_only` assertion
- the checked-in worker CLI still requires an explicit human `--access-jwt`

The goal here is narrower: if ParetoProof later runs scheduled or bot-driven ingest, that flow needs its own machine principal and route family instead of stretching portal-admin identity or worker bootstrap secrets past their intended boundary.

## Decision

Unattended offline ingest should use a dedicated internal operator principal on a dedicated internal route family:

- principal type: `offline_ingest_operator`
- route family: `/internal/offline-ingest/*`
- first route: `POST /internal/offline-ingest/problem9-run-bundles`
- call boundary: `internal_service_only`
- credential shape: Cloudflare Access service token or equivalent workload identity that resolves to the same API-side operator principal

The operator principal is ingest-only. It may submit completed canonical run bundles, but it does not inherit portal-admin powers, worker-claim powers, or broader internal mutation access.

## Why This Boundary

The current repo already distinguishes three auth lanes:

- portal user identity via Cloudflare Access assertions and DB-backed RBAC
- worker claim-loop bootstrap and job tokens under `/internal/worker/*`
- trusted-local contributor auth for local-only execution paths

Unattended ingest should be a fourth lane because it is operational automation, not a browser session and not a worker lease holder.

Reusing the portal-admin route would be incorrect because:

- stored browser assertions and cookies are human session material, not durable machine credentials
- `admin_only` implies broad review and corrective powers that an ingest scheduler should not hold
- audit records need a machine principal, not a forged or replayed human admin identity

Reusing worker bootstrap or job tokens would also be incorrect because:

- worker bootstrap only proves permission to claim execution work
- worker job tokens are per-lease artifacts scoped to one claimed job
- offline ingest imports terminal evidence after execution and should not be confused with claim-loop execution authority

## Principal Model

`offline_ingest_operator` is a dedicated non-human principal class with these rules:

- one principal per automation or scheduler environment, not one shared token for every bot
- principal metadata must include a stable `operatorId`, owning system, environment, and rotation version
- the principal may call only the internal offline-ingest route family unless a later scope grants more
- the principal never resolves through contributor RBAC tables as a helper, collaborator, or admin user

The API should treat this as a first-class actor type in audit records:

- `actorType`: `operator`
- `actorId`: stable operator principal id
- `credentialType`: `cloudflare_service_token` or approved workload-identity equivalent
- `credentialVersion`: token identifier, version, or key id when available
- `source`: scheduler or automation system name

## Route Ownership

The machine path should live under `/internal/offline-ingest/*`, not under `/portal/admin/*`.

That split keeps the caller contract explicit:

- `/portal/admin/*` is for human review and owner operations backed by portal Access identity
- `/internal/worker/*` is for execution workers and lease-scoped job tokens
- `/internal/offline-ingest/*` is for ingest-only automation principals

The internal route should reuse the same canonical ingest validation and persistence service as the portal-admin route. The difference is caller identity, audit attribution, and authorization boundary, not a looser ingest payload.

## Credential And Secret Rules

Approved unattended credential shapes:

- a dedicated Cloudflare Access service token for the internal audience
- a workload-identity mechanism that the API maps to the same `offline_ingest_operator` principal and audit fields

Required properties:

- environment-scoped credentials so dev, staging, and production do not share one token
- rotation without code changes
- revocation independent of any human contributor account
- issuance owned by platform or operator-secret management, not by checked-in `.env` files

Explicitly forbidden for unattended ingest:

- human `Cf-Access-Jwt-Assertion` values
- copied browser cookies such as `CF_Authorization`
- `WORKER_BOOTSTRAP_TOKEN`
- worker job tokens
- provider keys such as `CODEX_API_KEY`
- trusted-local auth artifacts such as `CODEX_HOME/auth.json`
- contributor portal session state or stored login recovery material

## Authorization Rules

The operator principal may:

- submit one completed canonical Problem 9 run bundle for ingest
- receive the same accepted, duplicate, validation, and conflict outcomes as the human-admin ingest route
- trigger the same digest recomputation, artifact registration, and idempotency checks as the human-admin path

The operator principal may not:

- approve or reject access requests
- mutate contributor accounts or roles
- claim worker jobs
- submit worker heartbeats, events, or result payloads
- bypass bundle validation, duplicate detection, or artifact requirements
- backfill arbitrary DB state outside the supported offline-ingest service

## Audit And Evidence

Every unattended ingest call should record machine-specific provenance that the human-admin route does not need:

- operator principal id
- environment
- credential identifier or rotation version when available
- request id and source IP or edge trace identifiers
- submitted bundle digests and resulting run, job, and attempt ids
- accepted, duplicate, or rejected outcome with error code

Audit views should make machine-vs-human attribution explicit. A later admin or operator reviewing an imported run must be able to tell whether it came from:

- a human admin portal ingest
- an unattended operator ingest

without inferring that from notes or ad hoc naming.

## CLI And Scheduler Selection

The checked-in offline-ingest CLI should remain explicit about auth mode selection.

Rules:

- the current `--access-jwt` path continues to mean human-admin portal ingest only
- unattended ingest must use a separate explicit auth mode, command, or flag set
- the CLI or scheduler must never infer machine ingest from the presence of `WORKER_BOOTSTRAP_TOKEN`, provider keys, or trusted-local auth files
- mixed or ambiguous auth inputs should fail closed

The intended later UX is one of:

- a separate command for operator ingest
- or an explicit `--auth-mode human_access_jwt|operator_service_token`

Either option is acceptable as long as the machine lane is explicit and human-session material cannot silently downgrade into machine auth.

## Non-Goals

This scope does not:

- change the current MVP human-admin ingest path
- approve unattended ingest on the existing `/portal/admin/offline-ingest/problem9-run-bundles` route
- define a general service-account model for every internal route
- approve reusing worker bootstrap secrets for operator actions
- expand the ingest payload beyond the current canonical Problem 9 run-bundle contract

## Required Follow-On Execution Work

- add an internal offline-ingest endpoint catalog entry and route implementation for `/internal/offline-ingest/problem9-run-bundles`
- implement operator-principal authentication and audit attribution in the API
- add CLI or scheduler support for the explicit operator-ingest auth mode
- add regression coverage that rejects portal cookies, worker bootstrap tokens, worker job tokens, and trusted-local auth for unattended ingest
- document environment-specific issuance, rotation, and revocation for the operator credential
