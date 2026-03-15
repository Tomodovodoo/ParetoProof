# Hosted Worker Pool And Autoscaling Baseline

This document defines the backend control-plane model for hosted worker pools, queue partitioning, capacity targets, and autoscaling signals.

The goal is to stop hosted execution from treating `workerPool` as a loose label on leases and instead make pool placement, capacity policy, and scale recommendations durable control-plane concepts.

## Current baseline

The repository already has enough worker surface area to show the missing boundary:

- `worker_job_leases.worker_pool` records which pool held a lease, but there is no durable pool registry yet
- `/portal/workers` and the private worker-ops baseline already assume pool summaries such as desired capacity, active capacity, and queue pressure
- run-governance contracts already define per-run and per-run-kind fan-out limits such as `maxConcurrentJobsPerRun`
- the current worker claim path is still essentially "claim any eligible queued job up to my advertised concurrency"

That means the codebase can already talk about pools, but it cannot yet answer the questions operators actually need:

- which pools exist in each environment
- which jobs are eligible for which pool
- what capacity each pool should maintain
- which queue signals justify scale-up or scale-down
- how pool pressure differs from per-run concurrency limits

## Decision

ParetoProof should model hosted worker scheduling through a durable pool registry plus environment-local capacity targets.

The accepted control-plane shape is:

1. a stable pool-definition catalog describes what a pool is allowed to run
2. an environment-local pool target describes where that pool is enabled and what capacity envelope it should hold
3. every queued job resolves to exactly one primary hosted pool and one queue partition before claim time
4. pool capacity is governed in lease slots first and worker instances second
5. autoscaling consumes control-plane queue and lease signals, not ad hoc runtime guesses

Hosted pool policy must remain a control-plane decision. Modal may supply worker instances, but it does not own placement or capacity truth.

## Durable pool registry

The registry should have two durable layers.

### 1. Pool definition

A pool definition is the environment-independent catalog entry for one hosted pool id such as `modal-general` or `modal-canary`.

Each pool definition should carry at least:

- stable `workerPool` id
- runtime family such as `modal`
- supported provider families and hosted auth modes
- supported tool or runtime profile class
- optional benchmark-lane selectors or exclusions
- optional benchmark-package or workload selectors when a pool exists for a narrow workload family
- default rollout class such as `stable`, `canary`, or `quarantine`
- ownership metadata for budget and incident routing

This row answers "what kind of work may ever land in this pool" without embedding environment-specific capacity or deployment state.

### 2. Environment-local pool target

An environment-local pool target is the serving record for one pool in one environment such as `staging/modal-general`.

Each target should carry at least:

- environment
- `workerPool`
- enabled or disabled status
- cordoned, draining, or serving posture
- desired worker image or rollout target reference
- minimum and maximum worker instances
- worker concurrency per instance in lease slots
- warm-spare target in lease slots or worker instances
- queue-latency target for the pool
- scale-up and scale-down cooldown settings
- budget or provider guardrails that can block scale-up

This row answers "how much of this pool should exist here right now" and "is the pool allowed to claim new work in this environment."

The control plane should not collapse these two layers into one blob. Pool identity is stable across environments, while capacity, rollout posture, and drain state are environment-local.

## Placement and queue partitioning

Every hosted job must resolve to one primary pool before workers start claiming it.

The control plane should assign the placement at launch or job-enqueue time and persist:

- `targetWorkerPool`
- environment
- queue partition key
- placement rationale or policy id
- whether the placement came from a default rule, a lane override, a canary rule, or a quarantine rule

The claim loop should then ask for work from the worker's assigned pool and partition set. It should not race every hosted worker against one global anonymous queue.

### Placement order

The accepted placement order is:

1. reject any job that requires an unsupported hosted provider family, auth mode, runtime class, or environment
2. apply explicit quarantine, canary, or lane-routing overrides
3. apply workload-class routing based on benchmark or tool profile requirements
4. place remaining compatible work into the pool's default serving partition

This keeps the hosted path fail-closed and makes special routing visible.

### Queue partition model

Queue partitions are logical claim buckets inside a pool, not separate infrastructure products.

For MVP, a partition should be identified by:

- environment
- `workerPool`
- partition class
- optional lane override key

The accepted partition classes are:

- `default`
- `canary`
- `quarantine`
- `lane_reserved`

This means most work lands in `default`, while explicitly isolated work can be separated without inventing one pool per benchmark lane.

### Lane and run-kind mapping

Pool routing must stay narrower than "one lane equals one pool" and cleaner than "every run kind chooses a pool."

The accepted mapping rule is:

- benchmark lanes may force routing only when the lane has explicit hardware, incident-isolation, or release-isolation needs
- run kind does not create a separate pool by default
- run kind continues to influence per-run fan-out through run-governance policy
- benchmark-package and tool-profile selectors may route into a specialized pool only when the pool definition explicitly declares that workload family

This prevents the pool registry from turning into a shadow copy of run-governance or benchmark taxonomy.

## Concurrency model

Pool capacity and run concurrency are related, but they are not the same control.

### Run-level concurrency

Run-governance remains responsible for:

- maximum active runs
- maximum queued runs
- maximum concurrent jobs per run
- run-kind concurrency overrides

These settings answer how much one run or one contributor may fan out.

### Pool-level concurrency

Pool policy is responsible for:

- how many jobs a pool may serve at once
- how many worker instances a pool should keep alive
- how much spare capacity the pool should maintain
- how the pool behaves while cordoned, draining, or in canary posture

These settings answer how much infrastructure the hosted fleet is willing to spend on that workload class.

Implementation should treat run-governance as an eligibility gate and pool policy as the capacity envelope around eligible work. One must not overwrite the other.

## Capacity targets

The authoritative capacity unit for autoscaling should be lease slots.

A worker instance may be able to hold more than one active job lease. Because of that, the control plane should compute:

- active lease slots
- idle lease slots
- desired lease slots
- worker instances required to provide those slots

Each environment-local pool target should define:

- `minWorkerInstances`
- `maxWorkerInstances`
- `leaseSlotsPerWorker`
- `warmSpareLeaseSlots`
- target queue-latency window
- optional maximum scale step per decision interval

The preferred derived formula is:

- `desiredLeaseSlots = activeLeaseSlots + eligibleQueuedJobs + warmSpareLeaseSlots`
- `desiredWorkerInstances = ceil(desiredLeaseSlots / leaseSlotsPerWorker)`
- clamp the result between `minWorkerInstances` and `maxWorkerInstances`

The exact smoothing function may change later, but the model must stay slot-first and bounded.

## Authoritative autoscaling signals

Autoscaling should consume control-plane signals that already encode product policy and queue eligibility.

The authoritative scale signals per pool are:

- eligible queued jobs for that pool
- oldest eligible queued-job age for that pool
- active lease-slot count
- idle healthy lease-slot count
- healthy registered worker count
- stale lease count
- recent claim failure count caused by capacity exhaustion or lease contention
- recent worker-start latency when new capacity is requested
- cordon, drain, rollout, and incident posture for the pool

These signals are authoritative because they answer whether more safe hosted capacity is actually needed.

### Non-authoritative signals

The following are useful diagnostics but not sufficient scaling truth on their own:

- total queued runs across the whole system
- raw queued-job counts that have not passed eligibility checks
- Modal CPU or memory percentages without queue context
- provider latency spikes that do not yet block claims
- browser-visible portal polling counts

If the control plane cannot connect runtime telemetry to pool eligibility and safety posture, it should not scale from that signal alone.

## Scale-up posture

Scale-up should happen only when the pool has eligible work that cannot be served inside its target wait window or spare-slot target.

The accepted scale-up posture is:

- scale up when eligible queued jobs exceed current idle healthy lease slots
- scale up when the oldest eligible queued job breaches the pool's queue-latency target
- do not scale above the environment-local maximum
- block scale-up when the pool is cordoned, when rollout policy forbids new capacity, or when budget or provider guards are tripped

Scale-up should follow the serving pool and partition model. A queue spike in one isolated partition should not silently consume capacity from an unrelated quarantined or canary partition unless policy explicitly allows it.

## Scale-down posture

Scale-down should be conservative and should preserve pool readiness.

The accepted scale-down posture is:

- scale down only after sustained idle healthy capacity beyond the warm-spare target
- never scale below the environment-local minimum
- do not scale down while the pool is draining, while canary evidence is still pending, or while stale-lease recovery is unresolved
- prefer removing idle workers that are not holding leases and are already outside the active rollout canary set

Scale-down must not discard the evidence needed to understand a still-open incident or active rollout.

## Rollout and incident interaction

Pool capacity policy must remain compatible with rollout and recovery posture.

That means:

- canary capacity should be visible as pool or partition posture, not hidden in ad hoc worker labels
- drain requests should stop new claims before the autoscaler interprets the resulting idle capacity as a normal scale-down success
- stale-lease incidents should bias the system toward recovery or quarantine before aggressive scale-down
- rollback or quarantine may temporarily pin a higher warm-spare target for the affected pool

Autoscaling is not allowed to erase incident evidence by rapidly replacing workers without durable control-plane records.

## Required operator read model

The private operator API and portal worker views should treat the following pool fields as first-class:

- `workerPool`
- environment
- placement class or supported workload summary
- serving posture such as `serving`, `cordoned`, `draining`, or `quarantined`
- desired and active worker instances
- desired and active lease slots
- eligible queued jobs
- oldest eligible queued-job age
- healthy worker count
- stale lease count
- current rollout target and rollout status
- current autoscaling recommendation or block reason

This is the minimum data needed to keep `/portal/workers` and `/portal/worker-ops/pools*` from remaining fixture-shaped.

## Relationship to current contracts

This baseline sharpens, rather than replaces, the current shared and backend contracts:

- existing run-governance defaults remain the source of per-run fan-out policy
- the current worker-control claim contract should evolve to claim against explicit pool and partition eligibility
- the thin `/portal/workers` pool summary should become a compatibility overview over the richer pool registry and pool-state read model
- the private operator API should expose queue-pressure and capacity fields derived from this registry rather than from loose lease grouping alone

The important design boundary is that job placement and pool capacity become durable control-plane data, not recomputed guesses from whatever leases happen to exist.

## Consequences for follow-up execution

This baseline should directly shape the next execution work:

- worker-pool registry tables should model pool definitions separately from environment-local pool targets
- queued jobs should persist their resolved pool placement and partition keys
- claim APIs should filter against durable pool eligibility instead of a global anonymous queue
- worker-ops read models should expose pool capacity, queue pressure, and scaling blockers directly
- autoscaling recommendation logic should operate on eligible queue and lease-slot signals, not raw portal aggregates

## Out of scope

This scope does not:

- implement the Neon tables or autoscaling controller
- define the exact SQL schema or migration names
- define every future specialized pool id
- define the full worker lifecycle state machine; issue `#922` owns that
- define the detailed portal UI; operator IA stays with issue `#926`

It defines the backend pool, partition, capacity, and autoscaling contract those later execution slices must honor.
