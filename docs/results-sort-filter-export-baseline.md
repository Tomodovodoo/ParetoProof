# Results Sort, Filter, and Export Baseline

This document defines the MVP sort, filter, and export behavior for benchmark and result views across the public site and contributor portal.

The goal is to make released results easy to scan, share, and reuse without turning every surface into a dense analytics tool.

## Core decision

ParetoProof has two different result-view surfaces, and they should not share one control model.

- the public site exposes simple release-scoped controls for released benchmark summaries
- the portal exposes richer run and result controls for authenticated contributors and admins

MVP should therefore use one common interaction language, but two different control depths.

Common interaction language means:

- filters are visible as chips or pills once applied
- different filter dimensions combine with `AND`
- multiple selections inside one filter dimension combine with `OR`
- one primary sort is active at a time
- exports reflect the current scoped view rather than silently exporting extra hidden data

## Public reporting controls

Public reporting remains release-oriented as defined in [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md).

The public site may support controls only where they help users answer basic release questions quickly.

### Public benchmark index filters

The benchmark index may filter by:

- benchmark family or benchmark slug
- task type
- release availability (`released`, `coming_soon`, `historical_only`)
- release status (`current`, `superseded`, `withdrawn`)

The benchmark index may sort by:

- latest public release date, newest first by default
- benchmark name
- headline metric for the latest public release when that metric is present for every visible row

MVP should not support arbitrary metric-pivot sorting on the benchmark index. If the metric is incomplete for the visible slice, the UI should fall back to the default newest-first sort instead of producing unstable ordering.

### Public release-summary table filters

The public release-summary table may filter by:

- model or configuration label
- provider or model family
- result outcome (`pass`, `fail`, `mixed`, `not_reported`)
- data-quality state (`complete`, `partial`, `withheld`, `superseded`)
- release row status when a row is blocked by a publication problem

The public release-summary table may sort by:

- public display label
- provider or model family
- solved count
- pass rate
- last-updated timestamp

MVP public filtering should stay compact:

- one inline search box for model/config labels is allowed
- one filter tray or filter row is allowed
- all active filters must remain visible above the table
- users must be able to clear all filters in one action

The public site should not support:

- nested rule builders
- hidden advanced filters
- saved views
- export of unreleased or internal rows

## Portal results controls

Portal drilldown remains evidence-oriented as defined in [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md).

The portal should expose the richer control set because reviewers need to isolate failures, reruns, and benchmark slices precisely.

### Portal filter dimensions

MVP portal results views must support filtering by:

- evaluation batch
- benchmark family
- benchmark version
- release label when browsing released results
- run id
- attempt id when present as a first-class record
- model config label
- provider or model family
- problem or task id
- lifecycle bucket
- verdict bucket
- rerun lineage bucket
- failure stage
- normalized failure reason code
- retry-eligible flag
- started-at or finished-at time range

The canonical lifecycle and verdict labels must stay aligned with [run-state-vocabulary-baseline.md](run-state-vocabulary-baseline.md).

### Portal sort behavior

MVP portal results views must support sorting by:

- newest started time
- newest finished time
- oldest started time
- duration
- verdict outcome grouping
- failure count when viewing aggregate rows
- pass rate when viewing aggregate rows

MVP should still keep sort behavior simple:

- one active sort at a time
- explicit ascending or descending direction
- a stable tie-breaker on most-recent timestamp and then record id

This avoids nondeterministic row jumps when a user refreshes a filtered table.

## Export behavior

Exports are allowed in MVP, but only as scoped views.

That means every export must be derived from a visible benchmark or result surface with explicit filters and sort state.

### Public exports

The public site may export only released benchmark data.

MVP public exports must support:

- `CSV` for spreadsheet and analyst use
- `JSON` for downstream website or programmatic reuse

Public exports may be offered from the benchmark release summary view, not from the benchmark index.

Public exports must include only:

- rows visible to the current public release scope
- release metadata needed to interpret the slice
- current filter values
- current sort field and direction

Public exports must not include:

- internal identifiers that expose hidden curation state
- unreleased rows
- private artifacts or artifact URLs
- rerun-internal evidence

### Portal exports

MVP portal exports must support:

- `CSV` export of the current filtered table selection

The exported slice may come from:

- the results index aggregate view
- the filtered run table
- the problem-results list inside one run detail panel

MVP portal exports should not yet support:

- bulk artifact bundle export
- scheduled exports
- saved export presets
- arbitrary JSON schemas

Those can arrive later once the backend contract for export jobs is defined.

## Export payload rules

Every MVP export file must carry enough context to be interpretable after it leaves the UI.

Each export should therefore include:

- surface type (`public_release`, `portal_results`, `portal_run_detail`)
- benchmark and version identifiers when applicable
- generated-at timestamp
- applied filters
- active sort field and direction

For CSV exports, this context may be emitted as leading metadata comment lines or as a small sidecar metadata block when the implementation layer needs stricter CSV compatibility. The important requirement is that the exported slice remains self-describing.

For JSON exports, the metadata should live in top-level fields next to the exported rows rather than being buried only inside each row object.

## URL and state rules

MVP control state should remain shareable on both surfaces.

- the public site should encode selected release, filters, and sort in query params
- the portal should encode filters, sort, and selected run detail state in query params
- exports must use the same current URL state rather than reconstructing a separate hidden query on click

This keeps public links reproducible and lets contributors share exact failure slices during review.

## MVP interaction limits

MVP explicitly does not require a full analytics console.

The required behavior is:

- simple visible filters
- single-sort control
- current-slice export
- stable URL state
- clear separation between public-release controls and portal-review controls

The MVP does not require:

- multi-column sort priority builders
- custom computed columns
- saved named filter sets
- long-running export jobs
- chart-specific export behavior

## Relationship to adjacent baselines

- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the calm, release-centric public reporting flow this document adds controls to
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines the portal evidence view this document adds control and export semantics to
- [frontend-design-system-baseline.md](frontend-design-system-baseline.md) defines the component and responsive constraints these controls should follow
- [release-notes-and-updates-baseline.md](release-notes-and-updates-baseline.md) defines the adjacent public update surface, which is separate from data export

This document is the source of truth for what users may sort, filter, and export in MVP benchmark and result views.

## Out of scope

- SQL-like query builders
- user-saved views or subscriptions
- cross-benchmark comparison exports
- raw artifact download controls
- background export-job orchestration
