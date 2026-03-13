# Product Surface Boundary Baseline

This document defines the authoritative MVP ownership split across the ParetoProof product surfaces.

The goal is to stop public-site, auth-entry, portal, and deferred-math work from collapsing into one blurred route map.

## Core decision

ParetoProof has two MVP product surfaces and one supporting auth-entry surface:

- `paretoproof.com` is the public product surface
- `portal.paretoproof.com` is the authenticated contributor and admin product surface
- `auth.paretoproof.com` is a branded sign-in entry and handoff surface, not a third content-owning product site

`math.paretoproof.com` does not enter the MVP surface map.

That means MVP product ownership is intentionally simple:

- public explanation, benchmark release reporting, and first-party updates live on the apex site
- authenticated contributor, admin, and private benchmark-operation work lives in the portal
- sign-in and retry handoff live on the auth surface only long enough to move the user into the portal flow

## Surface map

| Surface | MVP status | Primary audience | Owns | Must not own |
| --- | --- | --- | --- | --- |
| `paretoproof.com` | approved | public readers, prospective contributors, researchers | public project explanation, benchmark discovery, released benchmark reporting, public methodology links, release notes, public updates | authenticated workspace flows, privileged review actions, private run evidence, worker operations |
| `auth.paretoproof.com` | approved support surface | signed-in humans entering the portal | branded provider choice, sign-in retry, auth handoff completion messaging | long-lived dashboard content, benchmark reporting, contributor workspaces, admin operations |
| `portal.paretoproof.com` | approved | authenticated contributors and admins | profile and access flows, admin review actions, private benchmark and run operations, private drilldown and future launch workflows | public marketing or project explanation, public canonical release reporting |
| `math.paretoproof.com` | deferred | none in MVP | no MVP ownership | any public or contributor workflow during MVP |
| `api.paretoproof.com` | backend control plane, not a standalone product surface | browser and worker clients | state, authz, orchestration, artifact control, internal worker coordination | standalone user-facing site navigation or content ownership |

## Public apex ownership

The public site is the only MVP surface that should answer "what is ParetoProof?" for a new visitor.

The apex site owns:

- project explanation and positioning
- public benchmark index and release summary pages
- public methodology and policy links that explain released numbers
- first-party release notes, updates, and incident notices
- public contributor-program explanation and sign-in entry links

The apex site must not absorb:

- private run drilldown
- contributor-only benchmark curation tools
- admin review queues
- raw internal artifact access

If a page is safe and useful for an unauthenticated reader, it belongs on the apex site unless another baseline says otherwise.

## Auth-entry ownership

`auth.paretoproof.com` is a narrow branded handoff surface.

It exists to:

- let a user choose GitHub or Google cleanly
- retry or recover the sign-in handoff without dropping into generic Cloudflare interstitials
- complete the secure transition into the portal session flow

It does not own:

- an independent navigation tree
- benchmark dashboards
- contributor profile or access-request management
- public release reporting

In practice, auth pages should be brief and task-focused. They help a user get into the portal; they are not a parallel product destination.

## Portal ownership

The portal is the only MVP surface that should expose authenticated ParetoProof work.

The portal owns:

- profile management
- access request and identity recovery flows after sign-in
- admin approval and user-review actions
- private benchmark or run-management workflows
- private result drilldown, rerun lineage, and future launch surfaces

The portal must not become:

- the canonical public benchmark-reporting site
- the primary place where anonymous users learn the product
- a separate public changelog or updates archive

If a workflow requires approval, role-aware UI, or private benchmark state, it belongs in the portal unless a later scope explicitly creates a new trusted surface.

## Deferred math surface

The separate math hostname is deferred by [math-surface-mvp-baseline.md](math-surface-mvp-baseline.md).

That means math-specific work must map onto existing surfaces during MVP:

- public math-facing explanation or released benchmark material goes on the apex site
- contributor or admin math workflows go in the portal
- worker or verifier execution stays behind the API and worker boundary

No frontend or backend issue should treat `math.paretoproof.com` as an available MVP destination unless this baseline and the math-surface baseline are both superseded.

## Route-family ownership

The ownership rule should apply at the route-family level, not only at the hostname level.

### Apex route families

Expected apex-owned families include:

- landing and project explanation pages
- public benchmark index and released benchmark detail pages
- public methodology, policy, and update pages
- public entry links into auth or portal

### Auth route families

Expected auth-owned families include:

- provider start or return handling
- branded retry or failure messaging
- final handoff pages that submit into the API and then continue to the portal

### Portal route families

Expected portal-owned families include:

- `/profile` and account state
- access request, recovery, and approval flows after authentication
- private benchmark operation and review pages
- private results drilldown and future run-launch pages

## User-role mapping

The surface split also follows the user-role split:

- anonymous and public readers should stay on the apex site
- authenticated but not yet approved users should move through auth into the portal access flow
- approved contributors and admins should do their actual product work in the portal

The auth surface is transitional for all of these users. It should not become the place where they remain.

## Decision rules for future scopes

Use these rules when placing new work:

1. If the page is for unauthenticated public understanding or released public results, put it on `paretoproof.com`.
2. If the page only exists to get a user into or back into the portal session safely, put it on `auth.paretoproof.com`.
3. If the page requires an authenticated contributor or admin context, put it on `portal.paretoproof.com`.
4. If a proposed feature seems to require `math.paretoproof.com`, treat that as a new scope decision rather than as an available default.

## Relationship to adjacent baselines

- [public-content-pack-baseline.md](public-content-pack-baseline.md) defines the exact MVP project-explanation, contributor-entry, and contact-content pack that belongs on the apex site.
- [math-surface-mvp-baseline.md](math-surface-mvp-baseline.md) decides that `math.paretoproof.com` stays out of MVP entirely.
- [public-benchmark-reporting-ux-baseline.md](public-benchmark-reporting-ux-baseline.md) defines the public reporting UX that belongs on the apex site.
- [release-notes-and-updates-baseline.md](release-notes-and-updates-baseline.md) defines the public update surfaces that also belong on the apex site.
- [results-drilldown-ux-baseline.md](results-drilldown-ux-baseline.md) defines authenticated private drilldown work that belongs in the portal.

This document is the source of truth for which surface owns each kind of work.
