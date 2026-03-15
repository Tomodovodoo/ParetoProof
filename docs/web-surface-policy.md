# Web Surface Policy

ParetoProof ships three user-facing web surfaces in MVP:

- `paretoproof.com` for the public site and released benchmark reporting
- `auth.paretoproof.com` plus provider-specific auth hosts for approved sign-in and new collaborator identity verification
- `portal.paretoproof.com` for the authenticated contributor and admin workspace

There is no separate `math.paretoproof.com` hostname in MVP. Public benchmark releases stay on the apex site, and deeper operational views stay in the portal.

## Surface Ownership

- `paretoproof.com` owns the public home page, the compact project pack, and public benchmark release pages.
- `auth.paretoproof.com` owns the branded sign-in and request-access entry flow.
- `portal.paretoproof.com` owns contributor profile, access state, admin review, run views, launch, and worker operations.

Redirect helpers, route tests, and public copy should preserve this split and reject cross-surface drift.

## Contributor Path

- Approved contributors start at the sign-in entry on `auth.paretoproof.com`.
- New collaborators verify identity first and then continue to the dedicated access-request path.
- Approval stays manual before any contributor work opens inside the portal.

The public site should explain this path without implying self-serve enrollment, hidden sign-in shortcuts, or a separate benchmark hostname.

## Auth State Cookies

- `PortalAccessProvider` and `PortalLinkIntent` are same-site coordination cookies for the branded auth and profile-link flows. They should be `SameSite=Strict`.
- Google sign-in, GitHub sign-in, branded retry, and profile-link entry only need these cookies on same-site `*.paretoproof.com` redirects. They must not rely on truly cross-site top-level cookie delivery.
- `PortalAccessProvider` may survive the internal branded handoff long enough to bind the finalized provider to the resolved subject, then it should be refreshed or cleared by the finalize response.
- `PortalLinkIntent` exists only to authorize a deliberate profile-link flow that started from the authenticated portal. It should be issued on that path and cleared on normal sign-in or after finalize so abandoned link state does not ride later navigations.

## Public Pack

The public project route stays compact:

- project overview and mission
- contributor path and approved sign-in versus request-access guidance
- public contact boundary
- links into released benchmark reporting and working docs

Unsupported or deferred asks such as open waitlists, support mailboxes, or extra top-level public trees should stay out of MVP copy.

## Contact Boundary

Public questions route to GitHub Discussions. Account recovery, approvals, and contributor-state resolution belong on the auth or portal surfaces, not in public threads.
