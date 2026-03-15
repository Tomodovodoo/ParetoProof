# Benchmark Intake Review Workflow Baseline

This document defines how new benchmark candidates should enter ParetoProof after the current package-driven kernel, which parts of that workflow remain repository-owned, and which parts may later move into the portal without breaking the approved MVP surface boundaries.

## Current baseline

- `docs/benchmarks.md` already treats repository-owned benchmark packages as the active execution kernel.
- `docs/problem9-benchmark-target-baseline.md` now fixes `firstproof/Problem9` as the canonical current benchmark target rather than leaving it as a bootstrap-only theorem.
- `docs/math-surface-activation-baseline.md` now accepts `math.paretoproof.com` as the authenticated math workflow surface while keeping package truth repository-owned.
- `docs/portal-launch-mutation-baseline.md` and `docs/portal-run-control-actions-baseline.md` keep `/runs`, `/launch`, and `/workers` focused on execution and evidence, not benchmark authoring or curation.
- The current repository state still makes the benchmark package itself the authoritative source of theorem statement, support files, gold proof, and releaseable materialization inputs.

The project therefore has a real benchmark kernel, but it does not yet have an accepted intake and curation workflow for what comes after the current package.

## Decision

Near-term benchmark intake should remain repository- and pull-request-driven.

The portal should not gain raw benchmark package authoring or freeform theorem-submission forms in the next slice.

A later math workflow is allowed, but only as a structured review layer on top of repository-owned package candidates, not as a replacement for repository-owned source control.

## Near-term workflow

### Authoritative source of truth

The authoritative benchmark source remains the repository.

A candidate benchmark enters the system through:

1. a repository branch
2. one proposed benchmark package tree and related docs or fixtures
3. one pull request that can be reviewed against the benchmark policy gates

The repository remains the only place that may own:

- benchmark package files
- Lean statement and support modules
- gold proofs
- materialization inputs
- verifier fixtures and regression expectations
- immutable releaseable package revisions

This keeps the benchmark truth auditable, diffable, and reproducible under the same change control as the rest of the kernel.

### Human workflow

The near-term workflow should be:

1. candidate package drafted in-repo
2. PR opened with benchmark-policy evidence
3. benchmark-specific review against the mandatory gates
4. acceptance or rejection recorded in the PR and linked issue
5. only accepted candidates become launchable or publicly reportable

This is intentionally narrower than a general submission portal. The project still needs trusted package authorship and reproducible review more than it needs browser-based theorem intake.

## Math surface role in the later slice

The math surface may later gain structured benchmark intake and curation review, but only for metadata, workflow state, and reviewer decisions.

The math surface should not become a raw package editor.

### Allowed later math-surface responsibilities

A later math workflow may own:

- benchmark candidate registration metadata
- triage state
- reviewer assignment
- policy checklist completion status
- approval or rejection decisions
- publication readiness and release visibility state

### Forbidden later math-surface responsibilities

Even in the next math-enabled slice, the browser should stay out of:

- direct editing of Lean theorem files
- freeform theorem authoring without repository review
- mutable browser-side gold-proof editing
- ad hoc package-root file uploads that bypass repository history
- creation of a parallel benchmark source of truth outside the repo

## Minimum object model for the later workflow

If the math surface later gains structured benchmark intake or review capabilities, the minimum object model should be:

- `benchmark_candidate`
- `curation_review`
- `release_decision`
- `publication_status`

### `benchmark_candidate`

This object represents one proposed benchmark package revision under review.

It should carry:

- stable candidate id
- repository PR or commit linkage
- package id
- proposed package version
- benchmark family and item id
- submission source
- current intake status

It should not pretend to replace the repository package itself.

### `curation_review`

This object represents structured review of one candidate against the benchmark gates.

It should carry:

- reviewer identity
- review status
- checklist results
- blocking concerns
- escalation requirement
- final review note

A candidate may need more than one curation review over time, but the review object should remain attached to the candidate rather than drifting into generic issue comments only.

### `release_decision`

This object represents the approved, rejected, or deferred decision for a candidate.

It should carry:

- decision actor
- decision timestamp
- approved package revision or rejected candidate reference
- required follow-up before publication, if any

### `publication_status`

This object controls whether an already approved candidate is:

- internal-only
- held out
- release-ready
- publicly reportable
- published

Publication state must remain separate from review state, because an accepted candidate may still be intentionally withheld from public reporting.

## Role split

### Submit

Near-term submit authority remains repository contributors who can open the package PR.

Later math-surface candidate registration may be allowed for:

- approved collaborator or higher

Helpers should not create benchmark candidates in the next slice.

### Triage

Triage may later be delegated, but only for workflow-state management such as:

- marking a candidate ready for review
- requesting missing policy evidence
- routing to the appropriate reviewer

Triage should not equal approval.

### Review

Substantive curation review should stay with trusted benchmark reviewers or admins.

The reviewer role must be able to reject a candidate as unfit for launch or publication even when the package builds successfully.

### Approve or reject

Approval and rejection should remain admin-level or explicitly benchmark-reviewer-level decisions.

The project should not infer benchmark-publishing authority from ordinary run-launch or worker-ops permissions.

### Publish

Public release or publication status changes should remain admin-only in the near term.

That includes:

- marking a candidate publicly reportable
- attaching it to released benchmark reporting on the apex site
- lifting a hold-out state

## Mandatory benchmark-policy gates

A candidate must not become launchable or publicly reportable until the benchmark review flow records success against the mandatory gates.

The minimum required gate families are:

- benchmark target truth and scope clarity
- statement metadata completeness
- provenance and source legitimacy
- gold/reference availability and correctness
- disclosure and hold-out handling
- package reproducibility and materialization integrity

### Benchmark target truth

The candidate must clearly state:

- what theorem or benchmark task is being asked
- why it is not just a definitional triviality or a misleading placeholder
- how it fits the accepted benchmark family and package identity rules

### Statement metadata completeness

The candidate must preserve enough metadata to review the task cleanly, including:

- canonical statement text
- benchmark identifiers
- expected namespace or module identity
- lane expectations and any benchmark-owned helper definitions

### Provenance and source legitimacy

The review flow must capture where the problem came from, whether the project is allowed to package it, and whether the benchmark-owned statement is actually the one being evaluated.

### Gold/reference availability

A candidate must not be accepted as launchable without a reviewable gold or reference path that matches the benchmark statement truthfully.

That does not require public release of every internal review artifact, but it does require durable reviewer confidence that the benchmark has a correct target.

### Disclosure and hold-out handling

The review flow must distinguish:

- accepted for internal use only
- accepted but held out from public reporting
- approved for released benchmark reporting

Hold-out and publication posture are not optional annotations. They are release decisions.

### Package reproducibility and materialization integrity

The candidate must still satisfy the package-driven kernel rules:

- reproducible package tree
- materializable immutable package revision
- verifier and fixture alignment
- no browser-only state that would make the benchmark impossible to reconstruct from source control

## Surface ownership

### Repository-owned

The repository owns:

- benchmark package authoring
- theorem and proof source
- verifier fixtures
- releaseable package revisions
- code review on the substantive benchmark content

### Math-surface-owned later

If implemented later, the math surface should own:

- candidate registration and queue state
- structured curation-review status
- reviewer checklists and decision tracking
- release and publication workflow state

### Not owned by `/runs`, `/launch`, or `/workers`

The current benchmark-ops route family should not absorb benchmark intake.

- `/runs` remains benchmark evidence and execution history
- `/launch` remains package-selection and run-preflight workflow
- `/workers` remains operational posture and incident visibility

Benchmark intake and curation review, if they later become math-surface features, should live in a separate route family rather than mutating the execution cluster into a benchmark CMS.

## Recommended later route boundary

If the math surface later gains this workflow, the route family should be separate from execution routes.

Recommended shape:

- `/review/benchmark-candidates`
- `/review/benchmark-candidates/:candidateId`

That keeps benchmark curation aligned with privileged review work instead of confusing it with ordinary collaborator run operations.

A collaborator-visible submission entry may later exist, but it should still create or point at a structured candidate object reviewed under the privileged review route family.

## Explicit non-goals for the next slice

The next slice should not attempt:

- raw browser package editing
- theorem submission directly from a public form
- benchmark authoring under `/runs`, `/launch`, or `/workers`
- replacing repository PR review with browser-only workflow state

## Follow-up execution slices

Execution work after this scope should split into:

1. define the canonical `benchmark_candidate`, `curation_review`, `release_decision`, and `publication_status` contracts
2. add the chosen math review/read-model routes on a separate benchmark-candidates review route family if the project wants structured in-product review next
3. add audit coverage for candidate creation, review decisions, hold-out state, and publication changes
4. align public benchmark release reporting so only approved and publicly reportable candidates appear on the apex site
5. keep benchmark package authoring, theorem changes, and gold-proof updates repository-owned until a separate scope explicitly changes that rule
