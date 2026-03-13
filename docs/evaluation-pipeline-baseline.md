# Evaluation Pipeline Integration Baseline

This document defines the MVP evaluation-pipeline integration baseline for ParetoProof. It fixes how the backend ingests run outputs, determines pass or fail, classifies terminal failures, and computes the first stable metric set for the offline `firstproof/Problem9` slice.

The goal is to make result derivation explicit. The control plane should not infer benchmark outcomes from raw provider text, worker-local conventions, or UI assumptions when the run bundle already contains authoritative verifier and failure artifacts.

## Scope of the baseline

This baseline owns:

- the authoritative evaluation signals the backend must trust
- the order in which a run bundle is validated and turned into a result record
- the required failure and verdict classes the backend must preserve
- the first metric set for MVP result summaries and comparisons
- the distinction between attempt-level facts and run-level aggregates

This baseline does not own:

- the worker message transport schema from issue `#147`
- the exact budget ceilings from issue `#145`
- the public result-page UX or chart design
- implementation details of database tables or job workers

## Core principles

The MVP evaluation pipeline follows seven hard rules:

- the authoritative pass or fail signal comes from verifier and failure artifacts, not from provider self-report
- evaluation consumes the canonical run-bundle contract, whether the source is a live worker or an offline ingest
- one attempt produces one terminal result record, even when the run later aggregates multiple attempts or jobs
- failure classification must preserve the canonical failure code and family rather than collapsing to one generic error bucket
- evaluation metrics must be reproducibility-aware and compare only like-for-like configurations by default
- aggregate run status is derived from terminal job or attempt results, not from append-only event logs alone
- missing required verdict or reproducibility artifacts is itself an evaluation failure, not a silently partial success

## Authoritative input artifacts

The evaluation pipeline must treat these artifacts as the minimum authoritative input set:

- `run-bundle.json`
- `artifact-manifest.json`
- `package/package-ref.json`
- `prompt/prompt-package.json`
- `candidate/Candidate.lean`
- `verification/verdict.json`
- `verification/verifier-output.json`
- `verification/compiler-diagnostics.json`
- `verification/compiler-output.txt`
- `environment/environment.json`

Optional artifacts such as transcripts, event logs, and usage summaries may enrich analysis, but they are not the primary pass/fail authority.

## Authoritative signals

The backend should trust these signals in descending order of authority.

### 1. Bundle integrity and identity

Before any benchmark evaluation is accepted, the backend must validate:

- required files exist
- required digests match
- the run bundle schema version is supported
- the reproducibility tuple is structurally complete

If this stage fails, the run does not reach benchmark evaluation. It fails as an ingest or input-contract problem.

### 2. Terminal attempt result

`verification/verdict.json` is the authoritative terminal benchmark verdict for one attempt.

At minimum the backend must trust:

- `result`
  - `pass` or `fail`
- `failureCode` when `result=fail`
- `semanticEquality`
- `surfaceEquality`
- `surface_drift`
- `containsSorry`
- `containsAdmit`
- `axiomCheck`
- `diagnosticGate`
- `candidateDigest`
- `benchmarkPackageDigest`
- `laneId`

If `verdict.json` contradicts other artifacts, the pipeline should reject the result as inconsistent rather than guessing which file is right.

### 3. Structured verifier findings

`verification/verifier-output.json` is the authoritative detail source for:

- theorem-target mismatch details
- forbidden-placeholder findings
- axiom inventory and allowlist decision
- diagnostic-policy findings
- environment-stability findings

This file explains why the verdict failed or passed. It should never outrank `verdict.json` on the terminal boolean outcome, but it is the canonical explanation layer behind that outcome.

### 4. Failure registration record

When the attempt failed, the canonical failure registration derived from the bundle must preserve:

- `failureCode`
- `failureFamily`
- `phase`
- `terminality`
- `retryEligibility`
- `userVisibility`

These fields should align with `problem9-failure-registration-baseline.md`. The backend must store them directly rather than recomputing weaker generic error buckets later.

### 5. Reproducibility identity

`environment/environment.json`, `run-bundle.json`, and `package/package-ref.json` together provide the reproducibility tuple that determines whether two results are meaningfully comparable.

The evaluation pipeline must preserve:

- benchmark package identity and digest
- lane id
- prompt package digest
- provider family
- auth mode
- model config id
- model snapshot id when present
- environment digest
- run config digest

## Evaluation pipeline stages

The MVP should evaluate every imported or worker-submitted result in one fixed stage order.

### Stage 1: Intake validation

The backend accepts either:

- a live worker terminal result plus artifact references, or
- an offline bundle ingest request

In both cases it must first validate:

- required artifact presence
- manifest and digest consistency
- schema version compatibility
- run/job/attempt identity consistency

This stage produces:

- `intake_status = accepted` or `rejected`

Rejected intake must still emit an `invalid_result` attempt record when the bundle can be tied to a concrete run, job, or attempt identity. Only pre-attempt transport failures that never establish a benchmark identity may remain intake-only rejections outside benchmark metrics.

### Stage 2: Attempt normalization

The backend normalizes one attempt result record from the accepted bundle:

- benchmark identity
- reproducibility tuple
- terminal attempt outcome
- canonical failure registration when applicable
- candidate and verdict digests

This stage is where the live worker path and offline ingest path converge. From here on, the evaluation logic should not care whether the result came from a Modal worker or a local imported bundle.

### Stage 3: Benchmark verdict derivation

The backend derives the benchmark verdict using this logic:

1. reject the attempt if the bundle is structurally invalid
2. if `verification/verdict.json` says `pass`, record a passing attempt only when required verifier artifacts and reproducibility fields are present and consistent
3. if `verification/verdict.json` says `fail`, record a failing attempt with the canonical `failureCode`
4. if required verdict fields are missing or contradictory, record an ingest or evaluation failure rather than silently promoting the result

When step 1 rejects a structurally invalid bundle that is already attached to an attempt identity, the backend must emit `verdictClass=invalid_result` with an `input_contract` or `evaluation_contract` failure family instead of dropping the case from attempt metrics.

This means benchmark success requires both:

- an explicit passing verifier verdict
- a structurally valid evaluation bundle

### Stage 4: Run-level aggregation

The backend then derives the run-level aggregate from its terminal jobs or attempts.

The MVP run aggregate should preserve:

- overall terminal status
- attempt count
- pass count
- fail count
- primary failure-family summary when all attempts fail
- reproducibility grouping keys

For single-attempt offline Problem 9 runs, the run aggregate and attempt verdict are usually identical. The distinction still matters because repeated probes and future benchmark slices will aggregate multiple attempts or jobs.

## Required error and verdict classes

The evaluation pipeline must preserve both benchmark verdict class and failure class.

### Verdict classes

The MVP verdict classes are:

- `pass`
- `fail`
- `invalid_result`

Interpretation:

- `pass`
  - the attempt satisfied the verifier policy and the bundle is structurally valid
- `fail`
  - the attempt reached a valid terminal benchmark failure with a canonical failure code
- `invalid_result`
  - the backend could not trust the submitted result bundle enough to treat it as a benchmark pass or benchmark fail

`invalid_result` is critical. It prevents malformed ingests or contradictory artifacts from polluting benchmark metrics as though they were legitimate mathematical failures.

### Required failure classes

When `verdictClass=fail` or `verdictClass=invalid_result`, the backend must preserve one of these families:

- `provider`
- `harness`
- `tooling`
- `budget`
- `compile`
- `verification`
- `input_contract`
- `evaluation_contract`

The first seven come from the canonical Problem 9 failure-registration baseline.

The extra family `evaluation_contract` is for backend-side result invalidation such as:

- missing required verdict fields
- contradictory digests
- inconsistent run/job/attempt identifiers
- unsupported bundle schema version

This family is not a benchmark-kernel math failure. It is a control-plane rejection of an untrustworthy result package.

### Required benchmark failure codes

The backend must persist the canonical `failureCode` values already defined by the Problem 9 failure baseline when a real benchmark failure exists.

For `evaluation_contract` failures, the minimum backend-side codes are:

- `bundle_schema_unsupported`
- `required_artifact_missing`
- `digest_mismatch`
- `verdict_inconsistent`
- `identity_inconsistent`
- `reproducibility_fields_missing`

These codes should be treated as invalid results, not as benchmark proof failures.

## Pass or fail derivation rules

The backend should use these explicit rules.

### Passing attempt

Record `verdictClass=pass` only when all of these are true:

- bundle integrity checks pass
- `verification/verdict.json` exists and says `result=pass`
- `semanticEquality=true`
- `containsSorry=false`
- `containsAdmit=false`
- the axiom policy is acceptable for the selected lane
- required reproducibility fields are present and internally consistent

`surface_drift=true` may still be present on a pass if semantic equality succeeded.

### Failing benchmark attempt

Record `verdictClass=fail` when:

- bundle integrity checks pass well enough to trust the attempt record
- `verification/verdict.json` says `result=fail`
- a canonical `failureCode` or verifier-grounded failure reason is present

This is the normal benchmark failure path.

### Invalid result

Record `verdictClass=invalid_result` when:

- required evaluation artifacts are missing
- required digests do not match
- verdict fields contradict structured verifier findings in a way the backend cannot safely resolve
- reproducibility identity is materially incomplete
- run/job/attempt identity is inconsistent

The pipeline must not silently coerce these cases into `fail`, because that would distort benchmark metrics.

## First metric set

The MVP metric set should stay small and defensible.

### Attempt-level metrics

For the offline Problem 9 slice, the backend should compute:

- `attempt_total`
- `attempt_pass_total`
- `attempt_fail_total`
- `attempt_invalid_total`
- `pass_rate`
  - `attempt_pass_total / attempt_total`
- `semantic_pass_rate`
  - proportion of attempts with `semanticEquality=true`
- `surface_drift_rate`
  - proportion of valid attempts with `surface_drift=true`

### Failure metrics

The backend should compute:

- `failure_family_counts`
- `failure_code_counts`
- `compile_failure_rate`
- `verification_failure_rate`
- `budget_exhaustion_rate`
- `provider_failure_rate`
- `invalid_result_rate`

These metrics are the minimum useful cut for understanding where the system fails without yet building an elaborate leaderboard.

### Reproducibility-aware slice metrics

By default, metric aggregation should be grouped at least by:

- `benchmarkPackageVersion`
- `laneId`
- `promptPackageDigest`
- `providerFamily`
- `authMode`
- `modelConfigId`
- `modelSnapshotId` when available
- `environmentDigest`
- `runConfigDigest`

This keeps unlike configurations from being merged into one apparent score.

### Run-level metrics

For run summaries, the backend should compute:

- `run_total`
- `run_succeeded_total`
- `run_failed_total`
- `run_cancelled_total`
- `average_attempts_per_run`
- `average_failures_per_run`

These are operational summaries, not substitutes for benchmark comparison metrics.

## Comparison policy

The backend should compare runs as like-for-like only when the reproducibility-critical keys match.

The strict MVP comparison boundary is:

- same benchmark package version and digest
- same lane id
- same prompt package digest
- same provider family
- same auth mode
- same model config id
- same model snapshot identity when available
- same environment digest
- same run config digest

If those differ, the results may still be displayed together, but they must be labeled as different configurations rather than pooled into one benchmark score.

## Relationship to worker and portal flows

This baseline depends on but does not replace the internal contract split:

- the portal creates or views runs
- workers or offline ingest provide terminal attempt artifacts
- the evaluation pipeline derives trusted benchmark records from those artifacts

That means:

- the portal should read evaluated summaries rather than reconstructing verdicts client-side
- worker contracts should submit enough artifact references and terminal metadata for this pipeline to operate without hidden side channels
- offline ingest should land in the same evaluation pipeline after intake normalization

## Downstream implications

This baseline constrains later work:

### Issue `#147`

Worker-control contracts should include the terminal metadata and artifact references needed for evaluation intake, but they should not redefine verdict semantics.

### Result views and dashboards

Frontend reporting work should consume the verdict class, failure family, failure code, and metric summaries defined here instead of inventing parallel status buckets.

### Data model implementation

Backend table design should preserve:

- raw terminal attempt facts
- normalized evaluation result records
- reproducibility grouping keys
- precomputed summary metrics only as derived convenience data

## Out of scope

- ranking or leaderboard policy
- benchmark-publication policy across heterogeneous configurations
- UI chart specifications
- queue-worker implementation details
