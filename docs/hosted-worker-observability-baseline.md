# Hosted Worker Observability Baseline

This document defines the hosted worker observability contract for logs, metrics, traces, audit events, alerts, and incident signals.

The goal is to make rollout evidence, incident triage, worker health interpretation, and operator visibility come from one durable control-plane model instead of ad hoc log lines, dashboard guesses, or portal-specific summaries.

## Current baseline

The surrounding hosted-worker scopes already imply the need for a stricter observability model:

- the lifecycle baseline defines authoritative worker and lease transitions, but not the evidence each transition must emit
- the pool and autoscaling baseline defines the control-plane signals that scaling should consume, but not the metric vocabulary or alert posture around those signals
- the rollout baseline requires digest-specific staging and production evidence, but not the canonical event and metric record that proves a rollout was safe
- the private operator API baseline requires sanitized, pollable operational reads, but not the rule for which underlying evidence is operator-visible and which must stay redacted
- the isolation and artifact-boundary baseline requires quarantine and residue handling, but not the incident or alert signals that make those events discoverable

Without a shared observability baseline, later execution work will produce incompatible meanings for "healthy," "stale," "incident," "audit," and "release evidence."

## Decision

ParetoProof should treat hosted worker observability as a control-plane product contract with six distinct but linked signal families:

1. structured logs for bounded event detail
2. metrics for fleet health, capacity, latency, and failure-rate posture
3. traces for one execution path across control-plane and worker actions
4. audit events for attributable human or system control actions
5. alerts for actionable policy breaches
6. incident records for durable operator triage and remediation state

The control plane is authoritative for what counts as observability truth. Worker runtime output is useful evidence, but it does not become operator-visible truth until the control plane classifies, redacts, and records it through the accepted model.

The accepted design rule is:

- metrics answer "how much" and "how often"
- traces answer "which path did this action take"
- logs answer "what bounded detail explains this event"
- audit events answer "who or what intentionally changed posture"
- alerts answer "which signal crossed an operator action threshold"
- incidents answer "which disruption is durably open, acknowledged, mitigated, or closed"

These families reinforce one another, but they must not be collapsed into one undifferentiated event stream.

## Design principles

The hosted worker observability model should obey these principles:

- control-plane first: operator-facing truth is derived from Neon-backed control-plane records, not live scraping of worker hosts
- structured by default: logs, metrics, traces, and audit rows must use stable field names and enums rather than free-form text as the primary contract
- redaction before exposure: a signal may be retained internally in stricter storage, but only redacted, classified evidence may flow to portal and operator read models
- correlation by durable ids: every signal family should attach the relevant durable ids when available
- bounded cardinality: metrics and alert labels must avoid unbounded ids that would explode time-series cost or hide signal quality
- same evidence for rollout and incident review: the same observability record should support routine release proof and failure investigation instead of creating two separate systems

## Correlation model

All hosted worker signal families should correlate around the same durable identifiers whenever those identifiers exist:

- `environment`
- `workerPool`
- `workerId`
- `leaseId`
- `runId`
- `jobId`
- `attemptId`
- `incidentId`
- `rolloutId`
- `releaseDigest`
- `providerFamily`
- `partitionClass`

Not every signal needs every id. The rule is:

- attach the narrowest durable ids that explain the event
- do not invent synthetic correlation ids when a product id already exists
- do not place high-cardinality ids such as `leaseId` or `runId` on fleet-wide aggregate metrics

Trace spans, structured logs, audit rows, and incident timelines may carry narrow ids freely. Metrics must stay bounded.

## Structured log contract

Structured logs are the bounded-detail narrative layer for hosted workers and the control plane.

Hosted worker logs that are kept or surfaced through the control plane must be emitted as structured records with at least:

- timestamp
- severity
- component
- event name
- environment
- `workerPool`
- correlation ids when available
- redaction classification
- short machine-readable reason code
- short human-readable summary

The accepted hosted worker log event families are:

- worker registration attempt and result
- claim attempt, claim grant, and claim rejection
- heartbeat accept, heartbeat reject, and freshness breach
- worker lifecycle transition
- lease lifecycle transition
- artifact staging, manifest acceptance, quarantine, and finalize
- rollout registration, block, promotion, and rollback events
- provider capability mismatch and hosted-auth rejection
- cleanup, residue, and workspace-fence events
- observability pipeline degradation events

Logs should be retained as evidence for bounded debugging and incident review, but the portal and private operator API should expose only sanitized summaries or evidence pointers, not arbitrary raw line streaming.

## Metric contract

Metrics are the authoritative fleet-health and policy-threshold layer.

Hosted worker metrics should be produced from control-plane state changes or accepted worker interactions whenever possible. The accepted metric groups are:

### Worker and lease health metrics

- worker registrations, successes, and failures
- registered workers by lifecycle state
- workers with fresh versus stale heartbeat posture
- leases by lifecycle state
- lease recovery starts, completions, abandons, revocations, and expiries
- job-token validation failures

### Queue and capacity metrics

- eligible queued jobs by pool and partition class
- oldest eligible queued-job age by pool
- desired versus active worker instances by pool
- desired versus active lease slots by pool
- idle healthy lease slots by pool
- claim attempts, claim success rate, and claim rejection rate by reason class

### Rollout and release metrics

- workers by deployed release digest or worker version label
- rollout promotions, block events, and rollback events
- staging verification success and failure counts
- rollout canary failures by pool

### Artifact and isolation metrics

- artifact registration attempts and failures
- artifact quarantine events by reason class
- workspace cleanup failures
- residue detections after lease recovery

### Observability pipeline metrics

- dropped or rejected worker event batches
- trace export failures
- audit-write failures
- alert delivery failures
- stale read-model freshness breaches for operator routes

Accepted metric labels are limited to bounded values such as:

- environment
- workerPool
- lifecycle state
- partition class
- provider family
- release digest label or worker version label
- reason class
- severity

Metrics must not label on raw `workerId`, `leaseId`, `runId`, `attemptId`, artifact key, full benchmark slug, or any similarly unbounded identifier.

## Trace contract

Traces are the execution-path layer across control-plane and worker interactions.

Hosted worker tracing should link, at minimum, the following path families:

- registration path
- claim path
- heartbeat renewal path
- artifact registration and finalize path
- lease recovery path
- rollout promotion and rollback path
- operator mutation request path

The accepted span rule is:

- traces should show the path of one action across API, worker, DB, and artifact-registration boundaries
- traces should prefer durable ids as attributes rather than putting sensitive payloads into span bodies
- traces may include worker-runtime timing detail, but only after the detail is classified as safe to retain

Trace detail is primarily an internal diagnostic surface. Portal and operator reads may expose trace-derived summaries or trace ids, but not raw unredacted traces.

## Audit event contract

Audit events are the immutable attribution layer for intentional control actions.

An audit event must exist whenever a human or trusted system actor changes hosted worker serving posture, rollout posture, or recovery posture.

The accepted audit families are:

- worker drain, re-admission, termination, and bootstrap revocation
- pool cordon, uncordon, drain, and capacity-target changes
- lease cancel, abandon, revoke, and recovery-resolution requests
- incident acknowledgement, mitigation note, suppression, and closure
- rollout promotion, block override, rollback, and release approval
- secret or credential family rotation that materially affects hosted worker operation

Every audit event should record:

- audit event id
- actor type and actor id summary
- target resource type and target id
- requested action
- accepted-at timestamp
- rationale or note
- resulting requested state
- linked incident, rollout, worker, lease, or pool ids when applicable

Audit events must never include secrets, raw credential material, full request headers, or unredacted support bundles.

## Incident signal model

Incidents are durable operator-facing records created when alerts or control-plane detection rules indicate a disruption that needs triage.

Hosted worker incidents should be opened for these canonical classes:

- worker health degradation
- stale lease or failed recovery
- queue saturation or capacity exhaustion
- rollout gate or canary failure
- provider auth or provider capability failure
- artifact integrity or quarantine failure
- workspace isolation or cleanup failure
- observability degradation that makes worker state materially untrustworthy

An incident record should carry:

- `incidentId`
- incident class
- severity
- current state such as `open`, `acknowledged`, `mitigated`, or `closed`
- opened-at and last-updated-at timestamps
- affected scope summary
- detection source such as metric alert, lifecycle detector, rollout gate, or operator report
- collaborator-safe summary text
- linked evidence pointers

Incidents are distinct from alerts:

- alerts are threshold crossings or policy triggers
- incidents are the durable triage object operators work through over time

Repeated alerts for one already-open incident should link into the existing incident when they describe the same underlying disruption instead of creating duplicate incident noise.

## Alert contract

Alerts are actionable policy-bound notifications derived from metrics, lifecycle detectors, rollout gates, audit expectations, or observability-pipeline health.

Hosted worker alerts should be grouped into four severity postures:

- `page`: immediate operator attention required
- `high`: urgent same-day operator action required
- `medium`: important but non-paging follow-up required
- `info`: noteworthy state transition or degraded evidence that should be visible but not escalated

The accepted alert families are:

- worker heartbeat freshness breach
- stale lease count above accepted pool threshold
- claim rejection spike caused by capacity or auth mismatch
- queue age or queue depth breach relative to pool target
- canary or rollout verification failure
- artifact quarantine or residue detection breach
- provider authentication failure burst
- observability pipeline degradation that threatens operator truthfulness

Alert routing should target the owning pool or platform operator path, but later implementation may decide the exact transport. This scope only fixes which events are alert-worthy and how they relate to incidents.

## Operator-visible versus redacted evidence

Hosted worker evidence must be classified into three visibility tiers.

### 1. Collaborator-safe operational evidence

This is allowed in collaborator-readable operator views and summaries.

Examples:

- worker, lease, rollout, and incident lifecycle state
- pool queue pressure, healthy capacity, stale lease counts, and rollout blocker summaries
- reason classes such as `heartbeat_stale`, `claim_capacity_exhausted`, or `artifact_quarantined`
- release digest labels, worker version labels, and provider-family labels
- bounded sanitized event summaries and timestamps

### 2. Admin-only operational evidence

This is allowed only for admin read models and internal incident review surfaces.

Examples:

- detailed remediation notes
- acknowledgement actor attribution
- exact affected worker, lease, or rollout ids when those ids are operationally sensitive
- detailed failure-cluster summaries
- internal-only incident classification detail
- trace or log evidence pointers that still require authenticated retrieval

### 3. Never expose through portal or private operator reads

This evidence may exist in stricter backend storage, but must never be exposed through standard operator-facing product routes.

Examples:

- bootstrap tokens, job tokens, provider secrets, API keys, token hashes, or secret values
- raw env var maps, mounted-path listings, and internal network addresses
- unredacted provider request or response bodies
- full filesystem paths inside leased workspaces when they reveal sensitive host layout
- raw arbitrary worker stdout or stderr streams that have not passed redaction
- raw artifact contents or support bundles

The default rule is fail closed: if a signal has not been explicitly classified for operator visibility, it should remain internal-only until redaction policy approves it.

## Redaction rules

Hosted worker observability should redact before storage in product-facing evidence stores whenever practical, and must redact before any portal or private operator exposure.

Minimum redaction rules:

- replace secrets and tokens with presence-only or fingerprint-only markers
- replace raw provider account identifiers with stable internal labels where possible
- prefer reason classes and bounded summaries over dumping raw exception objects
- preserve release digest, worker pool, lifecycle state, and incident class because those are operationally meaningful and safe
- do not copy benchmark payloads, prompts, or artifact contents into metrics or alert bodies
- when raw support material must be retained for debugging, store it behind a stricter access boundary and expose only a classified evidence pointer

## Rollout evidence requirements

Hosted rollout and rollback evidence should consume the observability model directly.

Every staging or production rollout packet should be able to cite:

- rollout audit event for promotion or rollback intent
- worker-version or release-digest metrics proving adoption posture
- lifecycle and heartbeat health metrics during the rollout window
- bounded incident and alert summary for the rollout window
- staged verification trace or event pointers for claim, heartbeat, finalize, and artifact success on the target digest

This avoids a release packet that depends on screenshots of dashboards or operator memory.

## Operator read-model consequences

The private operator API and portal worker-ops surfaces should consume observability through sanitized read models, not by exposing raw telemetry pipes.

Those read models should treat the following as first-class:

- current freshness status of the observability-derived snapshot
- incident counts and severity by pool
- rollout blocker and alert-summary posture
- bounded evidence summaries for worker, lease, run, and rollout detail pages
- links between lifecycle state, alert reason classes, and incident state

The API should expose evidence summaries and evidence pointers, not unbounded log streams or arbitrary trace payloads.

## Required follow-up execution

This baseline should directly shape the next execution slices:

- control-plane metric and event emission for worker lifecycle, queue, rollout, and artifact boundaries
- durable audit tables and incident tables aligned with the accepted families
- alerting rules for stale heartbeat, stale lease, rollout failure, quarantine, and observability degradation
- redaction and evidence-classification helpers shared across worker, API, and portal code
- release-packet generation that cites audit, metric, trace, and incident evidence consistently

## Relationship to adjacent scopes

This observability baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#918` defines the identity and token material that observability must never expose directly
- `#921` defines the queue-pressure and capacity signals observability should aggregate and alert on
- `#922` defines the worker and lease state transitions that logs, metrics, traces, and incidents must describe
- `#923` defines the quarantine, cleanup, and residue boundaries that should produce incident and alert evidence
- `#925` should define the operator runbook and remediation expectations that consume these signals
- `#926` should expose sanitized observability-derived state through portal and operator surfaces

## Out of scope

This scope does not:

- implement dashboards, alert transports, or tracing vendors
- define exact numeric alert thresholds for every pool
- define the complete operator runbook or incident response checklist
- expose raw worker logs or traces directly to portal users
- replace the lifecycle, rollout, isolation, or private API baselines

It defines the signal taxonomy, visibility policy, and evidence contract that later backend, portal, and operations slices must honor.
