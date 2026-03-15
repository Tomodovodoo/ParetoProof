# Portal Run-Control Actions Baseline

This document defines the next-slice browser mutation boundary for existing runs so the portal can expose one coherent control surface without collapsing launch, recovery, worker operations, and admin intervention into the same ambiguous set of buttons.

## Current baseline

- `docs/portal-launch-mutation-baseline.md` already fixes launch creation at `POST /portal/launches` and makes `/runs/:runId` the canonical evidence route after launch success.
- `packages/shared/src/contracts/run-control.ts` already defines the canonical run lifecycle:
  - `created`
  - `queued`
  - `running`
  - `cancel_requested`
  - `succeeded`
  - `failed`
  - `cancelled`
- `packages/shared/src/contracts/run-governance.ts` already defines retry, cancellation grace, forced-cancel timing, and budget ceilings.
- `packages/shared/src/contracts/portal-navigation.ts` already keeps `/workers` read-mostly benchmark-ops posture rather than a generic admin console.
- `packages/shared/src/contracts/audit-event-catalog.ts` already reserves portal-user `run.cancel_requested` and internal-service `run.cancelled` audit events.
- There is no accepted portal mutation contract yet for cancel, retry, rerun, or operator recovery on an existing run.

## Decision

### Browser-exposed next-slice action set

The next slice should expose exactly one run-control browser mutation:

- `request_cancel`

The next slice should not expose browser mutations for:

- `rerun_run`
- `retry_run`
- `retry_job`
- `requeue_job`
- `force_cancel`
- worker lease reset or reassignment
- any generic operator intervention

This keeps the portal mutation boundary aligned with the accepted launch baseline:

1. `/launch` creates new work
2. `/runs/:runId` inspects existing work
3. `/runs/:runId` may request stop for still-live work
4. retry, rerun, and infra-recovery stay out of the browser until their lineage and governance semantics are scoped explicitly

### Route ownership

Browser run control belongs to the run-detail route family, not the workers view and not the runs index.

- The owning route is `/runs/:runId`.
- The API mutation route should be `POST /portal/runs/:runId/cancel-requests`.
- `/runs` may surface availability hints or deep links, but it should not own a bulk mutation form in the next slice.
- `/workers` remains read-mostly posture and incident visibility. It must not become a hidden operator console for run mutation.
- No separate admin-only browser route is needed for this next slice.

### Allowed caller roles

`request_cancel` is allowed for:

- the run launcher, if that caller still holds `approved_collaborator_or_higher`
- `admin`, regardless of launch ownership

`request_cancel` is not allowed for:

- helpers
- pending or anonymous callers
- collaborators cancelling another contributor's run
- worker credentials, internal-service credentials, or offline-ingest credentials presented through portal routes

The control plane should fail closed on ownership or role mismatch instead of inferring broader authority from benchmark-ops visibility alone.

## Canonical browser action contract

### Action id and intent

The shared action vocabulary for the next slice should reserve:

- approved now: `request_cancel`
- reserved for later scope: `rerun_run`, `retry_run`, `retry_job`, `requeue_job`, `force_cancel`

`request_cancel` means "record user intent to stop this run as soon as governance and current execution state allow." It does not promise immediate worker termination.

### Required request fields

`POST /portal/runs/:runId/cancel-requests` should require:

- `reason`: short human rationale string
- optional idempotency key

The request must not accept hidden worker ids, lease ids, retry counters, or direct target-state overrides.

### Confirmation requirements

The portal must require an explicit confirmation step before submit.

The confirmation surface should restate:

- run id
- benchmark label or benchmark item label
- current run state
- model config label
- that queued work may stop immediately but running work may remain active until the worker or control plane finalizes cancellation

### Rationale requirements

A rationale is required for every browser cancellation request.

The reason should be treated as operator-readable audit metadata, not optional decorative text, because the portal is requesting a privileged control-plane mutation against shared execution capacity.

## State mapping and suppression rules

### States where the action is available

`request_cancel` is available only when the run is still live enough for stop intent to matter:

- `created`
- `queued`
- `running`

### States where the action must be suppressed

The portal must suppress the action when the run is already terminal or already processing a stop request:

- `cancel_requested`
- `succeeded`
- `failed`
- `cancelled`

The portal must also suppress the action when:

- the current user is below collaborator
- the current user is not the run launcher and not an admin
- the run detail payload indicates the run is already locked by a more specific backend-only recovery flow

The API must still reject invalid requests even if the UI incorrectly shows the control.

### Server-side state behavior after acceptance

When `request_cancel` succeeds:

- `created` may transition directly to `cancelled` because no worker-facing shutdown handshake is needed yet
- `queued` should transition to `cancel_requested` or directly to `cancelled` if the queue entry can be removed synchronously without race
- `running` should transition to `cancel_requested`

The browser-facing action vocabulary stays `request_cancel` in all of those cases. The server remains responsible for the exact lifecycle transition that fits the current control-plane state.

## Audit and evidence boundary

A successful browser cancellation request must produce durable evidence for:

- actor user id
- target run id
- submitted rationale
- prior run state
- accepted-at timestamp
- whether the run moved directly to `cancelled` or first entered `cancel_requested`

The next slice should reuse the existing audit event split:

- portal-user event: `run.cancel_requested`
- internal-service finalization event: `run.cancelled`

Run detail should surface the accepted cancellation request in timeline evidence so later reviewers can distinguish "user asked to stop" from "backend finished stopping."

## Lineage rules for later actions

This scope does not approve browser retry or rerun, but it does fix how lineage must behave when those actions are later introduced.

### Retry and requeue lineage

Retry and requeue are same-run lineage operations.

If a later scope approves them:

- the run keeps the same `runId`
- new jobs and attempts append under that existing run lineage
- run detail should surface the new job and attempt ids in the existing lineage summary
- the timeline should show who triggered the retry or requeue and why

Retry and requeue must not silently create a brand-new run that looks unrelated to the original failure.

### Rerun lineage

Rerun is a new-run lineage operation.

If a later scope approves rerun:

- the rerun must create a new `runId`
- the new run must record a durable link back to the source run
- the source run detail and rerun detail should both expose that relationship so users can tell the difference between "same run got another attempt" and "new run was launched from an older run"

Rerun must not be treated as a disguised retry.

## Explicit out-of-browser scope

The next slice keeps these actions outside portal browser ownership:

- retry after transient worker or provider failure
- retry of one failed job inside a larger run
- requeue after lease expiry or infra recovery
- force-cancel after stuck shutdown
- worker lease repair, reassignment, or heartbeat overrides
- benchmark-operator mass actions across many runs

Those remain backend- or future-operator actions because they mutate scheduler, retry-budget, and lineage state in ways the current browser contracts do not yet explain safely.

If a later product slice needs those actions, they should be scoped explicitly first rather than piggybacking onto `/workers` or ad hoc run-detail buttons.

## Follow-up execution slices

Execution work after this scope should split into:

1. shared request and response schemas for `POST /portal/runs/:runId/cancel-requests`
2. backend ownership, state-validation, and audit handling for accepted or rejected cancel requests
3. run-detail UI control, confirmation dialog, rationale field, and invalid-state handling
4. read-model additions that expose cancel availability, launcher ownership, and accepted cancellation evidence
5. later separate scope and execution work for retry, rerun, requeue, and operator-only interventions
