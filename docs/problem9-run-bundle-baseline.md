# Problem 9 Offline Run Bundle Baseline

This document defines the canonical offline run bundle, verifier verdict bundle, and later ingest boundary for the offline `firstproof/Problem9` MVP slice.

The goal is to fix one stable output object for local or worker execution before downstream artifact storage, upload flow, and worker-control work continue. The benchmark package boundary in [problem9-benchmark-package-baseline.md](problem9-benchmark-package-baseline.md) defines the immutable input object. This document defines the derived run-result object.

## Bundle model

The MVP uses two nested logical bundles:

- full offline run bundle: the complete local execution artifact set for one attempt
- verifier verdict bundle: the compact review-critical subset that captures candidate source, compiler results, verifier results, and the final pass or fail record

The verifier verdict bundle is part of the full run bundle. Later ingest uploads the verifier-critical subset first and treats heavier transcripts or traces as optional secondary artifacts.

## Canonical directory layout

The canonical offline run bundle root should be `problem9-run-bundle/` with this required layout:

```text
problem9-run-bundle/
  run-bundle.json
  artifact-manifest.json
  package/
    package-ref.json
    benchmark-package.json
  prompt/
    prompt-package.json
  candidate/
    Candidate.lean
  verification/
    verdict.json
    compiler-diagnostics.json
    compiler-output.txt
    verifier-output.json
  environment/
    environment.json
```

The bundle may also contain these optional paths when available:

```text
problem9-run-bundle/
  package/
    snapshot.tar.zst
  prompt/
    system.md
    benchmark.md
    item.md
    run-envelope.json
  candidate/
    patch.diff
  execution/
    event-log.ndjson
    transcript.ndjson
    usage.json
    lean-mcp.ndjson
    tool-log.txt
  verification/
    theorem-comparison.json
```

The naming rule is intentionally narrow. The canonical candidate file for the Problem 9 slice is `candidate/Candidate.lean`. Raw execution exhaust may expand later, but the required bundle root and file meanings above must not drift between local runs, CI verifier runs, and later worker runs.

## Required files and meanings

- `run-bundle.json`
  - the top-level bundle manifest for schema version, run identity, package identity, lane id, tool profile, stop reason, and root digests
- `artifact-manifest.json`
  - the path-by-path checksum and size inventory for every file present in the bundle
- `package/package-ref.json`
  - the run-local reference to the immutable benchmark package id, version, lane, and whole-package digest
- `package/benchmark-package.json`
  - a copied manifest from the immutable benchmark package so the run bundle still carries the package contract even if the original checkout is unavailable later
- `prompt/prompt-package.json`
  - the normalized prompt-layer manifest described by the prompt protocol baseline, including prompt version ids and prompt-content digests
- `candidate/Candidate.lean`
  - the exact candidate Lean file that the verifier evaluated, even if the attempt failed
- `verification/verdict.json`
  - the authoritative terminal verdict record for the attempt
- `verification/compiler-diagnostics.json`
  - normalized structured diagnostics from the Lean compile step
- `verification/compiler-output.txt`
  - the exact compiler output preserved for review and debugging
- `verification/verifier-output.json`
  - structured verifier findings such as semantic-equality result, surface-equality result, axiom checks, and forbidden-token checks
- `environment/environment.json`
  - the reproducibility snapshot of runtime environment, toolchain versions, and harness revision

## Required versus optional artifacts

The MVP required bundle members are:

- package reference material:
  - `package/package-ref.json`
  - `package/benchmark-package.json`
- prompt reference material:
  - `prompt/prompt-package.json`
- evaluated candidate:
  - `candidate/Candidate.lean`
- verifier verdict bundle:
  - `verification/verdict.json`
  - `verification/compiler-diagnostics.json`
  - `verification/compiler-output.txt`
  - `verification/verifier-output.json`
- reproducibility manifests:
  - `run-bundle.json`
  - `artifact-manifest.json`
  - `environment/environment.json`

Optional artifacts are allowed only as additive files:

- `package/snapshot.tar.zst` when the run wants a self-contained archive of the immutable package snapshot
- raw prompt layer files under `prompt/` when human review benefits from exact prompt text
- `candidate/patch.diff` when the candidate was produced as a patch-oriented workflow instead of a direct file write
- execution telemetry under `execution/`
- `verification/theorem-comparison.json` when the verifier emits a deeper semantic or surface comparison trace

If an optional artifact is present, it must still appear in `artifact-manifest.json` with the same checksum and path rules as required files.

## Verifier verdict bundle

The verifier verdict bundle is the minimal self-contained review subset:

- `candidate/Candidate.lean`
- `verification/verdict.json`
- `verification/compiler-diagnostics.json`
- `verification/compiler-output.txt`
- `verification/verifier-output.json`
- `package/package-ref.json`
- `environment/environment.json`

This subset must be enough to answer:

- which immutable benchmark package was evaluated
- which candidate file was judged
- whether compilation succeeded cleanly
- whether semantic equality and surface equality passed
- whether `sorry`, `admit`, or non-allowlisted axioms were detected
- why the attempt passed or failed

The full run bundle may contain more context, but no later API or artifact flow should require raw transcripts or interactive tool logs just to understand the benchmark verdict.

## Structured representation rules

### `run-bundle.json`

At minimum it must record:

- `bundleSchemaVersion`
- `runId`
- `jobId` when applicable
- `attemptId`
- `benchmarkPackageId`
- `benchmarkPackageVersion`
- `benchmarkPackageDigest`
- `laneId`
- `toolProfile`
- `promptPackageDigest`
- `candidateDigest`
- `verdictDigest`
- `environmentDigest`
- `artifactManifestDigest`
- `bundleDigest`
- `status`: `success`, `failure`, or `incomplete`
- `stopReason`

The root-manifest rule is special on purpose:

- `run-bundle.json` may store `artifactManifestDigest` and `bundleDigest`
- `artifact-manifest.json` must not try to hash either `artifact-manifest.json` itself or `run-bundle.json`
- root-manifest integrity is instead carried by `artifactManifestDigest` and by the canonical field set in `run-bundle.json`

### `verification/verdict.json`

At minimum it must record:

- `verdictSchemaVersion`
- `runId`
- `attemptId`
- `result`: `pass` or `fail`
- `failureCode` when the result is `fail`
- `semanticEquality`
- `surfaceEquality`
- `surfaceDrift`
- `containsSorry`
- `containsAdmit`
- `axiomCheck`
- `diagnosticGate`
- `candidateDigest`
- `benchmarkPackageDigest`
- `laneId`

### `verification/compiler-diagnostics.json`

This file must store normalized structured diagnostics, not only free-form text. Each diagnostic entry should carry severity, message text, normalized source location when available, and whether the benchmark policy treats it as terminal.

### `verification/verifier-output.json`

This file should store the structured proof-policy findings that are too detailed for `verdict.json`, including theorem-target comparison details, axiom inventory, forbidden-token findings, and benchmark-policy rule evaluations.

### `environment/environment.json`

At minimum it must record:

- harness revision
- prompt protocol version
- verifier version
- lane id
- Lean version
- Lake snapshot identity
- execution image digest or local devbox digest when applicable
- provider and model configuration identifiers
- OS/runtime metadata needed to reproduce the verdict environment

### `execution/usage.json`

If present, this file should record usage estimates such as prompt tokens, completion tokens, wall-clock timing, model calls, and retry counts. It is optional because not all local runs or provider adapters can emit stable accounting in MVP.

## Mandatory checksums and digests

The bundle must use SHA-256 for all file and bundle digests.

Mandatory root digests are:

- `benchmarkPackageDigest`
  - copied from the immutable package baseline
- `promptPackageDigest`
  - digest of the normalized prompt package content
- `candidateDigest`
  - digest of `candidate/Candidate.lean`
- `verdictDigest`
  - digest of `verification/verdict.json`
- `environmentDigest`
  - digest of `environment/environment.json`
- `artifactManifestDigest`
  - digest of `artifact-manifest.json`
- `bundleDigest`
  - digest of the normalized bundle file inventory plus canonical summary fields from `run-bundle.json`, excluding digest fields and excluding the two root manifests as direct inventory members

`artifact-manifest.json` must include one entry for every bundled file except `artifact-manifest.json` and `run-bundle.json`, which are handled as special root manifests. Each entry must record:

- relative path
- SHA-256 digest
- byte size
- media type when known
- logical artifact role
- required versus optional flag

Normalization must ignore local extraction timestamps, filesystem metadata, and archive-wrapper variance. Two bundles with identical logical files and contents should produce the same `bundleDigest` regardless of where they were generated.

The digest finalization order is:

1. hash all non-root bundle files and write `artifact-manifest.json`
2. hash `artifact-manifest.json` and set `artifactManifestDigest` in `run-bundle.json`
3. compute `bundleDigest` from the normalized non-root inventory plus canonical non-digest fields in `run-bundle.json`
4. write the final `run-bundle.json`

## Ingest boundary

Later online ingest should upload only the minimal structured subset needed to persist the run and review the verdict. The required ingest set is:

- `run-bundle.json`
- `artifact-manifest.json`
- `package/package-ref.json`
- `package/benchmark-package.json`
- `prompt/prompt-package.json`
- `candidate/Candidate.lean`
- `verification/verdict.json`
- `verification/compiler-diagnostics.json`
- `verification/compiler-output.txt`
- `verification/verifier-output.json`
- `environment/environment.json`
- `execution/usage.json` when present

The default ingest path must not require:

- `package/snapshot.tar.zst`
- raw prompt layer text files
- `execution/transcript.ndjson`
- `execution/event-log.ndjson`
- `execution/lean-mcp.ndjson`
- `execution/tool-log.txt`
- other bulky trace or interactive-debug artifacts

Those heavier files may be uploaded later as optional linked artifacts, but a completed offline run should be ingestible without them.

## Downstream constraints

This bundle boundary constrains later worker-control and artifact work in concrete ways.

### Worker-control implications

Worker-control payloads should reference the bundle contract, not duplicate bundle content:

- assignment payloads should carry package identity, lane id, prompt-package identity, budgets, and upload rules
- heartbeat and progress events may reference artifact roles or partial digests, but they should not embed transcripts or large file bodies
- terminal success messages should carry the final `bundleDigest`, `verdictDigest`, and uploaded artifact references
- terminal failure messages should still be able to attach a partial run bundle with `status=incomplete` when candidate or verifier outputs already exist

Issue `#147` should therefore derive its result payloads from the digests and artifact roles defined here rather than inventing a separate terminal object model.

### Artifact-catalog implications

Artifact-catalog work should classify run-bundle members at least along these logical roles:

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

The first nine are part of the ingest-critical boundary. `execution_trace` and other bulky debug artifacts are optional and should not block ingestion of a finished verdict.

## Out of scope

- signed upload and download flow mechanics
- retention policy for each artifact class
- final database schema for persisted run metadata
- queue scheduling and retry rules beyond recording the resulting bundle
