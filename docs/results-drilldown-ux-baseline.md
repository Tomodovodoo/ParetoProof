# Results Drilldown UX Baseline

This document defines the MVP drilldown behavior for evaluation results in the contributor portal.

## Goal

Contributors and admins must be able to move from a high-level results view to concrete run evidence by evaluation, model, problem, failure mode, and rerun status without leaving the portal context.

## Required drilldown pivots

MVP results views must support these pivots:

- evaluation batch
- benchmark version
- run id
- model/provider configuration
- problem/task id
- lifecycle bucket (`queued`, `running`, `cancel_requested`, `succeeded`, `failed`, `cancelled`)
- verdict bucket (`pass`, `fail`, `invalid_result`) when evaluated result records exist
- rerun lineage (`original`, `retry_n`, `manual_rerun`)

Each pivot must be composable with at least one additional pivot (for example model + failure status).

## Drilldown flow model

The interaction stack is three levels:

1. Results index
2. Filtered run table
3. Run detail panel

### 1) Results index

Shows aggregate counters and quick filters:

- total runs
- pass rate
- failure count
- active count
- rerun count

Clicking any counter must apply a visible filter to level 2.

### 2) Filtered run table

Shows one row per run attempt with:

- run id
- evaluation or benchmark label
- model config label
- lifecycle state
- verdict bucket when available
- started/finished timestamps
- rerun lineage marker
- quick failure badge (when failed)

Table interactions:

- sort by newest, pass rate, duration, failure count
- filter by pivot set above
- export current filtered selection (CSV baseline)
- open run detail on row click

### 3) Run detail panel

The run detail panel is the canonical evidence view for one run attempt.

Required sections:

- summary: run id, version mapping, status timeline
- problem results list with pass/fail and per-problem status
- failure details (for failed problems/runs)
- artifact references (logs/traces/bundles) by class
- rerun lineage and links to related attempts

## Failure and rerun visibility

Failed runs must expose enough detail to decide whether rerun is needed.

For each failure, show:

- failure stage (`claim`, `execution`, `artifact_upload`, `result_submit`, `control_plane_validation`)
- normalized failure reason code
- human-readable summary
- first-seen timestamp
- retry-eligible flag (yes/no)

Rerun display rules:

- every rerun links back to its originating run
- lineage chain must remain visible in both table and detail panel
- rerun reason is required (`infra_flake`, `model_error`, `operator_retry`, `budget_requeue`, `other`)

## Comparison baseline

MVP supports side-by-side comparison of up to two filtered result sets.

Comparison dimensions:

- pass rate delta
- solved-problem overlap and diff
- failure category distribution
- median runtime delta
- rerun rate delta

Comparison must be scoped to the same benchmark/version family. Cross-benchmark comparison is out of MVP scope.

## Routing and state handling

Portal results drilldown state should be URL-shareable.

- encode active filters and sort in query params
- include selected run id in query state when detail panel is open
- preserve filter state when navigating between portal subviews

This keeps deep links usable for async review and admin support.

## Responsive behavior

- desktop: table + detail split view allowed
- tablet/mobile: table and detail become stacked views with explicit back navigation
- critical status and rerun indicators must remain visible without horizontal overflow

## Out of scope

- arbitrary multi-run comparison matrices beyond two selections
- custom chart builder
- cross-project federated result search
- public anonymous results drilldown outside authenticated portal access

Status naming in this document must follow [run-state-vocabulary-baseline.md](run-state-vocabulary-baseline.md). In particular, `timed_out` is a derived failure bucket rather than a primary lifecycle state, and the canonical spelling is `cancelled`.

The allowed sort, filter, and export semantics for these drilldown surfaces are defined in [results-sort-filter-export-baseline.md](results-sort-filter-export-baseline.md).
