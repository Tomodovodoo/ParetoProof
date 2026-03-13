# Run Control Governance Baseline

This document resolves MVP control-plane governance rules for run retries, cancellation, concurrency, and budget enforcement. It provides one baseline policy that downstream backend and worker issues can use without reopening these decisions.

The typed source of truth lives in:

- `packages/shared/src/contracts/run-governance.ts`
- `packages/shared/src/schemas/run-governance.ts`
- `packages/shared/src/types/run-governance.ts`

## Retry policy

The MVP retry model is bounded and reason-aware:

- maximum `3` attempts per job
- maximum `12` total attempts across one run
- exponential backoff: `30s` initial, multiplier `2`, capped at `600s`
- reason classification determines whether retries are allowed and whether retry budget is consumed

Retryable reasons include worker crashes, lease timeouts, transient provider/network failures, transient artifact upload failures, and transient internal errors. Deterministic failures (`validation_error`, `artifact_contract_error`) and policy outcomes (`budget_exhausted`, `manual_cancel`) are non-retryable.

`provider_rate_limited` is retryable but does not consume retry budget, so temporary provider throttling does not immediately exhaust normal failure retries.

## Cancellation policy

Cancellation is modeled as a two-step control-plane process:

- `cancel_requested` is non-terminal and gives workers a grace period to shut down cleanly
- `cancelled` is the terminal result once the worker acknowledges cancellation or the control plane forces shutdown

MVP timing baseline:

- heartbeat considered stale after `180s`
- cancellation grace window `120s`
- force terminal cancellation after `600s` if the worker does not shut down cleanly

If cancellation cannot be finalized safely (for example, repeated infrastructure failures), the run may transition to `failed` as a terminal control-plane outcome.

## Concurrency policy

The control plane should enforce both global and contributor-scoped concurrency limits:

- max active runs globally: `20`
- max active runs per contributor: `3`
- max queued runs per contributor: `6`
- default max concurrent jobs per run: `4`

Run-kind overrides:

- `full_benchmark`: `8` concurrent jobs
- `benchmark_slice`: `4`
- `single_run`: `1`
- `repeated_n`: `2`

This keeps diagnostic and repeated-probe workflows from starving benchmark throughput while preserving an explicit fairness ceiling.

## Budget policy

Every run should carry hard guardrails enforced by the control plane:

- max estimated spend per run: `$25`
- max input tokens per run: `5,000,000`
- max output tokens per run: `1,000,000`
- max wall-clock duration per run: `120` minutes

Budget exhaustion is terminal and maps to run state `failed`.

Rationale:

- budget breaches are policy outcomes, not transient infrastructure errors
- automatic retries after budget exhaustion would violate the same budget boundary

## Integration notes

- reason classification for retries is represented by `runFailureReasonCatalog`
- default policy object is `defaultRunControlPolicy`
- run-kind parallelism overrides are `runKindConcurrencyOverrides`
- schemas in `packages/shared/src/schemas/run-governance.ts` define the validation contract for future API/DB integration

## Out of scope

- dynamic per-team or per-user budget tuning UI
- production threshold auto-tuning based on usage history
- implementing scheduler code in this issue
