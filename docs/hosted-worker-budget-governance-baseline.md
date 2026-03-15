# Hosted Worker Budget Governance Baseline

This document defines the spend, quota, and budget governance contract for ParetoProof's hosted worker platform.

The goal is to stop hosted-worker cost control from becoming an after-the-fact billing exercise or an operator-only dashboard habit. Hosted execution should admit work, scale pools, and handle incidents against one explicit control-plane budget model.

## Current baseline

The surrounding hosted-worker scopes already define most of the mechanics that can create spend:

- the platform baseline defines pools as the operational unit with one budget and capacity envelope
- the pool and autoscaling baseline defines desired capacity, slot targets, and guardrails that can block scale-up
- the provider capability baseline defines which provider family and hosted auth mode are even allowed
- the lifecycle baseline defines when workers and leases may keep running, be drained, or be recovered
- the observability and operator-runbook baselines define the alert, incident, audit, and operator action model

What is still missing is the accepted governance layer that answers:

- which budget scopes exist and which one is authoritative when they conflict
- how the control plane should reason about spend before provider billing data fully settles
- which quota types can block launch, claim, or scale-up
- what an emergency cutoff actually does
- when operators may override a budget gate and how long that override may live

Without that baseline, later implementation will drift into soft warnings, inconsistent caps, or unsafe manual secret-removal hacks.

## Decision

ParetoProof should treat hosted-worker budget governance as a control-plane safety boundary with three linked guardrail layers:

1. pool-level capacity and spend envelopes
2. provider-family usage caps within an environment
3. emergency cutoff controls that can fail closed at pool, provider, or environment scope

The control plane is authoritative for whether new hosted work may be admitted, claimed, or scaled. Modal autoscaling, browser launch requests, and provider-side billing dashboards never override the control-plane budget decision on their own.

The accepted design rule is:

- use conservative spend accounting based on reserved and realized usage
- block new spend before the platform crosses a hard limit, not after invoices arrive
- surface warning posture early, but enforce hard stops automatically
- require explicit, time-bounded operator overrides for any temporary budget exception
- never let an override bypass security, provider-capability, or incident-fence boundaries

## Governance units

Hosted-worker budget policy should exist at three scopes.

### Environment-provider budget

This is the top-level hosted provider cap for one `environment` and one `providerFamily`.

It answers:

- how much total provider-backed hosted spend ParetoProof is willing to authorize in that environment
- which burst quotas are acceptable for that provider family
- when the whole environment or provider family should stop admitting new hosted work

This is the primary circuit breaker against platform-wide overspend on one provider.

### Worker-pool budget

Each `workerPool` must have its own budget envelope inside the environment-provider cap.

It answers:

- how many active lease slots the pool may consume
- how much estimated and realized provider spend that pool may accumulate in its active budget window
- whether the pool may scale up, keep current capacity, or stop taking new claims

Pool budgets are the main product-facing governance unit because they line up with rollout, incident, and operator ownership domains already defined elsewhere.

### Emergency cutoff scope

Emergency cutoffs are not normal budgets. They are an explicit stop-serve posture that may target:

- one worker pool
- one provider family within an environment
- the entire hosted environment

Cutoffs exist for anomaly response, incident mitigation, or operator-imposed safety holds. They are stronger than normal warning or hard-limit states.

## Budget windows and accounting clocks

Hosted-worker budget governance should use more than one time window because one monthly cap is too slow to prevent runaway spend.

The accepted windows are:

- short-window usage for burst protection such as rolling hour-level request, token, or lease-start limits
- daily operating envelope for abnormal same-day acceleration
- monthly budget envelope for the durable spend ceiling used in release and planning review

Later implementation may tune the exact durations, but it should preserve the three-level shape: burst, operating, and monthly ceilings.

## Authoritative spend accounting model

Provider billing data often lands late or with provider-specific granularity. The control plane therefore must not wait for settled invoices before it decides whether more work is allowed.

The accepted accounting model uses three values:

- `reservedSpendEstimate`
  - the conservative estimated provider cost for admitted but not yet fully settled hosted work
- `realizedSpendEstimate`
  - the current estimate for work that has already executed far enough to report more accurate usage
- `settledProviderSpend`
  - provider-reconciled spend or usage data once later ingestion confirms it

Budget enforcement should use the most conservative relevant total, not just the most delayed one.

The accepted enforcement total is:

- `max(reservedSpendEstimate + realizedSpendEstimate, settledProviderSpendAdjusted)`

Where `settledProviderSpendAdjusted` means the settled provider view after any accepted corrections, credits, or reversal handling the platform later supports.

This rule matters because the platform must fail closed when provider billing lags behind active hosted execution.

## Quota families

Hosted-worker governance should treat quota as a first-class sibling to monetary budget, not as an optional detail.

The accepted quota families are:

### Capacity quotas

- maximum active workers by pool
- maximum active lease slots by pool
- maximum queue-backed scale-up target by pool

These quotas stop infrastructure growth even when provider spend estimation is still inside budget.

### Provider usage quotas

- request-rate ceilings by provider family and environment
- token or equivalent usage ceilings by provider family and environment
- optional model-class or capability-lane ceilings when later provider support expands beyond the current narrow hosted matrix

These quotas protect against provider outages, quota exhaustion, and sudden burst failure even before absolute spend limits trip.

### Monetary budgets

- monthly provider-family ceiling by environment
- daily operating ceiling by provider family or pool
- pool-local monetary envelope for the workloads assigned to that pool

Monetary budgets answer what ParetoProof is willing to spend, not just what the provider allows.

## Budget state model

The control plane should classify every governed scope into one explicit posture:

- `healthy`
  - below warning thresholds and no cutoff is active
- `warning`
  - still allowed to admit and scale, but operator attention is required
- `hard_blocked`
  - no new launch admission, claim expansion, or scale-up is allowed for that scope
- `cutoff_active`
  - emergency stop posture is active and stronger than normal hard blocking

Override is not its own steady-state classification. It is a temporary operator-authored exception attached to a governed scope and visible alongside the current state.

## Admission, claim, and scaling rules

Budget governance must apply before the platform creates more hosted spend.

The accepted fail-closed rules are:

1. launch admission should reject or hold new hosted work when the target pool, provider-family scope, or environment is `hard_blocked` or `cutoff_active`
2. claim issuance should stop for scopes that are `hard_blocked` or `cutoff_active`, even if queued work already exists
3. autoscaling should never raise desired capacity when any relevant budget or quota guard is tripped
4. warning posture may still admit and scale work, but it must emit operator-visible alerts and evidence
5. if multiple scopes disagree, the strictest scope wins

Strictest-scope examples:

- a healthy pool inside a blocked environment-provider cap must still block new hosted work
- a warning provider cap cannot weaken a pool-level cutoff
- an override on one pool cannot reopen a provider-family cutoff for other pools

## Treatment of in-flight work

Budget limits are mainly about stopping new spend, but the platform still needs one rule for already-running leases.

The accepted default policy is:

- `hard_blocked` stops new launch, new claim, and scale-up
- existing healthy in-flight leases may finish if doing so is lower-risk than forced interruption
- `cutoff_active` may additionally require drain, lease fencing, or provider-token revocation when the cutoff reason is security, provider integrity, or runaway-spend containment

The system should not silently choose between those paths. The cutoff reason class must determine whether the scope is:

- `finish_inflight_only`
- `drain_and_finish`
- `fence_and_recover`

That reason-class outcome must be operator-visible and auditable.

## Emergency cutoff contract

Emergency cutoffs should be a named control-plane action, not an improvised secret deletion or modal-scale-to-zero hack.

An emergency cutoff must record:

- cutoff id
- scope type and scope id
- environment
- reason class
- requested by actor
- approval posture when required
- started-at timestamp
- expiry or review-by timestamp when applicable
- in-flight handling mode

Accepted cutoff reason classes:

- spend_anomaly
- provider_quota_exhaustion
- provider_outage
- credential_or_secret_incident
- artifact_or_evidence_integrity_risk
- operator_imposed_hold

Cutoffs should remain active until explicitly cleared or replaced by a narrower durable state. They must not disappear just because one metric dips back below threshold.

## Override policy

Budget overrides are allowed only as explicit, time-bounded exceptions.

An override must specify:

- target scope
- rationale
- requested temporary ceiling or quota change
- start time
- automatic expiry time
- operator actor
- approver actor when required

The accepted approval rule is:

- `dev` overrides may be approved by one attributable operator
- `staging` overrides may usually be approved by one operator, but production-like drills may require an approver when the override is broad
- `prod` overrides require both `operator` and `approver`

Overrides may relax budget or quota posture only for the named scope and only until the explicit expiry. They may not bypass:

- unsupported provider families or auth modes
- active security or secret-exposure cutoffs
- artifact-integrity or evidence-integrity fence conditions
- authorization boundaries for who may request hosted work

If operators need a broader break-glass posture than that, it should be handled as an incident with the break-glass boundary already defined by the operator-runbook baseline.

## Operator visibility and evidence

Budget posture must be operator-visible through the control plane, not inferred from provider invoices or Modal dashboards.

The minimum operator-facing budget snapshot should include:

- governed scope identity
- current budget state
- current warning and hard-limit thresholds
- reserved, realized, and settled spend summaries
- active quota utilization
- current override or cutoff posture
- last reconciliation timestamp
- linked incident or alert ids when the scope is degraded

The observability system should emit:

- warning alerts for scopes approaching hard limits
- hard-block alerts when admission or scale-up is refused
- cutoff alerts when emergency stop posture is activated
- audit events for override creation, approval, expiry, extension, cutoff activation, and cutoff clearance

Budget posture is part of release and fleet-operability evidence. Operators should be able to prove why hosted work was allowed, blocked, or forcefully stopped at a given time.

## Reconciliation and drift posture

Because provider-billing signals may lag, the platform should reconcile conservative control-plane estimates against settled provider usage on a recurring basis.

The accepted reconciliation rule is:

- under-count risk should bias toward preserving or increasing block posture until corrected
- over-count corrections may restore capacity, but only through an explicit state transition visible to operators
- reconciliation must never silently erase a cutoff, override, or alert history

This prevents budget drift from becoming invisible once delayed provider data arrives.

## Relationship to adjacent scopes

This budget baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#919` defines the supported hosted provider matrix whose families the budget model governs
- `#921` defines pool identities, slot targets, and autoscaling signals that budget caps can constrain
- `#922` defines worker and lease lifecycle actions needed when a cutoff drains or fences in-flight work
- `#924` defines the alerts, incidents, metrics, and audit evidence budget governance must emit
- `#925` defines the operator runbook and break-glass posture used when cutoffs or overrides are exercised
- `#926` should expose budget posture and blocked-state summaries through the live operator information architecture
- `#929` should define the network and secret-exfiltration boundary that budget overrides are never allowed to bypass

## Consequences for follow-up execution

This baseline should directly shape the next implementation slices:

- `#941` should implement durable budget and quota state, reserved-versus-settled accounting, and fail-closed enforcement on launch, claim, and scale-up
- operator-facing read models should expose warning, blocked, cutoff, and override posture as first-class fleet state
- later mutation surfaces should support explicit cutoff and override requests with the required rationale and approval evidence
- incident and release packets should cite budget posture when spend governance blocks rollout or hosted execution

## Out of scope

This scope does not:

- integrate directly with provider billing APIs yet
- define public pricing or contributor billing
- choose exact numeric limits for every pool or environment
- replace the provider-capability, autoscaling, lifecycle, observability, or runbook baselines

It defines the authoritative hosted-worker budget contract that later backend, portal, and operator work must honor.
