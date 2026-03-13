# Portal Benchmark Operations IA Baseline

This document defines the authoritative MVP information architecture for benchmark operations inside `portal.paretoproof.com` now that `math.paretoproof.com` is deferred.

The goal is to stop private benchmark work from drifting between a nonexistent math hostname, a generic "math input" page, and the route families the portal already reserves.

## Core decision

MVP benchmark operations in the portal use one route cluster with three top-level operational destinations:

- `/runs`
- `/launch`
- `/workers`

The canonical detail destination inside that cluster is:

- `/runs/:runId`

There is no separate MVP portal route for benchmark authoring or math-problem entry.

Instead, the MVP rule is:

- benchmark packages are authored and versioned outside the browser workflow
- the portal consumes approved benchmark versions as launchable or inspectable objects
- run visibility, launch intent, and worker posture each get one clear route owner inside the portal

This keeps the IA aligned with the current route contract and with the deferred-math-hostname decision.

## Route ownership map

| Route | Primary audience | Primary job | Owns | Must not own |
| --- | --- | --- | --- | --- |
| `/` | approved helpers, collaborators, admins | landing summary | high-level activity, role-aware next actions, service posture | deep run drilldown, launch forms, worker diagnostics |
| `/runs` | approved helpers and higher | shared private run index | run visibility, result filtering, rerun lineage entry points, benchmark-version context | launch configuration, worker-fleet health as a primary surface |
| `/runs/:runId` | approved helpers and higher | canonical evidence view for one run | run timeline, job or attempt state, failure details, artifacts, rerun or cancel context | cross-run fleet dashboards, benchmark-package authoring |
| `/launch` | collaborators and admins | run creation workspace | benchmark selection, run-shape configuration, preflight validation, queue-intent submission | long-lived run investigation, worker health dashboards |
| `/workers` | collaborators and admins | execution operations overview | worker pool posture, queue pressure, lease and failure posture, links to impacted runs | benchmark authoring, generic results browsing |

The portal overview route may summarize these areas, but it does not replace any of them as the canonical workspace.

## Benchmark authoring boundary

MVP benchmark operations are package-selection-first, not browser-authoring-first.

That means the portal does not own:

- freeform theorem or problem entry
- manual benchmark-package editing
- browser-side benchmark curation as a primary MVP workflow
- a dedicated `/benchmarks` or `/math` portal route

In MVP, benchmark authoring remains repository-owned and package-driven. The portal only needs enough benchmark metadata to:

- select an approved benchmark version or slice at launch time
- label runs consistently in `/runs` and `/runs/:runId`
- explain what benchmark package a worker or run is operating against

Any future browser-based benchmark authoring would be a later scope and must justify a new route family explicitly instead of being smuggled into this MVP cluster.

## Navigation model

The benchmark-operations cluster should read as one coherent branch of the portal navigation:

- `Overview` is the portal landing summary
- `Runs` is the default benchmark-operations destination for all approved users
- `Launch` is the create-new-run workspace for budget-trusted users
- `Workers` is the execution-operations workspace for budget-trusted users

Navigation rules:

- helpers land on `Overview` and use `Runs` as their deepest benchmark workspace
- collaborators and admins see `Launch` and `Workers` beside `Runs`, not nested under a synthetic math section
- there is no separate benchmark-authoring nav item in MVP
- run links from `Overview`, `Launch`, and `Workers` always resolve into `/runs` or `/runs/:runId`

## `/runs` as the benchmark operations home

`/runs` is the canonical private index for benchmark operations.

It answers:

- what runs exist
- which benchmark version each run belongs to
- which runs are active, failed, cancelled, or succeeded
- which slices need investigation or rerun

This route owns the authenticated results-index behavior already approved by:

- `results-sort-filter-export-baseline.md`
- `results-drilldown-ux-baseline.md`

Required `/runs` responsibilities:

- show the filterable and shareable run table for helpers and higher
- expose benchmark-version metadata as row context, not as a separate route family
- link each row into `/runs/:runId`
- support private CSV export and URL query state for investigation
- surface rerun lineage and failure buckets as run-table concerns

`/runs` must not become:

- a worker dashboard
- a launch wizard
- a benchmark-package editor

## `/runs/:runId` as the canonical detail view

`/runs/:runId` is the only canonical evidence destination for one run.

This route owns:

- run summary and identity
- benchmark-package and model-config context
- state timeline
- job and attempt posture
- failure details and retry context
- artifact references
- rerun lineage

Run-specific control actions belong here when they target one existing run, for example:

- cancel request
- rerun or retry initiation when a later execution scope allows it
- links to affected worker or queue context

The rule is simple:

- cross-run discovery lives on `/runs`
- single-run evidence and per-run control live on `/runs/:runId`

That keeps `Launch` from becoming a second run-detail route and keeps `Workers` from becoming a shadow debug console.

## `/launch` as the create-run workspace

`/launch` is the only MVP route for creating new benchmark execution intent.

This route owns the launch workflow for collaborators and admins:

1. choose an approved benchmark version or slice
2. choose the run kind and execution shape
3. choose model and provider configuration
4. review governance, budget, and concurrency implications
5. submit the launch request and receive the created queued run record

The launch route is the correct home for:

- selecting among repository-owned benchmark versions
- selecting `single_run`, `benchmark_slice`, `full_benchmark`, or `repeated_n` run shape when those are allowed
- explaining budget and concurrency constraints before queue submission
- confirming the created run id and linking directly into `/runs/:runId`

The launch route is not the home for:

- long-lived monitoring of active runs
- browsing historical results
- manual worker troubleshooting
- freeform problem entry or benchmark-package authoring

This supersedes the earlier idea that a private "math problem input" page should exist as an MVP peer route. In MVP, benchmark selection is a step inside launch, not a separate top-level workspace.

## `/workers` as the execution operations workspace

`/workers` is the operations view for the execution system, not the main results view.

This route owns:

- worker pool availability
- queue and claim pressure
- lease posture and stale-heartbeat visibility
- recent worker-side failure clusters
- links from operational incidents into the affected runs

The route should answer:

- is execution capacity healthy
- are workers claiming and heartbeating normally
- which runs or jobs are blocked by worker problems
- whether a queue or worker issue is broad or isolated

MVP `/workers` is read-mostly. It may later gain explicit operator actions, but it should start from inspection and routing into `/runs/:runId` for concrete evidence.

`/workers` must not absorb:

- the main historical run table
- benchmark launch setup
- benchmark authoring
- public-facing benchmark reporting

This supersedes the older generic "worker runners and stats" scope by fixing worker posture as one collaborator-plus route inside the portal cluster instead of a separate surface concept.

## Cross-route flow rules

The route cluster should support these primary flows.

### Flow 1: investigate an existing run

- enter from `Overview` or directly at `/runs`
- filter to the relevant benchmark slice or failure bucket
- open `/runs/:runId`
- inspect artifacts, job or attempt state, and lineage there

### Flow 2: launch a new run

- enter `/launch`
- select the benchmark version and run shape
- submit the run intent
- redirect to `/runs/:runId` for the created run or to `/runs` with the new run pre-filtered

### Flow 3: diagnose worker trouble

- enter `/workers`
- identify the affected queue, worker, or lease state
- jump into the impacted run detail on `/runs/:runId`
- use run-level evidence and allowed control actions there

These flows intentionally converge on `/runs` and `/runs/:runId` as the shared evidence layer.

## Role mapping

The route IA follows the existing portal role model.

### Helper

Helpers may use:

- `Overview`
- `/runs`
- `/runs/:runId`

Helpers do not get:

- `/launch`
- `/workers`

### Collaborator

Collaborators inherit helper visibility and add:

- `/launch`
- `/workers`

Collaborators are the first role trusted to spend benchmark execution budget.

### Admin

Admins inherit collaborator benchmark operations and separately gain the admin management routes.

The benchmark-operations IA for admins is the same as for collaborators. Admin-specific review work stays on `/admin/*`, not inside the benchmark-operations cluster.

## URL and state rules

The benchmark-operations routes must keep one stable URL model.

- `/runs` owns shareable query-state filtering and sort controls
- `/runs/:runId` owns the stable run identity in the path
- `/launch` owns launch-form state and should not become a query-param clone of the runs table
- `/workers` owns worker and queue filters, not result-table query aliases

This prevents benchmark operations from splitting into parallel route families that encode the same object in inconsistent ways.

## MVP boundaries

The approved MVP benchmark-operations cluster does not include:

- a dedicated portal benchmark-authoring route
- a portal math-problem-entry route
- a separate portal benchmark catalog route beyond benchmark selection inside `/launch` and benchmark labeling inside `/runs`
- a second run-detail route under `/workers` or `/launch`
- a browser-facing worker-control surface that bypasses run detail for evidence review

## Relationship to adjacent baselines

- `product-surface-boundary-baseline.md` keeps all authenticated benchmark work inside the portal instead of a deferred math hostname
- `math-surface-mvp-baseline.md` is why this IA must fit entirely inside existing portal routes
- `results-sort-filter-export-baseline.md` defines the canonical sort, filter, and CSV behavior that `/runs` reuses
- `results-drilldown-ux-baseline.md` defines the run-investigation flow that `/runs` and `/runs/:runId` must host
- `run-control-governance-baseline.md` defines the launch, cancel, retry, and concurrency rules that `/launch` and `/runs/:runId` must surface without redefining them
- `internal-contracts-api-baseline.md` defines the intent-registration boundary for launch and the asynchronous worker boundary that keeps `/workers` observational rather than browser-executed

## Follow-up execution lanes

This scope should unlock:

- a frontend issue to align portal navigation, route shells, and empty states with the approved benchmark-operations cluster
- a backend issue to define the read models and API query boundaries for `/runs`, `/runs/:runId`, `/launch`, and `/workers`
- a frontend implementation issue to build the MVP portal benchmark-operation surfaces against those read models
- closure of `#60`, `#61`, and `#62` as superseded by this route-owned IA

## Out of scope

- browser-based benchmark package authoring
- public benchmark reporting changes on the apex site
- introducing `math.paretoproof.com` back into MVP
- deep worker-control mutations beyond the minimal future operator actions explicitly scoped later
- creating additional portal route families for benchmark operations without a new scope decision
