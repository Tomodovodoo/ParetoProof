# Public Content Pack Baseline

This document defines the single MVP public-content pack for `paretoproof.com`.

The goal is to stop the public site from fragmenting into three low-leverage "About", "Contact", and "Contribution" page tracks before the benchmark and execution spine is finished.

## Core decision

ParetoProof should treat project explanation, contributor-entry context, and public contact guidance as one apex-owned content pack rather than three separate MVP scope lanes.

That means MVP public-content work should ship as one `Project` route family with shared information architecture and a small number of tightly related sections.

The pack exists to answer three questions for a public reader:

- what ParetoProof is
- how a serious contributor gets involved
- how someone reaches a human when the public site or contributor path needs clarification

It is not a general marketing site, support center, or community platform.

## Required pack structure

The MVP content pack should have one primary navigation entry on the public apex site.

That entry may render as:

- one long-form page with anchored sections, or
- one overview page with a small number of subordinate sections

MVP should not promote separate top-level navigation items for `About`, `Contact`, and `Contribution`.

The required sections inside the pack are:

1. project overview
2. contributor path
3. contact and escalation guidance

## 1. Project overview scope

The overview section is the canonical public explanation of what ParetoProof is and why it exists.

MVP overview content should include:

- the product purpose: reproducible evaluation of formal mathematical reasoning systems
- the primary audiences: researchers, mathematicians, and internal contributors or admins
- the trust model at a high level: released results come from versioned benchmark inputs, explicit execution context, and controlled approval or publication flows
- the surface split at a high level: public site, auth entry, portal, API, and separate workers
- the current maturity statement: active MVP build-out rather than a fully open self-serve platform

The overview should link outward to existing benchmark, methodology, release-note, or policy pages instead of re-explaining those documents inline.

The overview must not expand into:

- founder or team biography pages
- investor or hiring content
- press-kit or media-resource pages
- long-form benchmark methodology duplication

## 2. Contributor path scope

The contributor section should explain how a technically relevant reader moves from public understanding into the authenticated contributor flow.

MVP contributor-path content should include:

- who the current contributor program is for
- the kinds of work contributors may eventually do, such as benchmark curation, review, or execution work
- the fact that approval is manual and role-aware rather than open self-serve signup
- the expectation that sign-in is the entry point into the portal and access-request flow
- links or calls to action that move the user into the branded auth-entry surface

The contributor section should be explicit that MVP participation is selective and operationally constrained.

It must not promise:

- open enrollment
- public run-launch access for any signed-in user
- a large public volunteer program
- application-managed invitations, waitlists, or automated contributor notifications

## 3. Contact and escalation scope

The contact section should exist to help a reader reach the right human-owned next step without creating an accidental product-support system.

MVP contact guidance should expose the exact public contact destination defined by [public-contact-channel-baseline.md](public-contact-channel-baseline.md).

That currently means:

- the repository GitHub Discussions index is the canonical public contact entry
- access or identity problems still route into the auth or portal flow instead of public discussion
- the apex site should not publish a general support mailbox or contact form for MVP

The contact section should set conservative expectations:

- contact handling is manual
- response timing is not guaranteed by the application
- sensitive account approval or recovery decisions still happen through the controlled portal and admin process, not through an unauthenticated mailbox alone

The contact section must not require:

- an in-app contact form
- inbound email automation
- chat widgets or live support
- an SLA-backed support desk
- public issue triage embedded into the product UI

This keeps the content pack aligned with [email-strategy-baseline.md](email-strategy-baseline.md), which keeps human support mail outside the application runtime for MVP.

## Routing and navigation rules

The pack belongs on `paretoproof.com` and should be linked as one coherent public-information destination.

Allowed entry points:

- one primary header or menu item
- footer links to specific anchored sections when helpful
- contextual links from the landing page hero or public release pages

Not allowed for MVP:

- three separate primary-nav tabs for About, Contact, and Contribution
- duplicating contributor-entry explanation across multiple unrelated pages
- using the auth surface as the place where public project explanation lives

## Content depth rules

The pack should stay concise and decision-oriented.

Each section should answer the key user question quickly, then route outward:

- overview routes to benchmark and methodology context
- contributor path routes to auth entry and portal access flow
- contact guidance routes to the appropriate human-owned or public-discussion channel

If a topic needs sustained operational or legal detail, it should move to its own later-scope baseline or execution issue instead of bloating the MVP public pack.

## Explicit MVP inclusions

The approved MVP content pack includes:

- one clear explanation of ParetoProof's mission and trust model
- one explanation of the current contributor-program boundary
- one conservative public contact or escalation section
- links into benchmark reporting, updates, auth entry, and relevant methodology or policy pages

## Explicit MVP exclusions

The approved MVP content pack excludes:

- separate top-level About, Contact, and Contribution site trees
- broad community-program pages
- event calendars, newsletters, or mailing-list signup
- public support-ticket workflows
- legal-policy bundles such as privacy or terms
- full organizational history or people directories
- bespoke contact-form backend work

## Follow-on execution work this scope should unlock

This baseline should unlock three concrete execution lanes:

1. implement the approved apex public-content pack sections or page family
2. wire the public-site navigation and footer entry points for that pack
3. define the exact operational handling for any public contact channel exposed in the pack

The older split scoping issues for About, Contact, and Contribution should be closed as superseded once this baseline lands.

## Relationship to adjacent baselines

- [product-surface-boundary-baseline.md](product-surface-boundary-baseline.md) defines why this pack belongs on the apex site rather than on the auth or portal surfaces.
- [public-contact-channel-baseline.md](public-contact-channel-baseline.md) defines the exact public contact destination and manual handling rules that this pack should reference.
- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the public benchmark-release flow that sits beside this pack on the apex surface.
- [release-notes-and-updates-baseline.md](release-notes-and-updates-baseline.md) defines the canonical update and release-note surfaces that also live on the public site.
- [email-strategy-baseline.md](email-strategy-baseline.md) defines why public contact handling stays human-managed and outside the application runtime for MVP.

This document is the source of truth for the MVP public explanation, contributor-entry, and contact-content boundary on `paretoproof.com`.
