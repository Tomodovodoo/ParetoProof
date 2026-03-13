# Run-State Vocabulary Baseline

This document defines the canonical lifecycle-state vocabulary for runs, jobs, and attempts across shared contracts, backend read models, frontend filters, and exports.

The goal is to stop three different concepts from drifting into one overloaded "status" field:

- control-plane lifecycle state
- benchmark verdict or result
- failure reason or derived operational bucket

## Core decision

ParetoProof must keep lifecycle state separate from verdict and failure classification.

That means:

- `run`, `job`, and `attempt` records use one canonical snake_case lifecycle enum each
- benchmark outcome stays in verdict fields such as `pass`, `fail`, and `invalid_result`
- timeout, stalled, retryable, or superseded views are derived filter buckets, not stored primary lifecycle states
- the canonical spelling is `cancelled`, never `canceled`

## Scope of this baseline

This baseline owns:

- canonical stored enum values for `run`, `job`, and `attempt`
- canonical user-facing labels for those enum values
- export and API serialization rules
- derived grouping buckets that frontend filters may expose without inventing new primary states
- mapping rules between bundle status, verdict status, and control-plane lifecycle state

This baseline does not own:

- benchmark pass or fail semantics
- worker event kinds or failure-code catalogs
- public reporting badges for released benchmark results
- database implementation details

## Vocabulary separation rules

The repository must use four separate status families.

### 1. Control-plane lifecycle state

This is the progress state of a run, job, or attempt in the API and shared contracts.

Examples:

- `queued`
- `running`
- `cancel_requested`
- `failed`

### 2. Benchmark verdict

This is the mathematical or evaluation outcome of an attempt or imported result package.

Examples:

- `pass`
- `fail`
- `invalid_result`

These are not run lifecycle states.

### 3. Failure code or failure family

This explains why a failed or invalid result happened.

Examples:

- `compile_failed`
- `provider_timeout`
- `bundle_schema_unsupported`

These are not lifecycle states and must not be reused as UI status values.

### 4. Derived filter or display bucket

This is a frontend or export grouping built from canonical state plus other facts.

Examples:

- `active`
- `terminal`
- `timed_out_failure`
- `awaiting_cancellation`

These buckets are allowed only as derived labels. They must not replace the stored primary enum.

## Canonical lifecycle enums

The stored and serialized values below are authoritative.

### Run lifecycle state

`run.state` must use exactly:

- `created`
- `queued`
- `running`
- `cancel_requested`
- `succeeded`
- `failed`
- `cancelled`

Meanings:

- `created`
  - the run record exists, but queue handoff is not complete
- `queued`
  - accepted and waiting for execution capacity or ingest processing
- `running`
  - at least one job is actively executing or being processed
- `cancel_requested`
  - an authorized actor requested stop, but the control plane has not finalized it yet
- `succeeded`
  - the control plane completed the run normally and produced a final result set
- `failed`
  - the control plane ended the run with a terminal failure
- `cancelled`
  - the run ended intentionally by cancellation

### Job lifecycle state

`job.state` must use exactly:

- `queued`
- `claimed`
- `running`
- `cancel_requested`
- `completed`
- `failed`
- `cancelled`

Meanings:

- `queued`
  - ready for a worker or ingest processor
- `claimed`
  - leased to one worker or processor, but active execution has not fully started
- `running`
  - active execution or processing is underway
- `cancel_requested`
  - cancellation was requested but not finalized
- `completed`
  - the job reached a normal terminal completion and produced its terminal result payload
- `failed`
  - the job reached a terminal failure
- `cancelled`
  - the job was intentionally stopped

### Attempt lifecycle state

`attempt.state` must use exactly:

- `prepared`
- `active`
- `succeeded`
- `failed`
- `cancelled`

Meanings:

- `prepared`
  - attempt identity and inputs are allocated, but execution has not fully started
- `active`
  - execution is live inside the attempt phase machine
- `succeeded`
  - the attempt completed with a valid terminal success payload
- `failed`
  - the attempt completed with a terminal failure or invalid-result outcome
- `cancelled`
  - the attempt was intentionally stopped

## Spelling and casing rules

Canonical storage and transport rules are strict:

- use lowercase snake_case ids in code, APIs, JSON, database enums, and CSV export value columns
- use `cancelled`, never `canceled`
- use `cancel_requested`, never `cancelling` or `canceling` as the stored value
- use `succeeded`, never `success` as a run or attempt lifecycle state
- use `completed` only for jobs, not for runs or attempts

User-facing labels may differ from stored values, but they must map one-to-one to the canonical enum.

## User-facing labels

Portal and admin UI should display these labels by default.

| Object | Stored value | Default label |
| --- | --- | --- |
| Run | `created` | Created |
| Run | `queued` | Queued |
| Run | `running` | Running |
| Run | `cancel_requested` | Cancelling |
| Run | `succeeded` | Completed |
| Run | `failed` | Failed |
| Run | `cancelled` | Cancelled |
| Job | `queued` | Queued |
| Job | `claimed` | Claimed |
| Job | `running` | Running |
| Job | `cancel_requested` | Cancelling |
| Job | `completed` | Completed |
| Job | `failed` | Failed |
| Job | `cancelled` | Cancelled |
| Attempt | `prepared` | Prepared |
| Attempt | `active` | Running |
| Attempt | `succeeded` | Completed |
| Attempt | `failed` | Failed |
| Attempt | `cancelled` | Cancelled |

Label rules:

- use `Cancelling` as the user-facing label for `cancel_requested`
- use `Completed` as the user-facing label for `run.succeeded`, `job.completed`, and `attempt.succeeded`
- only show `Claimed` where job-level worker leasing matters; portal views may fold it into an active bucket

## Export and API serialization rules

The canonical serialized values must be the stored snake_case ids.

That means:

- JSON APIs return `state: "cancelled"`, not `state: "Cancelled"` or `state: "canceled"`
- CSV and JSON exports use the canonical ids in dedicated lifecycle columns such as `runState`, `jobState`, and `attemptState`
- if a human-readable label is needed in export, emit a separate field such as `runStateLabel`
- query params and filter state in the portal should use the canonical ids, not localized labels

## Derived grouping buckets

Frontend and reporting surfaces may expose these derived buckets, but only as views over the canonical states.

### Run grouping buckets

- `pending`
  - `created`, `queued`
- `active`
  - `running`, `cancel_requested`
- `terminal_success`
  - `succeeded`
- `terminal_failure`
  - `failed`
- `terminal_cancelled`
  - `cancelled`

### Job grouping buckets

- `pending`
  - `queued`, `claimed`
- `active`
  - `running`, `cancel_requested`
- `terminal_success`
  - `completed`
- `terminal_failure`
  - `failed`
- `terminal_cancelled`
  - `cancelled`

### Attempt grouping buckets

- `pending`
  - `prepared`
- `active`
  - `active`
- `terminal_success`
  - `succeeded`
- `terminal_failure`
  - `failed`
- `terminal_cancelled`
  - `cancelled`

## Timeout and retry vocabulary

`timed_out` is not a primary lifecycle state.

Timeout-related conditions must be represented as one of:

- lifecycle state `failed`
- a failure code such as `provider_timeout`, `worker_lease_lost`, or `wall_clock_budget_exhausted`
- an optional derived filter bucket such as `timed_out_failure`

Likewise:

- `retryable` is not a lifecycle state
- `stalled` is not a lifecycle state
- `superseded` is not a run, job, or attempt lifecycle state

Those are secondary facets derived from retry policy, failure classification, or release metadata.

## Relationship to bundle and verdict fields

The offline bundle and evaluation pipeline intentionally use different status families.

### `run-bundle.json`

`run-bundle.json.status` may use:

- `success`
- `failure`
- `incomplete`

Those values describe bundle completeness and terminal bundle packaging outcome. They are not replacements for `run.state` or `attempt.state`.

### `verification/verdict.json`

`verification/verdict.json.result` uses:

- `pass`
- `fail`

Those values describe benchmark verdict, not lifecycle state.

### Evaluation records

Evaluation records may additionally use:

- `pass`
- `fail`
- `invalid_result`

Those remain verdict classes. They are not run lifecycle values.

## Mapping rules across surfaces

The allowed high-level mapping is:

- a successfully completed control-plane run may still carry benchmark verdict `fail`
- a failed control-plane run may correspond to attempt verdict `invalid_result` or a terminal infrastructure failure
- `cancelled` is a lifecycle outcome and should not be remapped to benchmark verdict `fail`
- `timed_out` must be derived from failure evidence, not introduced as a competing lifecycle enum

For the MVP offline Problem 9 slice:

- `attempt.state=succeeded` means the attempt produced a structurally valid terminal success payload
- `attempt.state=failed` means the attempt ended in either a benchmark failure or invalid result
- benchmark pass or fail is determined by verdict fields, not by the attempt lifecycle alone

## UI and filter implications

Portal result views should expose at least two separate filters when both concepts matter:

- lifecycle state filter
- verdict bucket filter

This avoids the current anti-pattern where `running`, `failed`, `timed_out`, and `passed` are mixed into one pseudo-status dimension.

If a compact single filter is needed, it must be documented as a derived bucket built from:

- lifecycle state
- verdict class
- failure classification

It must not redefine the underlying canonical enums.

## Relationship to adjacent baselines

- `internal-contracts-api-baseline.md` defines the control-plane run, job, and attempt transitions
- `evaluation-pipeline-baseline.md` defines verdict classes and invalid-result handling
- `public-benchmark-reporting-ux-baseline.md` defines public result, data-quality, and publication-problem badges
- `results-drilldown-ux-baseline.md` should consume the vocabulary from this document rather than inventing separate status names

## Downstream execution implications

Follow-up implementation work should:

- align shared enums and schema exports to this vocabulary
- update backend serializers and read models to expose canonical ids plus optional labels
- update frontend filters, query params, and CSV export fields to distinguish lifecycle state from verdict state

## Out of scope

- changing existing benchmark failure codes
- changing public release-state taxonomy
- designing the exact results-table UI controls
