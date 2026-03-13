# Portal Admin Review Ops Baseline

This document defines the exact MVP admin workflows that belong on the existing portal admin routes:

- `/admin/access-requests`
- `/admin/users`

The goal is to stop "admin verification" from remaining a generic page concept and instead anchor it to the route families, mutations, audit records, and read models the portal already reserves.

## Core decision

MVP portal admin operations split into two route-owned workspaces:

- `/admin/access-requests` is the decision queue for pending onboarding and identity-recovery requests
- `/admin/users` is the inspection and corrective-action surface for already-known contributor accounts

These routes share the same admin-only permission boundary, but they do not serve the same job:

- the request queue decides whether pending identities become approved or stay denied
- the users surface inspects existing account posture and applies corrective access changes when an already-known contributor needs intervention

MVP does not add a separate reviewer hostname, a generic moderation dashboard, or a second approval UI outside the portal route tree.

## Route ownership

### `/admin/access-requests`

This route owns pending-request review.

It is the only MVP place where an admin should:

- approve a pending `access_request`
- approve a pending `identity_recovery`
- reject a pending request with a visible note
- review the applicant evidence that explains one of those decisions

### `/admin/users`

This route owns existing-user inspection and corrective access actions.

It is the only MVP place where an admin should:

- inspect the current role and linked-identity posture for an existing user
- inspect request and audit history for that user
- revoke an active contributor role when access must be removed
- confirm whether a pending recovery or approval request already exists for that person

Direct approval of a new contributor does not belong on `/admin/users`. New approval starts from a request object on `/admin/access-requests`.

## Request and user object split

The route split follows the object split:

- `/admin/access-requests` is keyed by `access_requests.id`
- `/admin/users` is keyed by `users.id`

An access-request review may hand off into the user view, but the primary object must stay explicit. The admin should always be able to tell whether they are deciding a request or inspecting an already-approved account.

## `/admin/access-requests` workflow

### Primary object kinds

The queue must handle two visibly distinct request kinds:

- `access_request`
- `identity_recovery`

Both kinds share the same list and detail shell, but they do not share the same approval side effects.

### List behavior

The list view is a work queue first and an audit surface second.

Default ordering and filtering rules:

- default view shows `pending` requests first, oldest submitted first
- admins may switch to newest first or most recently reviewed
- admins may filter by request kind, status, requested role, and reviewer state
- recently reviewed items stay visible for audit follow-up instead of disappearing entirely after a decision

Every row in the queue must expose:

- `accessRequestId`
- request kind
- request status
- applicant email
- requested role or "preserve existing role" marker for recovery
- submitted timestamp
- reviewed timestamp when present
- matched user id when a ParetoProof user already exists
- current matched-user posture summary
- current active role summary when present

### Detail behavior

Opening a request shows a route-local detail state, not a separate wizard.

The detail view must expose:

- request id
- request kind
- applicant email
- rationale or recovery note
- requested role
- submitted timestamp
- current request status
- reviewed timestamp and reviewer summary when present
- decision note when present
- matched user summary when present
- linked identities for the matched user
- current active role or `no_active_role`
- whether the presented identity is already linked, missing, or conflicts
- recent related audit echoes for earlier submit or review events

For `identity_recovery`, the detail must also show:

- requested identity provider
- whether the requested subject already belongs to another user
- the effective preserved role that would remain after linking

### Allowed decision actions

For `access_request`, MVP allows exactly:

- approve as `helper`
- approve as `collaborator`
- reject with a visible decision note

For `identity_recovery`, MVP allows exactly:

- approve by linking the presented identity to the matched user
- reject with a visible decision note

MVP does not allow:

- approving directly as `admin`
- bulk approval or rejection
- silent triage states
- hidden auto-save
- editing the underlying applicant email or request body from the admin screen

### Required approval side effects

`access_request` approval must:

- transition the request from `pending` to `approved`
- create the active `role_grants` row for the selected role
- record who reviewed the request and when
- produce `access_request.approved`
- produce `role_grant.granted`

`identity_recovery` approval must:

- transition the request from `pending` to `approved`
- attach the presented identity to the matched user
- preserve the already-approved contributor role instead of presenting a fresh role grant
- record who reviewed the request and when
- produce `access_request.approved`
- produce `user_identity.linked`

Rejection must:

- transition the request from `pending` to `rejected`
- retain the decision note in the reviewed state
- record who reviewed the request and when
- produce `access_request.rejected`

### Required conflict states

The request workflow must surface these decision-blocking conditions explicitly:

- request not found
- request already reviewed or withdrawn
- matched user missing for the pending request
- requested recovery identity already belongs to another user
- an `access_request` needs an existing linked identity before first approval can succeed
- an `access_request` is stale because the matched user already has an active role

These conditions must appear as visible admin outcomes, not generic transport failures.

## `/admin/users` workflow

### Purpose

The users route is not a second approval queue. It is the source of truth for inspecting a contributor account after the system already knows who the user is.

The route exists to answer:

- who currently has access
- which role is active
- which identities can authenticate as that user
- whether there is pending or prior request history that explains the current state
- what the most recent privileged admin actions were

### List behavior

The users list is a searchable directory with posture summaries.

The list must support:

- search by email or user id
- filter by active role
- filter by access posture (`approved`, `no_active_role`, `pending_request`, `review_history_only`)
- filter by linked identity provider

Every list row must expose:

- user id
- email
- display name when present
- active role or `no_active_role`
- active role granted-at timestamp when present
- linked identity provider list
- most recent pending request marker when present
- most recent reviewed request status when there is no pending request

### Detail behavior

The user detail view must expose the durable admin context for one account:

- user id
- primary email
- display name
- active role summary
- revoked-role history
- linked identities with provider, created-at, and last-seen-at
- pending request summary when present
- recent request history
- recent audit history for grants, revocations, approvals, rejections, and identity links

The user view should also make it obvious whether the current account posture came from:

- a normal approved access request
- a recovery link onto an existing user
- a later admin revocation

### Allowed corrective actions

MVP allows one corrective mutation on `/admin/users`:

- revoke the currently active `helper` or `collaborator` role with a required visible reason

Role revocation belongs here because it acts on an existing approved user rather than on a pending request.

MVP does not allow `/admin/users` to:

- create a new user manually
- grant first access without a request
- grant or transfer `admin`
- edit linked identities directly
- bypass recovery review by attaching arbitrary identities from the users view

### Required revocation side effects

Revocation must:

- set `revokedAt` and `revokedByUserId` on the active `role_grants` row
- produce `role_grant.revoked`
- record the visible revocation reason in the audit payload
- revoke active sessions for that user so the next login resolves the new role posture cleanly

The resulting user posture becomes `no_active_role` until a later approved request creates a new role grant.

## Read-model requirements

The current thin request summary is not enough for the approved MVP admin workflows. The portal needs dedicated read models for both admin routes.

### Access-request list model

The `/admin/access-requests` list model must include:

- request core fields: id, kind, status, email, rationale, requested role, created at, reviewed at, decision note
- reviewer summary: reviewed-by user id, reviewed-by email or display label
- matched-user summary: user id, display name, primary email
- account posture summary: active role, linked identity count, prior reviewed-request status, pending-request marker
- recovery-specific summary: requested identity provider, requested identity already linked flag, conflicting-user flag

### Access-request detail model

The detail model must extend the list model with:

- linked identity records for the matched user
- active role grant metadata
- recent related request history for the same email or user
- recent audit echoes for submit, approve, reject, grant, and identity-link events
- session-impact note for decisions that require re-authentication to see changed access

### User list model

The `/admin/users` list model must include:

- user core fields: id, email, display name
- active role summary with granted-at timestamp
- linked identity providers
- pending-request presence and kind when present
- last reviewed request status when there is no pending request

### User detail model

The detail model must extend the list model with:

- full linked-identity records
- role-grant history including revocation metadata
- request history for that user
- recent admin audit timeline
- active-session posture summary sufficient to confirm whether revocation must force re-authentication

## State transitions

The MVP route-level state transitions are:

- `access_request.pending -> access_request.approved`
- `access_request.pending -> access_request.rejected`
- `identity_recovery.pending -> identity_recovery.approved`
- `identity_recovery.pending -> identity_recovery.rejected`
- `role_grant.active -> role_grant.revoked`

There is no MVP transition from `/admin/users` that directly creates a fresh active role. New active access always comes from approval of a pending request object.

## Audit visibility rules

The UI must surface audit-critical actions as first-class context, not as hidden backend trivia.

The minimum visible audit cues across the two routes are:

- actor identity for the most recent privileged action
- action timestamp
- target user id
- request id when the action came from a request
- effective role after the action
- decision or revocation note when one was required

The portal does not need a generic audit explorer in MVP, but it must echo the relevant privileged events close to the object being reviewed.

## Permission boundary

Both routes are `admin_only`.

MVP does not create a separate moderator role. If a later scope introduces moderators, it must decide which subset of these actions they may perform. This baseline assumes one admin-only workflow model.

## Relationship to adjacent baselines

- [admin-verification-ux-baseline.md](admin-verification-ux-baseline.md) defines the earlier frontend review flow and is narrowed here to the concrete `/admin/access-requests` and `/admin/users` route model
- [product-surface-boundary-baseline.md](product-surface-boundary-baseline.md) keeps these workflows inside the authenticated portal
- [operations-baseline.md](operations-baseline.md) defines the underlying approval, revocation, session, and platform boundaries that these admin routes rely on
- [route-access.ts](../packages/shared/src/contracts/route-access.ts) and [portal-navigation.ts](../packages/shared/src/contracts/portal-navigation.ts) reserve the route and navigation entries this baseline now makes authoritative
- [audit-event-catalog.ts](../packages/shared/src/contracts/audit-event-catalog.ts) defines the privileged event ids this workflow must expose and, where needed, emit

## Follow-up execution lanes

This scope should unlock:

- a backend issue to expose the required `/portal/admin/access-requests` and `/portal/admin/users` read models plus missing audit emissions
- a frontend issue to implement the route-owned admin queue and user-management views against those read models
- a backend test issue to add regression coverage for approval, recovery-link, revocation, session-revocation, and protected-mutation audit logging

## Out of scope

- a separate moderator permission tier
- bulk review tools
- a standalone admin hostname
- admin self-bootstrap or first-admin creation
- arbitrary identity attachment from the users surface
- direct contributor approval from `/admin/users`
