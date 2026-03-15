# Hosted Worker Verification And DR Baseline

This document defines the required staged verification, chaos testing, and disaster-recovery proof for ParetoProof's hosted worker platform.

The goal is to stop hosted-worker readiness from being inferred from happy-path CI and instead require explicit evidence that the fleet behaves correctly when workers crash, tokens expire, uploads fail, networks break, and recovery or rollback becomes necessary.

## Current baseline

The repository and recent hosted-worker scopes already define part of the proof chain:

- `runtime.md` defines the exact PR-head kernel smoke evidence required before merge
- the hosted rollout baseline already requires digest-specific staging verification before production promotion
- the lifecycle baseline defines how workers, leases, drain, and recovery are supposed to behave
- the runbook baseline defines the operator procedures for rollout, rollback, drain, provider incidents, and stuck leases
- the observability baseline defines the audit, metric, trace, alert, and incident evidence that verification should cite

What is still missing is the accepted verification contract that answers:

- which hosted-worker behaviors must be proven in `staging` on every rollout
- which failure scenarios require deliberate chaos or failure-injection proof
- what counts as disaster recovery for the hosted-worker slice
- how recent that proof must be before production rollout stays credible
- what evidence packet operators must preserve for staging, chaos, rollback, and recovery drills

Without that baseline, production readiness will drift into "the image deployed and no one noticed a problem yet."

## Decision

ParetoProof should require hosted-worker proof at four distinct layers:

1. pre-merge kernel proof on the exact PR head
2. digest-specific staging smoke on the exact deployed hosted worker digest
3. recurring chaos and failure-injection proof for the canonical failure modes
4. recurring disaster-recovery proof that the control plane and fleet can be restored to a trustworthy serving posture

The accepted design rule is:

- PR CI proves the candidate change is fit to merge
- staging smoke proves the exact published digest works in the hosted environment
- chaos proof demonstrates the accepted failure paths degrade safely and recover correctly
- disaster-recovery proof demonstrates operators can restore or re-establish safe hosted service after a major disruption

No single layer replaces the others.

## Verification tiers

### Tier 1. Pre-merge kernel proof

This tier is already defined by `runtime.md`.

Hosted-worker-adjacent changes must still pass the exact PR-head evidence:

- `Build Problem 9 execution image smoke target`
- `Verify Problem 9 execution image smoke target`
- `Build Problem 9 devbox image smoke target`
- `Verify Problem 9 devbox image smoke target`
- `Run deterministic Problem 9 verifier smoke`
- `Run deterministic Problem 9 local-stub attempt smoke`
- any directly coupled auth or runtime checks required by the touched slice

This is necessary but not sufficient for hosted promotion.

### Tier 2. Staging smoke proof

This tier is required on the exact digest deployed to `staging` before any production promotion.

### Tier 3. Chaos and failure-injection proof

This tier verifies the hosted-worker platform does the right thing when the happy path breaks.

It is environment proof, not per-PR smoke. It should run in `staging` or a dedicated safe hosted verification environment using the same control-plane contracts as production.

### Tier 4. Disaster-recovery proof

This tier verifies that a severe platform disruption can be contained, reconstructed, and returned to a trustworthy serving posture with durable evidence.

This proof is broader and less frequent than routine staging smoke, but it is still required for production credibility.

## Staging smoke contract

Every hosted production rollout must attach a staging smoke packet for the exact target digest and affected pool scope.

### Required staging smoke families

The staging packet must prove all of these families:

#### 1. Registration and readiness

The smoke must prove:

- workers register under the expected digest, pool, and environment
- the control plane records them as healthy and claim-eligible
- pool posture reflects the newly deployed workers accurately

#### 2. Claim and lease issue

The smoke must prove:

- a staging worker can claim one eligible job
- the control plane issues exactly one authoritative lease
- the resulting worker and lease state are visible in the expected read models

#### 3. Heartbeat and token rotation

The smoke must prove:

- heartbeat renewals succeed on the staged digest
- the lease expiry window moves forward
- the lease-scoped job token rotates correctly
- worker freshness remains live in the read model

#### 4. Terminal finalize

The smoke must prove both:

- one accepted terminal-success path
- one accepted terminal-failure path

The purpose is to show the staged digest can exit work cleanly in both the success and canonical failure lanes.

#### 5. Artifact registration and upload

The smoke must prove:

- artifact rows register correctly
- direct upload intents succeed for the staged digest
- finalize references the resulting artifact state correctly

#### 6. Supported provider posture

The smoke must prove the currently supported hosted provider family and auth mode still work on the staged digest.

For the current MVP scope that means:

- provider family `openai`
- hosted auth mode `machine_api_key`

#### 7. Drain and graceful completion

The smoke must prove:

- a worker or pool drain stops new claims immediately
- an already-owned lease can either complete cleanly or move into the accepted recovery path

This is the minimum rollout-time proof that the staged fleet can be controlled safely.

### Required staging evidence packet

The staging packet must preserve at least:

- target digest
- environment
- affected pool or pools
- start and completion timestamps
- one success record for each staging smoke family above
- linked run ids, lease ids, worker ids, and rollout id where applicable
- alert or incident summary for the verification window
- operator or automation actor summary

The packet should cite control-plane evidence, not screenshots of dashboards.

## Chaos and failure-injection contract

Chaos verification exists to prove that the hosted-worker platform fails closed and recovers through the accepted lifecycle and runbook paths.

### Canonical chaos families

The hosted-worker chaos suite must cover these canonical families:

#### 1. Worker crash during active lease

Inject:

- worker process termination after claim and before terminal finalize

Must prove:

- heartbeat freshness breach is detected
- the lease is fenced and moved into the accepted recovery path
- no duplicate authoritative completion is accepted from the dead worker

#### 2. Network-loss recovery

Inject:

- loss of control-plane connectivity during an active lease

Must prove:

- the worker stops making authoritative progress once lease or token validity cannot be maintained
- stale-heartbeat or recovery signals open correctly
- the old lease is fenced before any follow-on execution begins

#### 3. Token-expiry or token-rotation failure

Inject:

- expired or superseded lease-scoped job token during heartbeat or finalize

Must prove:

- stale or invalid tokens are rejected
- the worker does not continue mutating state with the wrong token
- recovery or re-claim behavior follows the accepted lifecycle

#### 4. Upload-failure recovery

Inject:

- transient upload failure
- expired upload intent
- final artifact metadata mismatch

Must prove:

- artifact state stays accurate
- retries do not create ambiguous finalize state
- quarantine or failure paths remain visible when integrity checks fail

#### 5. Provider-auth or provider-availability failure

Inject:

- rejected provider auth
- provider latency or outage severe enough to block safe progress

Must prove:

- the failure is surfaced through the accepted incident and alert model
- the worker does not silently continue in a half-authoritative state
- drain, rollback, or provider incident response can proceed from durable evidence

#### 6. Rollout-failure rollback

Inject:

- staged canary or rollout verification failure on the new digest

Must prove:

- the prior known-good digest can be selected and redeployed
- rollback verification succeeds on the restored digest
- affected pools remain explicitly visible as advanced, blocked, or rolled back

### Chaos execution rules

The accepted chaos execution rules are:

- run against hosted worker flows, not only local stubs
- use staging or an explicitly isolated hosted verification environment
- inject one failure family at a time unless the drill explicitly targets compounded failure
- preserve the resulting incident, audit, and recovery evidence
- reset the environment to a trustworthy baseline before the next drill

Chaos proof is about trusted recovery, not random breakage.

## Disaster-recovery contract

Disaster recovery for the hosted-worker slice means a disruption severe enough that normal rollout or incident handling is not enough on its own.

The accepted DR scope for hosted workers includes:

- control-plane or read-model restoration after severe degradation
- re-establishing trustworthy worker registration and serving posture after environment loss or fleet reset
- proving that stale leases from the disrupted environment are fenced or recovered safely
- restoring release and rollback truth strongly enough that operators can resume controlled hosted execution

This scope does not redefine database backup policy. It defines what hosted-worker recovery must prove once the underlying platform restore path exists.

### Required DR proof families

The DR verification packet must prove all of these:

#### 1. Environment fencing

Operators must be able to stop unsafe claim activity in the disrupted scope by:

- cordoning or draining the affected pool or environment
- preventing new ambiguous lease ownership

#### 2. Recovery of control-plane truth

The system must be able to restore or reconstruct enough durable state to answer:

- which digest was supposed to be serving
- which workers and leases were active before the disruption
- which incidents or recovery decisions remain open

#### 3. Stale-lease reconciliation

The recovery procedure must prove:

- old leases from the disrupted scope cannot keep mutating state
- unresolved leases are moved into explicit recovery outcomes
- resumed execution happens only through fresh lease authority

#### 4. Re-registration and safe serving restore

The platform must prove:

- newly started workers can register cleanly after recovery
- pool posture returns to an explicit serving or non-serving state
- operators know whether they are restoring the prior digest or rolling back first

#### 5. Release-readiness re-establishment

The recovery packet must prove:

- the fleet is back on one explicit digest posture
- staging-style smoke has been re-established before production serving resumes
- open incidents and blockers are either resolved or carried forward explicitly

### DR evidence packet

The disaster-recovery packet must preserve:

- disrupted scope and trigger summary
- fencing start time
- operator and approver summary where applicable
- prior serving digest and restored serving digest
- stale-lease reconciliation summary
- re-registration or re-admission proof
- post-recovery staging smoke references
- remaining follow-up issues or explicit statement that none remain

## Cadence and recency rules

Hosted-worker proof must remain recent enough to be meaningful.

The accepted cadence rule is:

- Tier 1 PR-head kernel proof: every hosted-worker-adjacent PR
- Tier 2 staging smoke: every hosted production rollout on the exact target digest
- Tier 3 chaos proof: after any material hosted-worker change that affects lifecycle, auth, artifact upload, rollout, or recovery semantics, and also on a recurring platform-ops cadence
- Tier 4 DR proof: on a recurring platform-ops cadence and after material recovery-boundary changes

The exact calendar schedule can be set by later project-ops execution, but production readiness may not claim DR confidence from one ancient successful drill.

## Release-readiness consequence

Production promotion should be blocked when any of these are true:

- the exact target digest lacks the required staging smoke packet
- the most recent relevant chaos drill for the changed failure family is missing or unresolved
- the most recent DR proof for the current hosted-worker platform posture is missing, stale beyond the accepted ops window, or left follow-up blockers unresolved
- the verification packet cannot identify whether the fleet would roll forward, roll back, or remain drained after a failure

This does not mean every rollout reruns the full DR suite. It means the release packet must cite recent credible proof for the hosted-worker posture it depends on.

## Relationship to runbooks and observability

Verification must consume the already accepted operator model.

- staging smoke should cite rollout and drain evidence from the runbook baseline
- chaos drills should prove the incident, recovery, and rollback runbooks are executable
- DR drills should prove break-glass and restoration paths still backfill durable control-plane evidence
- all proof packets should cite observability records, not free-form operator memory

Verification is therefore the executable proof of the runbooks, not a parallel documentation path.

## Relationship to adjacent scopes

This verification baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#920` defines that production rollout requires exact-digest staging proof
- `#922` defines the lifecycle transitions the chaos suite must validate
- `#924` defines the alerts, incidents, traces, metrics, and audit evidence the verification packets should cite
- `#925` defines the runbooks the chaos and DR drills must exercise
- `#926` defines the operator IA that should eventually surface this proof and its blockers
- `#952` will own the underlying Neon environment checks, backup posture, and recovery checks that broader DR evidence depends on

## Consequences for follow-up execution

This baseline should directly shape the next execution work:

- `#913` should capture the required staging smoke packet against the exact deployed digest
- `#940` should implement the hosted-worker chaos suite around the canonical failure families in this document
- `#952` should expose the recovery and backup evidence that the hosted-worker DR packet depends on
- portal and operator read models should expose verification recency, rollout blockers, and unresolved drill findings explicitly

## Out of scope

This scope does not:

- implement the staging smoke suite
- implement fault injection or chaos automation
- define the detailed Neon backup mechanism
- replace the rollout, lifecycle, observability, or runbook baselines

It defines the hosted-worker verification and disaster-recovery contract those later backend, worker, and project-ops slices must honor.
