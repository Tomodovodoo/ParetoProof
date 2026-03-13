# Admin Verification UX Baseline

This document defines the MVP frontend flow for manual admin verification of new contributor access and identity-recovery requests in the portal.

The goal is to make approval decisions reviewable, auditable, and hard to confuse with ordinary profile editing.

## Core decision

MVP uses one portal-owned manual review queue for access decisions.

- review lives inside `portal.paretoproof.com`
- review is an admin workflow in MVP
- `moderator` is not a separate MVP permission tier yet
- access requests and identity-recovery requests share one queue, but they do not share one decision model

If a later scope introduces moderators, they should inherit this same queue model rather than forcing a second review surface.

## Review object types

The queue must handle two request kinds:

- `access_request`: a signed-in identity without approved access is asking for a first approved role
- `identity_recovery`: a signed-in identity appears to belong to an already approved person, but the current identity is not linked yet

These request kinds must remain visibly distinct in both the queue list and the detail view.

An identity-recovery request is not a normal role request. The primary decision is whether to attach the new identity to an existing approved user safely, not whether to grant a fresh contributor role from scratch.

## Admin workflow model

The MVP interaction stack is:

1. review queue
2. request detail
3. explicit decision action

### 1. Review queue

The queue view must show pending items first and keep recently reviewed items available for audit context.

Each queue row or card must expose:

- request kind
- request status
- applicant email
- requested role or recovery marker
- submitted timestamp
- last reviewed timestamp when present
- current account posture summary

The queue must support simple filtering by:

- request kind
- request status
- requested role
- reviewer state (`unreviewed`, `reviewed`)

The queue may sort by:

- newest submitted first by default
- oldest submitted first
- most recently reviewed

### 2. Request detail

Selecting a request opens the review evidence view for one applicant.

The detail view must show:

- request id
- request kind
- applicant email
- requested role for `access_request`
- rationale or recovery note
- submitted timestamp
- current request status
- current linked-identity summary
- current active role summary when a matching user already exists
- prior decision note and prior review timestamp when this is not the first review surface for the same person

### 3. Explicit decision action

The decision area must stay visually separate from the evidence area.

For `access_request`, the admin may:

- approve as `helper`
- approve as `collaborator`
- reject with an optional but visible decision note

For `identity_recovery`, the admin may:

- link the presented identity to the existing approved user
- reject the recovery request with a decision note

The UI must not present recovery approval as a fresh role-grant dropdown unless the backend has determined that the recovery target is not already tied to an approved account. Recovery should default to preserving the existing approved role posture.

## Applicant states that must be visible

The admin surface must show both request state and applicant account state.

These are different concepts and must not collapse into one badge.

### Request states

The request itself must show:

- `pending`
- `approved`
- `rejected`
- `withdrawn`

### Applicant account states

The linked account posture shown beside the request must distinguish:

- `no_matched_user`: the current identity does not map to an existing ParetoProof user record
- `pending_request`: the identity exists only as a pending applicant
- `approved_user`: the request is attached to an already approved contributor account
- `rejected_or_withdrawn_history`: the person has prior denied or withdrawn request history that may matter for context
- `identity_mismatch`: the current identity is not linked, but an approved account likely exists and recovery review is required

MVP does not need fancy inference labels, but it does need these distinctions rendered clearly enough that an admin can tell whether they are approving a new contributor, restoring an existing one, or re-reviewing a previously denied case.

## Required audit cues

The admin must see enough evidence to justify the decision without leaving the portal.

Every request detail must therefore expose these cues:

- request id
- request kind
- applicant email
- provider label for the presented identity
- requested role or preserved-role note
- rationale or recovery note
- submitted timestamp
- last reviewed timestamp when present
- current request status
- active role summary for any matched user
- linked identity list for any matched user
- prior decision note when present
- session-impact note when approval or recovery will require session refresh

The UI should also leave space for the eventual reviewer identity and audit-event echo once the backend returns it. At minimum, the design must anticipate who reviewed the request and when, because approval and rejection are audit-critical actions under the shared audit catalog.

## Decision confirmation rules

Approvals and rejections must feel deliberate.

For MVP:

- the action buttons stay disabled while a decision mutation is in flight
- the request card or detail view must show the resulting reviewed timestamp after success
- approval success should confirm the effective role that will become active
- recovery success should confirm that the new identity is linked to the existing contributor account
- rejection should leave the decision note visible in the reviewed state

Bulk approve, swipe-style moderation, and hidden auto-save are out of scope.

## Relationship to access and profile flows

This review UX sits beside, not inside, the applicant flows.

- the applicant submits an access or recovery request from the portal holding flow
- the admin reviews that request in the admin queue
- approved users then continue through the normal profile and linked-identity surfaces

The admin review UI must therefore link conceptually to:

- the access-request entry flow
- the denied or pending holding screens
- the linked-identity profile surface for already approved users

It must not reuse the ordinary profile editor as if approval were just another self-service account setting.

## Surface and permission boundary

This workflow belongs only to the authenticated portal.

- no approval actions belong on the public site
- no approval actions belong on the auth-entry host
- MVP review actions are `admin`-only even if issue text says "admin or moderator"

If a later scope adds a moderator role, it should define whether moderators can approve, reject, or only triage. That is not part of the MVP baseline here.

## Relationship to adjacent baselines

- [product-surface-boundary-baseline.md](product-surface-boundary-baseline.md) defines why admin review belongs in the portal
- [operations-baseline.md](operations-baseline.md) defines the manual approval and role-grant side effects behind this UI
- [frontend-design-system-baseline.md](frontend-design-system-baseline.md) defines the component and responsive rules this admin flow should follow

This document is the source of truth for how the portal presents manual contributor verification in MVP.

## Out of scope

- automated risk scoring
- email-based approval loops
- bulk approval or rejection
- a distinct moderator permission model
- long-lived case-management notes beyond the request decision note
