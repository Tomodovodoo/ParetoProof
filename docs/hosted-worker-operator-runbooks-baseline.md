# Hosted Worker Operator Runbooks Baseline

This document defines the authoritative operator runbooks for ParetoProof's hosted worker platform.

The goal is to stop hosted rollout, rollback, drain, token rotation, provider failure handling, stuck-lease recovery, and incident escalation from living in operator memory or scattered PR comments.

## Current baseline

The surrounding hosted-worker scopes already define the system mechanics:

- the rollout baseline defines digest-pinned staging-first promotion and rollback evidence
- the credential baseline defines bootstrap credentials, lease-scoped job tokens, revocation, and rotation boundaries
- the lifecycle baseline defines worker and lease states, drain posture, and recovery fencing
- the observability baseline defines the alerts, incidents, audit events, and evidence tiers operators should consume

What is still missing is the accepted operator procedure layer that answers:

- which named runbooks exist and when each one is required
- which preconditions must be checked before an operator mutates hosted-worker posture
- which actions must happen through the control plane versus directly in Modal or provider consoles
- what evidence must be recorded before a runbook is considered complete
- when a routine runbook becomes an incident and who must be notified

Without that baseline, later backend, portal, and project-ops work will implement controls without one shared answer for how operators are expected to use them safely.

## Decision

ParetoProof should treat hosted-worker operations as a small set of named control-plane runbooks with durable audit and incident evidence.

The authoritative runbook families are:

- rollout
- rollback
- worker drain and re-admission
- bootstrap credential rotation
- provider incident response
- stuck-lease recovery
- incident escalation

The accepted operating rule is:

1. use control-plane-backed operator actions first
2. prefer digest, worker, lease, pool, and incident identities already defined by the product
3. record the runbook start, key decisions, and exit evidence durably
4. fail closed when operator evidence is incomplete or system state is ambiguous

Ad hoc direct edits in Modal, Neon, GHCR, or provider dashboards are not normal operations. If a later break-glass action uses an external console because the control plane is degraded, the operator must still backfill the same audit and incident evidence into ParetoProof afterward.

## Runbook design rules

Every hosted-worker runbook must define and preserve these fields:

- trigger condition
- required operator role or approval posture
- affected environment and worker pool scope
- preflight checks
- ordered control actions
- mandatory evidence recorded during the runbook
- success, blocked, rollback, or escalation exit states

The operator-facing product and internal docs should present runbooks in that order. The system should not expect operators to infer prerequisites from unrelated docs.

## Operator role model

Hosted-worker runbooks use three actor classes:

- `automation` for system-triggered safe actions such as lease fencing, alert opening, or staged evidence capture
- `operator` for the human carrying out the runbook
- `approver` for the second human approval required when the action changes `prod` serving posture, rotates `prod` bootstrap credentials, or overrides an active blocker

One person may act as both `operator` and `approver` in `dev` and usually `staging`. Production rollout, rollback, bootstrap rotation, and incident suppression should require a second attributable approval unless a later explicit emergency policy defines a narrower exception.

## Common preflight checks

Before any mutating runbook action, the operator should confirm:

- the target environment, pool, worker, lease, incident, and digest identities are known
- there is one current observability snapshot with acceptable freshness
- the affected release digest and prior known-good digest are known when rollout posture is involved
- any relevant open incidents, alerts, or active drains are visible
- the action is being taken through the accepted control-plane or operator surface, not by editing hidden state directly

If any of those checks fail and the action is not an emergency fence-off, the runbook should stop and escalate instead of guessing.

## Common evidence contract

Every completed runbook should leave one durable evidence packet or equivalent operator record containing at least:

- runbook family
- actor and approver identity where required
- started-at and completed-at timestamps
- affected environment and scope
- triggering reason class
- key control actions taken
- linked alert, incident, rollout, worker, or lease ids
- resulting serving posture
- follow-up actions or explicit statement that none remain

Runbooks should cite the observability baseline's sanitized evidence model. Secrets, raw tokens, raw provider payloads, and unredacted support bundles must not appear in the packet.

## Rollout runbook

The rollout runbook applies when operators promote a hosted worker digest into `staging` or `prod`.

### Trigger

- new hosted worker digest published and approved for promotion
- staged canary or phased pool rollout requested

### Required inputs

- target digest
- prior known-good digest
- affected pools
- environment
- linked PR and merged commit

### Preconditions

- the exact PR head passed the required pre-merge `Pull Request CI / ci` evidence
- the publish workflow emitted the authoritative digest artifact
- no unresolved blocker incident forbids promotion for the affected pool and environment
- if promoting to `prod`, the exact digest already passed `staging` verification

### Required actions

1. open or reference the rollout record for the target digest and scope
2. confirm the target digest matches the intended merged revision
3. if needed, drain only the workers or pools required by the rollout strategy
4. deploy the exact digest to the affected `staging` or `prod` pool apps through the approved control path
5. verify registration, claim, heartbeat, finalize, and artifact posture on the deployed digest
6. record pool-by-pool outcome as `succeeded`, `blocked`, or `rolled_back`

### Required evidence

- rollout audit event
- exact deployed digest per pool
- staging or production verification evidence
- current incident and alert posture for the rollout window
- prior digest preserved for rollback readiness

### Exit rule

The rollout is complete only when each affected pool has one explicit outcome. Silent partial success is invalid.

## Rollback runbook

The rollback runbook applies when an already-promoted digest must be replaced by the prior known-good digest.

### Trigger

- rollout verification fails
- incident severity requires reverting the current release
- post-promotion drift makes the current digest unsafe to continue serving

### Preconditions

- the prior known-good digest is known for each affected pool
- the rollback target is still valid for the current credential and provider posture, or the mismatch is part of the incident record
- the affected incident or rollback reason is linked before mutating serving posture

### Required actions

1. mark the affected rollout or incident as rollback-in-progress
2. drain or cordon the affected serving scope if continued claims are unsafe
3. redeploy the prior known-good digest by explicit digest
4. verify worker registration, claim, heartbeat, and finalize on the restored digest
5. either re-admit serving capacity or keep the pool drained if the incident remains open

### Required evidence

- rollback audit event with rationale
- restored digest per pool
- post-rollback verification evidence
- incident state transition or closure note

### Exit rule

A rollback is not complete when the deployment command succeeds. It is complete only after the restored digest proves healthy enough for the intended serving posture.

## Worker Drain And Re-Admission runbook

The drain runbook applies when operators need to stop new claims for one worker or pool without immediately destroying all current evidence.

### Trigger

- planned rollout or rollback
- incident mitigation
- suspicious runtime posture that is not yet severe enough for immediate termination
- controlled pool maintenance

### Preconditions

- target worker or pool scope is explicit
- current lease ownership and heartbeat posture are visible
- operators know whether the goal is graceful completion, recovery fencing, or full termination

### Required actions

1. request worker drain or pool drain through the control plane
2. confirm new claim eligibility stops immediately
3. monitor current leases until they complete, move to recovery, or require operator abandonment
4. if the worker remains healthy and the maintenance reason clears, re-admit it only through the accepted lifecycle path
5. if the worker becomes unsafe, transition to recovery or termination instead of pretending drain still covers the case

### Required evidence

- drain audit event
- current active lease count at drain start
- final outcome for each in-flight lease
- re-admission, termination, or recovery decision

### Exit rule

Drain is complete when the worker or pool is either:

- safely back in `ready` or normal serving posture
- left intentionally non-serving with rationale
- terminated or moved into recovery with incident evidence

## Bootstrap credential rotation runbook

The credential-rotation runbook applies to hosted bootstrap credential families. Lease-scoped job tokens rotate automatically on heartbeat and are not a manual operator runbook except when recovery or revocation is required.

### Trigger

- scheduled secret hygiene
- suspected bootstrap exposure
- provider or platform policy change requiring rotation
- environment bootstrap drift detected during rollout or incident review

### Preconditions

- the target pool and environment scope is explicit
- the replacement credential family exists and has been validated for distribution
- operators know whether the old credential may overlap briefly with the replacement

### Required actions

1. create the replacement bootstrap credential family for the exact pool and environment
2. distribute it only through the approved hosted secret boundary
3. restart, recycle, or re-register workers onto the replacement family
4. confirm new claims succeed under the replacement and old claims stop when the old family is revoked
5. revoke the old credential family and leave the result visible in operator evidence

### Required evidence

- credential-rotation audit event
- affected pools and environments
- activation and revocation timestamps
- proof of successful post-rotation claim or registration
- any linked incident ids when the rotation was reactive

### Exit rule

Rotation is complete only after the old credential family is no longer accepted for new claims and the replacement family has proved healthy claim posture.

## Provider incident response runbook

The provider incident runbook applies when the supported hosted provider posture is degraded or unsafe.

### Trigger

- provider auth failures exceed the accepted threshold
- provider capability drift or configuration mismatch is detected
- provider outage, quota exhaustion, or latency breach threatens lease health
- provider behavior creates evidence-integrity or secret-exposure risk

### Preconditions

- the affected provider family, environment, and pool scope is known
- there is one incident record or one new incident opened for the disruption
- the current release digest, bootstrap posture, and queue pressure are visible

### Required actions

1. classify the incident as auth, capability, outage, quota, or integrity related
2. if serving is unsafe, drain or cordon the affected pools before claims continue
3. fence or recover leases that can no longer proceed safely
4. apply the least-broad corrective action that restores the accepted provider posture
5. verify claim, execution, and finalize behavior before re-admitting normal serving

### Required evidence

- linked provider incident record
- affected pools and provider family
- operator action timeline
- any drained, recovered, revoked, or abandoned lease counts
- proof of restored provider posture before reopening capacity

### Exit rule

A provider incident is mitigated only when operators can show both the corrective action and the restored hosted execution evidence. "The provider console looks better now" is not sufficient.

## Stuck-Lease recovery runbook

The stuck-lease runbook applies when a lease no longer has trustworthy forward progress.

### Trigger

- heartbeat freshness breach
- conflicting lease ownership evidence
- worker transition to `unhealthy` or `recovering`
- explicit operator decision that the current lease owner is no longer trustworthy

### Preconditions

- target lease id and current worker id are known
- the current lease lifecycle state is visible
- the system can fence the old lease before any requeue or reassignment

### Required actions

1. move the lease into `recovery_pending` and fence the old job-token family
2. ensure the previous worker can no longer mutate the lease
3. classify the recovery reason and capture the last known good evidence point
4. choose one explicit outcome: recover and requeue under a fresh lease, abandon with rationale, or revoke and hold for incident handling
5. verify the old lease reaches a terminal recovery outcome

### Required evidence

- lease-recovery audit or incident event
- fenced worker and lease identities
- recovery reason class
- chosen terminal outcome
- any follow-on lease or requeue linkage

### Exit rule

The stuck-lease runbook is complete only when the old lease is terminal and there is no ambiguity about who, if anyone, now owns follow-on work.

## Incident escalation runbook

The escalation runbook applies whenever a hosted-worker disruption is large enough that routine local handling is no longer sufficient.

### Trigger

- any `page` alert
- repeated `high` alerts that do not clear within the accepted window
- rollback required for `prod`
- provider, credential, observability, or isolation failures that make operator truth materially unreliable
- any situation where an operator must use break-glass external controls

### Required actions

1. open or update the incident record with current severity, scope, and affected environments
2. appoint one accountable operator or incident commander
3. decide whether immediate drain, rollback, or credential revocation is required
4. keep the incident timeline updated with each material action and observed outcome
5. either downgrade once service is stable and evidence is complete, or keep escalation active until the blocker is resolved

### Required evidence

- incident state timeline
- severity changes and rationale
- explicit mitigation decision points
- linked rollout, drain, rollback, credential-rotation, and recovery actions
- closure or follow-up issue note

### Exit rule

An escalated incident is not closed when symptoms disappear. It is closed when serving posture is understood, mitigation evidence exists, and any remaining follow-up work is carried into explicit issues.

## Break-glass boundary

The accepted normal path is control-plane-first operation.

Break-glass actions are allowed only when one of these is true:

- the control plane or operator API cannot carry out the safety action quickly enough
- the observability pipeline is degraded enough that the product no longer exposes trustworthy operator state
- a provider or runtime emergency requires an immediate external fence-off

When break-glass is used, operators must:

- minimize the action scope
- capture the external system touched
- record what exact state was changed
- backfill the same action and rationale into ParetoProof audit and incident records as soon as the control plane is available

Break-glass does not relax the evidence requirement. It only changes where the first action happens.

## Relationship to adjacent scopes

This runbook baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#918` defines the credential material and revocation boundaries the rotation and incident runbooks consume
- `#920` defines digest-pinned rollout and rollback rules that the rollout and rollback runbooks must follow
- `#922` defines the worker and lease transitions that drain and stuck-lease recovery are allowed to invoke
- `#924` defines the alerts, incidents, audit events, and redaction posture every runbook must cite
- `#926` should expose these runbooks and their evidence through portal operator information architecture
- `#927` should define the deeper drills that prove these runbooks are actually executable

## Consequences for follow-up execution

This baseline should directly shape the next execution work:

- operator APIs should expose named actions and evidence packets that map directly to these runbooks
- portal worker operations should present the right preflight context and required confirmations before mutation
- incident and audit storage should preserve runbook family, scope, actor, rationale, and result state explicitly
- later chaos and staging-drill work should exercise these exact runbook families instead of inventing new ones

## Out of scope

This scope does not:

- implement the operator API mutations or portal UI
- define every alert threshold numerically
- replace the rollout, lifecycle, credential, or observability baselines
- execute or automate the drills yet

It defines the authoritative hosted-worker runbook contract those later backend, frontend, and operations slices must honor.
