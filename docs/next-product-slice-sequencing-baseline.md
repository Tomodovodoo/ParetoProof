# Next Product Slice Sequencing Baseline

This document defines the next high-leverage submission, review, dashboard, and public-reporting sequence after the current benchmark kernel so the roadmap stops drifting into low-leverage polish or disconnected UI slices.

## Current baseline

The repository now has materially more kernel definition than it had when this sequencing issue was opened.

Accepted upstream scope now includes:

- `docs/problem9-benchmark-target-baseline.md`: `firstproof/Problem9` is no longer a bootstrap-only theorem and now has an accepted canonical target
- `docs/benchmark-intake-review-workflow-baseline.md`: benchmark intake stays repository-first, with any later math workflow limited to structured candidate and review state
- `docs/portal-launch-mutation-baseline.md`: launch is a portal-owned browser-to-queue mutation
- `docs/portal-run-control-actions-baseline.md`: run-detail browser control is intentionally narrow
- `docs/math-surface-activation-baseline.md`: `math.paretoproof.com` is now the accepted authenticated math workflow surface, while released reporting still stays on the apex site

There is also now an active benchmark-product object scope in flight, which means the project can stop guessing about the layer above raw runs and start sequencing real follow-on work deliberately.

## Decision

The next product slice should be sequenced in this order:

1. benchmark truth and package-upgrade completion
2. benchmark product-object and release-model completion
3. benchmark candidate intake and curation-review contracts
4. portal review and dashboard surfaces on the approved route boundaries
5. public release and reporting surfaces on `paretoproof.com`
6. richer comparison and frontier-reporting work only after release objects are stable

The project should not refill the backlog with opportunistic tiny-screen, CTA, or cosmetic dashboard work until these layers are intentionally populated.

## Why this order

The ordering is driven by dependency shape rather than visual appeal.

- Benchmark truth must come before intake and review, because the system needs one honest benchmark target before it can define how new candidates should be accepted.
- Product objects must come before dashboards and public reporting, because otherwise the UI keeps encoding product meaning in raw ids, ad hoc queries, or hardcoded data.
- Intake and review contracts must come before portal review surfaces, because workflow UI without accepted candidate/review/release objects turns into policy by accident.
- Public reporting must come after release approval and publication-state handling, because released pages should consume approved product objects rather than mining private operational data directly.

## Slice 1: Benchmark Truth And Package Upgrade

### Purpose

Make the canonical benchmark truthful in code, verifier expectations, and worker-facing docs.

### Includes

- upgrade `benchmarks/firstproof/problem9` to the accepted closed-form theorem target
- refresh gold proof, statement markdown, README, and package version
- refresh verifier goldens, negative fixtures, prompt-package expectations, and attempt smoke expectations that still encode the old recurrence statement

### Why first

This is the smallest execution slice that turns the kernel from "platform built around a provisional theorem" into "platform built around the benchmark it actually claims to evaluate."

### Representative follow-on

- `#718`

## Slice 2: Benchmark Product Objects And Release Model

### Purpose

Add the durable product layer above raw runs so launch, release, and later comparison work refer to real objects rather than loose ids.

### Includes

- benchmark version
- model registry entry
- launch template
- benchmark release
- the minimum persistence and route contracts needed to make those objects real

### Why second

The system already has runs, jobs, attempts, and artifacts. What it still lacks is a durable answer to:

- what benchmark version is being launched
- what model object is being evaluated
- what releaseable result set is approved for publication

Without this layer, later intake dashboards and public reports will keep reconstructing product meaning from execution rows alone.

### Scope and execution relationship

- the current benchmark-product-objects scope should finish first
- execution work should then implement the smallest object layer needed for launch and release flows

## Slice 3: Benchmark Candidate Intake And Curation Review Contracts

### Purpose

Turn repository-first benchmark intake into a structured candidate/review/release workflow without moving package authorship into the browser.

### Includes

- `benchmark_candidate`
- `curation_review`
- `release_decision`
- `publication_status`
- admin or reviewer audit boundaries for approval, rejection, and hold-out state

### Why third

This layer depends on both benchmark truth and benchmark product objects.

The project should not build benchmark review UI until it knows:

- what the benchmark target truth is
- what product object the candidate will eventually become if approved

### Route boundary

This workflow should live on a separate privileged route family such as `/admin/benchmark-candidates/*`, not on `/runs`, `/launch`, or `/workers`.

## Slice 4: Portal Review And Dashboard Surfaces

### Purpose

Expose the approved review and release workflow inside the portal without mutating the benchmark-ops execution cluster into a benchmark CMS.

### Includes

- candidate queue and detail views
- reviewer checklist and decision surfaces
- release-readiness dashboards
- benchmark-specific admin drilldown read models

### Why fourth

The UI should consume the structured candidate/review/release contracts from Slice 3 instead of defining them implicitly in components.

This is where dashboard work becomes high leverage rather than decorative.

### Explicit anti-goal

Do not start with generic benchmark charts or public-facing benchmark dashboards before the candidate/review/release objects exist.

## Slice 5: Public Release And Reporting Surfaces

### Purpose

Move approved benchmark releases and released reporting onto the apex site under the existing surface policy.

### Includes

- public benchmark release pages
- released metrics or report summaries tied to approved release objects
- publication-state enforcement so held-out or internal-only candidates never leak into public pages

### Why fifth

Public reporting should consume approved release objects, not query draft review data or private portal state.

The apex site is still the right home for released benchmark reporting even after activating `math.paretoproof.com` for authenticated workflow.

## Slice 6: Richer Comparison And Frontier Reporting

### Purpose

Add like-for-like comparison groups and higher-level frontier reports only after releases are stable and review-approved.

### Includes

- comparison groups
- public comparison summaries
- richer frontier reports or cross-release narratives

### Why sixth

Comparison and frontier-reporting work is valuable, but it is downstream of:

- benchmark truth
- release approvals
- publication posture
- stable benchmark and model objects

Without those upstream layers, "dashboard" work becomes noisy aggregation instead of trustworthy reporting.

## What Not To Prioritize First

The next roadmap refill should explicitly avoid prioritizing these ahead of the ordered slices above:

- more tiny-screen polish for already-accepted routes
- public benchmark charts that bypass release approval objects
- new benchmark authoring UI on `/launch` or `/runs`
- a separate benchmark hostname
- generic dashboard shells with placeholder data but no stable benchmark candidate or release object model

These are not forbidden forever. They are simply lower leverage than the kernel-adjacent product layer that is now missing.

## Recommended backlog refill order

When turning this into issues, the recommended refill order is:

1. kernel execution work that upgrades `firstproof/Problem9` to the accepted theorem target
2. execution work for the benchmark version and release object layer
3. execution work for the benchmark candidate and curation-review contract layer
4. portal review and release dashboards on the approved admin route family
5. public release/reporting tasks on `paretoproof.com`
6. comparison and frontier-reporting tasks after release objects are shipping cleanly

## Relationship To Active Work

This sequencing baseline does not replace active PRs already scoping the adjacent boundaries.

It assumes the currently active benchmark-product and delegated-review scope work will either land or be replaced by equivalent accepted boundaries before downstream execution issues are queued against them.

The important point is ordering:

- benchmark truth before candidate review expansion
- product objects before dashboards
- release approvals before public reporting

## Follow-up execution slices

Execution work after this scope should therefore be opened in dependency order:

1. canonical Problem 9 package upgrade and verifier/doc refresh
2. benchmark version, model registry, launch-template, and benchmark-release implementation
3. benchmark candidate, curation-review, release-decision, and publication-status implementation
4. portal admin benchmark-candidate and release-review surfaces
5. apex-site released benchmark reporting pages
6. comparison-group and frontier-report work once releases are stable
