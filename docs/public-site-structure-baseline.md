# Public Site Structure Baseline

This document resolves the MVP public website structure and UX boundary for ParetoProof. It defines which pages belong to the public surface, what belongs on the landing page versus subpages, and what is explicitly out of scope.

## Public-surface purpose

The public site exists to:

- explain what ParetoProof is and why it exists
- communicate trust boundaries (public web, auth entry, portal, API, workers)
- route contributors into authentication without exposing internal admin/worker surfaces
- provide stable public context for benchmark/result interpretation

It does not function as the contributor workspace itself.

## Top-level public pages

MVP public-surface page set:

1. `/` (landing page)
2. `/benchmarks` (benchmark model and methodology overview)
3. `/results` (public result summaries and reporting entry)
4. `/about` (project purpose, governance, and scope framing)
5. `/contact` (public contact path and support routing)

Authentication-adjacent page that remains public:

- `auth.paretoproof.com` branded sign-in entry (separate auth surface, not a portal page)

## Landing page vs subpage content split

### Landing page (`/`)

The landing page should be concise and conversion-oriented.

Required landing content:

- one clear product statement (formal-math evaluation platform with reproducibility focus)
- high-level value signals (reproducibility, trust model, API/worker separation)
- explicit CTA for contributor sign-in
- one compact preview of benchmark/reporting model (without full detail tables)

Landing page should avoid deep technical matrices and exhaustive policy text.

### Subpages

Subpages carry detailed informational content that should not overload landing:

- `/benchmarks`: benchmark lifecycle, run model, methodological caveats, and scope notes
- `/results`: summary reporting views and linkouts to deeper run/result pages when available
- `/about`: project goals, target audiences, architecture posture, governance direction
- `/contact`: contact/support pathways and boundary between public contact and contributor workflow

## Routing boundary with portal/auth

Public pages are unauthenticated website routes. Contributor portal pages are authenticated workspace routes and must remain separate.

- public site host/surface: `paretoproof.com` and `www.paretoproof.com`
- auth entry host/surface: `auth.paretoproof.com`
- contributor portal host/surface: `portal.paretoproof.com`

Public routes should link into auth/portal but must not embed admin or contributor-control functionality directly.

## Navigation baseline

MVP global public navigation should include:

- Home
- Benchmarks
- Results
- About
- Contact
- Contributor Sign In (distinct CTA)

Footer should include:

- project identity
- contact path
- policy/repository links when available

## Content ownership and update cadence

- landing narrative and architecture framing should track accepted docs in `docs/`
- benchmark/results copy should be updated when scope or methodology materially changes
- public pages should prefer stable explanatory language over rapidly changing internal operational details

## Explicit out-of-scope items for public surface

- contributor profile and access-request workflow
- admin approval/review controls
- worker orchestration controls
- internal service route documentation (`/internal/*`)
- private run artifacts and contributor-only detailed logs/traces

These belong to portal/API/internal surfaces, not public web routes.

## Execution handoff

This baseline enables follow-on scope and execution tasks:

- `#51` benchmark/data/error reporting UX can build on `/results` boundary
- `#52` sort/filter/export requirements can target public result surfaces without redefining page ownership
- later frontend implementation issues can align navigation and route composition to this page map
