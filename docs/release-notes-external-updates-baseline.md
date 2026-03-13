# Release Notes and External Updates Baseline

This document defines the MVP release-notes surface, update channels, and outbound external-link policy for ParetoProof.

The goal is to keep public project updates understandable and consistent without promising a large content-management system or automated social distribution pipeline during MVP.

## Core decision

ParetoProof MVP should separate update publishing into two classes:

- first-party update surfaces that ParetoProof owns directly
- external update links that point to or amplify the first-party update

The first-party update surface is authoritative. External channels may amplify a release, but they must not become the only place where release meaning, benchmark caveats, or methodology changes are recorded.

## First-party versus external surfaces

### First-party update surfaces

MVP first-party update surfaces are:

- the public release notes view on the ParetoProof web surface
- the benchmark release summary page described in [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md)
- durable documentation or methodology pages linked from those release notes when needed

These surfaces are where the canonical project update must live.

### External update surfaces

MVP external update surfaces may include:

- X or another social-announcement account link
- GitHub release or repository announcement links
- blog or newsletter links if they later exist

These surfaces are optional amplifiers. They may summarize or point back to the release, but they do not replace the first-party record.

## Canonical update flow

For each public benchmark or product update, MVP should follow this order:

1. publish or update the first-party release note
2. ensure the relevant benchmark release summary page reflects the same state
3. add external announcement links only after the first-party update exists

This avoids a common failure mode where an external post is more detailed, more current, or more caveated than the project's own site.

## Required update content types

Every MVP release-note entry should be built from a small fixed set of content types.

The required content types are:

- `headline`
  - short title for the release or update
- `scope_summary`
  - one short explanation of what changed
- `release_type`
  - one of `benchmark_release`, `site_update`, `portal_update`, `api_update`, `worker_update`, or `policy_update`
- `status_note`
  - whether the release is current, partial, superseded, withdrawn, or delayed
- `user_impact`
  - what researchers, contributors, or readers should take away from the change
- `links`
  - pointers to benchmark pages, methodology docs, PRs, or other first-party supporting material

Optional but recommended content types:

- `caveats`
  - known limitations, withheld material notes, or publication constraints
- `next_steps`
  - short note about what will change next
- `external_links`
  - outbound social or repository-announcement links that reference the first-party release note

## Release-note entry types

MVP should support three practical release-note entry types.

### Benchmark release note

Used when a public benchmark slice or public benchmark-results set changes.

Must include:

- benchmark name
- release identifier or date
- what benchmark material or result slice is now public
- any completeness, withholding, or supersession note
- links to the benchmark release summary page and relevant methodology context

### Product or surface update note

Used when the public site, portal, API behavior, or worker policy changes in a user-visible way.

Must include:

- affected surface
- short summary of behavior change
- whether users need to take action
- link to any deeper documentation if relevant

### Policy or methodology note

Used when the meaning of benchmark reporting changes even if the UI itself does not.

Must include:

- policy or methodology name
- what interpretive rule changed
- whether prior public results remain comparable, partial, or superseded
- links to the governing baseline or methodology page

## Social and external integration scope

MVP should keep external integrations intentionally narrow.

Allowed MVP behavior:

- show outbound links to official external announcement surfaces
- optionally show one link group such as `Follow updates` or `Related announcements`
- allow release-note entries to include a canonical external post URL after publication

Not required for MVP:

- automated cross-post generation
- embedded social timelines
- per-provider share widgets
- social engagement metrics
- multi-network scheduling dashboards

This keeps the public web surface from depending on unstable third-party embed behavior.

## Link and content ownership rules

The canonical release note should own the substantive update text.

External links may contain:

- a short teaser
- a link back to the first-party note
- a short status pointer such as `new benchmark release` or `results updated`

External links should not be the only place that contains:

- release caveats
- public-withheld scope notes
- methodology changes that affect interpretation
- correction or withdrawal notices

If an external post is wrong or stale, the first-party note remains authoritative.

## Withdrawal and correction handling

Release notes must support correction states without deleting history.

MVP supported note states are:

- `published`
- `updated`
- `superseded`
- `withdrawn`

Rules:

- `updated` means the entry still stands, but some detail was corrected or clarified
- `superseded` means a newer release note is now the public reference
- `withdrawn` means readers should not rely on the original note as authoritative

When a note is withdrawn or materially corrected, the release-note surface must show that state clearly rather than silently rewriting the old headline.

## Relationship to public benchmark reporting

Release notes and benchmark reporting are related but not identical.

- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the benchmark release summary page and public result table
- this document defines how updates about those releases are published and linked across first-party and external channels

The benchmark release summary page answers:

- what the current released benchmark numbers are

The release-notes surface answers:

- what changed
- why it changed
- what caveats or interpretation updates readers should know

## MVP presentation rules

For the frontend, the release-notes surface should stay simple.

MVP should provide:

- a chronological list of release-note entries
- one compact entry card or list item per note
- clear type and status badges
- a small outbound-link area when external links exist

MVP should avoid:

- threaded comments
- full blog-style rich authoring tools
- tag clouds or multi-axis archive navigation
- third-party embed feeds in the main release-note list

## Out of scope

- a full CMS
- social-post drafting or approval workflows
- automated posting to third-party services
- analytics for announcement reach or clickthrough
- email/newsletter delivery pipelines
