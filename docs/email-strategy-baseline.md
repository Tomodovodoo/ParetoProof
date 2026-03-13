# Email Strategy Baseline

This document resolves the current MVP scope for email. It separates human support mail from application-driven transactional mail so later execution work can be created without reopening whether ParetoProof should send product email at all.

## MVP decision

ParetoProof does not need product-integrated email in the current MVP.

- Contributor approval is currently manual and owner-driven.
- Portal access already depends on Cloudflare Access rather than on email magic links or email-verified session flows.
- Identity recovery is intended to be handled through manual review, not automated mailbox workflows.
- The MVP portal does not yet need benchmark-completion notifications, invites, or billing notices.

The immediate result is simple: no application code, worker flow, or API contract should depend on outbound email to make the MVP usable.

## Mail categories

Email work should be split into two separate categories instead of one combined "mail provider" decision.

### 1. Transactional product email

This is later-scope, app-owned outbound email such as:

- contributor approval or rejection notices
- account recovery follow-up
- optional benchmark or run notifications
- admin-triggered invitations if the project later adds them

This is not part of the current MVP implementation baseline.

### 2. Human support or contact mail

This is owner-managed human communication such as:

- contact requests from the public site
- contributor support replies
- manual approval or recovery coordination

For MVP, support mail stays outside the application and should be handled through a normal human mailbox provider rather than an app-integrated inbound mail flow.

## Provider decision

When ParetoProof eventually adds transactional product email, the default outbound provider should be `Resend`.

Resend is the preferred later provider because it keeps the MVP mail surface narrow:

- outbound-first integration matches the actual later need better than full mailbox hosting
- domain verification, SPF, DKIM, and suppression handling are part of the expected setup
- API-first delivery fits the existing TypeScript control-plane model without adding mailbox administration to the app
- the product does not currently need a tightly coupled inbound-routing engine

This decision does not mean Resend should be configured now. It only fixes the default provider choice for future execution issues unless a later scope change creates a stronger requirement.

## Inbound mail decision

Inbound product mail is out of current scope.

- ParetoProof does not need app-owned inbound parsing, ticket ingestion, reply threading, or mailbox sync for the MVP.
- If the product later needs inbound automation, it should be scoped as a separate issue instead of being bundled into the first outbound email implementation.

Support/contact mail may still exist at the domain level, but it should terminate in a human-managed mailbox system rather than the application.

## Domain and address policy

The later transactional sender should use a dedicated subdomain such as `notifications.paretoproof.com` instead of sending directly from the root domain.

That keeps operational ownership clearer:

- transactional DNS records can be managed without mixing them into the public-site root unnecessarily
- suppression and reputation concerns stay separated from human-operated support mail
- future provider migration stays easier because the transactional sender boundary is explicit

Human support mail may use a normal support address on the primary domain or mailbox provider, but that remains outside the application runtime.

## Later secrets and DNS requirements

When transactional email is implemented later, the expected additions are:

- one outbound provider API key such as `RESEND_API_KEY`
- optional webhook signing secret if delivery or bounce webhooks are consumed
- sender-domain DNS records for SPF and DKIM
- DMARC policy updates for the sending domain
- one configured sender identity such as `noreply@notifications.paretoproof.com`
- one human reply path or `Reply-To` target when a workflow needs responses

The current MVP should not add those secrets or records yet unless mail execution work actually starts.

## Execution boundary for later issues

Future execution issues should stay separate:

- one issue for transactional outbound mail provider setup and secret/DNS wiring
- one issue for app-level email templates and trigger rules
- one issue for any later portal/admin notification preferences
- one separate issue, only if needed, for inbound or support-mail automation

That keeps mail from re-entering the MVP as an accidental dependency of auth, approvals, or the portal bootstrap flow.
