# Hosted Worker Credential And Token Baseline

This document defines the hosted worker identity and credential model for ParetoProof.

The goal is to make hosted worker auth explicit enough that later execution work can implement registration, claim, heartbeat, finalize, rotation, and incident response without inventing ad hoc token handling per route or per environment.

## Decision

ParetoProof should use a two-tier hosted worker credential model:

1. a long-lived but rotatable environment-and-pool bootstrap credential used only to prove worker identity at claim time
2. a short-lived lease-scoped job token used only for the active claimed assignment and rotated during heartbeat renewal

The control plane remains the authority for:

- which worker pools exist
- which worker instances are allowed to claim under a pool
- when a bootstrap credential is valid
- when a lease-scoped job token is issued, rotated, expired, or revoked
- what audit and incident evidence must survive rotation or revocation

Hosted workers must never reuse one credential for both "I am an approved worker for this pool" and "I am the active owner of this specific lease." Those are separate authority levels and must stay separate.

## Why the current kernel is not enough

The current repository already establishes the narrow contract:

- `WORKER_BOOTSTRAP_TOKEN` exists as the claim credential
- the claim response returns a short-lived job token
- heartbeats rotate that job token while extending the lease
- only token hashes belong in durable storage for live session-style secrets

What is still missing is the accepted full lifecycle around those primitives:

- what exactly a worker instance is proving when it claims work
- how pool identity and worker identity relate
- when bootstrap credentials rotate
- what revocation means during incidents
- how a lease-bound token expires and why it cannot outlive its lease
- what evidence operators need to keep after rotation

Without that baseline, hosted auth would drift into folklore even if the individual routes continue to pass tests.

## Identity model

Hosted worker identity has three distinct levels:

### 1. Pool identity

A worker pool is the durable control-plane scheduling and governance unit.

Pool identity answers:

- which environment this worker belongs to
- which capability set it is allowed to serve
- which rollout, budget, and incident domain it belongs to
- which bootstrap credential family it is allowed to use

Pool identity is controlled by the API and operator configuration, not by whatever label a worker process claims for itself.

### 2. Worker instance identity

A worker instance is one running runtime participant under a pool.

Each instance should carry these stable identity fields in the control plane:

- `workerId`
- `workerPool`
- `workerRuntime`
- `workerVersion`
- environment label
- first-seen and last-seen timestamps

The instance identity is durable enough for audit and incident reconstruction, even though the underlying Modal container may be short-lived.

Worker identity is therefore not "whatever runtime slot happens to exist right now." It is the API-tracked machine participant that claims work and emits lease-bound activity.

### 3. Lease identity

A lease identity is the narrowest authority boundary.

It binds one worker instance to:

- one run
- one job
- one attempt
- one lease row
- one current job token family

Everything after claim must be validated against that lease identity, not just against the broader worker or pool identity.

## Bootstrap credential model

The bootstrap credential is the worker's claim credential.

Its purpose is narrow:

- authenticate a hosted worker as an approved machine participant
- bind the worker to one environment and one pool posture
- allow `POST /internal/worker/claims`
- return either idle polling guidance or one lease plus a short-lived job token

The bootstrap credential must not authorize:

- heartbeat
- execution event append
- artifact manifest submission
- terminal result submission
- terminal failure submission
- browser or operator routes

That separation already matches the current API call boundary and should remain canonical.

## Bootstrap credential scope

One bootstrap credential family belongs to one pool in one environment.

The credential must not silently span:

- multiple environments
- unrelated worker pools
- browser or admin actors
- offline ingest

The accepted scoping rule is:

- `dev` pool credentials are valid only for `dev`
- `staging` pool credentials are valid only for `staging`
- `prod` pool credentials are valid only for `prod`
- distinct pools get distinct bootstrap credential families even if they share the same image digest

This keeps pool drain, credential rotation, and incident isolation possible without a fleet-wide credential blast radius.

## Bootstrap credential storage posture

Bootstrap credential values are operator-managed hosted secrets.

They may exist:

- in Modal environment secrets for the target pool app
- in local operator-only bootstrap tooling when syncing or rotating secrets

They must not exist:

- in committed repo files
- in browser bundles
- in portal cookies or human sessions
- in control-plane responses after claim succeeds
- in plain-text durable database columns

The control plane may keep enough material to validate a bootstrap credential safely, but the credential value itself should be treated like any other live secret and kept out of durable plain-text storage.

## Claim-time proof requirements

A claim request should only succeed when all of these are true:

- the presented bootstrap credential is valid for the target environment and pool
- the caller's declared `workerPool` matches the credential's allowed pool
- the caller's runtime and capability declaration is compatible with the pool contract
- the worker is not cordoned, revoked, quarantined, or otherwise disallowed from claiming
- the queue has eligible work for that pool and capability set

If any of those checks fail, the API must fail closed rather than minting a lease and expecting later routes to catch the mismatch.

## Job token model

The job token is a lease-bound bearer credential minted by the API after a successful claim.

It exists to authorize exactly one active lease and nothing broader.

Its authority is limited to the routes already defined in the internal worker boundary:

- heartbeat
- event append
- artifact manifest write
- verifier verdict write when applicable
- result finalize
- failure finalize

The token must be validated together with:

- the route `jobId`
- the lease id in the payload
- the attempt id in the payload
- the run id where applicable
- the active lease row state

A valid-looking token that does not match the current lease identity is not sufficient.

## Job token lifetime

The job token lifetime must never outlive the lease lifetime.

The accepted rule is:

- a freshly claimed lease gets one initial job token
- each successful heartbeat rotates the token and moves both token expiry and lease expiry forward together
- if the lease is expired, revoked, cancelled, or terminally finalized, the active job token family becomes invalid immediately

This matches the current kernel behavior where heartbeat renewal rotates the token hash and extends the lease in the same transaction.

## Job token rotation policy

Job tokens rotate on every successful heartbeat renewal.

That means:

- the worker should treat the newest returned token as authoritative immediately
- the previously valid job token should stop being accepted once the renewal commits
- terminal submission should use the latest acknowledged token for the active lease

The system should not maintain a rolling set of multiple simultaneously valid job tokens for the same lease unless a later explicit scope proves that overlap is required and safe. MVP should prefer the simpler fail-closed model of one active token per live lease.

## Job token storage posture

Job tokens follow the same posture as session handles:

- only the live worker process should hold the raw token value
- the control plane should store only a token hash and associated lease metadata
- logs, events, artifacts, and operator read models must never expose the raw token

This is already consistent with the existing `worker_job_leases.jobTokenHash` model and should stay authoritative.

## Revocation rules

### Bootstrap credential revocation

Bootstrap credential revocation is the control used when operators need to stop future claims.

Revoking a bootstrap credential should:

- block new claim requests using that credential family
- be attributable to one environment and one pool scope
- record operator-visible incident evidence

Revoking a bootstrap credential does not automatically prove that already leased work has stopped. Existing leases are a separate control-plane state that may also need drain, cancellation, or explicit lease revocation.

### Job token revocation

Job token revocation happens whenever the underlying lease is no longer authoritative.

That includes:

- lease expiry
- lease recovery after missed heartbeat
- explicit cancel or drain actions that invalidate the lease
- successful terminal result submission
- successful terminal failure submission
- detected auth mismatch or race during renewal

The control plane should treat job-token revocation as a consequence of lease invalidation, not as a separate manual concept in normal operation.

## Rotation ceremonies

### Bootstrap rotation

Bootstrap rotation is an operator ceremony, not a worker self-service action.

The accepted bootstrap rotation sequence is:

1. create a replacement bootstrap credential for the target pool and environment
2. distribute it only to the intended Modal app secret boundary
3. update claim validation so the new credential is accepted
4. restart or recycle workers onto the new credential family
5. revoke the old credential after the replacement has taken effect
6. record rotation evidence in operator-facing audit surfaces

Later execution may allow a narrow overlap window for old and new bootstrap credentials during rollout, but that overlap must be explicit, time-bounded, and attributable.

### Job-token rotation

Job-token rotation is automatic and lease-driven.

The worker does not request an arbitrary new token; it receives one only as part of a successful heartbeat renewal for the still-active lease.

This keeps token rotation tied to liveness and ownership instead of turning it into a second independent protocol.

## Expiry policy

Expiry should be fail-closed and tied to real control-plane time, not worker-local assumptions.

The accepted expiry rules are:

- bootstrap credentials are long-lived enough for normal worker operation but must still be explicitly rotatable and revocable
- job tokens are short-lived and bounded by the heartbeat timeout window
- a job token expiring or losing its lease means the worker must stop mutating state until it claims fresh work through the bootstrap credential path

Workers must not silently continue using cached job tokens after the API reports `expired` or `cancel_requested`.

## Audit and evidence requirements

Operators need enough durable evidence to explain:

- which bootstrap credential family was active for a pool at the time of a claim
- which worker instance claimed a lease
- when job-token rotation occurred
- when a lease was revoked or expired
- whether a terminal finalize revoked the lease cleanly
- which rotation or revocation actions were operator-driven versus automatic

The evidence must preserve identity and timing without storing raw secrets.

That means retaining:

- worker identity fields
- pool and environment identity
- lease ids
- token-hash-backed lease history and expiry timestamps
- revocation timestamps and reasons
- operator rotation or incident records

It explicitly does not mean retaining raw bootstrap or job token values.

## Failure posture

Hosted auth should fail closed on these conditions:

- bootstrap credential valid but wrong pool declaration
- claimed `workerId` drift that violates the accepted worker registration model
- expired or revoked bootstrap credential
- expired or revoked job token
- job token presented for the wrong `jobId`, `attemptId`, `leaseId`, or `runId`
- heartbeat renewal race where the lease was already revoked or recovered
- worker continuing with a stale token after a successful rotation returned a newer token

In these cases the worker should stop mutating control-plane state and either re-enter claim flow or exit, depending on the error class.

## Relationship to other scopes

This credential baseline depends on but does not replace the surrounding hosted-worker scopes:

- `#917` fixes where credentials live in Modal topology terms: workspace, environment, and per-pool app boundaries
- `#919` will define which provider credentials hosted workers may also hold
- `#920` will define rollout and release evidence for image and secret promotion
- `#922` will define the full lifecycle and recovery state machine around worker registration, heartbeat, drain, and lease loss
- `#924` and `#925` will define the operator-facing observability and runbook posture for credential incidents and rotations

## Consequences for follow-up execution

This baseline should drive the implementation issues in concrete ways:

- `#911` should inject environment-and-pool-scoped bootstrap credentials plus provider secrets into the hosted Modal apps without widening them into browser or human auth material
- `#931` should register workers and enforce pool identity in a way that makes bootstrap proof more than just possession of one global token
- `#933` should implement the bootstrap-token issuance, replacement, and revocation workflow plus durable rotation evidence
- `#942` should add regression coverage for secret redaction, scope enforcement, and stale-token rejection

## Out of scope

This scope does not:

- implement the storage tables or rotation jobs for bootstrap credentials
- define provider-family-specific secret payloads
- redefine browser auth, portal sessions, or offline-ingest auth
- define the full worker registration schema or operator UI

It defines the credential and token contract the hosted worker implementation must honor.
