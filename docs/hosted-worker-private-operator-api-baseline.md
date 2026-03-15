# Hosted Worker Private Operator API Baseline

This document defines the authenticated private API surface that powers hosted worker and run-operations views in the portal and later operator tools.

It exists so worker operations stop depending on fixture-shaped data and instead target one explicit, Neon-backed contract with clear authorization, freshness, and mutation boundaries.

## Current baseline

- `packages/shared/src/schemas/portal-benchmark-ops.ts` already defines a thin `/portal/workers` read model for queue summary, worker pools, active leases, and incident summaries.
- `apps/api/src/lib/portal-benchmark-ops.ts` currently serves that data from the existing run, lease, and event tables, but it is intentionally shallow and fixture-friendly.
- `packages/shared/src/schemas/worker-control.ts` already defines the worker-to-control-plane contract for claims, heartbeats, events, artifact manifests, and terminal result submission.
- Parent scope issue `#916` is still broader than this document. This document fixes only the browser- and operator-facing private API boundary.
- Public reporting is explicitly separate. It belongs to issue `#946`, not this scope.

## Decision

The hosted worker private API should be a portal-authenticated route family under `/portal/worker-ops/*` plus one compatibility overview route at `/portal/workers`.

The API is private in the product sense:

- it is authenticated with the normal portal Access identity path
- it is safe for the portal and future operator tooling
- it is not a service-auth internal API
- it is not a public reporting API

The API should be read-model first and mutation explicit:

- every read endpoint returns a pollable, side-effect-free snapshot backed by Neon-owned state
- every dangerous action is a dedicated mutation route that records durable operator intent and audit evidence
- no read route may quietly reach out to Modal, provider backends, or mutable worker hosts to "fill in" missing data at request time

## Namespace and route ownership

### Read routes

The approved private read namespace is:

- `GET /portal/workers`
  - compatibility overview route for the existing portal worker surface
- `GET /portal/worker-ops/overview`
  - same logical data as `/portal/workers`, but owned by the private operator API family
- `GET /portal/worker-ops/pools`
- `GET /portal/worker-ops/pools/:workerPool`
- `GET /portal/worker-ops/workers`
- `GET /portal/worker-ops/workers/:workerId`
- `GET /portal/worker-ops/incidents`
- `GET /portal/worker-ops/incidents/:incidentId`
- `GET /portal/worker-ops/rollouts`
- `GET /portal/worker-ops/rollouts/:rolloutId`
- `GET /portal/worker-ops/runs/:runId`
- `GET /portal/worker-ops/leases/:leaseId`

The overview route is intentionally small. Detail routes own drill-down data.

The API should not overload `/portal/runs/:runId` with operator-only worker data just because it already exists. Contributor run detail and operator run-ops detail are related but distinct read models.

### Mutation routes

This scope approves the mutation boundary pattern, not every detailed control semantic. Side-effectful worker and run-ops actions must live on explicit `POST .../requests` routes under `/portal/worker-ops/*`.

Approved mutation families:

- pool lifecycle requests
- worker lifecycle requests
- run recovery requests
- lease recovery requests
- incident acknowledgement and resolution requests
- rollout progression and rollback requests

Representative route pattern:

- `POST /portal/worker-ops/pools/:workerPool/cordon-requests`
- `POST /portal/worker-ops/pools/:workerPool/drain-requests`
- `POST /portal/worker-ops/workers/:workerId/drain-requests`
- `POST /portal/worker-ops/runs/:runId/requeue-requests`
- `POST /portal/worker-ops/leases/:leaseId/abandon-requests`
- `POST /portal/worker-ops/incidents/:incidentId/acknowledgements`
- `POST /portal/worker-ops/rollouts/:rolloutId/rollback-requests`

Detailed state-machine semantics for drain, requeue, abandon, and rollback stay owned by the dedicated lifecycle, rollout, and operator-control scopes. This scope only fixes that those actions are explicit mutations, never hidden query flags or overloaded PATCH blobs.

## Authorization boundary

### Read access

Private worker-ops read routes are allowed for:

- `approved_collaborator_or_higher` for sanitized operational reads
- `admin_only` for full-detail operational reads

Private worker-ops read routes are not allowed for:

- helpers
- pending contributors
- anonymous callers
- worker credentials
- internal service credentials presented through browser-authenticated routes

### Mutation access

Private worker-ops mutation routes are `admin_only` in the current role model.

This repo does not yet have a separate operator role. Until that changes, collaborator access is read-only and admin access owns worker-ops mutation authority.

### Field-level exposure

Read authorization is not just endpoint-level. Some fields are collaborator-visible, and some are admin-only.

Collaborator-visible fields:

- queue depth and backlog posture
- worker pool ids, runtime, desired image or version labels, and fleet health summaries
- worker ids and current lifecycle posture
- run ids, job ids, attempt ids, benchmark labels, model config labels, and canonical lifecycle state
- incident summaries, severity, affected scope, and sanitized remediation status
- rollout status, target version labels, blocked pools, and operator-visible release posture

Admin-only fields:

- acknowledgement actor ids and exact remediation audit trail
- internal incident notes and suppressed internal-only classifications
- lease ids when an action targets that exact lease
- rollback eligibility rationale, blocked gate reason, and detailed rollout step history
- internal diagnostic artifact references that are not public-safe or collaborator-safe

Never expose through the private operator API:

- bootstrap tokens, provider secrets, API keys, token hashes, or secret values
- raw env var maps or mounted path details
- unredacted logs, traces, or support bundles that have not passed the artifact and redaction policy
- hidden infrastructure addresses whose only purpose is secret or network posture debugging
- opaque DB internals that are only implementation details and not stable product contract

## Freshness contract

Every private worker-ops read response should carry the same freshness envelope:

- `generatedAt`
- `observedThrough`
- `freshnessStatus`
  - `live`
  - `stale`
  - `degraded`
- `staleAfterSeconds`
- `recommendedPollAfterSeconds`
- `degradationReason`
  - nullable

Definitions:

- `generatedAt` is when the API assembled the response
- `observedThrough` is the newest timestamp in the read model that the API considers authoritative for this response
- `live` means the data is recent enough for normal operator use
- `stale` means the read model is still usable but old enough that the UI must show a stale-state banner
- `degraded` means the route is serving a partial or impaired snapshot and the UI must show an explicit warning state

Freshness is owned by the control plane, not inferred by the frontend from arbitrary timestamps.

The API must not fake freshness by stamping `generatedAt` on old data without also surfacing `observedThrough` and the status classification.

## Read-model datasets

### 1. Overview snapshot

`GET /portal/workers` and `GET /portal/worker-ops/overview` should return:

- queue summary
- fleet summary
- pool summary rows
- active incident summary rows
- active rollout summary rows
- a bounded list of the most urgent stale leases or blocked runs

This route is for landing-page triage, not full drill-down.

### 2. Pool list and pool detail

`GET /portal/worker-ops/pools` returns one row per pool with:

- `workerPool`
- runtime
- desired worker version or image label
- desired capacity and active capacity
- cordoned or draining posture
- queued work counts
- stale lease counts
- active incident counts by severity
- current rollout status summary

`GET /portal/worker-ops/pools/:workerPool` adds:

- bounded worker instance list
- rollout detail for that pool
- active incident list scoped to the pool
- queue pressure breakdown for the pool's assigned partitions
- recent failure clusters
- linked active runs or bounded run samples

### 3. Worker list and worker detail

`GET /portal/worker-ops/workers` is a filterable worker instance list.

Each row should include:

- `workerId`
- `workerPool`
- runtime
- current lifecycle status
- worker version or image digest label
- registered-at and last-heartbeat-at
- current lease presence
- current run or attempt link when active
- stale or healthy classification

`GET /portal/worker-ops/workers/:workerId` adds:

- current and recent lease history
- recent execution-event summary strip
- incident involvement
- rollout membership
- drain or cordon posture
- cleanup or residue status when that becomes available from later scopes

### 4. Incident list and incident detail

`GET /portal/worker-ops/incidents` is the canonical incident index.

Each incident row should include:

- `incidentId`
- incident kind
- severity
- state such as `open`, `acknowledged`, `mitigated`, or `closed`
- observed window
- affected scope summary
- linked pool ids, worker ids, run ids, or lease ids as appropriate
- collaborator-safe summary text

`GET /portal/worker-ops/incidents/:incidentId` adds:

- detection evidence summary
- impacted runs and leases
- acknowledgement history
- mitigation history
- admin-only notes and internal-only classification detail

### 5. Rollout list and rollout detail

`GET /portal/worker-ops/rollouts` returns:

- rollout id
- target worker image or version label
- target pools
- current status
- started-at and updated-at
- gate status summary
- rollback availability summary

`GET /portal/worker-ops/rollouts/:rolloutId` adds:

- per-pool rollout state
- promotion or block reason
- canary progress
- failure gate evidence summary
- rollback eligibility and prior rollback attempts

### 6. Run-ops and lease detail

`GET /portal/worker-ops/runs/:runId` is the operator-focused execution detail for one run.

It should include:

- canonical run summary
- current queue or execution placement
- linked leases, workers, and incidents
- recovery eligibility summary
- bounded event timeline focused on operator-relevant transitions
- artifact and evidence summary pointers, not raw blob payloads

`GET /portal/worker-ops/leases/:leaseId` is the narrow recovery target view for one lease.

It should include:

- linked run, job, and attempt ids
- worker assignment and heartbeat posture
- current status such as `active`, `cancel_requested`, `expired`, `revoked`, or `abandoned`
- last acknowledged event sequence
- lease-expiry and heartbeat windows
- incident links and recovery eligibility flags

## Data-shape rules

The private operator API should use stable product ids and labels rather than leaking raw table joins as the contract.

Required shape rules:

- timestamps are ISO strings
- ids are durable string ids already used by the rest of the product
- lifecycle and severity fields use shared enumerated vocabularies where they already exist
- every list endpoint returns bounded rows plus explicit summary metadata, not hidden pagination by omission
- nullable fields mean "not available in this state," not "frontend should guess another endpoint"

When a detail route needs nested lists, those nested lists must still be bounded and intentionally shaped. A detail route is not permission to dump raw event or log rows without contract.

## Read-model sourcing rules

Private operator reads are Neon-owned and derived from durable control-plane state.

That means:

- worker registration, lease, event, artifact, incident, and rollout records must exist in Neon-backed tables or materialized read models before the API claims them as authoritative
- the API may enrich from existing shared catalogs or release metadata already in the control plane
- the API must not depend on live Modal RPC or provider API calls in the request path
- when upstream freshness lags, the API should mark the snapshot `stale` or `degraded` instead of silently synthesizing missing state

This is a control-plane API, not a thin proxy to worker runtimes.

## Mutation contract rules

Every private operator mutation should follow one consistent pattern:

- target resource in the path
- action-specific request body with human rationale or note when the action is dangerous
- durable audit record
- accepted response with:
  - request id
  - accepted-at timestamp
  - actor summary
  - target summary
  - resulting requested state, not guessed final state

Mutation responses should confirm what intent was recorded, not pretend that a distributed fleet action is already complete unless the backend can prove it synchronously.

Examples:

- a drain request may return `requestedState: draining`
- a requeue request may return `requestedState: requeue_pending`
- an incident acknowledgement may return `requestedState: acknowledged`

## Separation from public reporting

This private API is not the source for apex-site public reporting.

It may include:

- internal incident posture
- unreleased execution evidence
- collaborator-safe but non-public queue and failure information
- run or lease detail that is too operational for the public site

Issue `#946` owns the public API and redaction boundary for released hosted-execution datasets. That public surface must consume a separate explicitly public contract rather than inheriting this one by subtraction.

## Explicit non-goals

This scope does not:

- define the Neon table layout in detail; issue `#947` owns that
- define frontend stale-state UX copy or polling heuristics beyond the backend freshness envelope; issue `#948` owns that
- define the full operator control state machine; issues `#920`, `#922`, and `#939` own those semantics
- define public reporting payloads; issue `#946` owns that
- approve raw log streaming or ad hoc SQL-backed debug endpoints

## Follow-up execution slices

Execution after this scope should split into:

1. shared schemas and contracts for the private operator route family
2. backend read endpoints backed by Neon worker, incident, rollout, and run-ops models
3. backend authorization and field-redaction coverage for collaborator versus admin access
4. portal worker overview wiring to the private overview route
5. portal drill-down panels for pool, worker, incident, rollout, run, and lease detail
6. later explicit mutation endpoints for drain, cordon, requeue, abandon, acknowledge, clear, and rollback actions

Issue alignment:

- `#949` implements the private operator read routes and shared mutation envelopes
- `#953` consumes the overview and live freshness contract
- `#954` consumes the detail routes
- `#956` should centralize the shared freshness and cache semantics across private and public data paths
