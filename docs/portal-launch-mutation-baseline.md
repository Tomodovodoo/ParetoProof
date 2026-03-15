# Portal Launch Mutation Baseline

This document defines the next-slice contract for turning a collaborator's portal launch request into durable queued work without collapsing launch, run control, and worker operations into one ambiguous mutation surface.

## Current baseline

- `GET /portal/launch` already exists as the collaborator-visible preflight surface.
- The launch surface is part of the portal benchmark-ops cluster alongside `/runs`, `/runs/:runId`, and `/workers`.
- The current launch read model is intentionally `preflight_only`.
- The canonical run kinds already exist in `packages/shared/src/contracts/run-control.ts`:
  - `single_run`
  - `benchmark_slice`
  - `full_benchmark`
  - `repeated_n`
- The canonical run lifecycle already distinguishes `created` from `queued`:
  - `created` means validation passed far enough for a run record to exist, but queueing is not yet complete.
  - `queued` means the control plane has accepted the run and workers may eventually claim its jobs.
- Workers only become relevant after launch creation has produced durable queued jobs and prepared attempts.

## Decision

### Route ownership

Launch creation belongs to the same portal benchmark-ops route family as launch preflight.

- Read preflight remains `GET /portal/launch`.
- Launch creation should use `POST /portal/launches`.
- The mutation is portal-owned, not admin-only and not part of `/workers`.
- `/workers` remains read-mostly operational posture, not a hidden launch console.

This keeps launch creation aligned with the visible contributor workflow:

1. review benchmark package, model config, and governance on `/launch`
2. submit one launch mutation
3. redirect into `/runs/:runId` once durable work exists

### Allowed caller roles

Launch creation is allowed for:

- `approved_collaborator_or_higher`
- `admin`

Launch creation is not allowed for:

- helpers
- pending identities
- anonymous or branded-auth handoff callers

The route should fail closed with a standard authorization error instead of trying to infer elevated launch authority from other portal or worker credentials.

### Durable objects created by a successful launch

The next slice should not invent a separate first-class `launch_request` table or queue object. A successful launch creates the execution records directly:

1. one run record
2. the required job records for the chosen run kind
3. the prepared attempt records tied to those jobs
4. audit events describing the accepted launch and resulting queue creation

The run record is the durable browser-facing anchor. The browser should redirect to that run's evidence route immediately after success.

Future campaign/template work may add higher-level product objects, but this mutation should not block on that later scope.

## Canonical mutation contract

### Required browser inputs

Every launch request must carry the user-chosen identifiers that matter for reproducibility and governance:

- `benchmarkVersionId`
- `runKind`
- `modelConfigId`

It must also carry the run-kind-specific targeting fields:

- `single_run`: one benchmark item or other approved single target id
- `benchmark_slice`: one explicit slice definition or slice id
- `full_benchmark`: no extra target field beyond the benchmark version
- `repeated_n`: one target id plus `repeatCount`

The request may include an idempotency key and an optional caller note, but it must not be allowed to smuggle hidden worker, lease, or queue-assignment fields.

### Server-resolved values

The control plane may resolve or derive:

- the canonical benchmark package digest and version metadata
- the concrete benchmark item expansion for slice, full-benchmark, or repeated launches
- the concrete model snapshot, auth mode, run mode, and tool profile when those are uniquely implied by the chosen launchable config
- the governance caps and queue fan-out allowed for the chosen run kind

If any of those values are ambiguous, the mutation must reject the request instead of silently picking one.

### Response contract

A successful response should return:

- `runId`
- `runState`
- `queuedJobCount`
- `preparedAttemptCount`
- `redirectTo`
- the canonical resolved benchmark and model identifiers used for persistence

`redirectTo` should point at `/runs/:runId`, because run detail is the canonical evidence owner once launch succeeds.

## Validation and governance gates

The launch mutation must reject before durable creation when any of the following fail:

- caller role is below collaborator
- benchmark version is unknown, unpublished, or not launchable
- requested run kind is not allowed for the selected benchmark target
- requested model config is unknown or not launchable for the current benchmark target
- required run-kind fields are missing or structurally invalid
- repeat count or slice expansion exceeds the allowed launch envelope
- concurrency limits would be exceeded
- budget policy would be exceeded
- the request tries to rely on forbidden hidden fields instead of the approved launch vocabulary

Validation failures are deterministic contract results, not retryable queue failures.

## Synchronous vs asynchronous boundary

### Synchronous in the launch request

Before returning success, the API must:

1. validate the request and authorization
2. expand the chosen run kind into the exact benchmark target set
3. create the run row
4. create the job rows
5. create the prepared attempt rows
6. write the launch audit event(s)
7. advance the run into `queued`

The response should only be sent after the new jobs are durable and claimable.

### Asynchronous after launch success

After the mutation returns success, the following happen asynchronously:

- worker claim selection
- lease issuance
- heartbeats and worker events
- retries and retry backoff
- artifact registration and upload
- terminal result or failure submission

The launch route is not responsible for creating worker leases inline.

## Initial state mapping by run kind

### `single_run`

- one run
- one queued job
- one prepared attempt

### `benchmark_slice`

- one run
- one queued job per expanded slice member
- one prepared attempt per queued job

### `full_benchmark`

- one run
- one queued job per benchmark item in the selected version
- one prepared attempt per queued job

### `repeated_n`

- one run
- one queued job per requested repeat
- one prepared attempt per queued job

The run remains the top-level lineage owner across all of those fan-out patterns.

## Failure handling and atomicity

Launch creation must not leave partially queueable state behind.

- If the system cannot create the complete initial run, job, and attempt set, the mutation should fail without leaving claimable jobs.
- A run row may pass through `created` inside the transaction boundary, but the API should not return success until the run is fully `queued`.
- If a post-validation internal error occurs before queueability is durable, the mutation should return a terminal validation or internal error rather than a half-created launch.

## Audit boundary

Successful launch creation must record audit evidence that answers:

- who launched the run
- which benchmark version and run kind they selected
- which model configuration was resolved
- how many jobs and prepared attempts were created
- which governance rules materially shaped the launch, if any were binding

The audit trail should be attached to the created run so run detail and later admin review can reconstruct why the queued work exists.

## Explicit out-of-scope decisions

This scope does not approve:

- browser launch from `/workers`
- helper-visible launch buttons
- launch mutation on an admin-only route
- immediate worker lease creation inside the browser request
- a generic free-form "run anything" payload
- campaign/template/release objects beyond the direct launch-to-run bridge
- cancel, retry, rerun, or operator intervention for existing runs; that remains separate run-control scope

## Follow-up execution slices

Execution work after this scope should split cleanly into:

1. shared launch request and response schemas plus API route contract
2. backend launch service that validates, expands, persists, and queues work
3. portal launch UI submit flow with invalid-state handling and redirect to run detail
4. audit and regression coverage for accepted launches, rejected launches, and queue fan-out per run kind
