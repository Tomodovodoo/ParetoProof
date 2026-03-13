# Better Auth Migration Baseline

This document scopes the post-MVP migration path from the initial Cloudflare-Access-centered auth model to Better Auth as the application auth layer. It does not authorize immediate implementation work. The goal is to make the later migration boundary explicit so execution issues can be created without reopening the same design questions.

## Current MVP auth model

The live MVP auth model is edge-first:

- Cloudflare Access is the human sign-in gate for `portal.paretoproof.com` and the browser-facing portal API surface.
- The backend verifies the `Cf-Access-Jwt-Assertion`, resolves the caller through `user_identities`, and derives authorization from `role_grants`.
- Access currently proves identity at the edge, but it does not own application authorization or application session state.
- Identity recovery, access-request status, and role decisions are all application-level workflows backed by Postgres.

That split is visible in the current backend flow: Cloudflare Access provides the incoming subject and optional email, while the API decides whether that subject maps to an approved, pending, or denied contributor.

## Why migrate after MVP

Better Auth becomes attractive only after the MVP auth surfaces are stable.

Reasons to migrate later:

- move human sign-in and session ownership into the application instead of coupling all browser auth to Cloudflare Access
- support a durable application session model across portal routes, future APIs, and richer user settings
- make provider linking, re-authentication, and account recovery application-native instead of edge-cookie-driven
- support additional auth features later without inventing custom session plumbing in the API
- reduce dependence on Cloudflare Access as the long-term user-identity source for non-admin contributor workflows

Reasons not to migrate during MVP:

- the current Access-plus-RBAC model is sufficient for the existing portal bootstrap, approval, and recovery flows
- changing auth layers before those flows settle would multiply debugging surface across edge config, browser flow, backend checks, and database state

## Target boundary after migration

The post-MVP target is:

- Better Auth owns human user authentication, OAuth provider integration, session issuance, session revocation, and provider-account linking.
- ParetoProof application tables remain the source of truth for authorization, approvals, contributor roles, and admin decisions.
- Cloudflare Access stops being the primary human sign-in system for the contributor portal.
- Cloudflare Access may remain in use for non-human/internal boundaries such as protected admin operations, service-to-service routes, or temporary edge restrictions, but not as the long-term application session authority.

In short, Better Auth should replace Cloudflare Access for normal contributor identity and session handling, while Cloudflare Access remains available as infrastructure protection where it still adds value.

## Expected user, provider, and session model

After migration, the application auth model should look like this:

- one `users` row per logical person remains the core application identity
- provider identities are linked as external auth accounts rather than treated as the sole session authority
- Better Auth stores or manages application sessions and any required provider-account metadata
- `user_identities` remains the stable place where ParetoProof maps an external provider subject to a local user
- `role_grants` remains separate from auth and continues to answer "what may this person do?"

Expected provider baseline:

- GitHub OAuth
- Google OAuth

Expected session behavior:

- browser sessions are application sessions, not Cloudflare Access assertions mirrored into app state
- session invalidation on approval/role changes remains an application concern
- identity recovery becomes a provider-linking or account-claim workflow inside the application auth layer rather than a Cloudflare-Access-subject exception path

## Migration preconditions

Do not start execution work until all of the following are true:

- MVP portal auth and approval flows are stable enough that their current failure modes are well understood
- the application-level session shape is defined, including cookie policy, session lifetime, revocation behavior, and CSRF expectations
- the future provider callback hostnames and deployment topology are fixed for local, staging, and production
- the data model changes required for Better Auth are mapped cleanly onto the existing `users`, `user_identities`, `sessions`, and role-grant structure
- the team has decided whether any human-facing surfaces should still sit behind Cloudflare Access after migration
- owner-managed provider secrets and callback configuration are available for the target environments

## Recommended migration sequence

When execution eventually begins, the migration should happen in stages:

1. Introduce Better Auth in parallel with the existing RBAC and user tables.
2. Link GitHub and Google identities to existing ParetoProof users instead of creating a second user authority.
3. Move browser session issuance and logout to Better Auth.
4. Retain the current authorization checks backed by `role_grants`.
5. Remove Cloudflare Access from normal contributor sign-in only after parity is proven for approval, recovery, and admin workflows.

This should be a migration of auth transport and session ownership, not a rewrite of authorization semantics.

## Non-goals for this scope

- choosing a Better Auth adapter implementation today
- designing final session-table schemas in this issue
- replacing machine or internal service authentication
- authoring execution tasks before MVP auth behavior stabilizes
