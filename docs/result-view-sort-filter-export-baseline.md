# Result View Sort, Filter, and Export Baseline

This document defines the MVP sort, filter, and export behavior for ParetoProof result views across the public reporting surface and the authenticated portal.

The goal is to stop every result table or reporting page from inventing its own filter chips, sort semantics, and export rules. Users should be able to predict how result views behave even when the public site and the portal expose different levels of detail.

## Core rule

Every result view should make three things explicit:

- what slice of data is currently shown
- how the data is currently ordered
- what exact slice an export will contain

If any one of those is ambiguous, the result view is not ready.

## Scope split

The same interaction model should apply to both:

- public released reporting views
- authenticated portal result views

But the available dimensions differ by surface.

Public views may expose only public-release-safe dimensions. Authenticated portal views may expose deeper run and failure pivots.

The shared rule is that the UI should never offer a filter or export dimension the current user is not allowed to inspect.

## Required filter dimensions

MVP result views should support filters from this dimension set when the underlying surface has access to the data.

### Benchmark scope

- benchmark family
- benchmark version or release label
- task or problem id when the current view is item-granular

These filters establish what benchmark slice the results belong to.

### Result scope

- status bucket (`passed`, `failed`, `running`, `canceled`, `timed_out`, `invalid`)
- evaluation batch or release cohort
- model or provider configuration label

These filters establish what kind of result outcome is being examined.

### Operational scope

Authenticated portal views may additionally filter by:

- run id
- rerun lineage
- failure category or failure stage
- started or finished time window

These are portal-only dimensions unless a released public report intentionally exposes them.

## Filter behavior rules

### Multi-filter composition

Users must be able to compose at least:

- one benchmark-scope filter
- one result-scope filter

Portal views may compose additional operational filters on top.

### Visible active state

Every active filter must remain visible in the UI as a labeled state, not as a hidden query mutation.

The view should support:

- adding a filter
- clearing one filter
- resetting all filters

### No misleading unavailable filters

If a filter dimension is not available on the current surface because the data is private, unreleased, or out of scope, the UI should omit it rather than showing a dead control.

## Required sort behavior

Every tabular result view should support a small, explicit sort set.

### Minimum sort keys

Public and portal result tables should support the relevant subset of:

- newest first
- oldest first
- highest pass rate
- lowest pass rate
- longest duration
- shortest duration
- largest failure count
- smallest failure count

Not every view needs every sort key, but each view should provide at least one time-based default and one meaningful secondary sort when multiple rows are comparable.

### Sort stability

Sort order should be deterministic.

If two rows tie on the primary sort key, the view should use a stable fallback such as:

- newest timestamp
- benchmark label
- run id

This prevents rows from jumping unpredictably between refreshes.

### Default sort

MVP defaults:

- public released reporting views: newest released summary first
- authenticated portal run tables: newest run first

If a view overrides that default, it should do so only when another ordering is clearly more useful for that page's primary job.

## Export baseline

Exports must preserve the currently visible slice, not an unrelated broader dataset.

The minimum rule is:

- export exactly the current filtered scope
- preserve the current benchmark and release boundary
- make the export format explicit before download

## Export formats

MVP should support:

- CSV for tabular result rows

Optional but not required for MVP:

- JSON export for structured public reports
- richer bundle exports in the authenticated portal

If a surface does not yet support a richer export, CSV is the baseline, not a placeholder label for an unavailable feature.

## Export slice rules

### Public reporting exports

Public exports may contain only public-release-safe result data.

They must not include:

- private hold-out rows
- internal run identifiers that are not part of the public reporting contract
- internal artifact references

### Portal exports

Authenticated portal exports may include deeper fields when the current user is allowed to inspect them.

They may include:

- run ids
- failure categories
- rerun lineage
- timestamps and status fields tied to the visible filtered slice

But even portal exports should remain scoped to the current filtered selection rather than silently exporting the whole database result set.

## MVP behavior by surface

### Public reporting

Public result views should expose:

- a small number of high-signal filters
- simple, explicit sorts
- CSV export only for the currently released result slice

This surface is optimized for clarity, not for deep exploratory analytics.

### Authenticated portal

Portal result views should expose:

- the full MVP pivot set needed for contributor and admin review
- deeper operational filters for run state and failure analysis
- CSV export of the currently filtered run/result slice

The portal may later grow richer exports, but the first version should already make filter scope and export scope deterministic.

## State handling

Filter and sort state should be shareable by URL on views that already support deep linking.

At minimum:

- active filters should be representable in query params
- active sort should be representable in query params
- resetting filters should remove the corresponding query state

This keeps shared links faithful to what the sender was actually looking at.

## Empty, partial, and unavailable states

Sort, filter, and export controls must behave clearly when the current slice has little or no data.

Required rules:

- if filters produce zero rows, show an explicit empty-result state and keep the active filters visible
- if the current surface is partial because some data is unreleased or private, exports must only include the visible released subset
- if export is unavailable for a specific view, the UI should say so plainly instead of rendering a dead button

## MVP application to current baselines

The current results drilldown baseline already implies:

- multi-pivot filtering in the authenticated portal
- sorting on run tables
- CSV export of the current filtered selection

This document makes that interaction model the general result-view rule and extends the same discipline to the public reporting surface.

## Relationship to adjacent baselines

- `results-drilldown-ux-baseline.md` defines the authenticated results drilldown flow that consumes these filter and export rules
- the future public benchmark and reporting UX baseline should use the public-safe subset of these controls once that surface is scoped
- `public-disclosure-holdout-policy-baseline.md` defines what data may appear in public filters and exports at all
- `frontend-design-system-baseline.md` defines the shared UI-component constraints these controls must follow

This document is the source of truth for sort, filter, and export behavior in ParetoProof result views.

## Out of scope

- arbitrary saved views or custom analytics dashboards
- multi-format export bundles beyond the MVP CSV baseline
- role-management rules for who may create or schedule exports
