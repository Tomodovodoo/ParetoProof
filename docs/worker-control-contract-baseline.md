# Worker Control Contract Baseline

## Why this document exists

Issue `#147` defines the first real worker-control contract. The important constraint is that the control plane must not invent a second result model that drifts away from offline Problem 9 execution.

The authoritative downstream objects already exist elsewhere:

- [problem9-run-bundle-baseline.md](problem9-run-bundle-baseline.md) fixes the offline run-bundle members, artifact roles, and digest boundary
- [problem9-failure-registration-baseline.md](problem9-failure-registration-baseline.md) fixes the canonical failure taxonomy, retryability split, and evidence rules
- [problem9-harness-budget-baseline.md](problem9-harness-budget-baseline.md) fixes the bounded stop conditions that the worker loop must report
- [internal-contracts-api-baseline.md](internal-contracts-api-baseline.md) fixes the run, job, and attempt ownership boundary across the API and worker surfaces

This document therefore defines worker control as a transport and authorization layer around those existing bundle and verifier objects. If a local offline run and a hosted worker run execute the same attempt, they should produce the same final bundle and verdict shape even though only the hosted path uses claim, heartbeat, and job-token routes.

## Endpoint set

The MVP worker-control endpoint set is:

- `internal.worker.claim`
- `internal.worker.heartbeat`
- `internal.worker.event.report`
- `internal.worker.artifact-manifest.submit`
- `internal.worker.result.submit`
- `internal.worker.failure.submit`

These endpoints are enough for one worker to claim an attempt, prove liveness, append bounded execution history, register the artifact manifest, and then finalize either success or terminal failure. They are not a general remote execution protocol and they do not expose raw interactive tool traffic as a first-class control-plane object.

## Control model

Worker control is lease-based and attempt-scoped.

- the control plane owns run, job, and attempt creation
- a worker claims one runnable job and receives one active lease
- the lease authorizes only the active attempt for that job
- terminal success or terminal failure closes the active lease
- event messages are supporting history only; they do not define the final outcome on their own

The canonical terminal record remains the same bundle-aligned success or failure object that offline ingest would later read.

## Claim contract

Claim is the only worker-control route that accepts the long-lived worker bootstrap credential.

The claim request identifies:

- `workerId`, `workerPool`, `workerRuntime`, and `workerVersion`
- current capacity with `activeJobCount` and `maxConcurrentJobs`
- supported run kinds
- supported artifact roles from the run-bundle baseline
- whether the worker can honor the offline bundle contract and trace uploads

The active claim response returns:

- `runId`, `jobId`, `attemptId`, and `leaseId`
- heartbeat cadence with `heartbeatIntervalSeconds`
- server-side expiry with `heartbeatTimeoutSeconds` and `leaseExpiresAt`
- a short-lived `jobToken` plus explicit `jobTokenScopes`
- `runBundleSchemaVersion`
- `requiredArtifactRoles`
- `offlineBundleCompatible=true`
- the run target that points at immutable benchmark and model configuration identity

The claim response must not deliver provider credentials or large mutable benchmark payloads. The worker should receive only enough identity and policy information to materialize the read-only bundle inputs under the separately defined package and prompt-package baselines.

## Job-token boundary

After claim, the bootstrap credential is no longer used for attempt execution. The worker uses the short-lived job token instead.

The first scoped token catalog is:

- `heartbeat`
- `event_append`
- `artifact_manifest_write`
- `verifier_verdict_write`
- `result_finalize`
- `failure_finalize`

The point of explicit scopes is not user-facing OAuth-style delegation. The point is to keep one compromised or stale worker lease from performing unrelated control-plane writes.

## Heartbeat contract

Heartbeats are lease liveness messages, not progress logs.

The heartbeat request carries:

- `attemptId`, `jobId`, and `leaseId`
- `observedAt`
- current `phase`
- `lastEventSequence`
- optional `progressMessage`

The heartbeat response carries:

- `leaseStatus`
- `leaseExpiresAt`
- `acknowledgedEventSequence`
- `cancelRequested`
- optional replacement `jobToken` and `jobTokenExpiresAt`

Heartbeat cadence follows the governance baseline rather than worker preference. The important stale threshold is the current control-plane policy value of `180` seconds from [run-control-governance-baseline.md](run-control-governance-baseline.md). Workers may send more frequently than that, but they must not treat heartbeat as an unbounded log channel.

## Execution phases and event contract

The shared execution phases are:

- `prepare`
- `generate`
- `tool`
- `compile`
- `verify`
- `finalize`
- `cancel`

The event stream is append-only, ordered by a per-attempt `sequence`, and intentionally narrow. It exists to preserve structured history that the API or later UI can index without parsing raw logs.

The canonical event kinds are:

- `attempt_started`
- `compile_started`
- `compile_succeeded`
- `compile_failed`
- `compile_repair_requested`
- `compile_repair_applied`
- `verifier_started`
- `verifier_passed`
- `verifier_failed`
- `verifier_repair_requested`
- `verifier_repair_applied`
- `budget_exhausted`
- `artifact_manifest_written`
- `bundle_finalized`

These events map directly to the bounded Problem 9 agent loop and budget baselines. They are intentionally specific to compile, verifier, repair, and budget milestones because those transitions matter for later reproducibility and failure analysis. They should not become a catch-all substitute for raw logs or full transcripts.

## Artifact manifest contract

Artifact registration follows the run-bundle baseline rather than an ad hoc upload list. The first required logical roles are:

- `run_manifest`
- `package_reference`
- `prompt_package`
- `candidate_source`
- `verdict_record`
- `compiler_output`
- `compiler_diagnostics`
- `verifier_output`
- `environment_snapshot`
- `usage_summary`
- `execution_trace`

The artifact-manifest submission carries:

- `attemptId`, `jobId`, `leaseId`
- `recordedAt`
- `artifactManifestDigest`
- `artifacts[]`

Each artifact entry carries:

- `artifactRole`
- `relativePath`
- `sha256`
- `byteSize`
- `mediaType`
- `contentEncoding`
- `requiredForIngest`

The response returns the accepted manifest digest and the API-owned artifact ids that later terminal submissions reference. Worker-control should reference artifact roles and digests. It should not duplicate file bodies inside control messages.

The signed upload and download flow that sits around those artifact ids now lives in `artifact-signed-transfer-baseline.md`.

## Verifier verdict contract

Hosted workers and offline runs must converge on the same structured verifier verdict.

The shared verifier verdict records:

- attempt identity and benchmark package digest
- candidate digest
- lane id and verdict schema version
- verdict result
- semantic equality and surface equality outcomes
- `containsSorry` and `containsAdmit`
- axiom and diagnostic gates
- optional primary failure classification

The optional primary failure classification preserves the canonical failure taxonomy:

- `failureCode`
- `failureFamily`
- `phase`
- `terminality`
- `retryEligibility`
- `userVisibility`
- summary text
- evidence artifact references

This is the boundary that keeps evaluation intake, user-visible failures, and hosted/offline comparison aligned.

## Success finalize contract

The success route finalizes the attempt with the same digest-oriented object that offline bundle ingest would later understand.

The success payload carries:

- `runId`, `jobId`, `attemptId`, `leaseId`
- `completedAt`
- operator-readable `summary`
- `bundleDigest`
- `artifactManifestDigest`
- `candidateDigest`
- `verdictDigest`
- `environmentDigest`
- accepted `artifactIds`
- structured `verifierVerdict`
- optional `usageSummary`
- `offlineBundleCompatible=true`

The worker must not send a second success object model that conflicts with the run bundle. The control plane records the bundle-linked terminal metadata and then downstream evaluation or export work reads from that normalized state.

## Terminal failure contract

Failure finalization follows the same pattern as success: preserve the canonical failure classification and attach partial bundle references when they already exist.

The terminal failure payload carries:

- `runId`, `jobId`, `attemptId`, `leaseId`
- `failedAt`
- `terminalState`
- summary text
- canonical `failure`
- optional `bundleDigest`
- optional `artifactManifestDigest`
- optional `candidateDigest`
- optional `verdictDigest`
- optional `artifactIds`
- optional `verifierVerdict`

This allows the system to represent important distinctions cleanly:

- no candidate produced at all
- candidate produced but compile failed
- verifier failed after compile succeeded
- cancellation or lease loss after partial artifact generation

That distinction is required for accurate evaluation grouping and later results drilldown.

## Offline ingest boundary

Offline runs do not need claim or heartbeat. They still need the same final bundle, verdict, artifact-role, and failure-classification shape.

That means:

- claim and heartbeat are hosted-execution transport only
- artifact-role catalogs and terminal payload schemas belong in shared contracts
- offline ingest should accept the same digests, verdict fields, and canonical failure codes that hosted worker-control finalization emits

If future hosted execution needs extra operational metadata, it should be added outside the canonical run-bundle and verifier core unless offline execution can produce the same field without distortion.

## Shared schema implications

`packages/shared` should expose the worker-control contract as bundle-aligned schemas, types, and catalogs:

- endpoint ids for the six worker-control routes
- execution phases and event kinds
- artifact roles
- job-token scopes
- verifier verdict schema
- canonical worker failure classification schema
- success and terminal failure finalize schemas that reference digests and artifact ids instead of bespoke result blobs

Issue `#147` is complete when those shared contracts no longer describe the older generic runtime-error/progress protocol and instead match the offline run-bundle and failure-registration baselines.

## Out of scope

- database table names or persistence layout
- artifact upload transport details
- worker autoscaling or queueing strategy
- browser-facing progress streaming
- non-Problem-9 benchmark-specific extensions
