# Hosted Worker Public Reporting API Baseline

This document defines the public API surface for hosted execution reporting on `paretoproof.com`.

The goal is to expose truthful released benchmark evidence without leaking private operator semantics, unreleased benchmark material, or live worker telemetry.

## Current baseline

- [benchmark-product-objects-baseline.md](./benchmark-product-objects-baseline.md) already fixes that public reporting must be release-centric rather than "whatever runs currently exist."
- [web-surface-policy.md](./web-surface-policy.md) already fixes that public benchmark reporting belongs on `paretoproof.com`, not the portal.
- The current public story is still thin and partly placeholder-driven.
- The newly accepted [hosted-worker-private-operator-api-baseline.md](./hosted-worker-private-operator-api-baseline.md) is explicitly private and portal-authenticated. Public reporting must not derive itself by subtracting a few fields from that operator API.

## Decision

ParetoProof should expose a distinct public reporting API under `/public/reporting/*`.

This API is:

- unauthenticated
- release-centric
- aggregate-first
- redaction-safe by construction
- backed by Neon-derived public datasets, not ad hoc queries over private operator tables

This API is not:

- a public mirror of `/portal/worker-ops/*`
- a live fleet-health feed
- a queue or incident API
- a route family for draft or unreleased benchmark evidence

## Namespace and route ownership

The approved public reporting namespace is:

- `GET /public/reporting/releases`
- `GET /public/reporting/releases/:benchmarkReleaseId`
- `GET /public/reporting/frontier-reports`
- `GET /public/reporting/frontier-reports/:frontierReportId`
- `GET /public/reporting/benchmarks/:benchmarkVersionId`

Optional later public-safe subordinate routes may exist only when they are release-linked and explicitly redaction-safe, for example:

- `GET /public/reporting/releases/:benchmarkReleaseId/evidence`
- `GET /public/reporting/frontier-reports/:frontierReportId/comparisons`

The public site should consume these routes directly. It should not call private portal routes or infer public pages from operator data paths.

## Public object model boundary

Public reporting is built from released product objects, not raw execution rows.

The approved public source objects are:

- `benchmark_release`
- `frontier_report`
- release-linked public-safe aggregate rows
- release-approved public artifacts

The public API must not require the browser to understand:

- raw run rows
- job or attempt lineage
- worker leases
- worker instances
- incidents
- rollout state
- queue partitions

Those remain private or operator-facing concerns even when they contributed to the released result.

## Release-centric datasets

### 1. Release index

`GET /public/reporting/releases` powers the apex-site release index.

Each row should include:

- `benchmarkReleaseId`
- benchmark label
- benchmark version label
- publication status limited to public-safe values such as `released` or `withdrawn`
- published-at timestamp
- top-line released metric summary
- included model count
- linked public artifact presence flags

This route is for discovery and summary, not for raw execution evidence.

### 2. Release detail

`GET /public/reporting/releases/:benchmarkReleaseId` is the canonical dataset for one released benchmark publication.

It should include:

- release metadata
- methodology summary
- public-safe benchmark metadata
- released model entries
- released aggregate metrics
- release-approved evidence links
- optional comparison summaries that were explicitly approved as part of the release

It should not include:

- per-run live telemetry
- operator-only incident context
- unreleased or held-out benchmark items
- raw candidate artifacts
- raw traces or logs

### 3. Frontier report index

`GET /public/reporting/frontier-reports` powers the public list of released cross-release or cross-model reports.

Each row should include:

- `frontierReportId`
- report label
- covered benchmark releases
- publication timestamp
- top-line comparison summary

### 4. Frontier report detail

`GET /public/reporting/frontier-reports/:frontierReportId` is the public comparison dataset.

It should include:

- included benchmark releases
- included released model entries
- comparison methodology summary
- released aggregate comparison metrics
- release-approved evidence bundles or downloadable artifacts
- notes about withheld or excluded data only at a public-safe summary level

It must not expose hidden comparison exclusions, private operator rationale, or unreleased underlying runs.

### 5. Benchmark-version public metadata

`GET /public/reporting/benchmarks/:benchmarkVersionId` is the public benchmark metadata surface for one released benchmark version.

It should include only release-approved benchmark facts such as:

- benchmark label
- release-safe benchmark description
- release-safe methodology notes
- linked release ids and frontier report ids

It must not expose the full internal benchmark corpus, holdout item inventory, or unreleased theorem metadata by default.

## Redaction boundary

Public reporting is safe only if it is derived from an explicit allowlist.

### Public-safe fields

The public API may expose:

- released benchmark labels and release ids
- released model labels and provider family labels
- aggregate verdict counts and pass rates
- bounded released failure-family summaries when approved
- release publication timestamps
- release-approved methodology notes
- release-approved public artifact references

### Private fields that must never leak

The public API must never expose:

- worker ids, worker pool ids, lease ids, rollout ids, or incident ids
- exact queue depth, backlog posture, or fleet capacity signals
- raw run ids, job ids, attempt ids, or internal lineage ids unless a later scope explicitly approves a public-safe lineage object
- provider auth modes, secret names, token digests, or infrastructure addresses
- raw failure codes or traces that reveal internal worker, provider, or policy posture beyond an approved aggregate bucket
- unreleased benchmark items, holdout items, or theorem statements that are not intentionally public
- operator notes, mitigation history, or acknowledgement actor ids

### Aggregate rule

If a field exists only because the control plane currently stores it, that is not enough reason to expose it publicly.

A public field must satisfy all of:

- released through a release or frontier-report object
- useful to a public reader
- stable enough to become a contract
- safe under the explicit redaction boundary

## Public reporting versus private operator telemetry

The public API and the private operator API answer different questions.

The public API answers:

- what benchmark releases are published
- which released model entries and comparisons are safe to show
- what public-safe evidence supports those releases

The private operator API answers:

- what the fleet is doing right now
- which incidents are open
- which pools are unhealthy
- which runs or leases need intervention

Public routes should never try to expose "current fleet status" as a teaser for public reporting. That is product drift.

## Freshness and caching posture

Public reporting should be cache-friendly and publication-driven.

Every public response should carry:

- `generatedAt`
- `publishedAt`
  - or, for list routes, the newest included publication timestamp
- `snapshotVersion`
- `recommendedRevalidateAfterSeconds`

Public reporting freshness is not live telemetry freshness.

Implications:

- released detail routes should be treated as immutable snapshots keyed by release or report id plus `snapshotVersion`
- list routes may revalidate for newly published releases or withdrawn releases
- the API should not advertise a `live` or `stale` fleet posture on public pages

If a release is superseded or withdrawn, the public API may surface that status explicitly, but it should still remain a release-state concept rather than a worker-health concept.

## Data-derivation rules

Public reporting must read from a deliberate derived path in Neon.

That means:

- public aggregates are pre-derived or materialized from private execution evidence
- release linkage is explicit in the derived path
- redaction happens before the API reads the dataset, not by trimming fields from private query results at the controller edge

The public API must not run expensive or privacy-unsafe ad hoc joins over private operator tables on every request.

This is the contract boundary that issue `#957` should implement in storage and derivation form.

## Public artifact boundary

The public API may link only to artifacts that have already crossed the release boundary.

Allowed examples:

- released benchmark bundles
- released methodology documents
- released summary tables or charts
- release-approved reproducibility bundles

Disallowed examples:

- raw worker traces
- raw logs
- quarantined artifacts
- supportability bundles
- unreleased candidate source or verifier diagnostics

The API should return stable public artifact references, never raw bucket internals.

## Non-goals

This scope does not:

- implement the public routes
- define frontend loading or stale-state UX beyond the public freshness posture; issue `#948` owns that
- define the shared contract package and response-version plumbing; issue `#956` owns that
- define the Neon schema or materialized-view mechanics in detail; issue `#947` and issue `#957` own that
- expose live operator data publicly

## Follow-up execution slices

Execution after this scope should split into:

1. shared public reporting schemas and route contracts
2. derived Neon public aggregates linked to released benchmark and report objects
3. backend public reporting routes that read only the approved public dataset path
4. negative tests proving private operator fields cannot leak into public payloads
5. public-site data wiring for release and frontier-report pages

Issue alignment:

- `#950` implements the public routes
- `#955` consumes these datasets on the apex site
- `#956` centralizes shared freshness and response-version semantics across public and private worker data
- `#957` implements the Neon-side derivation and release-linked aggregate path
