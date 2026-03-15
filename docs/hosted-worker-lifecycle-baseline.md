# Hosted Worker Lifecycle Baseline

This document defines the authoritative hosted worker and lease lifecycle model for ParetoProof.

The goal is to stop worker registration, heartbeat renewal, drain, stale-lease handling, and operator intervention from remaining implied by the current claim loop and instead make them durable control-plane state transitions.

## Current baseline

The current hosted-worker kernel already establishes the narrow mechanics:

- a hosted worker proves a bootstrap credential before claim
- a successful claim returns one lease plus one short-lived job token
- heartbeats renew the lease and rotate the job token
- the private worker-ops API and pool baseline already assume operator-visible worker health, stale-lease counts, and drain posture

What is still missing is the accepted lifecycle contract that answers:

- when a worker becomes a durable registered instance instead of a one-off process
- which worker states are allowed to claim, heartbeat, or finalize
- what it means for a worker to be draining versus unhealthy
- when a stale lease becomes recoverable by the control plane
- how an old worker is fenced off once lease recovery begins
- which operator actions are safe and what they are allowed to change

Without that contract, later backend and portal work will invent incompatible meanings for "running," "stale," "draining," and "recovered."

## Decision

ParetoProof should model hosted execution through two linked but distinct state machines:

1. a worker-instance lifecycle owned by the control plane
2. a lease lifecycle owned by the control plane and bound to exactly one current worker instance

The control plane is authoritative for both. Modal runtime state, worker self-reporting, or portal polling never override the control-plane lifecycle on their own.

The accepted design rule is:

- worker state answers whether one machine participant is healthy and eligible to claim or continue serving work
- lease state answers whether one claimed assignment is still owned, renewable, recoverable, or terminal

The two state machines influence each other, but they must not be collapsed into one shared enum.

## Worker instance lifecycle

The authoritative worker lifecycle states are:

- `registering`
- `ready`
- `claiming`
- `running`
- `draining`
- `unhealthy`
- `recovering`
- `terminated`

### `registering`

`registering` means the control plane has accepted the worker's bootstrap proof strongly enough to create or refresh a durable worker record, but the worker is not yet claim-eligible.

Required checks before leaving `registering`:

- bootstrap credential is valid for exactly one environment and one pool
- declared `workerPool`, runtime family, and worker version match the approved pool contract
- the pool is enabled for serving and not blocked by rollout, incident, or revocation posture
- there is no unresolved identity collision that would make two active processes claim the same durable worker identity

`registering` is short-lived. A worker should move to `ready`, `draining`, or `terminated`, not stay indefinitely in a provisional state.

### `ready`

`ready` means the worker is healthy, registered, not holding an active lease, and allowed to claim compatible work for its pool.

`ready` workers count as healthy idle capacity for pool and autoscaling calculations.

### `claiming`

`claiming` means a `ready` worker is in the claim handshake for one compatible queue partition and the control plane is deciding whether to issue a lease.

`claiming` is an in-flight coordination state, not a durable execution state. It should settle quickly to:

- `ready` when no eligible work is issued
- `running` when a lease is issued successfully
- `draining` when the worker became non-serving during claim arbitration
- `terminated` when identity or pool validation fails

### `running`

`running` means the worker currently owns at least one active lease and the control plane still accepts its lease-scoped job token and heartbeat cadence as healthy.

`running` workers may:

- renew their active lease through heartbeat
- append execution events for that lease
- submit artifact manifests and terminal results for that lease

`running` workers may not claim unrelated work outside their approved pool or continue serving after their lease has been recovered or revoked.

### `draining`

`draining` means the control plane has marked the worker non-serving for new claims, but the worker may still be allowed to finish or safely hand off its current lease.

`draining` is entered when:

- an operator requests worker or pool drain
- rollout posture requires this worker to stop taking new work
- incident posture requires serving to stop before immediate termination

While `draining`:

- new claim requests must be rejected
- heartbeat renewal may continue only for leases the worker already owns
- terminal finalize is still allowed for those leases if the lease remains authoritative
- autoscaling must not count the worker as healthy spare claim capacity

If a `draining` worker reaches zero active leases and the drain remains in force, it should stay non-serving until it terminates or is explicitly recycled through fresh registration.

### `unhealthy`

`unhealthy` means the control plane no longer considers the worker safe to keep serving normally, but lease recovery has not fully completed yet.

Typical entry causes:

- heartbeat freshness breach
- repeated claim or renewal failures that imply auth or runtime drift
- runtime integrity signals that fail closed
- explicit quarantine posture triggered by incident policy

An `unhealthy` worker:

- cannot claim new work
- should not be treated as available capacity
- may still have one or more leases that need recovery arbitration

### `recovering`

`recovering` means the control plane has begun explicit lease-recovery handling for work previously assigned to that worker and has fenced the old worker away from further authoritative mutation on the affected leases.

`recovering` is the safety boundary between "worker might still come back" and "the control plane is now deciding how to reassign or terminate its work."

While `recovering`:

- heartbeats for recovered or recovery-pending leases must be rejected
- old job tokens are no longer authoritative
- the worker may remain visible for audit and incident evidence, but not as serving capacity

The worker may later transition to:

- `ready` only after recovery finished cleanly and the control plane explicitly re-admits the worker
- `draining` if operators want a graceful non-serving cleanup path
- `terminated` if the worker should be removed from service entirely

### `terminated`

`terminated` means the worker instance is no longer eligible for claim, heartbeat, or recovery actions.

Entry causes include:

- clean drain completion followed by worker exit
- bootstrap revocation or identity invalidation
- unrecoverable incident posture
- explicit operator termination after recovery or rollback handling

`terminated` records remain durably visible for audit, incident review, and rollout evidence. Termination is the end of serving authority, not deletion of history.

## Worker lifecycle transitions

The accepted high-level worker transitions are:

- `registering -> ready`
- `registering -> draining`
- `registering -> terminated`
- `ready -> claiming`
- `ready -> draining`
- `ready -> unhealthy`
- `ready -> terminated`
- `claiming -> ready`
- `claiming -> running`
- `claiming -> draining`
- `claiming -> terminated`
- `running -> ready`
- `running -> draining`
- `running -> unhealthy`
- `running -> recovering`
- `running -> terminated`
- `draining -> recovering`
- `draining -> terminated`
- `unhealthy -> recovering`
- `unhealthy -> terminated`
- `recovering -> ready`
- `recovering -> draining`
- `recovering -> terminated`

Transitions outside this set should be treated as invalid control-plane state changes.

## Lease lifecycle

The authoritative lease lifecycle states are:

- `issued`
- `active`
- `cancel_requested`
- `recovery_pending`
- `recovered`
- `completed`
- `expired`
- `revoked`
- `abandoned`

### `issued`

`issued` means the control plane minted the lease and initial job token for one worker, but the lease has not yet proved liveness through a successful heartbeat or equivalent first execution acknowledgement.

This state exists so the system can distinguish "claim succeeded" from "worker actually started serving the lease."

### `active`

`active` means the lease is currently authoritative for one worker instance and its latest job token family is valid for heartbeat, event, artifact, and finalize routes.

Only one worker may hold an `active` lease at a time.

### `cancel_requested`

`cancel_requested` means an operator or system policy requested the work stop cleanly, but the current worker may still be alive long enough to acknowledge the request, publish final evidence, or yield to recovery.

`cancel_requested` does not grant the worker authority to keep running indefinitely. It is a bounded transition state before `completed`, `abandoned`, `recovered`, `revoked`, or `expired`.

### `recovery_pending`

`recovery_pending` means the control plane has detected that the active worker can no longer be trusted to continue the lease normally and recovery arbitration has started.

Entry causes include:

- missed heartbeat beyond the accepted freshness window
- stale or conflicting lease ownership evidence
- worker transition to `unhealthy` or `recovering`
- operator intervention that requires fence-and-recover semantics

Once a lease is `recovery_pending`, the previous worker must no longer be able to advance it with the old job token.

### `recovered`

`recovered` means the control plane finished arbitration for the previous lease owner and recorded the durable outcome.

Accepted recovered outcomes include:

- work requeued for a fresh lease
- work reassigned through a new claim path
- work declared non-resumable and moved to incident handling

`recovered` is terminal for the old lease id. Any continued execution must happen under a new lease identity.

### `completed`

`completed` means the worker submitted an accepted terminal result or terminal failure and the control plane finalized the lease cleanly.

`completed` is terminal and must invalidate the lease's active job token family immediately.

### `expired`

`expired` means the lease timed out without clean terminal finalize and without a cleanly recorded recovery outcome before the expiry boundary.

`expired` is terminal for the old lease. Follow-on work, if any, must happen through recovery or requeue under a different durable action.

### `revoked`

`revoked` means the control plane invalidated the lease immediately because the lease or token authority was no longer trusted.

Typical causes:

- auth mismatch
- worker identity collision
- operator emergency stop
- severe incident posture requiring immediate fence-off

`revoked` is terminal and stronger than `cancel_requested`.

### `abandoned`

`abandoned` means the control plane deliberately gave up on the current lease as the authoritative path for that work and recorded the abandonment as an explicit operator or recovery action.

This is different from `expired`: abandonment is intentional and attributable; expiry is a timeout failure.

## Lease lifecycle transitions

The accepted high-level lease transitions are:

- `issued -> active`
- `issued -> recovery_pending`
- `issued -> expired`
- `issued -> revoked`
- `active -> cancel_requested`
- `active -> recovery_pending`
- `active -> completed`
- `active -> expired`
- `active -> revoked`
- `cancel_requested -> completed`
- `cancel_requested -> recovery_pending`
- `cancel_requested -> abandoned`
- `cancel_requested -> revoked`
- `cancel_requested -> expired`
- `recovery_pending -> recovered`
- `recovery_pending -> abandoned`
- `recovery_pending -> revoked`

Transitions out of `recovered`, `completed`, `expired`, `revoked`, and `abandoned` are invalid because those states are terminal for that lease id.

## Registration contract

Registration is the control-plane act of creating or refreshing the durable worker instance record, not merely accepting one HTTP request.

The accepted registration contract is:

1. worker presents the pool-scoped bootstrap credential and its claimed runtime identity
2. control plane validates environment, pool, worker version, runtime family, and current serving posture
3. control plane creates or refreshes the worker record in `registering`
4. control plane resolves identity collisions or rejects the registration attempt
5. control plane transitions the worker to `ready`, `draining`, or `terminated`

Registration must be idempotent enough for legitimate worker restarts, but it must fail closed on conflicting active identity evidence.

## Heartbeat contract

Heartbeat renewal is the control-plane proof that a worker still owns an active lease and is allowed to keep it.

Every accepted heartbeat must do all of the following in one authoritative step:

- validate the current lease-scoped job token
- validate that the worker state still allows continued ownership of that lease
- rotate the job token to a new active token family
- extend the lease expiry window
- update worker and lease freshness timestamps
- return any changed control-plane posture, such as `cancel_requested` or drain instructions

Heartbeat must be rejected when:

- the lease is no longer `issued`, `active`, or `cancel_requested`
- the worker is already in `recovering` or `terminated`
- the lease or worker identity no longer matches the presented token
- the control plane already fenced the lease for recovery

Accepted heartbeats during `draining` are allowed only for already-owned leases. They must not convert the worker back into a claim-eligible state.

## Drain contract

Drain is a graceful control-plane action, not a best-effort convention.

The accepted drain semantics are:

- drain stops new claim eligibility immediately
- drain does not erase the worker's current lease history
- drain may allow the current lease to finish cleanly if that is still safe
- drain must remain visible in operator read models until the worker terminates or is explicitly re-admitted

There are two accepted drain scopes:

- worker drain: affects one worker instance
- pool drain: affects claim eligibility for all workers in the target pool, while each worker still reports its own lifecycle state

Drain is not the same as revocation. If the system can no longer trust the worker to finish safely, it must move to `unhealthy`, `recovering`, or `terminated`, not pretend a graceful drain is still in effect.

## Lease-recovery contract

Lease recovery begins when the control plane decides the current worker can no longer be trusted as the authoritative owner of that lease.

The accepted recovery sequence is:

1. detect stale heartbeat, worker-health failure, or operator-triggered recovery condition
2. move the worker to `unhealthy` or `recovering`
3. move the lease to `recovery_pending`
4. fence the old job token and reject further mutation from the old worker
5. record durable incident and recovery evidence
6. choose one explicit outcome:
   - requeue for a fresh lease
   - abandon with operator rationale
   - revoke and hold for incident handling
7. move the old lease to its terminal recovery outcome and expose the result through operator read models

Recovery must never let two workers hold the same authoritative lease concurrently. If the system wants to continue the work, it must do so with a fresh lease identity.

## Operator intervention model

Operators are allowed to change lifecycle posture only through explicit control-plane actions that leave durable audit evidence.

Accepted intervention families:

- worker drain
- pool drain or cordon
- lease cancel request
- lease abandon request
- emergency worker termination
- bootstrap revocation
- recovery acknowledgement or resolution

Operator actions must not:

- mutate lease ownership implicitly through a read route
- delete the evidence that explains why recovery or termination happened
- silently reclassify an `unhealthy` worker as `ready` without a fresh control-plane admission path

The operator API should therefore expose the requested posture and final outcome separately.

## Read-model consequences

The private operator API and portal worker views should treat the following fields as first-class:

- worker lifecycle state
- worker last heartbeat timestamp
- worker drain posture and drain requested-at timestamp
- worker active lease count
- lease lifecycle state
- lease recovery reason
- lease last acknowledged event sequence
- recovery decision status and operator-attributed rationale

Pool and autoscaling read models should count only `ready` and `running` workers with fresh health as serving capacity. `draining`, `unhealthy`, `recovering`, and `terminated` workers are not spare claim capacity.

## Relationship to other hosted-worker scopes

This lifecycle baseline sharpens, rather than replaces, the surrounding hosted-worker scopes:

- `#918` defines who is allowed to claim and heartbeat at all through bootstrap and job-token authority
- `#921` defines pool targets, queue partitions, and capacity posture that lifecycle decisions must respect
- `#926` and the private operator API baseline define how worker, lease, incident, and rollout state appears in portal-backed reads
- `#924` and `#925` will define the observability and runbook posture around these lifecycle transitions

This document is the missing state-machine contract those adjacent scopes rely on.

## Consequences for follow-up execution

This baseline should directly shape the next implementation work:

- worker registration must create durable worker instance rows before claim is treated as authoritative
- claim and heartbeat routes must enforce the accepted worker and lease transition boundaries
- drain controls must stop new claims immediately while preserving current-lease evidence
- stale-lease recovery must fence the old worker before any requeue or reassignment happens
- private operator read models must expose worker and lease lifecycle state directly instead of deriving it loosely from lease timestamps alone

## Out of scope

This scope does not:

- implement the Neon tables or route handlers
- define provider execution logic or benchmark-specific retry policy
- define exact portal UI copy or alert thresholds
- replace the credential, pool, rollout, or operator API baselines

It defines the lifecycle contract those later backend, worker, and portal slices must honor.
