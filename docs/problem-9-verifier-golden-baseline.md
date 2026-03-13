# Problem 9 Verifier Goldens and Regression Policy

This document defines the MVP verifier-golden and benchmark-regression policy for the offline `firstproof/Problem9` slice. For benchmark-kernel changes, this policy takes priority over broader generic test-stack breadth.

The goal is simple: protect benchmark correctness first. Generic unit, integration, and browser coverage still matter, but they do not replace strict proof-verifier goldens for the first real benchmark slice.

## Canonical positive goldens

The offline Problem 9 slice must keep two required positive goldens:

- `problem9_exact_canonical`
  - lane: `lean422_exact`
  - source: the immutable canonical `firstproof/Problem9` package
  - purpose: prove exact reproduction still succeeds with no benchmark-package drift
- `problem9_interop_canonical`
  - lane: `lean424_interop`
  - source: the same canonical target with only lane-compatibility changes that preserve theorem meaning
  - purpose: prove the benchmark still verifies in the main interoperability lane without silently changing the task

Both positive goldens are required merge gates for benchmark-kernel work. The exact lane protects reproduction; the interop lane protects the future-facing harness surface that contributors will use most often.

## Required negative fixtures

The offline Problem 9 slice must keep, at minimum, the following negative fixtures:

- `reject_sorry`
  - candidate contains `sorry`
- `reject_admit`
  - candidate contains `admit`
- `reject_non_allowlisted_axiom`
  - candidate introduces an axiom outside the allowlist
- `reject_mutated_benchmark_inputs`
  - candidate mutates immutable benchmark-package inputs instead of writing only to the run sandbox
- `reject_wrong_theorem_type`
  - candidate proves a proposition with the wrong theorem shape or target type
- `reject_semantic_mismatch`
  - candidate compiles but proves a statement that is not semantically equal to the canonical target
- `reject_failing_diagnostics`
  - candidate compiles with diagnostics that the benchmark policy treats as failure

These fixtures are part of the MVP baseline, not optional extras for later hardening.

## Equality policy

The verifier must record both semantic equality and surface equality.

- semantic equality is the authoritative pass or fail signal for theorem-target correctness
- surface equality is a diagnostic record that captures whether the normalized theorem statement text still matches the canonical fixture representation

Authoritative rule:

- a candidate passes theorem-target checking only when semantic equality succeeds
- a surface mismatch may still pass if semantic equality succeeds, but the verdict must record `surface_drift=true`
- a semantic mismatch is always terminal even if the candidate compiles cleanly

This keeps the benchmark resistant to harmless formatting or notation drift while still surfacing when a supposedly equivalent theorem is no longer textually identical to the canonical fixture.

## Verdict and artifact policy

Each positive or negative fixture run must emit a stable review bundle with, at minimum:

- `verdict.json`
  - fixture id, lane id, pass or fail, semantic-equality result, surface-equality result, and failure code when relevant
- `compiler-output.txt`
  - combined compiler or build output preserved exactly as emitted
- `verifier-output.json`
  - structured verifier findings including axiom checks, `sorry` or `admit` detection, theorem-target checks, and diagnostic classification
- `artifact-manifest.json`
  - checksum and path inventory for all emitted files

Repository policy:

- expected fixture metadata and golden verdict snapshots should live in one committed `problem9` golden-fixture directory in the repository
- heavy logs or trace files may be emitted as CI artifacts rather than committed snapshots
- when a benchmark-kernel PR intentionally changes verifier output, the golden snapshot diff must be reviewed in the PR like code, not treated as opaque CI exhaust

## Local pre-merge requirements

Any change that touches the Problem 9 benchmark kernel, verifier logic, harness execution semantics, fixture materialization, or theorem-target checking must run the full verifier-golden suite locally before merge.

The local required set is:

- `problem9_exact_canonical`
- `problem9_interop_canonical`
- all required negative fixtures
- golden snapshot diff review when any expected verdict artifact changes

Downstream execution work should expose these as one deterministic local command family. The exact command names may evolve, but the logical requirement must remain:

- run positive goldens for both canonical lanes
- run the full negative fixture pack
- fail fast on any unexpected verdict or artifact-manifest drift

## CI merge-gate requirements

For benchmark-kernel changes, PR CI must run:

- the exact positive golden in `lean422_exact`
- the interoperability positive golden in `lean424_interop`
- the full negative fixture pack
- artifact-manifest consistency checks for every fixture run

CI may shard fixture execution, but it must not skip the exact lane, the interop lane, or the negative pack on benchmark-kernel pull requests.

Experiment lanes such as `lean426_experiment` and `lean428_experiment` are allowed as non-blocking jobs later, but they are not part of the MVP required gate.

## Relationship to the generic testing baseline

The generic TypeScript-first testing baseline still applies, but it sits around this verifier policy rather than ahead of it.

- benchmark-kernel changes must satisfy the Problem 9 verifier-golden gate first
- generic unit, integration, migration, and Playwright coverage remain required for the web, API, and shared-contract surfaces they touch
- a passing generic test suite is not sufficient evidence that the benchmark kernel remains correct
- if a change does not touch the benchmark kernel, contributors may rely on the normal testing baseline without running the full Problem 9 fixture pack

This is the intended MVP ordering:

1. verifier goldens and negative fixtures for benchmark-kernel correctness
2. generic TypeScript and browser coverage for the surrounding product surfaces
3. broader future test-stack expansion only after the benchmark-kernel gate is stable

## Out of scope

- implementing the verifier runner itself
- defining the full failure taxonomy outside the fixture baseline
- adding forward-compatibility experiment lanes as required merge gates
