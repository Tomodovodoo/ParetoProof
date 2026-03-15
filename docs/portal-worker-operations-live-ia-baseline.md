# Portal Worker Operations Live IA Baseline

This document defines how the portal should present live hosted worker operations once fixture-only worker data is replaced by the private operator API.

The goal is to stop the `workers` section from remaining one shallow queue-and-incident card stack and instead turn it into a durable operator information architecture for fleet health, rollout posture, incident triage, and recovery actions.

## Current baseline

The repository already has the early shape of a worker-operations surface:

- the portal has one `workers` section inside the benchmark-ops cluster
- `PortalBenchmarkOpsSurface` already treats `workers` as a live-polled route rather than a static page
- the current `PortalWorkersViewResponse` schema provides only one overview snapshot with queue summary, worker pools, active leases, and incident summaries
- the private operator API baseline already defines the long-term route family for overview, pool, worker, incident, rollout, run, and lease detail
- the observability and runbook baselines already define the evidence and action posture the UI must present safely

What is still missing is the accepted frontend information architecture that answers:

- what the `workers` landing view is actually for
- which drill-down destinations exist and in what order operators reach them
- how overview, detail, incidents, rollouts, and recovery views divide responsibility
- which private API datasets each view consumes
- how stale, degraded, empty, and failed data should look in the portal on desktop and mobile

Without that baseline, backend read models will arrive before the portal has one shared structure for presenting them.

## Decision

ParetoProof should keep hosted worker operations inside the existing portal `workers` route as one operator workspace with progressive drill-down, not as a loose collection of unrelated cards and not as a separate top-level product surface.

The accepted IA has seven view families:

1. overview
2. pool detail
3. worker detail
4. incident detail
5. rollout detail
6. run-ops detail
7. lease detail

The accepted navigation rule is:

- `workers` is the operator landing view
- pool, incident, rollout, worker, run, and lease detail are drill-down destinations from that landing view
- the user should always be able to return to `workers` without losing current high-level context
- the portal should prefer durable ids and route-backed detail views over modal-only deep state

This keeps worker operations inside the portal shell while still giving operators a real place to investigate live fleet posture.

## Route and view model

The portal should map the worker-operations IA onto the private operator API and the existing benchmark-ops route cluster as follows:

- `/workers`
  - hosted worker-operations overview workspace
- `/workers/pools/:workerPool`
  - pool detail view
- `/workers/workers/:workerId`
  - worker detail view
- `/workers/incidents/:incidentId`
  - incident detail view
- `/workers/rollouts/:rolloutId`
  - rollout detail view
- `/workers/runs/:runId`
  - worker-ops run detail view
- `/workers/leases/:leaseId`
  - lease recovery detail view

These portal routes should consume the private API routes already scoped under `/portal/worker-ops/*`.

The UI should not expose those API paths directly in the browser location. The browser location stays product-shaped and stable, while the API remains implementation-facing.

## Primary operator jobs

The worker-operations IA should optimize for four operator jobs:

- determine whether the fleet is healthy enough to keep serving
- identify which pool, rollout, worker, run, or lease explains a disruption
- decide whether the next action is observation, drill-down, or mutation
- preserve confidence when data is stale, degraded, or partially missing

The portal is not a raw telemetry console. It is an operator decision surface built from sanitized control-plane read models.

## Overview workspace

The overview workspace at `/workers` is the required landing page for worker operations.

It should answer these questions in one screen:

- is the fleet currently serving, cordoned, draining, or partially blocked
- which pools are under pressure
- are there open incidents or blocked rollouts
- are there stale leases or recovery candidates that need attention
- is the underlying worker-ops snapshot live, stale, or degraded

### Required overview sections

The overview workspace should contain these sections in order of importance:

1. fleet status rail
2. pool posture table
3. active incidents strip
4. rollout posture strip
5. stale-lease and blocked-run queue
6. operator next-actions rail

### 1. Fleet status rail

This section is a compact headline summary with:

- freshness status
- healthy versus stale worker posture
- queued jobs and oldest eligible queue age
- active incidents by severity
- active rollouts and blocked rollouts

Its purpose is orientation, not action execution.

### 2. Pool posture table

The pool posture table is the overview's main body.

Each row should show:

- `workerPool`
- serving posture
- desired and active worker instances
- desired and active lease slots
- eligible queued jobs
- oldest eligible queued-job age
- stale lease count
- current rollout target label or digest label
- incident count by severity
- top block reason when present

Each row should link to `/workers/pools/:workerPool`.

The table should be sortable by queue pressure, stale leases, incident severity, and rollout posture so the highest-risk pools surface first.

### 3. Active incidents strip

This is a bounded list of currently open or recently acknowledged incidents with:

- incident severity
- incident class
- affected scope summary
- observed window
- current state

Each card links to `/workers/incidents/:incidentId`.

The overview should not show full incident notes here. This strip exists to route operators into detail, not replace the detail view.

### 4. Rollout posture strip

This is a bounded list of active or blocked rollouts with:

- rollout id
- target digest or version label
- affected pools
- current stage such as `staging`, `promoting`, `blocked`, `rollback_in_progress`, or `complete`
- rollback availability summary

Each card links to `/workers/rollouts/:rolloutId`.

### 5. Stale-Lease and blocked-run queue

This section shows the highest-priority recovery candidates.

Each item should identify:

- the resource type: lease or run
- linked run id
- linked worker or pool scope
- reason class such as `heartbeat_stale`, `recovery_pending`, `queue_blocked`, or `rollout_gate_blocked`
- current age or observed window

Lease items link to `/workers/leases/:leaseId`.

Run items link to `/workers/runs/:runId`.

### 6. Operator next-actions rail

This right rail on desktop, or trailing stacked section on mobile, should show:

- the most urgent drill-down destinations
- the most recent acknowledged incident or active rollout
- the most likely next safe action entry points for admins

This rail should never contain destructive action buttons by itself. It should link operators into the detail view that provides the required preflight context.

## Pool detail view

The pool detail view at `/workers/pools/:workerPool` is the operational center for one serving domain.

It should contain:

- pool identity and serving posture header
- capacity and queue-pressure summary
- bounded active worker list
- bounded incident list scoped to the pool
- rollout state for the pool
- recovery candidates and recent failure clusters
- admin action rail for cordon, drain, rollout progression, or rollback requests

The pool detail view consumes:

- `GET /portal/worker-ops/pools/:workerPool`
- linked freshness envelope for that route

The pool detail view is where operators decide whether an issue is local to one pool or part of a wider fleet incident.

## Worker detail view

The worker detail view at `/workers/workers/:workerId` exists to explain one worker instance, not the whole pool.

It should contain:

- worker identity, pool, runtime, version, and freshness posture
- current lifecycle state and drain posture
- current lease summary if any
- recent lease history
- incident participation
- rollout membership or release digest association
- residue, cleanup, or quarantine summary when available
- admin action rail for worker drain or termination requests

This view consumes:

- `GET /portal/worker-ops/workers/:workerId`

Worker detail should not become a raw log stream. It stays summary-first, with evidence pointers only where the observability policy allows them.

## Incident detail view

The incident detail view at `/workers/incidents/:incidentId` is the canonical portal triage page for one hosted-worker incident.

It should contain:

- incident header with severity, class, state, and observed window
- affected scope summary across pools, workers, runs, and leases
- detection evidence summary
- bounded mitigation timeline
- linked runbooks or action families
- linked rollouts, runs, leases, and workers
- admin acknowledgement and resolution rail

This view consumes:

- `GET /portal/worker-ops/incidents/:incidentId`

Incident detail should present collaborator-safe evidence by default, with admin-only notes rendered only for admins.

## Rollout detail view

The rollout detail view at `/workers/rollouts/:rolloutId` explains one rollout or rollback event end to end.

It should contain:

- rollout header with target digest, status, started-at, and updated-at
- per-pool rollout state
- gate and blocker summary
- staging and production evidence summary
- incident linkage for rollout-related failures
- rollback readiness summary and prior known-good digest
- admin action rail for rollout progression or rollback requests

This view consumes:

- `GET /portal/worker-ops/rollouts/:rolloutId`

Rollout detail is the operator evidence page for release posture. It should not be hidden behind generic worker cards on the overview route.

## Run-Ops detail view

The worker-ops run detail view at `/workers/runs/:runId` is distinct from the contributor run detail under `/runs/:runId`.

It should emphasize operator questions:

- where is this run currently placed
- which workers or leases touched it
- is it blocked, stale, or eligible for recovery
- which incidents, artifacts, or rollout boundaries affect it

This view consumes:

- `GET /portal/worker-ops/runs/:runId`

The portal may still link back to the contributor-style run evidence view, but the operator route owns the worker-ops framing.

## Lease detail view

The lease detail view at `/workers/leases/:leaseId` is the narrowest recovery-focused page.

It should contain:

- linked run, job, attempt, worker, and pool ids
- lease lifecycle state
- heartbeat freshness and expiry posture
- last acknowledged event sequence
- current recovery eligibility summary
- linked incident history
- admin action rail for abandon, recovery, or revoke requests where allowed

This view consumes:

- `GET /portal/worker-ops/leases/:leaseId`

Lease detail should be the place operators confirm whether a stale lease is truly fenced before taking recovery action.

## Navigation rules

The accepted worker-operations navigation model is:

- the left portal navigation keeps one `Workers` entry only
- drill-down routes stay inside the `Workers` context and show a clear breadcrumb back to the overview
- transitions between pool, incident, rollout, run, and lease detail should use explicit linked ids, not inferred browser state
- overview filters and sort state may persist within the `Workers` workspace, but detail routes must remain directly reloadable from the URL

This avoids deep-link loss during incident review or handoff.

## Desktop layout

On desktop, the worker-operations IA should use a two-column workspace pattern:

- main column for tables, timelines, and detail summaries
- secondary rail for freshness, next actions, and bounded context cards

The overview page should keep the pool posture table as the dominant visual element.

Detail pages should keep the resource header and action summary above the fold, with evidence and related resources below.

## Mobile layout

On mobile, the same IA stays intact but stacks vertically:

- freshness and headline posture first
- primary resource summary second
- tables collapse into cards or grouped lists
- next-actions rail moves below the primary summary but above long evidence sections

Mobile is not allowed to hide incident severity, stale status, or rollout blockers behind secondary tabs. Those must remain visible in the first screenful.

## Freshness and degraded-state rules

Every worker-operations route must render the freshness envelope from the private operator API as first-class UI state.

### Live

When `freshnessStatus = live`:

- render the normal route content
- show the latest `observedThrough`
- keep refresh affordances available

### Stale

When `freshnessStatus = stale`:

- keep the last known data visible
- show a stale banner near the route header
- visually mark any time-sensitive sections such as pool pressure, stale leases, or rollout posture as potentially old
- never remove the stale resource rows just because they are old

### Degraded

When `freshnessStatus = degraded`:

- keep any still-valid sections visible
- show an explicit degraded-state banner with the route's `degradationReason`
- annotate the specific missing or partial sections instead of failing the whole page when only one dataset is impaired
- suppress admin mutation affordances when the missing data makes safe action preflight impossible

The portal must not silently present degraded data as healthy just because the fetch succeeded.

## Empty and failed-state rules

The worker-operations IA should distinguish these states clearly:

- empty because there is genuinely no matching data
- unavailable because the route failed
- partial because some sections degraded while others remained usable

Accepted behavior:

- empty lists should explain what would normally appear there
- failed route fetches should keep the page shell, freshness state, and retry affordance visible
- partial route failures should keep successful sections rendered and fence only the failed section

The UI should not collapse every problem into one generic "worker operations unavailable" card.

## Action placement rules

Dangerous actions belong only on the detail view that provides enough context to perform the runbook safely.

That means:

- overview may show urgency and links, but not primary destructive controls
- pool detail may host pool-level control actions
- worker detail may host worker-level control actions
- incident detail may host acknowledgement and resolution actions
- rollout detail may host rollout progression or rollback actions
- lease detail may host recovery actions

All action surfaces should show the minimum preflight context required by the runbook baseline before the operator can confirm.

## Role-aware visibility

The IA should preserve one route structure across collaborator and admin views, while varying what each route reveals and allows.

Collaborators may see:

- fleet health summaries
- pool posture
- incident summaries
- rollout posture
- sanitized run, worker, and lease linkage

Admins additionally see:

- admin-only notes and acknowledgement history
- exact recovery eligibility details
- mutation affordances
- stronger rollout and rollback evidence summaries where collaborator-safe redaction is insufficient

The route tree should stay the same. Hidden detail should degrade by section, not by sending collaborators to a totally different workers product.

## Relationship to adjacent scopes

This IA baseline depends on and sharpens the surrounding hosted-worker scopes:

- `#924` defines the observability evidence and redaction tiers these views must consume
- `#925` defines the runbook families whose preflight context and action rails appear on detail pages
- `#945` defines the private operator API routes and freshness envelope that power this IA
- `#948` should refine shared polling, caching, and stale-state UX semantics across routes
- `#949`, `#953`, and `#954` should implement the backend and frontend slices implied by this IA

## Consequences for follow-up execution

This baseline should directly shape the next execution slices:

- the current `/workers` overview should evolve from one shallow snapshot into the accepted fleet landing workspace
- portal routing should add reloadable drill-down routes for pools, workers, incidents, rollouts, runs, and leases
- private API wiring should be split by route family rather than stretching one giant overview payload forever
- admin actions should be attached to detail pages with required preflight context, not dropped into overview cards
- desktop and mobile QA should verify stale, degraded, partial, and empty state behavior on each route family

## Out of scope

This scope does not:

- implement the portal UI
- define the backend Neon schema
- define the shared polling/cache semantics in detail
- replace the private operator API, observability, or runbook baselines

It defines the live portal worker-operations information architecture those later backend and frontend slices must honor.
