# Artifact Class Catalog and Storage Location Baseline

This document defines the MVP artifact class catalog for ParetoProof and fixes whether each class belongs in Postgres metadata, Cloudflare R2 object storage, or both.

The goal is to keep later schema, upload, and retention work grounded in one stable artifact inventory instead of treating every new JSON or text file as a special case.

## Policy summary

- Postgres is the system of record for artifact metadata, ownership, lifecycle state, and query-critical summary fields.
- Cloudflare R2 is the system of record for immutable file bodies and downloadable artifact payloads.
- File-shaped artifacts do not live as canonical blobs in Postgres, even when they are small JSON or text files.
- One logical run may produce many artifact classes, but each class must map to one stable role and one stable R2 prefix family.
- Ingest-critical artifacts and bulky execution traces are separate classes on purpose.

## Canonical storage split

The MVP uses one simple storage rule:

- Postgres stores references and summaries.
- R2 stores files.

That means:

- if an object needs normal portal filtering, run aggregation, or state-machine joins, its queryable summary belongs in Postgres
- if an object is a file that should be downloaded, rechecked, or preserved as evidence, its canonical bytes belong in R2

Postgres may duplicate selected summary fields extracted from an R2-backed artifact, but it must not become a second blob store for the same file.

## What is not an artifact class

The following are control-plane records, not artifact classes:

- runs
- jobs
- attempts
- access or identity records
- queue leases
- worker heartbeat state

Those objects live in Postgres as application state. Artifact classes are the file-like evidence or payload objects that those records reference.

## Canonical artifact classes

### Run-linked artifact classes

These classes belong to one run or attempt and are normally stored under a `runs/<run_id>/...` R2 prefix family.

| Class id | Typical examples | Canonical file store | Prefix family | Postgres role |
| --- | --- | --- | --- | --- |
| `run_manifest` | `run-bundle.json`, `artifact-manifest.json` | R2 | `runs/<run_id>/artifacts/` | reference + digest + schema/version summary |
| `package_reference` | `package-ref.json`, copied package manifest | R2 | `runs/<run_id>/artifacts/` | reference + package identity summary |
| `prompt_package` | normalized prompt package, prompt-layer source files | R2 | `runs/<run_id>/artifacts/` | reference + prompt digest/version summary |
| `candidate_source` | `Candidate.lean`, `patch.diff` | R2 | `runs/<run_id>/artifacts/` | reference + digest + size + language/media summary |
| `verdict_record` | `verification/verdict.json` | R2 | `runs/<run_id>/artifacts/` | reference + terminal verdict summary |
| `compiler_diagnostics` | normalized compile diagnostics JSON | R2 | `runs/<run_id>/artifacts/` | reference + failure-summary extraction when needed |
| `compiler_output` | raw compiler stdout/stderr text | R2 | `runs/<run_id>/logs/` | reference only unless later summary extraction is justified |
| `verifier_output` | structured verifier findings, theorem comparisons | R2 | `runs/<run_id>/artifacts/` | reference + selected policy summary fields |
| `environment_snapshot` | environment/toolchain snapshot JSON | R2 | `runs/<run_id>/artifacts/` | reference + reproducibility digest summary |
| `usage_summary` | token, spend, wall-clock, retry accounting | R2 | `runs/<run_id>/artifacts/` | reference + selected budget summary fields |
| `execution_trace` | transcripts, event logs, Lean-MCP logs, tool logs | R2 | `runs/<run_id>/traces/` | reference only by default |

### Benchmark-linked artifact classes

These classes belong to a benchmark package or benchmark release surface rather than one run.

| Class id | Typical examples | Canonical file store | Prefix family | Postgres role |
| --- | --- | --- | --- | --- |
| `benchmark_source` | benchmark package snapshot archives, source manifests, published package payloads | R2 | `benchmarks/<benchmark_version_id>/source/` | reference + benchmark identity summary |
| `benchmark_report` | generated result reports, comparison exports, published benchmark bundles | R2 | `benchmarks/<benchmark_version_id>/reports/` | reference + report/release summary |

### Export bundle class

One additional class is run-scoped but distinct from the raw artifact set:

| Class id | Typical examples | Canonical file store | Prefix family | Postgres role |
| --- | --- | --- | --- | --- |
| `export_bundle` | downloadable zipped run bundles, shareable reviewer packages | R2 | `runs/<run_id>/bundles/` | reference + export status summary |

## Required versus optional classes

For the MVP Problem 9 slice, the ingest-critical classes are:

- `run_manifest`
- `package_reference`
- `prompt_package`
- `candidate_source`
- `verdict_record`
- `compiler_diagnostics`
- `compiler_output`
- `verifier_output`
- `environment_snapshot`
- `usage_summary` when the provider exposes stable accounting

Optional but supported classes are:

- `execution_trace`
- `benchmark_source`
- `benchmark_report`
- `export_bundle`

The rule is:

- a completed verdict must not depend on `execution_trace`
- bulky trace artifacts may be absent without invalidating a completed run
- benchmark publication and report surfaces may layer on top of the same class catalog later without redefining run artifact roles

## Storage location rules by class

### Classes that are always R2-backed

These classes always store their canonical bytes in R2:

- `candidate_source`
- `compiler_output`
- `execution_trace`
- `benchmark_source`
- `benchmark_report`
- `export_bundle`

These objects are file-like evidence or downloadable payloads. Postgres should hold only references and summaries.

### Classes that are structured but still R2-backed

These classes are structured JSON or manifest files, but they are still canonical R2 artifacts rather than inline database blobs:

- `run_manifest`
- `package_reference`
- `prompt_package`
- `verdict_record`
- `compiler_diagnostics`
- `verifier_output`
- `environment_snapshot`
- `usage_summary`

The reason is consistency: the offline bundle, worker upload path, and later exports all need one file-oriented evidence model. Postgres may index selected fields from these objects, but the canonical file body still lives in R2.

## Postgres metadata responsibilities

For every artifact class above, Postgres should own only metadata such as:

- artifact class id
- owning run, attempt, benchmark version, or export record
- object key or storage locator
- digest and size
- media type when known
- required versus optional status
- lifecycle state
- any narrow denormalized fields that later read models need for filtering or summaries

The exact field list belongs to issue `#123`. This document only fixes which objects deserve rows and which objects deserve R2 bodies.

## Prefix-family rules

Artifact classes must map to the stable R2 prefix families already defined elsewhere:

- run artifact bodies:
  - `runs/<run_id>/artifacts/`
- run log-like text output:
  - `runs/<run_id>/logs/`
- run traces and transcript exhaust:
  - `runs/<run_id>/traces/`
- packaged downloadable run bundles:
  - `runs/<run_id>/bundles/`
- benchmark package and source payloads:
  - `benchmarks/<benchmark_version_id>/source/`
- benchmark reports and publishable result bundles:
  - `benchmarks/<benchmark_version_id>/reports/`

The class catalog owns the class-to-prefix-family mapping. Issue `#123` may later define per-class metadata fields, but it should not move a class into a different bucket family without an explicit policy change.

Within a run prefix family, object keys must still preserve attempt-level uniqueness when multiple attempts emit the same class. The shared `runs/<run_id>/...` family is a storage namespace, not permission to overwrite prior attempt evidence.

For the MVP class catalog, `runs/<run_id>/logs/` is reserved for log-like text output such as `compiler_output`. Rich execution telemetry stays in `runs/<run_id>/traces/` under the `execution_trace` class.

## Query and review implications

The class split is designed to preserve two different product needs:

- fast portal and admin reads from Postgres metadata
- durable evidence and downloadable payloads from R2

For example:

- run list pages should filter on Postgres summaries, not fetch `verdict.json` bodies from R2 just to render a table
- reviewers should be able to download `Candidate.lean`, verifier outputs, or full bundles from R2-backed artifact references
- traces should remain available for incident or debugging review without bloating query paths for ordinary run listings

## Relationship to other baselines

- `problem9-run-bundle-baseline.md` defines the canonical Problem 9 bundle members and their meanings
- `r2-retention-restore-baseline.md` defines environment bucket layout, retention, and restore ownership
- `internal-contracts-api-baseline.md` defines the browser/API/worker ingest boundary that later artifact APIs must respect

This document is the source of truth for artifact class names and for the canonical metadata-versus-object-store split.

## Out of scope

- exact Postgres reference fields and checksum columns from issue `#123`
- signed upload and download flow mechanics from issue `#124`
- retention, visibility, and access policy from issue `#125`
- public UX wording for artifact downloads or trace visibility
