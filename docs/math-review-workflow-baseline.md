# Math Review Workflow Baseline

This document defines the accepted peer-review, editor-review, and release-decision workflow for `math.paretoproof.com` so later API, UI, audit, and release-link work all build on one durable review machine instead of ad hoc comment threads or route-local state.

## Current baseline

- `docs/math-surface-activation-baseline.md` accepts `math.paretoproof.com` as the authenticated surface for question, submission, review, and question-centric launch workflow.
- `docs/math-data-model-baseline.md` already defines `math_review_record` as the durable top-level review object, but intentionally leaves rounds, checklists, assignments, line comments, and escalation rules to this document.
- Local `main` already has placeholder math routes such as `/reviews` on the math host, but it still does not have first-class math review tables, `/math/*` review APIs, math review audit events, or review UI beyond the placeholder shell.
- `docs/portal-review-moderator-baseline.md` applies only to portal account-review operations and does not decide math review authority.
- `#884` owns Lean submission kinds, automation checks, and further-review gates. This document decides how human review consumes those automation signals.
- `#890` owns repo-sync, package-freeze, benchmark-version, and publication workflow. This document decides when math review may hand work to that downstream flow.

The next step is therefore not to build a generic review engine. It is to define one explicit math review workflow that later tables, APIs, and queues can implement directly.

## Decision

ParetoProof should use one math review workflow with:

- triage as a lightweight routing and readiness step
- peer review as the first substantive review of submitted work
- editor review as the benchmark-policy, quality, and package-readiness review layer
- release decision as the package-candidate readiness and holdout or publish-readiness layer

The workflow should be built around:

- one durable `math_review_record` per review subject and review kind
- immutable review rounds under that record
- structured assignments, checklist state, comments, escalation events, and final decisions
- server-enforced reviewer-independence and authority rules

The workflow must remain separate from publication itself.

Review may decide:

- route to the next substantive review layer
- incomplete posture
- withdrawn posture
- invalid posture
- changes requested
- rejection
- escalation
- hold for policy
- internal-only approval
- holdout posture
- deferred posture
- publish-ready posture

Review must not directly:

- publish a benchmark release
- mutate the repository as the canonical launchable package source
- replace explicit package-freeze or release approval work from later scopes

## Workflow layers

### 1. Triage

Triage is queue and readiness management, not a substitute for substantive review.

Triage is allowed to:

- verify that the review subject is the correct object
- verify that required artifacts and metadata are present
- verify that the latest automation evidence for the subject is attached and current
- route the subject into the correct substantive review queue
- mark the item incomplete, withdrawn, or invalid when it is not yet reviewable
- escalate unusual policy or conflict cases to editor or admin handling

Triage is not allowed to:

- grant final substantive approval of mathematical correctness
- grant final publish-ready posture
- silently waive reviewer-independence rules

Triage outcomes are:

- `routed_to_peer_review`
- `routed_to_editor_review`
- `routed_to_release_decision`
- `incomplete`
- `withdrawn`
- `invalid`
- `escalated`

Triage outcome semantics are:

- `routed_to_peer_review` means a `math_submission` is reviewable and should enter the peer-review queue; triage must not use this outcome for `math_question_revision` or `math_package_candidate`
- `routed_to_editor_review` means a `math_question_revision` is reviewable and should enter the editor-review queue; triage must not use this outcome to skip a `math_submission` past peer review or to route a `math_package_candidate`
- `routed_to_release_decision` means a `math_package_candidate` is reviewable and should enter the release-decision queue; triage must not use this outcome for a `math_submission` or `math_question_revision`
- `incomplete` means required artifacts, metadata, or evidence are still missing
- `withdrawn` means the submitter or responsible actor explicitly pulled the subject from the current review flow
- `invalid` means the subject is not a valid review target for the current workflow and should not proceed without creating or selecting the correct durable object
- `escalated` means triage is explicitly handing the item upward because policy, conflict, or ambiguity requires higher-authority handling before normal progression

Triage should not use free-form route notes as a substitute for one of these outcomes. Every triage close or handoff action must record one canonical triage outcome.

The accepted first-slice subject-to-stage mapping is:

- `math_submission` triage may route only to peer review, or close as `incomplete`, `withdrawn`, `invalid`, or `escalated`
- `math_question_revision` triage may route only to editor review, or close as `incomplete`, `withdrawn`, `invalid`, or `escalated`
- `math_package_candidate` triage may route only to release decision, or close as `incomplete`, `withdrawn`, `invalid`, or `escalated`

### 2. Peer review

Peer review is the first substantive review layer for `math_submission`.

Peer review evaluates:

- mathematical or formal correctness
- submission quality relative to the targeted question revision
- whether reviewer-visible automation evidence supports or contradicts the submission
- whether the submission is ready for editor review

Peer review outcomes are:

- `approved_for_editor_review`
- `changes_requested`
- `rejected`
- `escalated`
- `withdrawn`
- `invalid`
- `superseded`

### 3. Editor review

Editor review is the benchmark-policy and benchmark-quality layer.

Editor review normally evaluates a `math_submission` in the context of the exact `math_question_revision` it targeted. It may also evaluate a `math_question_revision` directly when the product needs editorial approval of the question definition itself before or apart from a particular submission.

Editor review evaluates:

- benchmark fit and scope
- statement and metadata quality
- duplication or conflict with existing benchmark material
- whether the work is fit to produce or update a package candidate
- whether policy or governance concerns require hold, escalation, or rejection

Editor review outcomes are:

- `approved_for_release_decision`
- `changes_requested`
- `rejected`
- `hold_for_policy`
- `escalated`
- `withdrawn`
- `invalid`
- `superseded`

`approved_for_release_decision` is not just a label on the editor round. It must also bind the workflow to exactly one downstream `math_package_candidate` before release decision can start. The handoff may:

- create a new package candidate
- select an existing package candidate to continue
- reopen the correct existing package candidate

Whichever path is used, the editor-closing event must record the target `math_package_candidate` id so the release-decision queue is never left pointing at an undefined downstream object.

### 4. Release decision

Release decision is the final review layer before downstream repo-sync, freeze, and publication workflow. It applies to `math_package_candidate`, not directly to a raw submission.

Release decision evaluates:

- package-candidate readiness
- provenance completeness
- holdout posture
- whether the work is suitable for internal-only use, later release work, or neither

Release decision outcomes are:

- `approved_internal_only`
- `holdout`
- `deferred`
- `publish_ready`
- `rejected`
- `withdrawn`
- `invalid`
- `superseded`

`publish_ready` means the package candidate is approved to enter downstream repo-sync, freeze, version, and publication workflow. It is the workflow's canonical publish-facing outcome, but it still does not mean already published.

## Administrative close outcomes

The workflow also allows canonical administrative close outcomes when a subject should stop progressing without being interpreted as a substantive acceptance-or-rejection judgment.

These administrative close outcomes may be used from peer review, editor review, or release decision, and later implementation may also expose them in triage where needed:

- `withdrawn` means the submitter or responsible owner explicitly pulled the current immutable subject out of the workflow after the round had already entered a substantive stage
- `invalid` means the subject should not continue because it is no longer a valid review target for the current workflow, even though that fact was discovered after handoff from triage
- `superseded` means a newer immutable successor subject has replaced the current one; the closing event should record the successor reference instead of overloading `rejected`

## Reviewable subjects

The accepted v1 subject mapping is:

- `math_submission`
  - triage
  - peer review
  - editor review
- `math_question_revision`
  - triage
  - editor review when direct editorial approval of the question definition is required
- `math_package_candidate`
  - triage
  - release decision

The following are explicitly not direct review subjects in v1:

- `math_question`
- `math_release_link`
- loose artifact ids without a durable workflow object

That keeps review attached to immutable, reviewable objects instead of drifting across free-form threads.

## Review record and round model

The workflow should use:

- one `math_review_record` per subject and review kind
- one active open round at a time for that record
- immutable historical rounds once a round is closed or superseded

In this baseline, `triage` is itself a review kind with its own record, queue, assignments, rounds, and close outcome. It is not implicit pre-state on the later substantive review record.

That means the normal v1 records are:

- `math_submission`: triage, peer review, editor review
- `math_question_revision`: triage, editor review
- `math_package_candidate`: triage, release decision

Each round may accumulate:

- assignments
- checklist state
- comments and line-anchored annotations
- structured escalation notes
- a final round decision

Assignment is not optional workflow metadata in v1. It is the explicit record of who currently owns the round and who is allowed to close it.

Use a new round when:

- the same immutable review subject needs a new substantive review attempt after an earlier attempt already produced comments, escalation state, or a closing decision
- the same immutable subject needs a continued review attempt after escalation that should remain audibly separate from the earlier attempt
- the system needs to preserve multiple review attempts on the same subject without overwriting history

Do not use a new round to hide a changed subject.

If the underlying subject changes materially, create a new review record on the new subject instead.

## Assignment rules

The accepted first-slice assignment policy is:

- triage may begin in an unassigned queue
- once a triager starts active triage work, that round must record a triage assignee of record
- peer review requires exactly one active primary peer-review assignee before an approval, rejection, changes-requested, or escalation decision may be recorded
- editor review requires exactly one active primary editor assignee before an approval, rejection, hold-for-policy, changes-requested, or escalation decision may be recorded
- release decision requires exactly one active primary release-decider assignee before an internal-only, holdout, deferred, publish-ready, or rejection decision may be recorded
- a round may also record optional secondary or observing assignees, but only one active primary assignee exists per review kind at a time

Assignment authority in the first slice is:

- triagers may self-assign triage work from the unassigned triage queue
- editors and admins may assign or reassign triage work
- editors and admins may assign or reassign peer reviewers
- admins may assign or reassign editor-review work
- admins may assign or reassign release-decision work
- no actor may assign or reassign a reviewer in a way that violates the reviewer-independence rules in this baseline

Decision authority in the first slice is:

- only the active primary assignee for the current round may record the ordinary round-closing decision
- a secondary or observing assignee may comment, annotate, and complete checklist items when granted that permission by later implementation, but may not close the round as the final decision actor
- admin override may close a round without being the ordinary primary assignee, but the event must be recorded as an override

Reassignment rules are:

- reassignment must preserve prior assignment history as immutable audit data
- reassignment closes the prior active assignment and creates a new active assignment entry; it does not overwrite the previous assignee in place
- reassignment within an in-progress round does not create a new round by itself; ordinary staffing turnover stays in the current round unless the workflow intentionally opens a separate review attempt
- when the workflow wants reassignment to mark a fresh substantive attempt on the same immutable subject, it must open a new round instead of silently continuing the old one
- abandonment, recusals, and conflict removals must be represented as explicit assignment-state changes rather than silent disappearance from the record

## Authority model

The first slice should avoid a broad RBAC redesign.

Current platform access still uses the existing approved-user ladder such as helper, collaborator, and admin. Math review authority should layer on top of that approved-user baseline through math-review-specific capabilities or scoped grants.

The workflow actors are logical workflow roles:

- submitter
- question-revision author
- triager
- peer reviewer
- editor
- release decider
- admin override actor

Recommended first-slice authority:

- triage, peer review, and editor review may be granted to trusted approved contributors through math-review-specific capability grants
- release decision remains admin-only in the first real slice unless a later scope justifies a narrower delegated release authority safely
- admin override is allowed for safety and recovery, but must remain explicit and auditable

The system should not introduce a new platform-wide reviewer rank unless later workflow pressure proves it is necessary.

## Reviewer independence and conflict rules

The backend must enforce the following minimum rules:

- the submitter may not peer-review, editor-review, or release-decide their own submission
- the author of a directly reviewed `math_question_revision` may not be the sole approving editor for that revision
- a peer reviewer may not be the sole release decider for the downstream package candidate derived from the same work
- the author of a directly reviewed `math_question_revision` may not be the sole release decider for the downstream `math_package_candidate` derived from that revision
- escalation must move authority upward to editor or admin handling rather than sideways to another peer as a silent substitute for policy review
- admin override actions must be recorded as overrides rather than disguised as ordinary peer or editor actions

These are minimum rules. Later scopes may add stricter separation if the project requires multi-party approval.

## Checklist families

The workflow should use a small fixed set of checklist families in v1:

### `triage_readiness`

Confirms:

- the review subject is the correct durable object
- required artifacts and metadata are attached
- the targeted question revision is explicit
- the latest automation evidence is present and current
- the subject is not obviously withdrawn, invalid, or superseded

### `peer_correctness`

Confirms:

- the submission addresses the targeted question revision
- mathematical or formal reasoning is sound enough for peer approval
- reviewer-visible automation evidence does not contradict the claimed result
- unresolved correctness blockers are either fixed, rejected, or escalated

### `editor_policy_and_quality`

Confirms:

- benchmark fit and question quality
- metadata quality and statement clarity
- duplication, overlap, and governance concerns
- whether the submission is suitable to produce or update a package candidate

### `release_readiness`

Confirms:

- package-candidate provenance and traceability
- holdout posture
- internal-only versus publish-ready posture
- readiness for downstream repo-sync and freeze workflow

Checklist families should be versionable so later wording or required items can evolve without mutating old review history.

## Automation evidence and further-review gates

`#884` owns which automation checks and gates exist. This document decides how human review consumes them.

The accepted rule is:

- automation outputs are durable evidence inputs, not final authority
- required unsatisfied gates block advancement into the next human review stage
- satisfied gates may complete checklist items automatically or semi-automatically
- advisory failures remain visible to reviewers without forcing automatic rejection
- stale automation for an older submission or superseded subject never counts as current evidence

In practice:

- if `#884` marks a gate as required for a submission kind, triage should not route the item forward until that gate is satisfied or explicitly escalated
- peer and editor reviewers may rely on satisfied gates as evidence, but they still own the human decision
- release decision may use the accumulated gate posture as readiness evidence, but it may not treat automation alone as publication approval

## Comment and annotation model

Comment threads belong to a review round.

Each comment may anchor to one of:

- an artifact role plus file path and line range
- a named subject field such as statement text, theorem identifier, or metadata field
- a specific checklist item

The workflow should support line-anchored review for Lean or related files, but it should not require a generalized diff engine before the first review UI can ship.

Structured decision fields must remain first-class. Comments are supporting evidence and discussion, not the source of truth for final review state.

## Resubmission and supersession rules

`math_question_revision` and `math_submission` are durable review subjects. When the underlying reviewed work changes materially, the system should create a new subject row rather than mutate the old subject in place.

That means:

- changed submission work should create a new `math_submission`, typically linked through `parentSubmissionId`
- changed question definition should create a new `math_question_revision`
- the new subject receives a new review record for the relevant review kind
- the prior review record stays immutable and is marked superseded, closed, rejected, or completed according to the workflow outcome already reached

For v1, use additional rounds on the same review record only when the immutable subject itself did not change.

## Outcome semantics and downstream handoff

The workflow should use the following outcome meanings.

### `changes_requested`

The current review subject is not accepted as submitted. The author or submitter must create a new revision or new submission if they want to respond materially.

### `rejected`

The subject is not accepted for progression through the current workflow. Rejection does not delete history.

### `approved_for_editor_review`

Peer review is complete and the submission may move into editor review.

### `approved_for_release_decision`

Editor review is complete and the work may produce or advance a package candidate for release decision.

### `hold_for_policy`

The work is not rejected on substance alone, but it may not advance until a policy, governance, benchmark-scope, or editorial concern is resolved.

### `escalated`

The current reviewer is explicitly handing the item to a higher-authority or better-scoped review layer without granting approval by implication.

### `approved_internal_only`

The work is accepted for internal use or internal experimentation but is not yet eligible for public release workflow.

### `holdout`

The work is intentionally withheld from public release or reporting even if it is otherwise valid benchmark material.

### `deferred`

The work is not rejected, but it is not ready for release progression yet because more prerequisites, policy decisions, or package work are required.

### `publish_ready`

The package candidate may enter downstream repo-sync, freeze, version, and publication workflow.

This is the workflow's canonical publish-facing outcome, but publication itself still happens only in the later release workflow from `#890`.

None of these outcomes directly publish a benchmark release.

## Audit requirements

The workflow must add explicit math-review audit coverage for:

- review record opened
- round opened
- assignment created or changed
- comment added
- checklist state changed
- escalation recorded
- decision recorded
- review record superseded or closed
- admin override applied

Each auditable event should retain:

- actor user id
- review subject type and subject id
- review kind
- review record id
- review round id when applicable
- decision or state change payload
- resulting posture

The repo's current audit catalog does not yet include math-review subject kinds or events. Follow-on implementation must add them explicitly rather than smuggling math review into unrelated audit vocabularies.

## What stays out of scope in v1

This baseline does not approve:

- a generic workflow engine
- a user-defined checklist builder
- notification or inbox orchestration
- reviewer load balancing or staffing analytics
- batch assignment or bulk decision tooling
- direct repository mutation from review routes
- package freeze creation from review routes
- release publication from review routes
- portal account-admin review reuse on the math surface

Those may be revisited later if there is concrete workflow pressure, but they are not required to ship the first real math review workflow.

## Follow-up execution work

This baseline should drive the later implementation slices under the existing math roadmap:

1. add the new baseline to `docs/README.md`
2. add shared math review vocabulary, route entries, and audit event catalogs
3. add math review tables for records, rounds, assignments, checklist state, and comments
4. add `/math/reviews*` API handlers with reviewer-independence and authority enforcement
5. generalize cached authenticated-browser session reuse and trusted-origin enforcement from portal-only to the math surface
6. add math review queues and review detail UI on `math.paretoproof.com`
7. hand `publish_ready`, `holdout`, and `approved_internal_only` outcomes to the downstream repo-sync and release workflow without coupling review directly to publication
