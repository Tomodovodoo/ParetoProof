# Better Auth Migration Baseline

This document defines the intended post-MVP migration path from the current Cloudflare Access-centered auth setup to Better Auth as the application-level authentication layer.

It is intentionally a later-scope decision. The MVP should keep the current auth model until the existing portal, approval, and identity-linking flows stop changing frequently.

## Why migrate after MVP

The current MVP auth path is intentionally conservative. Cloudflare Access gates the portal, the backend verifies the Access assertion, and the application stores its own linked identities, approval state, and session records in Postgres. That is good enough for the current MVP, but it is not the long-term application auth model.

The post-MVP reasons to migrate are:

- reduce custom auth/session plumbing in the API and portal handoff flow
- move user-facing sign-in and account linking into an application-owned auth layer instead of an Access-specific edge flow
- make GitHub and Google provider handling a normal app concern rather than a Cloudflare Access concern
- gain a cleaner path for later account features such as provider management, session management, passkeys, or other first-party auth features
- keep internal service auth and human portal auth from being tied to the same Cloudflare Access shape forever

## Migration boundary

Better Auth should replace the application-level identity-provider and browser-session layer.

Better Auth should not replace:

- ParetoProof authorization rules
- `role_grants`
- `access_requests`
- audit-event semantics
- internal worker or service-token authentication

Cloudflare Access should remain an infrastructure boundary where it still adds value, but it should stop being the primary user-facing portal login mechanism once Better Auth is adopted for the main application.

The intended boundary is:

- Better Auth owns user sign-in, provider callbacks, account linking, and browser session issuance
- ParetoProof owns approval state, role assignment, audit policy, and internal machine authentication
- Cloudflare Access remains available for internal-only surfaces, owner/admin bootstrap, and other edge-gating cases that are not the normal contributor login path

## Target user, session, and provider model

### User model

`users` should remain the canonical application user table.

That keeps the rest of the product stable:

- `role_grants` continue to reference `users.id`
- `access_requests` continue to target app users and app approval rules
- future run ownership, audit records, and contributor metadata do not need to move to a third-party schema shape

Better Auth should attach to the same canonical user identity rather than introducing a second competing "real user" table.

### Provider account model

The current `user_identities` table is conceptually close to Better Auth's provider-account model, but the migration should not assume that the current table can be reused unchanged.

The target state is:

- Better Auth-managed provider-account records become the source of truth for GitHub and Google login linkage
- the current `user_identities` rows are backfilled into the Better Auth account model during migration
- app code stops treating Cloudflare Access subject values as the main long-term identity key for normal portal login

The migration may keep `user_identities` temporarily for compatibility during a dual-read window, but the long-term owner of linked social-provider accounts should be Better Auth.

### Session model

The current `sessions` table is optimized around the current handoff model and token hashing. Better Auth uses a cookie-backed session model with its own session table and lifecycle.

The target state is:

- Better Auth becomes the source of truth for contributor browser sessions
- portal session creation, rotation, expiry, and revocation follow Better Auth rather than custom portal-session endpoints
- current portal handoff and retry routes can be retired once Better Auth fully owns login completion

The migration should prefer a Better Auth-aligned session table rather than forcing Better Auth to mimic the current `sessions` shape exactly.

## Cloudflare Access vs Better Auth after migration

After migration, the normal contributor login path should be:

- contributor goes to `auth.paretoproof.com`
- Better Auth handles GitHub or Google OAuth directly
- Better Auth issues the application session for `.paretoproof.com`
- the API resolves the authenticated user and then applies ParetoProof approval and role checks

Cloudflare Access should no longer sit in front of the normal contributor portal flow once Better Auth owns app login. Otherwise the system would keep two overlapping human-auth systems in the critical path.

Cloudflare Access should still be retained for:

- internal-only API or admin routes when edge gating is still useful
- owner bootstrap or break-glass operational access if needed
- non-product infrastructure boundaries that are not part of ordinary contributor sign-in

## Migration preconditions

Do not start execution work for Better Auth until these preconditions are true:

- the MVP portal auth, approval, and identity-recovery flows have stabilized
- the product has a clear canonical public auth callback surface, expected to remain `auth.paretoproof.com`
- GitHub and Google remain the supported human providers for the next phase
- the team is ready to manage provider OAuth apps directly instead of delegating that entirely to Cloudflare Access
- the API auth boundary for internal worker/service routes is already separated from the human portal path
- there is a concrete migration plan for existing approved users, existing linked identities, and current sessions

## Expected execution shape

When this migration eventually becomes execution work, it should be split into stages:

1. Add Better Auth in parallel with the existing MVP auth stack.
2. Create the Better Auth database tables and wire them to the canonical app user model.
3. Register GitHub and Google directly with Better Auth callback URLs on `auth.paretoproof.com`.
4. Backfill existing approved users and linked identities into the Better Auth account model.
5. Move contributor login and session issuance to Better Auth.
6. Retire the Cloudflare Access dependency from the normal contributor flow.
7. Keep or narrow Cloudflare Access only where it still serves an infrastructure/admin purpose.

## Secret and config impact

The later migration should expect new runtime inputs such as:

- `BETTER_AUTH_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- Better Auth cookie and base-URL configuration for `auth.paretoproof.com`

These values belong in app runtime secret stores, not in Pages bundles, Docker build args, or the repository.

## Non-goals

This scope does not commit ParetoProof to:

- email/password auth
- password reset flows
- magic-link auth
- organization features
- passkeys
- replacing `role_grants` with Better Auth roles

Those may become later decisions, but they are not preconditions for adopting Better Auth as the post-MVP application auth layer.
