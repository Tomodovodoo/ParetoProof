# Problem 9 Reproducibility and Version Tracking Baseline

This document defines the mandatory reproducibility tuple and version-tracking rules for the offline `firstproof/Problem9` MVP slice. The goal is to make every benchmark result attributable to one explicit set of benchmark, prompt, provider, and environment identifiers instead of to an informal "we ran it in roughly this setup" memory.

ParetoProof is supposed to answer what a formal-math system can do reproducibly. That means version tracking is part of the benchmark contract, not just an implementation detail.

## Policy summary

- every canonical run must record one complete reproducibility tuple
- benchmark, prompt, provider, and environment identities are separate version axes
- model snapshot identity must be explicit and must not degrade to a marketing model alias
- environment tracking must include both logical toolchain versions and a concrete environment digest
- changing any required reproducibility field creates a different run configuration, not a patch note on the same result

## Canonical reproducibility tuple

Every canonical Problem 9 run must be attributable to this tuple:

- `benchmarkPackageId`
- `benchmarkPackageVersion`
- `benchmarkPackageDigest`
- `benchmarkItemId`
- `laneId`
- `promptProtocolVersion`
- `promptPackageDigest`
- `runMode`
- `toolProfile`
- `harnessRevision`
- `verifierVersion`
- `providerFamily`
- `authMode`
- `modelConfigId`
- `modelSnapshotId`
- `environmentDigest`
- `runConfigDigest`

This tuple is the minimum identity boundary for comparing, replaying, ingesting, or publishing a result.

If any field above changes, the resulting run is not the same benchmark execution, even if the candidate source happens to be identical.

## Mandatory benchmark identifiers

The benchmark side of the tuple must always include:

- `benchmarkPackageId`
  - for MVP: `firstproof/Problem9`
- `benchmarkPackageVersion`
  - the package version defined by the benchmark package baseline
- `benchmarkPackageDigest`
  - the whole-package SHA-256 digest copied from the immutable package manifest
- `benchmarkItemId`
  - the item identity inside the package; for MVP this is `Problem9`
- `laneId`
  - for MVP one of:
    - `lean422_exact`
    - `lean424_interop`
    - optional experiment lanes only when explicitly selected

The benchmark identifiers are the authoritative answer to "what problem was run?"

## Mandatory prompt identifiers

The prompt side of the tuple must always include:

- `promptProtocolVersion`
  - the version of the shared prompt-layer contract from `prompt-run-protocol-baseline.md`
- `promptPackageDigest`
  - the digest of the normalized prompt package used for the attempt
- `runMode`
  - such as `single_pass_probe`, `pass_k_probe`, or `bounded_agentic_attempt`
- `toolProfile`
  - such as `no_tools`, `lean_mcp_readonly`, or `workspace_edit_limited`

Prompt versions must not be inferred from a harness commit alone. The run must carry an explicit prompt protocol version plus the exact prompt package digest that reached the provider.

## Mandatory harness and verifier identifiers

The execution side of the tuple must always include:

- `harnessRevision`
  - the repository revision or published harness revision that built the run
- `verifierVersion`
  - the version id of the Lean verification logic and rule pack

These two identifiers must be separate:

- changing the harness without changing the verifier still changes reproducibility
- changing the verifier rule set without changing the harness also changes reproducibility

This matters because many future changes will alter logging, orchestration, or artifact layout without changing Lean semantics, and others will alter Lean validation without changing the outer harness.

## Mandatory provider and model identifiers

The provider side of the tuple must always include:

- `providerFamily`
- `authMode`
- `modelConfigId`
- `modelSnapshotId`

### `modelConfigId`

`modelConfigId` is the repository-owned configuration identity. It should resolve to:

- provider family
- baseline model family or API target
- default limits
- default tool mode
- provider-specific options when allowed

### `modelSnapshotId`

`modelSnapshotId` is the upstream model snapshot identity actually used at execution time.

It must not be only a loose alias such as:

- "latest gpt-5"
- "current codex"
- "aristotle default"

It must instead preserve the most specific upstream identity available, such as:

- dated or versioned model ids from the provider
- API-reported release or snapshot identifiers
- adapter-resolved pinned snapshot names

If the upstream provider does not expose a stable snapshot id, the run must record:

- the exact upstream model string used
- the adapter version
- the request timestamp
- an explicit marker that the snapshot is provider-floating

Floating upstream identities are allowed for exploratory runs, but they are weaker reproducibility evidence than pinned snapshots and should be labeled accordingly.

## Environment tracking requirements

Environment tracking has two layers:

- logical environment identity
- concrete environment digest

### Logical environment identity

Every run must record:

- `laneId`
- Lean version
- Lake or Mathlib snapshot identity
- execution target kind
  - `problem9-devbox`
  - `problem9-execution`
  - later worker image ids when hosted execution exists
- OS and runtime metadata needed to explain the verifier environment
- execution image digest when an image-backed environment is used

### Concrete environment digest

Every canonical run must also record `environmentDigest`, a SHA-256 digest over the normalized environment manifest stored in `environment/environment.json`.

The environment digest must cover the fields that materially affect benchmark verdicts, including:

- harness revision
- verifier version
- lane id
- Lean version
- Lake or Mathlib snapshot identity
- execution image digest or local devbox digest when applicable
- provider family and model config identifiers
- relevant runtime metadata captured by the run-bundle baseline

## Run configuration digest

The run must record a `runConfigDigest` that hashes the normalized reproducibility tuple excluding ephemeral outcome fields.

The purpose of `runConfigDigest` is to answer:

- are these two runs meant to be the same execution configuration?
- can this result be grouped with other runs under one exact benchmark setting?

`runConfigDigest` must not include:

- candidate output digests
- final verdict digests
- timestamps that only reflect when the run happened
- retry counters that do not change the logical configuration

It should include the fields needed to define the run before execution starts.

## Stable versus ephemeral fields

The reproducibility baseline distinguishes stable identity fields from ephemeral telemetry.

### Stable identity fields

These must be preserved for every canonical run and are part of the reproducibility tuple:

- benchmark package identifiers
- prompt package identifiers
- lane id
- harness revision
- verifier version
- provider family
- auth mode
- model config id
- model snapshot id
- environment digest
- run config digest

### Ephemeral telemetry

These are useful for debugging and analysis but are not part of the canonical configuration identity:

- `runId`
- `jobId`
- `attemptId`
- wall-clock start time
- latency measurements
- token usage totals
- retry counts
- host-specific temporary paths

These fields still belong in the run bundle, but they do not define configuration equivalence.

## Version-change rules

The following changes must create a new recorded configuration:

- benchmark package version or digest changes
- lane id changes
- prompt protocol version changes
- prompt package digest changes
- tool profile changes
- harness revision changes
- verifier version changes
- provider family or auth mode changes
- model config id changes
- model snapshot id changes
- environment digest changes

This is strict on purpose. ParetoProof should prefer over-attributing version differences rather than publishing results whose provenance is ambiguous.

## Comparison and publication rules

Two runs may be compared as like-for-like only when their reproducibility tuple matches on all benchmark-critical and verifier-critical fields.

For MVP publication and internal comparison, the default strict comparison boundary is:

- same benchmark package id, version, and digest
- same lane id
- same prompt package digest
- same run mode and tool profile
- same verifier version
- same provider family and model snapshot id
- same environment digest

Runs that differ on those fields may still be analyzed together, but they must be labeled as different configurations rather than as repeated samples from the same setup.

## Required storage locations

The run-bundle contract must carry these identifiers in stable files:

- `run-bundle.json`
  - top-level benchmark, prompt, provider, environment, and run-config digests
- `prompt/prompt-package.json`
  - prompt protocol version and prompt package digest inputs
- `environment/environment.json`
  - the detailed environment manifest hashed into `environmentDigest`
- `package/package-ref.json`
  - benchmark package id, version, digest, and lane id

Later backend ingestion should persist the same fields rather than recomputing them loosely from artifact names or branch names.

## Relationship to other Problem 9 baselines

- `problem9-run-bundle-baseline.md` defines where the identifiers live in the run bundle
- `lean-mathlib-version-baseline.md` defines the lane and toolchain version rules
- `provider-framework-api-baseline.md` defines provider family, auth mode, and model config boundaries
- `prompt-run-protocol-baseline.md` defines prompt protocol and tool-profile versioning

This document is the source of truth for which version identifiers are mandatory and what counts as the same versus different run configuration.

## Out of scope

- the full backend schema for storing run records
- metric aggregation or leaderboard policy from issue `#32`
- model registry implementation details from issue `#47`
