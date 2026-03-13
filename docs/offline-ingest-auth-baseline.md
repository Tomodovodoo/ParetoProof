# Offline Ingest Auth Baseline

This document defines the authentication model for offline Problem 9 run-bundle ingest in the ParetoProof MVP.

The goal is to unblock `ingest-problem9-run-bundle` without introducing a second privileged auth lane before the existing portal-admin ingest surface is fully exercised.

## Scope of the baseline

This baseline owns:

- the approved auth identity for `offline_ingest`
- the credential shape that a local ingest CLI may present to the API
- the boundary between human-operated ingest and later unattended automation
- the rules that keep offline ingest separate from worker and trusted-local execution auth

This baseline does not own:

- implementation of the worker CLI ingest command
- implementation of a new API route
- general service-account policy for the whole product
- broader portal auth redesign

## Core decision

The MVP offline-ingest auth model is:

- a human-approved portal admin identity
- authenticated through Cloudflare Access for the portal audience
- presented to the API as an explicit `Cf-Access-Jwt-Assertion` request header
- authorized by the existing backend `admin_only` guard on `POST /portal/admin/offline-ingest/problem9-run-bundles`

In other words:

- the MVP CLI ingests through the existing portal-admin route
- the caller must be an approved admin in ParetoProof's RBAC data
- the CLI must use an explicit short-lived admin Access assertion
- unattended machine-only ingest is deferred until a later dedicated operator auth surface is scoped

## Why this is the MVP choice

This choice follows four constraints that already exist in the repository:

- the live ingest route already exists and is guarded by `admin_only`
- offline ingest imports terminal benchmark results and should stay under the same high-trust review boundary as other admin actions
- worker bootstrap auth and internal service auth are scoped to claimed execution, not to retroactive result import
- trusted local Codex auth is approved only for local model execution, not for control-plane mutation

Adding a second privileged auth lane now would expand risk in exactly the area that is still being tightened elsewhere: who may publish terminal benchmark results into the system. The simpler and safer MVP rule is to keep ingest on the current human-admin boundary until unattended operator workflows are real enough to justify a narrower dedicated credential model.

## Approved auth contract for MVP ingest

### Caller identity

The caller must be:

- a real Cloudflare Access user identity
- mapped to a ParetoProof user record
- currently approved with the `admin` role

Pending, denied, helper, collaborator, worker-service, or anonymous identities are not allowed to ingest offline bundles.

### Credential artifact

The approved credential artifact is:

- one short-lived Cloudflare Access JWT assertion for the portal audience

The ingest CLI should accept that assertion as an explicit operator-supplied input and forward it as:

- `Cf-Access-Jwt-Assertion: <token>`

The exact CLI flag or env-var names are implementation details for the follow-up execution issue. The auth artifact itself is fixed by this baseline.

### API surface

The authoritative MVP ingest endpoint remains:

- `POST /portal/admin/offline-ingest/problem9-run-bundles`

The API must continue to:

- verify the assertion against the portal Access audience
- resolve the subject into the existing RBAC context
- require the `admin` role before any ingest persistence happens

This baseline does not approve a parallel `/internal/*` or service-token ingest route for MVP.

## Local operator workflow boundary

The approved local operator flow is:

1. an approved admin obtains a fresh portal-audience Access assertion outside the worker runtime
2. the ingest CLI validates the local run bundle before network submission
3. the CLI sends the bundle payload to the existing admin ingest route with the explicit Access assertion header
4. the API authorizes the admin identity and then performs the normal ingest validation and persistence flow

The important boundary is that the CLI carries a control-plane credential, not a model-provider credential and not a worker credential.

## Automation boundary

MVP offline ingest is approved for:

- human-operated local CLI usage
- human-attended scripts that explicitly receive a fresh admin Access assertion for that run

MVP offline ingest is not approved for:

- unattended cron or scheduled jobs
- hosted worker runtimes
- machine-only automation that has no human admin identity behind it
- reuse of internal worker service credentials to call the portal-admin route

Later unattended automation must not be hacked onto the portal-admin route by stretching the meaning of admin identity. It requires a separate scope and follow-up implementation that defines:

- a dedicated operator or machine identity
- a narrow ingest-only authorization boundary
- a non-portal route surface or equally explicit service-auth contract
- secret-handling and rotation rules appropriate for unattended use

## Forbidden auth paths

Offline ingest must not use any of the following as its primary credential:

- `WORKER_BOOTSTRAP_TOKEN`
- per-job worker lease or heartbeat tokens
- Cloudflare internal service tokens for `/internal/*`
- `CODEX_API_KEY` or any provider API key
- trusted-local `CODEX_HOME/auth.json`
- copied browser cookie jars or ambient portal session cookies as the CLI contract

Two distinctions matter here:

- provider auth proves model access, not authority to mutate ParetoProof control-plane state
- trusted-local user auth proves local model execution rights, not authority to import benchmark results

## Secret-handling expectations

The ingest assertion is an operator credential and should be treated as short-lived runtime input.

The follow-up CLI and documentation work should assume:

- the assertion is provided explicitly at runtime
- the assertion is never committed to the repository
- the assertion is never stored in benchmark fixtures or run-bundle artifacts
- the CLI fails clearly when the assertion is missing or rejected
- the CLI does not silently fall back to another auth mode

Because the assertion is short-lived and human-bound, it should not become a long-lived repo-wide automation secret.

## Downstream implications

### Issue `#487`

`ingest-problem9-run-bundle` should:

- target the existing admin ingest route
- require an explicit portal-audience Access assertion input
- emit `401` or `403` failures as auth/setup errors for the operator
- reject attempts to use worker or provider auth in its place

### API surface

No new ingest route is required for the MVP CLI. The current admin route is the approved target. If later automation needs machine identity, that should land in a new issue instead of mutating this baseline silently.

### Operator documentation

The worker/operator docs should describe offline ingest as an admin-only control-plane import command, not as a normal worker runtime path and not as a hosted worker capability.

## Follow-up issues this scope should unlock

- implement `ingest-problem9-run-bundle` against the existing admin ingest route with explicit Access assertion input
- document the operator-side runtime input and failure behavior for the ingest assertion
- open a later scope issue for unattended operator or machine-auth ingest if scheduled automation becomes a real requirement

## Out of scope

- exact CLI flag naming
- browser UX for acquiring the admin assertion
- service-account policy for other API surfaces
- future unattended ingest route design
