# Results Sort, Filter, and Export Baseline

This document defines the MVP sort, filter, and export requirements for benchmark-result views across the public site and the authenticated portal.

The goal is to make released results easy to scan publicly while still giving contributors and admins enough control to isolate concrete runs, failure clusters, and reproducibility slices inside the portal.

## Core decision

ParetoProof should use two different result-interaction tiers:

- public release reporting stays intentionally simple and release-oriented
- authenticated portal results views provide the richer sort, filter, and export controls needed for investigation and review

The MVP must not collapse those two needs into one overloaded table.

## Surface split

### Public benchmark reporting

The public site supports only lightweight controls on released benchmark summaries.

Allowed MVP controls:

- choose the benchmark release being viewed
- sort the primary public results table by:
  - public display label
  - solved count or pass rate
  - total evaluated items or runs
  - release timestamp
- optionally filter within a release by one simple status dimension:
  - result outcome (`pass`, `fail`, `mixed`, `not_reported`)
  - release completeness state (`complete`, `partial`, `withheld`, `superseded`)

Disallowed in MVP public views:

- advanced multi-filter panels
- failure-code filtering
- rerun-lineage filtering
- arbitrary export buttons
- public artifact or evidence exports

The public site is a release-reading surface, not a researcher workbench.

### Authenticated portal results views

The portal supports the richer controls needed to move from summaries into specific result slices.

Portal result tables and indices must support filtering on these dimensions:

- evaluation batch
- benchmark family
- benchmark version or package digest
- run id
- job id when applicable
- attempt id when applicable
- model config id
- provider family
- auth mode
- run mode
- tool profile
- lifecycle bucket
- verdict bucket
- failure family
- failure code
- problem or task id
- rerun lineage
- retry-eligible flag
- started-at or finished-at time range

These filters may render as a compact bar plus a secondary drawer, but they must all be representable in URL state for shareable drilldowns.

## Required sort behavior

### Public table sorting

Public tables should expose only one active sort at a time.

Required public sort rules:

- default sort: solved count or pass rate descending, then public display label ascending
- release timestamp sort: newest first by default
- string sorts use ascending order first
- ties must fall back to public display label, then stable release row id

Public pages must not expose multi-column sort builders or analyst-only ranking controls.

### Portal table sorting

Portal result tables must support one explicit active sort with deterministic tie-breaking.

Required sortable fields:

- started-at timestamp
- finished-at timestamp
- duration
- model config label
- lifecycle bucket
- verdict bucket
- failure family
- rerun lineage
- run id

Aggregate result views may additionally sort by:

- pass rate
- solved count
- failure count
- rerun rate

Portal default sort:

- newest started-at first for run tables
- highest pass rate first for aggregate comparison tables

Tie-break rule:

- stable id ordering (`runId`, `attemptId`, or aggregate row key) must resolve ties so exports and pagination stay deterministic

## Required filter behavior

### Filter composition

MVP portal filtering must support combining at least:

- one identity filter
- one status filter
- one model or provider filter

Example valid combinations:

- benchmark version + model config + verdict bucket
- provider family + failure family + time range
- rerun lineage + lifecycle bucket + started-at range

### Filter UX rules

Filter UX must follow these rules:

- active filters are always visible as removable chips, tags, or pills
- clearing one filter must not clear the whole filter set
- default empty state means "all visible results within the current page context"
- URL state is the source of truth for active sort and filter values
- mobile layouts may collapse the controls into a sheet, but active filters must remain visible after the sheet closes

### Canonical query-state keys

Portal results routes must use one stable query-state shape so links, exports, and frontend state do not invent parallel aliases.

Required key names:

- `runLifecycle`
  - comma-separated canonical `run.state` ids such as `running,cancel_requested`
- `lifecycleBucket`
  - one derived bucket id from [run-state-vocabulary-baseline.md](run-state-vocabulary-baseline.md), such as `active`
- `verdict`
  - comma-separated canonical verdict ids such as `fail,invalid_result`
- `failureFamily`
  - canonical failure-family ids only
- `failureCode`
  - canonical failure-code ids only
- `sort`
  - one documented sort id such as `started_at_desc`
- `q`
  - free-text search term when a view supports search

Disallowed key names:

- `status`
- `stateLabel`
- ad hoc result-only aliases that hide the lifecycle versus verdict split
- US-spelled cancellation values

Example query state:

- `/runs?runLifecycle=running,cancel_requested&lifecycleBucket=active&verdict=fail,invalid_result&sort=started_at_desc`

### Canonical grouping buckets

When a UI offers grouped filters instead of raw enums, it must derive them from the canonical backend vocabularies:

- lifecycle grouping must follow [run-state-vocabulary-baseline.md](run-state-vocabulary-baseline.md)
- verdict grouping must use `pass`, `fail`, and `invalid_result`
- failure grouping must use the canonical failure-family and failure-code catalogs rather than ad hoc labels such as "timeout-ish"

## Export baseline

### Public site exports

Public benchmark result pages do not expose direct export actions in MVP.

If public users need data beyond the on-page release summary, that should be handled later through explicit publication artifacts or downloadable benchmark reports, not through ad hoc table exports in the first release UI.

### Portal exports

Portal result views must support one MVP export action:

- export the current filtered table selection as CSV

The export slice is defined strictly as:

- the current route context
- the current filter set
- the current search query if present
- the current comparison scope if the view is an aggregate comparison table
- all matching rows, not just the current visible page

MVP CSV exports must include:

- stable ids (`runId`, `jobId`, `attemptId`, or aggregate row id as applicable)
- benchmark/version identifiers
- model config identifiers and display labels
- lifecycle bucket
- verdict bucket
- failure family and failure code when present
- rerun lineage
- started-at and finished-at timestamps
- duration when known

The canonical CSV header set for run-level exports should be:

- `runId`
- `jobId`
- `attemptId`
- `benchmarkVersionId`
- `modelConfigId`
- `modelConfigLabel`
- `runState`
- `runStateLabel`
- `runLifecycleBucket`
- `verdictClass`
- `verdictLabel`
- `failureFamily`
- `failureCode`
- `startedAt`
- `finishedAt`
- `durationMs`

Header rules:

- lifecycle fields must use `runState` and `runStateLabel`, not `status`
- verdict fields must use `verdictClass` and `verdictLabel`, not any legacy result-only status alias
- labels are optional convenience columns; canonical ids remain the authority for filtering and downstream parsing

MVP does not require:

- XLSX export
- PDF export
- custom column pickers
- saved export templates
- public anonymous CSV download

### Non-goals for this scope

This document does not define:

- artifact bundle download packaging
- reviewer evidence exports
- release-note publication bundles

Those belong to the artifact and release-surface baselines instead of the table-control baseline.

## MVP behavior summary

The MVP interaction contract is:

1. public release pages expose only simple within-release sorting and at most one lightweight status filter
2. portal result views expose the full canonical filter set needed for run investigation
3. portal exports are CSV-only and always respect the active filtered slice
4. all sort and filter state is shareable through URL query params
5. no surface supports saved views, arbitrary analyst builders, or spreadsheet-style customization in MVP

## Relationship to adjacent docs

- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the public release-reading flow that this document intentionally keeps simple
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines the portal drilldown flow whose table controls are further specified here
- [run-state-vocabulary-baseline.md](run-state-vocabulary-baseline.md) defines the canonical lifecycle and verdict groupings that result filters must reuse
- [artifact-class-catalog-baseline.md](artifact-class-catalog-baseline.md) and [artifact-reference-fields-baseline.md](artifact-reference-fields-baseline.md) define export-related artifact ownership, but not the UI control model

## Out of scope

- saved result views
- custom dashboard builders
- cross-benchmark public comparison consoles
- public export APIs
- portal export scheduling or background export jobs
