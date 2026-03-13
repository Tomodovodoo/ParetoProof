# Internal Contracts and API Handling Baseline

This document defines the MVP internal contract and API-handling baseline for ParetoProof. It fixes which flows are synchronous versus asynchronous, which surfaces talk to which backend routes, and which state transitions the control plane must preserve between the browser, API, and worker side of the system.

The goal is to keep the control plane narrow. Browser flows should stay human-authenticated and request-response shaped. Worker execution should stay asynchronous and service-authenticated. Offline Problem 9 runs should be ingestible later without pretending they went through the same live worker-lease path.

## Scope of the baseline

This baseline owns:

- the MVP contract boundary between browser, API, and worker execution
- the split between synchronous and asynchronous flows
- the canonical lifecycle states for runs, jobs, and attempts at the contract level
- the route-surface split between portal routes and internal worker routes
- the ingest boundary for offline bundles

This baseline does not own:

- the exact worker message payload schema from issue `#147`
- the exact budget ceilings from issue `#145`
- the final backend storage schema beyond the conceptual state model
- the public UX wording for run states and failures

## Core principles

The MVP contract model follows six hard rules:

- the browser talks only to the API; it never talks directly to workers, provider backends, or artifact storage primitives
- human-authenticated routes and worker-authenticated routes are separate API surfaces even when they live under one hostname
- synchronous routes are for identity, metadata, and operator intent, not for long-running benchmark execution
- asynchronous execution always resolves through durable run, job, and attempt state in the control plane
- offline local execution must be ingestible through the same result boundary without needing to fake worker heartbeats or claims
- contract ownership lives in the API and shared schemas, not in frontend route code or worker-local conventions

## Contract surfaces

The MVP has three contract surfaces and one derived ingest path.

### Human portal surface

The human portal surface is:

- browser to `api.paretoproof.com/portal/*`
- browser to `api.paretoproof.com/admin/*` for admin actions

This surface is:

- human-authenticated through Cloudflare Access plus app authorization
- request-response shaped
- short-lived
- safe for normal interactive UI use

It is the only surface the portal frontend should call directly.

### Internal worker surface

The internal worker surface is:

- worker to `api.paretoproof.com/internal/*`

This surface is:

- service-authenticated
- lease- and token-based
- asynchronous
- not browser-callable

It exists for worker claim, heartbeat, event reporting, artifact coordination, and terminal result submission.

### Shared result boundary

The shared result boundary is the offline run bundle and ingest-critical subset already defined by:

- `problem9-run-bundle-baseline.md`
- `problem9-failure-registration-baseline.md`
- `problem9-reproducibility-baseline.md`

This is not a separate live transport surface. It is the canonical artifact contract that both local/offline and worker-hosted execution must satisfy.

### Offline ingest path

Offline ingest is:

- human- or operator-triggered upload of a completed offline run bundle into the API

This path is asynchronous from the product perspective, but it does not require worker claim or heartbeat semantics. It is effectively "result import," not "live remote execution."

## Synchronous versus asynchronous flows

The MVP should make the split explicit.

### Synchronous flows

Synchronous flows are request-response operations where the caller expects a completed answer in one interactive round trip.

The MVP synchronous set is:

- auth finalize and session introspection
- profile read and update
- access-request submission
- admin review actions for access state
- run-list, run-detail, and artifact-metadata reads once those exist
- launch request creation that returns a queued run record rather than waiting for execution
- offline bundle ingest request acceptance that returns an ingest record rather than waiting for evaluation to finish

The critical rule is that "launch" is synchronous only as an intent-registration call. The browser may create a run, but it must not block until the worker finishes.

### Asynchronous flows

Asynchronous flows are operations whose real work continues after the initiating request returns.

The MVP asynchronous set is:

- run scheduling
- job expansion
- worker claim and lease management
- worker heartbeat
- worker progress and event reporting
- artifact upload coordination
- terminal result submission
- run aggregation and final status derivation
- offline bundle verification and import after the upload is accepted

These flows require durable state, idempotent transitions, and retry-aware handling. They are not UI request-response flows disguised as slow HTTP calls.

## Human portal contract boundary

The browser-facing API should stay narrow and human-oriented.

### Portal responsibilities

The portal surface may:

- authenticate the user and resolve app authorization
- let the user view current identity, access, and run metadata
- let an authorized user create or cancel a run intent
- let an authorized user inspect run, job, and attempt summaries
- let an admin perform approval or revocation actions

### Portal exclusions

The portal surface must not:

- receive worker bootstrap tokens
- receive per-job worker tokens
- call provider APIs directly
- upload large execution artifacts as though it were the worker
- mutate attempt state directly after launch beyond approved control actions such as cancel

The browser owns operator intent. The API owns execution state.

## Internal worker contract boundary

The worker surface must exist only for execution agents that already hold valid machine identity.

### Worker responsibilities

The worker surface may:

- claim work
- receive one assignment plus job-scoped authority
- report progress, phase changes, and heartbeats
- register or upload artifacts through API-coordinated flows
- submit one terminal result or terminal failure for the claimed assignment

### Worker exclusions

The worker surface must not:

- browse or mutate unrelated runs
- submit results for a job it did not claim
- escalate one assignment token into another claim
- impersonate a human portal caller
- define its own state machine separate from the control plane

The worker is an execution client, not the source of truth for run governance.

## Offline ingest contract boundary

Offline ingest needs one clear rule: it imports a completed run artifact set, not a live worker session.

The ingest path may:

- accept a completed bundle that already satisfies the run-bundle contract
- verify digests, reproducibility metadata, failure registration, and verdict structure
- create run, job, and attempt records in a completed or failed terminal state

The ingest path must not require:

- worker claim
- heartbeat
- lease renewal
- synthetic progress events invented after the fact

If optional event logs exist inside the bundle, they may be imported as historical telemetry. They are not required to make the run valid.

## Canonical state objects

The MVP control plane must preserve three related but distinct state objects:

- `run`
- `job`
- `attempt`

The point of the split is:

- a run is the user-visible execution request
- a job is one schedulable work unit inside a run
- an attempt is one concrete execution try for one job

## Run lifecycle

The canonical run states are:

- `draft`
- `queued`
- `running`
- `cancel_requested`
- `completed`
- `failed`
- `cancelled`

### Run transition rules

Allowed run transitions are:

- `draft -> queued`
- `queued -> running`
- `running -> completed`
- `running -> failed`
- `queued -> cancel_requested`
- `running -> cancel_requested`
- `cancel_requested -> cancelled`
- `cancel_requested -> failed`

Interpretation:

- `draft` exists only before a launch request is committed
- `queued` means accepted by the API but not yet fully finished
- `running` means at least one job has entered active execution or ingest processing
- `completed`, `failed`, and `cancelled` are terminal

The portal may request cancellation, but only the control plane may finalize `cancelled` or `failed`.

## Job lifecycle

The canonical job states are:

- `queued`
- `claimed`
- `running`
- `cancel_requested`
- `completed`
- `failed`
- `cancelled`

### Job transition rules

Allowed job transitions are:

- `queued -> claimed`
- `claimed -> running`
- `running -> completed`
- `running -> failed`
- `queued -> cancel_requested`
- `claimed -> cancel_requested`
- `running -> cancel_requested`
- `cancel_requested -> cancelled`
- `cancel_requested -> failed`

Meaning:

- `claimed` means one worker or ingest processor owns the job lease
- `running` means active execution is underway
- terminal job state feeds upward into run aggregation

## Attempt lifecycle

The canonical attempt states are:

- `prepared`
- `active`
- `succeeded`
- `failed`
- `cancelled`

The attempt model stays intentionally compact at the contract layer. The deeper phase machine inside one attempt is already defined in `problem9-agent-loop-baseline.md`.

### Attempt transition rules

Allowed attempt transitions are:

- `prepared -> active`
- `active -> succeeded`
- `active -> failed`
- `active -> cancelled`

Within `active`, the worker may emit detailed phase events such as:

- `generating_initial_candidate`
- `compile_repair`
- `verifier_repair`

Those are event-phase details, not separate top-level attempt states in the API contract.

## Event model

The control plane must treat events as append-only execution facts, not as the primary state store.

The MVP event categories are:

- lifecycle events
  - run queued, job claimed, attempt started, attempt finished
- phase events
  - generate, compile, verify, repair
- governance events
  - heartbeat stale, retry scheduled, cancel requested, cancel forced
- artifact events
  - artifact registered, upload ready, artifact finalized
- evaluation events
  - verdict derived, aggregate status updated, ingest accepted

State is derived from validated transitions plus terminal records. Events provide auditability and progress detail.

## API handling rules

The MVP API should apply these handling rules across all surfaces.

### Idempotency

The API must treat these operations as idempotent or safely deduplicated:

- launch request submission
- worker claim retry after transport uncertainty
- heartbeat retry
- artifact registration retry
- terminal result submission retry
- offline ingest finalize retry

The practical rule is that callers may need to retry after network uncertainty without accidentally creating duplicate runs or duplicate terminal records.

### Ownership of transitions

The caller that requests an action is not automatically allowed to finalize its state:

- the browser may request `cancel_requested`, but the control plane finalizes `cancelled`
- the worker may submit a terminal result, but the API validates and records the terminal state
- offline ingest may submit a bundle, but the API decides whether the imported run becomes `completed` or `failed`

### Validation before persistence

The API must validate contract shape before promoting state:

- browser launch requests must validate authorization and run intent shape
- worker result submission must validate job token scope, artifact references, and result schema
- offline ingest must validate digest and bundle integrity before publishing a terminal verdict

### Separation of summary from detail

The portal-facing read models may expose summaries:

- run status
- attempt counts
- primary failure code
- verdict summary

Detailed traces, worker tokens, and internal diagnostics remain on the internal or privileged side unless an explicit read policy says otherwise.

## MVP flow catalog

The baseline flow set is:

### Flow 1: Human session and access

- browser calls portal auth/session routes
- API validates Access identity and app authorization
- API returns user/access/session summary

This is synchronous.

### Flow 2: Human launch intent

- browser submits launch request
- API validates role and run shape
- API creates `run=queued` plus one or more queued jobs
- API returns run metadata immediately

Execution itself is asynchronous.

### Flow 3: Worker claim and execution

- worker calls internal claim route
- API returns either no work or one claimed job plus scoped authority
- worker executes, heartbeats, and reports append-only events
- worker submits terminal result or terminal failure
- API validates the submission and updates job plus run state

This is asynchronous and internal-only.

### Flow 4: Human cancel request

- browser requests cancellation
- API marks run or job `cancel_requested`
- worker observes cancellation through the internal flow
- API finalizes terminal cancellation or failure

The request is synchronous; completion is asynchronous.

### Flow 5: Offline bundle ingest

- user or operator uploads a completed offline bundle
- API validates bundle integrity and schema
- API creates terminal run/job/attempt records plus imported artifacts
- API returns ingest status and later read-model visibility

This is asynchronous in processing terms, but it does not use worker claim semantics.

## Explicit contract boundary for later implementation

The MVP contract split should be implemented in shared types and route catalogs as:

- human portal route catalog
- admin route catalog
- internal worker route catalog
- offline ingest route catalog
- shared run/job/attempt state enums
- shared event category enums

The important rule is that a later worker contract or frontend hook may extend those catalogs, but it must not redefine which side owns which transition.

## Downstream implications

This baseline constrains later work:

### Issue `#147`

Worker-control contracts should derive claim, heartbeat, artifact, and finalize messages from the run/job/attempt boundary in this document rather than inventing a separate lifecycle.

### Issue `#32`

Evaluation-pipeline work should consume terminal attempt and run records from this contract model rather than depending on raw worker events as its source of truth.

### Portal implementation work

Frontend and API route work should keep launch and cancellation as intent APIs only. They should not expose long-running execution as synchronous browser behavior.

## Out of scope

- transport-level pagination or filtering details
- exact JSON schema fields for each route
- websocket or SSE choices for later progress streaming
- implementation of queueing, leasing, or artifact storage
