# Math Surface Activation Baseline

This document defines the accepted web-surface split for the next ParetoProof product step now that benchmark authoring, review, and question-centric launch work need a dedicated authenticated home.

## Current baseline

- `docs/web-surface-policy.md` and `docs/architecture.md` previously deferred a separate `math.paretoproof.com` hostname.
- `docs/benchmark-intake-review-workflow-baseline.md` keeps launchable benchmark packages repository-owned and rejects browser-side package truth.
- `docs/portal-launch-mutation-baseline.md` and `docs/portal-run-control-actions-baseline.md` keep `/launch`, `/runs`, and `/workers` centered on execution and evidence rather than math authoring or review.
- The API and auth stack already support branded handoff into authenticated browser surfaces, even though the current continuation paths are portal-centric.

The project now needs a dedicated authenticated math workflow surface without collapsing that work into the public site, the generic ops portal, or ad hoc repository comments.

## Decision

ParetoProof should activate `math.paretoproof.com` as a fourth user-facing web surface.

The accepted surface split becomes:

- `paretoproof.com` for the public site and released benchmark reporting
- `auth.paretoproof.com` plus provider-specific auth hosts for branded sign-in and recovery entry
- `portal.paretoproof.com` for generic contributor profile, access state, execution evidence, worker posture, and platform admin
- `math.paretoproof.com` for authenticated math question intake, submission workflow, review workflow, package-readiness posture, and question-centric launch/bootstrap entry

This is a product-surface decision, not approval to move launchable benchmark truth out of the repository.

## Surface ownership

### `paretoproof.com`

The apex site continues to own:

- public project context
- released benchmark reporting
- approved release pages and public summaries

It should not own authenticated math authoring, reviewer queue state, or private launch preparation.

### `auth.paretoproof.com`

The auth surface continues to own:

- branded sign-in and provider start flows
- access-request and recovery entry
- redirect continuation into the correct authenticated app after identity resolution

The auth surface should not become a long-lived workspace shell for either portal or math tasks.

### `portal.paretoproof.com`

The portal remains the generic contributor and admin workspace for:

- profile and linked-identity management
- approval and access-state handling
- run, worker, and artifact operations
- generic admin and operational views that are not specific to the math workflow

The portal should not absorb question authoring, submission review, package-freeze preparation, or question-centric launch as sidecars under `/runs`, `/launch`, or `/workers`.

### `math.paretoproof.com`

The math surface should own:

- question catalog and question detail workflow
- submission intake and submission status
- peer review, editor review, and release-decision workflow
- package-readiness and freeze-preparation posture for approved math work
- question-centric launch entry for hosted, local connected, and offline export flows

The math surface is the authenticated product home for math workflow. It is not a public reporting site, a generic account portal, or a replacement for worker and scheduler operations.

## Repository truth boundary

Activating `math.paretoproof.com` does not change the canonical source of truth for launchable benchmark packages.

The repository remains authoritative for:

- launchable benchmark package trees
- Lean source, support files, and gold/reference material
- immutable package revisions and freezeable release inputs
- reviewable diffs on the substance of benchmark content

The math surface may own workflow metadata and structured reviewer state around those artifacts, but it must not become an unbounded browser-side package editor or create a parallel benchmark truth outside source control.

## Auth and continuation boundary

Branded sign-in should remain centralized on `auth.paretoproof.com`, but continuation must become app-aware.

The auth stack should:

- continue to authenticate users through the branded auth hosts
- preserve the caller's intended continuation target
- route successful continuation into either `portal.paretoproof.com` or `math.paretoproof.com` based on the requested destination

Math-specific sign-in should not require users to land in the portal first and then navigate manually into math.

Profile, access-request, and recovery flows that are generic to the account system may still resolve on portal-owned routes when that is the right continuation target.

## Launch and evidence boundary

Question-centric launch entry should live on the math surface because launch intent starts from a question, submission, or review context there.

That does not move all execution evidence into the math app.

The accepted split is:

- math owns question-centric launch entry, bootstrap choices, and question-local readiness context
- portal remains the generic home for durable run evidence, worker posture, and operational drilldown unless a later scope explicitly reassigns a read model

The project should prefer explicit deep links between math and portal over duplicating whole execution consoles in both surfaces.

The question-centric launch surface split also depends on a separate credential-ownership decision. `docs/math-provider-credential-policy-baseline.md` defines when math launch uses platform-managed hosted credentials, when local connected launch stays runner-host-local, and why browser surfaces must not become raw provider-secret collection points.

## What stays out of math

`math.paretoproof.com` should not own:

- public released benchmark reporting
- generic profile and access-state management
- worker fleet posture or incident response consoles
- raw provider secret vending to browsers by default
- a second source of truth for benchmark package contents outside the repository

## Relationship to earlier docs

This baseline supersedes the older "no separate `math.paretoproof.com` hostname in MVP" rule in:

- `docs/web-surface-policy.md`
- `docs/architecture.md`
- any downstream scope text that only deferred math workflow because the dedicated surface had not yet been accepted

It does not supersede the repository-truth decisions in `docs/benchmark-intake-review-workflow-baseline.md` or the execution-evidence boundaries in the portal launch and run-control baselines.

## Follow-up scope and execution work

This baseline unblocks the child scopes under `#882`:

- data model
- Lean submission and automated-check rules
- review and release workflow
- `/math` API namespace and auth destinations
- question-centric launch/bootstrap
- provider-credential policy
- harness and image distribution
- repo-sync and package-freeze workflow

Execution after those scopes should build:

1. the dedicated `math.paretoproof.com` app shell and auth continuation
2. `/math/*` backend routes and service modules
3. the math question, submission, review, package, and release object layer
4. question-centric launch flows that connect cleanly to the existing execution kernel
