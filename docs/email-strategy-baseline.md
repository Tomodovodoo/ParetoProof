# Email Strategy Baseline

This document scopes ParetoProof email strategy beyond the current MVP implementation. It does not add email features now; it resolves what to build later so execution issues can be created without reopening provider and boundary decisions.

## Scope summary

- MVP remains email-light: no required app-driven transactional flows at launch.
- Post-MVP baseline includes outbound transactional email from the API.
- Inbound support handling stays external-first and manual.
- Provider baseline is Resend for transactional delivery and suppression handling.

## Product email boundaries

### Transactional email (planned, post-MVP)

ParetoProof should support transactional email after the core portal and runner control plane are stable.

Planned categories:

- account-access events: approval granted, approval rejected, role changed
- identity-recovery acknowledgements: request received, request resolved
- operational notifications: run failure or completion summaries for opted-in contributors
- admin alerts: high-priority control-plane failures (optional, later phase)

Excluded from this baseline:

- marketing campaigns
- newsletter/broadcast systems
- in-product chat or threaded support mailbox ingestion

### Support/contact mail (external-first)

Support and contact mail should stay outside product runtime for MVP and near-term post-MVP phases.

- `support@paretoproof.com` is handled by owner-admin inbox tooling, not by API endpoints.
- Public contact forms, if added, should forward to support mail without creating user-visible ticketing inside the portal.
- No inbound parsing pipeline is part of this scope.

## Provider choice

Resend is the baseline transactional provider.

Rationale:

- straightforward API for TypeScript backend integration
- built-in suppression and deliverability controls without adding a second service for MVP-scale volumes
- webhook support for delivery, bounce, complaint, and suppression events
- low operational overhead for a small owner-managed team

Decision rule for revisit:

- revisit only if monthly volume, compliance requirements, or dedicated support workflows exceed Resend constraints

## Domain and sender model

- Primary sender domain: `paretoproof.com` with subdomain identity for mail as needed (for example `mg.paretoproof.com` or `mail.paretoproof.com` depending on provider setup)
- Canonical senders:
  - `noreply@paretoproof.com` for transactional notices
  - `support@paretoproof.com` for human support replies
- DMARC policy should start at monitoring (`p=none`) during warm-up, then move to enforcement once deliverability is stable

Required DNS/auth records:

- SPF include for chosen provider
- provider-issued DKIM records
- DMARC record owned at root domain
- optional custom return-path/tracking domain per provider guidance

## Secrets and platform ownership

Ownership:

- Provider account and API credentials are owner-admin controlled.
- Runtime send secret is injected into Railway API environment only.
- No provider credentials in web bundles, Docker images, or repository files.

Expected runtime variables (names may be finalized in execution):

- `EMAIL_PROVIDER` (for example `resend`)
- `EMAIL_FROM_NO_REPLY`
- `EMAIL_FROM_SUPPORT`
- `EMAIL_SEND_API_KEY`
- `EMAIL_WEBHOOK_SIGNING_SECRET` (if webhook ingestion is enabled)

## Auth and workflow impact

Cloudflare Access remains the identity gate for sign-in. Email does not replace auth.

Email is notification-only for this baseline:

- no password reset flow
- no magic-link auth flow
- no email-based account verification gate before Access login

Application flows that may emit transactional mail later:

- admin approval/rejection actions
- identity-recovery decision updates
- optional run-status notifications

## Data and audit impact

When execution begins, persist minimal message telemetry for audit and support triage:

- template key
- recipient user id (nullable for non-user operational notices)
- provider message id
- send timestamp
- delivery state (`queued`, `sent`, `delivered`, `bounced`, `complained`, `suppressed`)
- last provider event timestamp

Do not store full email body content in core tables unless required for compliance.

## Execution-ready follow-up tasks

Create execution issues for:

- backend provider adapter and typed send contract
- email template catalog for approval/recovery/notification events
- secure Railway secret wiring and environment validation
- provider webhook endpoint and signature verification
- minimal email event table and admin-facing audit view
- support mailbox ownership/runbook documentation

## Out of scope

- implementing provider integration in this issue
- building user-facing notification preference UI
- adding inbound ticketing or CRM integration