# Portal Benchmark Operations IA Baseline

This document defines the authoritative MVP information architecture for private benchmark operations inside `portal.paretoproof.com`.

The goal is to stop benchmark authoring, run visibility, launch, and worker operations from drifting between the deferred `math.paretoproof.com` idea, the public reporting surface, and the unrelated admin-review routes.

## Core decision

Portal benchmark operations live in one portal-owned feature cluster with one default landing view and four operation families:

- `/` for authenticated benchmark-operations overview
- `/runs` and `/runs/:runId` for private run visibility and drilldown
- `/launch` for trusted run launch
- `/workers` for worker and queue operations
- future `/benchmarks/*` routes for benchmark authoring and private benchmark configuration

This means:

- `math.paretoproof.com` does not own any MVP benchmark-operations UX
- public benchmark release reading stays on the apex site
- admin review work stays on `/admin/access-requests` and `/admin/users`
- benchmark authoring is portal-owned, but it is not collapsed into `Runs`, `Launch`, or `Workers`

## Why this is the MVP structure

Three constraints now matter at the same time:

- the math hostname is explicitly deferred by [math-surface-mvp-baseline.md](math-surface-mvp-baseline.md)
- the shared route contract already reserves `/runs`, `/runs/:runId`, `/launch`, and `/workers`
- worker, offline-ingest, and future claim-loop work need stable browser-facing destinations inside the portal before more frontend execution work continues

The portal therefore needs one clear operations map now rather than several loosely related "math" pages.

## Portal benchmark-operations map

| Section | Route family | MVP role gate | Purpose |
| --- | --- | --- | --- |
| Overview | `/` | approved helper or higher | Show the current operational state, recent run activity, and the next useful actions for the signed-in role. |
| Runs | `/runs`, `/runs/:runId` | approved helper or higher | Browse private run history, apply investigation filters, and open one concrete run for drilldown. |
| Launch | `/launch` | approved collaborator or higher | Start new benchmark executions from one controlled portal workflow. |
| Workers | `/workers` | approved collaborator or higher | Inspect worker fleet posture, queue state, and execution capacity once orchestration is live. |
| Benchmarks | future `/benchmarks/*` | approved collaborator or higher by default | Own benchmark authoring, benchmark-version management, and private benchmark configuration work. |

The first four route families are the operational MVP spine. The `Benchmarks` family is defined here so authoring has an approved home, but it does not need to block the current run-operations execution lane.

## Section responsibilities

### Overview

`/` is the portal landing view for approved users.

It should answer:

- what is active right now
- whether the API and worker system appear healthy
- what benchmark-operation actions are available for the current role

It should not become:

- a second run-detail page
- the full worker dashboard
- a place where benchmark definitions are edited inline

Overview is the orientation layer, not the permanent home for deeper workflows.

### Runs

`/runs` is the canonical private read surface for benchmark execution history.

`/runs/:runId` is not a separate top-level nav item. It is the detail child of the `Runs` section.

The `Runs` family owns:

- the filtered run index
- shareable query-state drilldown
- private run evidence and status inspection
- links to artifact references and rerun lineage allowed by portal permissions

The `Runs` family must not absorb:

- benchmark definition editing
- worker-fleet operations
- the initial launch form

This keeps run investigation distinct from benchmark authoring and execution control.

### Launch

`/launch` is the only top-level portal entry for starting benchmark execution.

This section owns:

- selecting the already-defined benchmark target to run
- selecting model and execution parameters allowed by policy
- confirming budget-relevant launch intent
- later retry or relaunch entry points that still create a controlled run request

This section must not become:

- a hidden benchmark editor
- a generic queue dashboard
- the main place where historical results are reviewed

Launch consumes benchmark definitions and run policies. It does not author them.

### Workers

`/workers` is the operations view for execution capacity and worker posture.

This section owns:

- worker availability
- queue and claim-loop posture
- worker failure or degraded-capacity signals
- role-gated operator actions that affect worker execution rather than benchmark content

This section must not become:

- the primary run-detail surface
- a public reliability dashboard
- the benchmark-authoring workspace

Worker operations are part of benchmark execution, but they are not the same thing as result review or benchmark definition management.

### Benchmarks

Benchmark authoring belongs in the portal, but not in a separate MVP hostname and not as an extra mode inside `Launch`.

The future `Benchmarks` family should own:

- benchmark catalog and version inventory
- benchmark metadata and provenance review
- private benchmark-package or statement-version management
- curation and authoring workflows that prepare immutable benchmark versions for launch

The intended route family is:

- `/benchmarks`
- `/benchmarks/:benchmarkId`
- `/benchmarks/:benchmarkId/versions/:benchmarkVersionId`

This is a portal-owned collaborator/admin workspace. It should be treated as a later portal feature family, not as a reason to overload the current MVP run-operations routes or to revive `math.paretoproof.com`.

## Public versus portal boundary

This IA depends on a strict split between public release reading and private operations:

- public benchmark discovery and released reports remain on `paretoproof.com`
- private run inspection, launch, worker posture, and future benchmark authoring remain in `portal.paretoproof.com`

The public route families already reserved for released benchmark reading remain:

- `/benchmarks`
- `/reports/:benchmarkVersionId`

Those public pages are release-oriented, not operator-oriented. They must not be treated as substitutes for the portal `Runs` or `Workers` sections.

## Relationship to admin routes

Benchmark operations are not the same thing as admin population management.

The admin routes remain separate:

- `/admin/access-requests`
- `/admin/users`

Those pages own contributor approval and role management, not benchmark authoring or execution review. The portal navigation may place them in the same shell, but they are a separate IA slice from benchmark operations.

## Navigation rules

The portal navigation should follow these rules:

1. Keep `Overview`, `Runs`, `Launch`, and `Workers` as the primary benchmark-operations sections.
2. Treat run detail as part of `Runs`, not as a standalone nav section.
3. Do not create a separate `Math` nav cluster during MVP.
4. Add `Benchmarks` later as a portal feature family if and when benchmark authoring work is implemented.
5. Keep admin routes visibly separate from benchmark-operations routes even when both live in the same shell.

## Read-model and API implications

The frontend IA should drive backend read models rather than the other way around.

The minimum section-aligned data slices are:

- overview summary slice for portal landing cards and role-aware next actions
- run index slice for `/runs`
- run detail slice for `/runs/:runId`
- launch reference-data and submit contract for `/launch`
- worker posture slice for `/workers`
- later benchmark catalog and benchmark-version slices for `/benchmarks/*`

This keeps the portal from forcing one giant "operations payload" into every page.

## Effect on older frontend scopes

This baseline makes the old generic scopes too imprecise for the current product map:

- `#60` should be superseded by future portal-owned benchmark-authoring scope under `/benchmarks/*`, not by a standalone "math problem input" page
- `#61` should be superseded by worker-operations scope rooted at `/workers`
- `#62` should be superseded by run-launch scope rooted at `/launch`

Those older scopes were framed before the math-hostname deferral and before the current portal route contract existed.

## Follow-up execution lanes this scope should unlock

This scope should unlock at least:

1. an execution issue to align the frontend route tree and portal navigation with this IA
2. an execution issue to define backend read models and API boundaries for these route families
3. an execution issue to implement the MVP portal `Runs`, run-detail, `Launch`, and `Workers` surfaces
4. issue cleanup that closes `#60`, `#61`, and `#62` as superseded once replacement scopes or execution tasks exist

## Relationship to adjacent baselines

- [math-surface-mvp-baseline.md](math-surface-mvp-baseline.md) defers `math.paretoproof.com` and forces benchmark operations back into the portal
- [product-surface-boundary-baseline.md](product-surface-boundary-baseline.md) defines why private benchmark operations belong in the portal and public release reading belongs on the apex
- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the release-oriented public reporting flow that this portal IA intentionally does not replace
- [results-sort-filter-export-baseline.md](results-sort-filter-export-baseline.md) defines the richer filter and export behavior for the `Runs` family
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines how portal run investigation deepens from the `Runs` index into detail views
- [admin-verification-ux-baseline.md](admin-verification-ux-baseline.md) defines the separate admin-review slice that should not be mixed into benchmark operations

This document is the source of truth for where portal benchmark operations belong during MVP.

## Out of scope

- implementation details of the portal pages themselves
- a new `math.paretoproof.com` hostname or route tree
- public release-page IA beyond the existing public reporting baselines
- the detailed benchmark-authoring workflow inside future `/benchmarks/*` routes
- admin audit workflow details already covered by the separate admin baseline
