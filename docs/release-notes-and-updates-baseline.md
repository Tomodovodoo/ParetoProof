# Release Notes and External Updates Baseline

This document defines the MVP frontend scope for release notes, update publishing, and external announcement links on ParetoProof.

The goal is to give the project one canonical update path that explains product changes, benchmark releases, and user-facing incidents without turning social channels or GitHub activity into the system of record.

## Core decision

ParetoProof should treat first-party update pages as canonical and external channels as distribution only.

That means:

- the public site owns the readable source-of-truth update entry
- benchmark release pages may surface benchmark-specific release notes, but they still link back to the canonical update record when the change affects the broader product or release story
- external destinations such as GitHub and social announcement posts are optional mirrors or amplifiers, not authoritative records

Users should never need to reconstruct what changed by comparing a PR list, a social post, and a benchmark table manually.

## Required first-party update surfaces

MVP should separate three first-party update surfaces.

### 1. Public updates index

The public site should expose one lightweight updates or release-notes index.

Each entry in the index should show:

- title
- publish date
- update type
- short summary
- one primary destination link

The index is the public archive for people who want to understand recent benchmark releases, product changes, and important user-facing notices.

### 2. Canonical update detail page

Each published update should have one canonical detail view on the first-party site.

The detail page should support:

- a clear title and timestamp
- update type badge
- concise summary paragraph
- structured body content
- related benchmark, portal, or admin links when relevant
- outbound links to any mirrored external announcement posts

If the update is referenced anywhere else in the product, this is the page those links should target.

### 3. Benchmark-local release note section

Benchmark release summary pages may include a compact release-notes section for benchmark-specific caveats, data-quality notices, or release-scope notes.

This local section is not a replacement for the canonical updates index. It exists so benchmark readers can understand release-specific caveats in context, then continue to the fuller update page when needed.

This keeps [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) focused on interpreting released results rather than becoming the entire project changelog.

## External update surfaces

MVP should distinguish external update surfaces from first-party ones.

External surfaces may include:

- GitHub release or discussion posts
- social announcement posts on one or more owner-managed networks
- manually shared links in research or community channels

These are distribution surfaces only.

They may summarize or amplify a change, but they must not be the only place where required release context lives.

## Social integration scope

Social integration for MVP is deliberately narrow.

Allowed:

- linking out from a first-party update entry to a corresponding external announcement
- linking back from an external post to the canonical first-party update page
- storing a small set of per-update outbound links such as `github`, `x`, `bluesky`, or `linkedin` when those posts exist

Not required for MVP:

- embedded timelines or feeds
- automatic cross-posting
- per-user social follow state
- commenting or reactions on ParetoProof pages
- social-provider OAuth or third-party publish permissions

The product should not depend on any external social API being available in order to publish a complete update.

## Required update content types

MVP update publishing should explicitly support these content types.

### Product release note

Use for visible product or UX changes to the public site, auth flow, portal, or admin workflow.

### Benchmark release note

Use for newly published benchmark results, methodology-relevant release scope changes, supersessions, withdrawals, or public corrections tied to a benchmark release.

### Operations or incident notice

Use for user-visible outages, degraded access, delayed publication, or recovery notices that affect trust in the current surfaces.

### Policy or methodology update

Use when a public-facing benchmark rule, disclosure boundary, or interpretation rule changes in a way that affects how users should read current or historical results.

### Contributor or admin program update

Use for changes to contributor onboarding, approval expectations, or other program-level workflow announcements that matter to authenticated users but should still remain publicly referenceable.

## Content rules per update

Every canonical update entry should include:

- update type
- human-readable title
- published-at timestamp
- short summary
- the actual change or decision
- user impact statement
- related links

Optional fields:

- benchmark or release identifier
- affected surface (`public`, `auth`, `portal`, `api`, `worker`)
- external announcement links
- correction or supersession reference

## Publication and linking rules

The publication flow should be simple:

1. write one canonical first-party update entry
2. link related benchmark pages or portal surfaces to that entry when needed
3. optionally mirror the announcement on GitHub or social platforms
4. link those external posts back to the canonical entry

Link direction should remain consistent:

- product UI links point to the first-party canonical entry
- first-party canonical entries may list external mirrors
- external mirrors point back to the first-party canonical entry

This prevents external posts from becoming the only discoverable release record.

## Separation from adjacent scopes

- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines how released benchmark numbers and data-quality states are shown on public benchmark pages
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines authenticated portal drilldown and export behavior
- [production-release-checklist-baseline.md](production-release-checklist-baseline.md) defines the internal approval packet and release-governance gate, not the public-facing update UX

This document is only the source of truth for user-facing release-note and update-publication surfaces.

## Out of scope

- native social publishing automation
- personalized notification feeds
- in-app comment threads on updates
- RSS, email, or push-notification commitments
- a full CMS decision for authoring updates
