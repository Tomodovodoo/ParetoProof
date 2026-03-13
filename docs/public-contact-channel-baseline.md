# Public Contact Channel Baseline

This document defines the exact MVP public contact destination for ParetoProof and the manual handling rules around it.

The goal is to give the public-content pack one concrete contact answer without inventing an app-supported mailbox, contact form, or support desk before the project is ready to operate one.

## Core decision

The MVP public contact destination for `paretoproof.com` is the repository GitHub Discussions index:

- [https://github.com/Tomodovodoo/ParetoProof/discussions](https://github.com/Tomodovodoo/ParetoProof/discussions)

The public site should treat that Discussions surface as the canonical public contact entry.

MVP should not publish:

- a public contact form
- a general support mailbox on the apex site
- a live-chat or ticketing destination

## Why GitHub Discussions is the MVP contact entry

GitHub Discussions is the right MVP choice because:

- the current public audience is highly technical
- the repository is already the canonical public project surface outside the website
- Discussions supports asynchronous owner-managed replies without adding application runtime work
- the email baseline already keeps support mail outside the product runtime and does not require a public mailbox to exist at launch

This keeps the public contact promise narrow and real.

## What belongs in the Discussions contact path

The public site may route these public inquiries into GitHub Discussions:

- general project questions
- contributor-interest questions that do not contain sensitive identity details
- public clarification requests about released benchmark material, updates, or methodology links
- requests for help finding the right public documentation or portal entry point

If a discussion turns into implementation work, maintainers may open or request a GitHub issue separately. The discussion entry remains the public contact ingress.

## What must not route through the public contact path

The public site must not tell users to use GitHub Discussions for:

- access approval or identity recovery details that contain personal or sensitive information
- secrets, credentials, or account-session material
- authoritative admin approval decisions
- anything that requires a confidential reporting channel

The public site should say this plainly: do not post private account details or secrets in public discussions.

## Routing rules for auth and access problems

Access and identity problems should route through the existing auth and portal flows instead of the public contact channel.

The public-content pack may point users toward:

- the branded sign-in entry when the problem is simply reaching the portal
- the normal portal access-request or recovery flow when the user can authenticate but needs approval or identity help

GitHub Discussions may be used only for high-level clarification such as "which flow should I use?" and not for processing the account change itself.

## Manual handling policy

The Discussions contact path is manually owner-managed.

The MVP handling rules are:

- no guaranteed response SLA is promised on the public site
- replies are human-written and may redirect the user to documentation, auth entry, or the portal flow
- if a thread genuinely needs private follow-up, the maintainer may move the conversation off-platform manually, but that private handoff is not itself a public site feature
- the public site must not imply that GitHub Discussions is a confidential or secure intake channel

## Public-site wording constraints

The apex public-content pack should present the contact path conservatively.

Allowed messaging:

- public questions and contributor-interest questions go to GitHub Discussions
- access or identity issues belong in the sign-in, request, or recovery flow
- do not post secrets or sensitive account details publicly

Not allowed:

- "contact us for anything" language
- promises of private handling from a public discussion thread
- language that implies the site offers customer-support operations beyond the current MVP

## Relationship to email

This decision does not supersede the broader email policy.

It means:

- the public site does not publish a human support mailbox in MVP
- human-managed email may still exist later or be used manually off-platform when the owner decides it is necessary
- application-managed outbound or inbound email remains out of scope under [email-strategy-baseline.md](email-strategy-baseline.md)

If ParetoProof later wants a published support address, confidential reporting path, or mailbox-backed support workflow, that should be scoped explicitly as new work rather than implied by this MVP contact decision.

## Relationship to adjacent baselines

- [public-content-pack-baseline.md](public-content-pack-baseline.md) defines where the contact section appears in the apex public-content pack.
- [product-surface-boundary-baseline.md](product-surface-boundary-baseline.md) defines why this contact path belongs on the apex site rather than on the auth or portal surfaces.
- [email-strategy-baseline.md](email-strategy-baseline.md) defines the broader MVP boundary for human support mail and later transactional mail.

This document is the source of truth for the exact MVP public contact destination and its handling rules.
