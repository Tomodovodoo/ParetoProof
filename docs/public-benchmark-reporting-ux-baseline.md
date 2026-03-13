# Public Benchmark Reporting UX Baseline

This document defines the MVP public-facing reporting UX for benchmark releases on ParetoProof.

The goal is to show benchmark results, data coverage, and error conditions clearly without turning the public site into a dense analyst console. Public reporting should feel clean and trustworthy first, with deeper filtering and drilldown left to later scopes.

## Core decision

The MVP public reporting surface is release-oriented, not run-oriented.

That means the public site should present:

- benchmark-level summary context
- one clear released-results view for a selected benchmark release
- explicit data-quality and error messaging when a release is partial, delayed, or invalidated

It should not try to expose the full internal run-review workflow. Detailed drilldown, rerun lineage, and artifact-level inspection belong to authenticated portal work such as [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md).

## Required summary views

The public reporting flow should have three required summary views.

### 1. Benchmark index view

The public entry view lists each publicly released benchmark slice.

Each benchmark card or row should show:

- benchmark name
- short benchmark description
- task type such as statement formalization or proof generation
- latest public release label or date
- current release status badge
- one compact headline metric such as latest pass rate or solved-count summary

This view answers:

- what benchmarks exist
- which ones currently have public results
- which release is the latest public reference point

### 2. Benchmark release summary view

Selecting a benchmark opens one release-centric summary page.

This page must show:

- benchmark title and short description
- release label, date, and benchmark version identifier
- scope note describing what the release covers
- methodology summary with a link to deeper documentation
- top-level result summary cards
- one primary public results table
- one visible data-quality or error block when needed

The summary cards should stay small and stable. MVP should expose only the core public numbers:

- models or configurations included
- total evaluated items or runs included in the release
- solved count or pass rate
- unresolved or failed count
- release completeness state

### 3. Release notes and data-quality view

Every public release page must have a clearly visible section that explains what the numbers do not mean.

This section should summarize:

- excluded or withheld benchmark slices
- partial publication status
- invalidated or rerun release notes
- known data gaps or publication delays
- links to methodology or benchmark-package documentation when relevant

The purpose is to keep users from mistaking incomplete data or infrastructure trouble for a clean benchmark verdict.

## Core public reporting flow

The MVP public reporting flow is:

1. user lands on the public benchmark index
2. user selects one benchmark and its latest public release
3. user reads the release summary cards and primary results table
4. user sees any data-quality or error notice before trusting the numbers
5. user may continue to public methodology or release-note context, but not into private run-review internals

If a user needs per-run evidence, rerun chains, or artifact links, the public site should not fake that depth. It should direct trusted users toward the authenticated portal instead of overloading the public release view.

## Primary public results table

The release summary view should expose one clean, scan-friendly table.

For MVP, each row should represent one released model or evaluation configuration and should include:

- public display label
- provider or model family label
- solved count or pass rate
- total included items or runs
- status badge
- last-updated or release timestamp

The table should optimize for readability, not analyst flexibility.

MVP should therefore avoid:

- advanced multi-column filter panels
- arbitrary sort builders
- per-row artifact menus
- export actions on the public site

Those belong to follow-on scopes such as issue `#52`.

## Distinguishing result, data, and error states

Public reporting must distinguish benchmark outcome from data-quality state and from publication error state.

These states should never be collapsed into one ambiguous badge.

### Result outcome states

Use result badges only for benchmark outcome:

- `pass`: the released slice met the success condition for the shown row or summary
- `fail`: the released slice did not meet the success condition
- `mixed`: the release contains both solved and unsolved items and is being summarized at an aggregate level
- `not_reported`: no public outcome is available for that row in the current release

### Data-quality states

Use data-quality badges or inline notes for coverage and completeness:

- `complete`: the public release includes the full intended released slice
- `partial`: some intended rows or items are not yet published
- `withheld`: some benchmark material is intentionally excluded under disclosure policy
- `superseded`: the release remains visible for history, but a newer release is the public reference point

### Error or publication-problem states

Use warning or error callouts only for publication or integrity problems:

- `publication_delayed`: a release exists conceptually, but public reporting is waiting on publication completion
- `validation_problem`: published numbers are blocked or flagged because the release failed a validation check
- `data_ingest_problem`: some rows could not be included because source data was incomplete or inconsistent
- `withdrawn`: a previously visible release should no longer be treated as authoritative

The rendering rule is strict:

- missing or delayed data must not be shown as benchmark failure
- withheld data must not be shown as error
- publication or validation problems must be surfaced before any summary metric that they affect

## Simplicity and visual hierarchy rules

Public reporting should stay visually calm.

For MVP:

- one benchmark summary header per page
- one primary metrics row
- one primary results table
- one obvious notice area for partial or invalid releases
- one secondary release-notes or methodology section

Avoid:

- dashboard-style chart walls
- multiple competing tables on first load
- dense color legends
- jargon-heavy status copy without an explanatory sentence nearby

If a status needs more than a short label, add one sentence of explanatory text instead of inventing a more complex badge system.

## Public release scope rules

The public reporting surface should only describe publicly released benchmark material.

That means:

- internal hold-out items must not appear as hidden rows or opaque score adjustments
- public benchmark summaries must align with [public-disclosure-holdout-policy-baseline.md](public-disclosure-holdout-policy-baseline.md)
- if a release excludes held-out material, that exclusion should be stated as a scope note rather than buried in fine print

Public users should always be able to tell whether they are looking at:

- a complete released slice
- a partial released slice
- a historical superseded release
- a withdrawn or blocked release

## Mobile and responsive rules

The public reporting flow must remain readable on narrow screens.

For MVP:

- benchmark cards stack vertically on mobile
- release summary cards collapse into a single-column list
- the public results table may become a stacked row list, but key status and pass-rate information must remain visible without horizontal scrolling
- notice banners for partial or invalid data must remain above the results list on mobile

## Relationship to adjacent frontend scopes

- issue `#52` should define sort, filter, and export behavior for richer result views
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines the authenticated portal drilldown behavior once users move beyond the public release summary
- [frontend-design-system-baseline.md](frontend-design-system-baseline.md) defines the component and styling rules this reporting surface should use

This document is the source of truth for the simple public reporting flow itself.

## Out of scope

- authenticated run-detail drilldown
- export formats or advanced filter controls
- per-artifact download links on the public site
- custom chart builders or researcher-only analytics workbenches
