# Portal Review Moderator Baseline

This document decides whether ParetoProof should add a delegated moderator or reviewer role for the current admin review operations.

The current question is narrow:

- contributor access-request review
- identity-recovery review
- existing-user corrective actions on `/admin/users`

It does not define benchmark-intake moderation or general operator powers outside the admin review workspace.

## Current baseline

The repository currently keeps the full review surface behind `admin_only`:

- `GET /portal/admin/access-requests`
- `GET /portal/admin/access-requests/:accessRequestId`
- `POST /portal/admin/access-requests/:accessRequestId/approve`
- `POST /portal/admin/access-requests/:accessRequestId/reject`
- `GET /portal/admin/users`
- `GET /portal/admin/users/:userId`
- `POST /portal/admin/users/:userId/revoke-role`

That current boundary is doing real safety work:

- approval can grant helper or collaborator access
- identity recovery can link a new external identity to an approved user
- role revocation can invalidate active sessions
- read models expose linked identities, request history, and audit echoes

This is not a low-risk queue-triage surface.

## Decision

ParetoProof should not add a delegated non-admin review role with write authority in the near-term product.

The accepted near-term boundary is:

- all current `/portal/admin/*` review mutations remain `admin_only`
- all current `/portal/admin/*` review reads remain `admin_only`
- there is no moderator, reviewer, or helper-plus role that may approve, reject, recover, or revoke access

If review throughput later becomes a real bottleneck, the first allowed delegation step is a separate later slice for read-only review assistance plus explicit escalation. It is not acceptable to create a partial-write moderator role by accretion.

## Why The Boundary Stays Admin-Only

The current review actions are tightly coupled:

- approving a standard access request grants a real contributor role
- approving identity recovery can attach a new sign-in identity to an existing account
- revoking a role also invalidates active sessions
- request and user detail views include sensitive history and linked-identity posture

Those actions are higher risk than simple queue moderation because they change account authority and identity binding.

Delegating them without a narrower product need would create avoidable policy ambiguity:

- a moderator who may approve helper but not collaborator still changes account authority
- a moderator who may approve recovery without revocation powers still changes identity control
- a moderator who can see all user details but not act still needs a justification for reading sensitive linked-identity and session posture

The repo does not yet show enough real workflow pressure to justify adding that complexity now.

## Explicit no for near-term delegated write actions

The following actions remain admin-only with no delegated exception:

- approve helper access
- approve collaborator access
- approve identity recovery
- reject access or recovery requests
- revoke an active helper or collaborator role
- inspect full user detail with linked identities, request history, and session posture
- inspect quarantine-like conflict details that expose account-linking problems between identities

These are all authority-changing or privacy-sensitive operations.

## Future delegation shape, if later needed

If the project later needs more review capacity, the first acceptable delegated role is a read-only reviewer role with escalation, not a write-capable moderator.

That future role would be allowed to:

- inspect a bounded access-request queue
- inspect one request detail page with only the fields necessary for triage
- record a non-authoritative recommendation or escalation note

That future role would not be allowed to:

- approve any request
- reject any request
- revoke any role
- link or relink identities
- invalidate sessions
- inspect the full `/admin/users/:userId` corrective-action surface

The purpose of that role would be queue preparation, not decision authority.

## Route ownership

No new moderator route family is approved here.

The accepted route rule is:

- current admin review stays on `/portal/admin/*`
- if a later read-only reviewer role is approved, it should stay on the same route family with capability-filtered read models instead of inventing a second hostname or shadow review tree

That keeps the ownership model explicit:

- same portal surface
- different capabilities
- no duplicate review application

## Escalation model

Near-term escalation remains simple:

- if a non-admin contributor notices a suspicious or urgent review case, they escalate out of band to an admin
- the portal does not need an in-product moderator approval path yet

If a later read-only reviewer role exists, escalation should require:

- a structured recommendation note
- explicit handoff to an admin
- no implied approval from the reviewer state alone

The admin remains the only actor who can finalize the decision.

## Audit requirements

Because no delegated write role is approved, current audit rules remain unchanged:

- approval, rejection, identity-linking, and revocation audits must identify an admin actor
- there is no audit event that implies non-admin authority over access decisions

If a later read-only reviewer role is introduced, it must add separate audit events for:

- reviewer triage opened
- reviewer recommendation recorded
- reviewer escalation requested

Those events must not be confused with final approval or rejection.

## Interaction with later benchmark moderation

This decision applies only to contributor access and corrective account review.

It does not automatically decide:

- benchmark intake moderation
- evidence review moderation
- release moderation
- worker or run-operations intervention

Those later surfaces may justify different roles because they do not necessarily alter contributor identity or account authority.

## MVP-adjacent rule

The next product step is not "add a moderator role."

The next product step is:

- keep the existing review boundary explicit
- avoid leaking admin powers into helpers or collaborators
- revisit delegation only when there is a concrete throughput problem with evidence that read-only triage would help

## Explicit out-of-scope decisions

This scope does not:

- implement new roles or route guards
- add recommendation notes to the portal
- change the access-request or recovery payload shapes
- define run-operations or benchmark-operations operator roles

## Follow-up execution slices

Because no delegated write role is approved, there is no immediate execution issue to add for moderator mutations.

The only valid future follow-on, if justified by real review volume, is:

1. add a read-only reviewer role and bounded review read models
2. add reviewer recommendation and escalation audit events
3. keep final approval, rejection, recovery, and revocation admin-only
