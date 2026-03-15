# Math Data Model Baseline

This document defines the canonical object model for `math.paretoproof.com` so later API, UI, review, launch, and release work all build on one durable set of product objects instead of route-local records.

## Current baseline

- `docs/math-surface-activation-baseline.md` accepts `math.paretoproof.com` as the authenticated math workflow surface.
- `docs/benchmark-product-objects-baseline.md` already defines `benchmark_version`, `benchmark_release`, and adjacent product-layer objects above the run kernel.
- The repo already has durable auth, user, run, job, attempt, and artifact kernel objects.
- The repo does not yet have first-class math question, submission, or review entities.

The next scope step is therefore not a new execution kernel. It is a product-layer data model that sits above the existing auth, artifact, and run foundations.

## Decision

The math workflow should use a small set of persistent first-class objects:

1. `math_question`
2. `math_question_revision`
3. `math_submission`
4. `math_artifact_ref`
5. `math_review_record`
6. `math_package_candidate`
7. `math_release_link`

These objects do not replace:

- `users`, `user_identities`, or role grants
- `artifacts`
- `runs`, `jobs`, or `attempts`
- `benchmark_version` or `benchmark_release`

They organize how authenticated math workflow maps onto those existing kernels.

## Object model

### 1. `math_question`

Purpose:

- stable product identity for one mathematical task inside the math workspace
- durable anchor above mutable draft text, submitted revisions, and later release linkage

Canonical fields:

- `mathQuestionId`
- stable slug or canonical route key
- question family or lane
- current posture
- owner or originating user id
- current head revision id
- current accepted revision id, nullable
- latest active package-candidate id, nullable
- latest linked benchmark-version id, nullable
- created and updated timestamps

Why it exists:

- URLs, launches, reviews, and submissions need a stable question identity even as the text and formal material evolve
- the system should not treat one changed statement blob as an entirely new product object by default

### 2. `math_question_revision`

Purpose:

- immutable snapshot of the question definition under review at one point in time
- separates stable question identity from the specific statement or metadata revision a submission targeted

Canonical fields:

- `mathQuestionRevisionId`
- `mathQuestionId`
- monotonic revision number
- revision author user id
- revision posture
- human statement payload or reference
- formal statement metadata or reference, nullable
- provenance metadata
- benchmark metadata needed for review
- supersedes revision id, nullable
- created timestamp

Rules:

- once a revision becomes reviewable or submission-addressable, it should be treated as immutable
- later edits create a new revision row rather than mutating the previously reviewed revision in place

Why it exists:

- submissions and review decisions must point at the exact question definition they evaluated
- release linkage should not become ambiguous when the question evolves after review

### 3. `math_submission`

Purpose:

- durable record of one submitted mathematical answer, proof, formalization, repair, or related workflow artifact targeting a specific question revision

Canonical fields:

- `mathSubmissionId`
- `mathQuestionId`
- `mathQuestionRevisionId`
- submitting user id
- submission kind
- submission posture
- parent submission id, nullable
- primary artifact ref id, nullable
- automation summary posture
- latest review record id, nullable
- latest package-candidate id, nullable
- created and updated timestamps

Rules:

- every submission must target one exact `math_question_revision`
- a resubmission or amended submission should link back to its parent submission when it is materially the same work being revised
- submission kind exists at the data-model layer, but the detailed Lean submission taxonomy belongs to `docs/math-lean-submission-baseline.md`

Why it exists:

- reviewers need one durable unit of submitted work
- automation, review, and release linkage should attach to a submission object instead of drifting across free-form comments and artifact ids

### 4. `math_artifact_ref`

Purpose:

- subject-owned metadata row that connects math questions or submissions to existing artifact storage without duplicating the artifact kernel

Canonical fields:

- `mathArtifactRefId`
- subject type: `question_revision` or `submission`
- subject id
- artifact role
- backing type such as uploaded artifact, generated artifact, or repo-linked reference
- linked `artifactId`, nullable when the source is repository-backed and not yet materialized into object storage
- content digest, nullable
- filename or logical path
- media type
- created timestamp

Rules:

- file bytes and object storage lifecycle stay with the existing artifact kernel
- the math model owns only the workflow-facing reference layer and role metadata
- Lean-specific artifact role catalogs belong to the Lean-submission scope, not this document

Why it exists:

- math workflow needs durable file and bundle references without reinventing artifact storage rules
- reviewers and UI surfaces need workflow roles such as "statement source", "submission bundle", or "generated equivalence report" instead of raw artifact ids alone

### 5. `math_review_record`

Purpose:

- durable human-review object for a reviewable math subject
- keeps later workflow and decision state out of ad hoc issue comments or UI-local state

Canonical fields:

- `mathReviewRecordId`
- review subject type: `question_revision`, `submission`, or `package_candidate`
- review subject id
- review kind: peer, editor, release, or other approved family
- review posture
- opened by user id
- assigned reviewer user id, nullable
- final decision actor user id, nullable
- final decision summary, nullable
- escalation required flag
- created and updated timestamps
- closed timestamp, nullable

Rules:

- `math_review_record` is the durable top-level review object
- detailed assignment rounds, checklist families, line comments, and escalation machine rules belong to `docs/math-review-workflow-baseline.md`

Why it exists:

- later workflow needs a persistent review anchor before it can safely define rounds, comments, and decisions
- package-candidate and release review should reuse the same top-level review shape instead of inventing unrelated review tables

### 6. `math_package_candidate`

Purpose:

- bridge object between accepted math workflow output and repository-backed package, freeze, and benchmark-version work

Canonical fields:

- `mathPackageCandidateId`
- source type: `question_revision` or `submission`
- source id
- candidate posture
- owning question id
- proposed package id
- proposed package version, nullable
- repository linkage such as branch, PR, commit, or freeze reference, nullable
- latest review record id, nullable
- linked benchmark-version id, nullable
- created and updated timestamps

Rules:

- a package candidate may exist only for approved or otherwise workflow-authorized math content
- the candidate is the bridge into repo-sync and freeze workflow, not a replacement for the repository package itself
- detailed repo-sync, freeze authority, and publication flow belong to `docs/math-package-freeze-and-release-baseline.md`

Why it exists:

- the math surface needs a durable object for "this reviewed work is now trying to become repository-backed benchmark material"
- release linkage should point at a package candidate or later benchmark version, not at loose submission ids

### 7. `math_release_link`

Purpose:

- durable linkage row between math workflow objects and the product-layer benchmark version or release objects that already exist elsewhere

Canonical fields:

- `mathReleaseLinkId`
- `mathQuestionId`
- source package-candidate id
- linked `benchmarkVersionId`, nullable
- linked `benchmarkReleaseId`, nullable
- link posture
- created by user id
- created timestamp

Rules:

- `math_release_link` does not replace `benchmark_version` or `benchmark_release`
- it records how a math question's approved workflow output became part of those downstream product objects
- detailed publication approval remains part of the release workflow scopes, not this document

Why it exists:

- math workflow needs traceable lineage from reviewed question work into released benchmark objects
- public release pages and later reporting should not need to reconstruct this bridge from comments, PR text, or artifact names

## Relationship rules

The canonical relationship shape is:

- one `math_question` has many `math_question_revision`
- one `math_question_revision` may have many `math_submission`
- one `math_question_revision` or `math_submission` may have many `math_artifact_ref`
- one reviewable subject may accumulate many `math_review_record` over time
- one approved `math_question_revision` or `math_submission` may produce one or more `math_package_candidate`
- one `math_package_candidate` may later attach to a `math_release_link`
- `math_release_link` points outward to `benchmark_version` and `benchmark_release`

The key lineage rule is that math workflow objects point outward to the existing benchmark and execution kernels. They should not duplicate those kernels locally.

## Reuse of existing kernels

### Auth and actor identity

Math workflow should reuse the existing auth and user foundations:

- `users`
- `user_identities`
- role grants and access posture

Math objects should store user ids or identity-derived actor references rather than inventing a second account system.

### Artifacts

The existing artifact kernel remains authoritative for:

- object storage identity
- transfer, quarantine, and retention lifecycle
- checksums and byte-level metadata

The math model stores workflow-facing references through `math_artifact_ref`.

### Runs and launches

The existing run kernel remains authoritative for:

- `runId`
- job and attempt lineage
- execution evidence
- worker lifecycle

Question-centric launches should later link math objects to runs, but that linkage belongs to the launch/bootstrap scope rather than this document.

### Benchmark versions and releases

The existing benchmark product layer remains authoritative for:

- `benchmark_version`
- `benchmark_release`

Math workflow should link into those objects through `math_package_candidate` and `math_release_link` instead of redefining them.

## Minimum posture fields

This document does not lock the full workflow state machines. That belongs to later review, Lean-submission, and release scopes.

It does lock the need for each object to carry durable posture fields at the right layer:

- `math_question`: draft, active, superseded, withdrawn, or equivalent question-level posture
- `math_question_revision`: draft, reviewable, accepted, rejected, superseded, or equivalent revision-level posture
- `math_submission`: draft, submitted, automation-complete, human-review-required, accepted, rejected, withdrawn, or equivalent submission-level posture
- `math_review_record`: open, decided, superseded, or equivalent review posture
- `math_package_candidate`: proposed, repo-synced, frozen, version-linked, release-linked, rejected, or equivalent bridge posture
- `math_release_link`: planned, version-linked, release-linked, published, withdrawn, or equivalent publication-link posture

Later scopes may refine these values, but they should not remove the posture split across those object layers.

## Explicit out-of-scope decisions

This scope does not:

- define the detailed Lean submission-kind catalog
- define review assignments, rounds, checklists, or line comments in detail
- define runner bootstrap sessions or question-to-run launch objects
- define repo-sync automation, freeze authority, or release publication workflow in detail
- implement database tables, routes, or UI

## Follow-up execution slices

Execution work after this scope should split into:

1. DB migrations for the approved math objects and their foreign-key relationships
2. backend services and `/math/*` route contracts that expose the approved objects
3. UI surfaces that read and mutate questions, revisions, submissions, and review records
4. follow-on execution for Lean artifacts, review workflow, package-candidate sync, and release linkage once their child scopes land
