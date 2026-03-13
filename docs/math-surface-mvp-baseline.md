# Math Surface MVP Baseline

This document decides whether `math.paretoproof.com` is part of the ParetoProof MVP product surface.

The goal is to stop frontend, hosting, and workflow scoping from drifting between a dedicated math site and the already approved apex plus portal split.

## Core decision

`math.paretoproof.com` is not part of the MVP.

The MVP does not introduce:

- a public math-specific hostname
- an Access-protected contributor math hostname
- a separate math submission or review site

Math-specific product work stays inside the already approved surfaces:

- `paretoproof.com` for public explanation, released benchmark reporting, and first-party updates
- `portal.paretoproof.com` for authenticated contributor and admin workflows
- `api.paretoproof.com` plus internal worker routes for control-plane state, execution, and artifacts

## Why this is the MVP decision

The current MVP spine is the offline Problem 9 benchmark slice, not a broad internet-facing math collaboration product.

Introducing a dedicated `math.paretoproof.com` surface now would add hostname, Cloudflare Access, navigation, deployment, and ownership complexity before the repository has finished the core run-bundle, verifier, and benchmark-control workflows that would justify a separate surface.

The existing public and authenticated surfaces already cover the MVP roles cleanly:

- public readers need benchmark context, release reporting, and project updates
- approved contributors need portal access for profile, access, future benchmark operations, and admin-reviewed work
- workers and backend services need internal control-plane routes, not a browser-facing math site

## Options considered

### Option A: public `math.paretoproof.com`

Rejected for MVP.

This would imply a fourth public-facing product hostname before there is a settled public math workflow distinct from the public site. It would also duplicate benchmark explanation and reporting work that already belongs on the apex site.

### Option B: Access-controlled or contributor-only `math.paretoproof.com`

Rejected for MVP.

This would split contributor navigation and route ownership between two authenticated web surfaces before the portal benchmark and run-management UX is even scoped or implemented. The portal should absorb early contributor math workflows rather than creating a parallel site boundary.

### Option C: no dedicated math hostname in MVP

Accepted.

Keep math-specific public material on the apex site and math-specific contributor or admin workflows in the portal until there is a proven product need that cannot be expressed cleanly inside those existing surfaces.

## Surface ownership during MVP

| Surface | Owns in MVP | Must not own in MVP |
| --- | --- | --- |
| `paretoproof.com` | public project explanation, benchmark release reporting, methodology links, release notes, public updates | contributor-only benchmark operations, privileged review queues, private run evidence |
| `portal.paretoproof.com` | authenticated contributor profile and access flows, admin review actions, future benchmark/run/review workflows that require approval | broad public discovery content, a separate public marketing or reporting experience |
| `api.paretoproof.com` | authoritative state, authz, run metadata, artifact coordination, worker coordination | browser-facing standalone product UX |
| `math.paretoproof.com` | no MVP ownership because the hostname does not enter MVP | any public or contributor workflow during MVP |

## Routing and workflow implications

Until a later scope says otherwise:

- public benchmark discovery, reporting, and release context stay on the apex site
- authenticated benchmark curation, submission review, or run-operation work should scope into portal routes, not a fourth hostname
- no DNS, TLS, Pages attachment, or Cloudflare Access application should be created for `math.paretoproof.com`
- future frontend route trees should treat math work as a feature area within existing surfaces, not as its own MVP deployment target

## Relationship to adjacent scopes

- Issue `#444` should define the detailed apex-versus-portal ownership split assuming there is no approved math hostname in MVP.
- Later frontend scopes should not create a dedicated math nav cluster or deployment target unless this baseline is superseded.
- Hosting and TLS work should continue to treat `math.paretoproof.com` as a deferred hostname only.

## Revisit conditions

This decision should be revisited only if at least one of these becomes true:

- ParetoProof adds a sustained public math workflow that is not just benchmark reporting or project explanation
- contributor math work becomes large enough that the portal can no longer hold it without harming clarity or permissions
- the product intentionally expands from the offline benchmark MVP into a broader submission, review, or collaboration surface

Until then, `math.paretoproof.com` remains a deferred hostname rather than part of the MVP product map.
