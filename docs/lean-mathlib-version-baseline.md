# Problem 9 Lean and Mathlib Version Policy

This document defines the Lean and Mathlib version policy for the offline `firstproof/Problem9` MVP slice. The goal is to keep the benchmark reproducible across time while still leaving room for one practical interoperability lane for current contributor tooling.

The policy is intentionally conservative: ParetoProof should not chase "latest Lean" by default if that makes historical benchmark runs hard to reproduce or compare.

## Policy summary

- `lean422_exact` is the canonical exact-reproduction lane for the Problem 9 benchmark package.
- `lean424_interop` is the required interoperability lane for contributor-facing harness work and Aristotle compatibility.
- `lean426_experiment` and `lean428_experiment` are optional experiment lanes only.
- Every lane must pin both Lean and the resolved Mathlib or Lake dependency snapshot.
- No canonical benchmark run may float to "latest" Lean or "latest" Mathlib at execution time.
- A run targets exactly one lane; mixed-lane dependency graphs are invalid.

## Initial lane decision

The MVP Problem 9 slice starts with two required lanes:

- `lean422_exact`
  - Lean version: `4.22.0`
  - role: exact reproduction of the original `firstproof` benchmark package
  - package authority: the checked-in `lean-toolchain` inside the canonical package root
- `lean424_interop`
  - Lean version: `4.24.0`
  - role: main interoperability lane for present-day harness and adapter work
  - package authority: a deterministic compatibility materialization tied to the same benchmark package version

The key decision is that ParetoProof does not choose one lane and ignore the other:

- `4.22.0` is required because the benchmark needs one exact historical anchor.
- `4.24.0` is required because the MVP must still be practical to run and compare in the current contributor and Aristotle-adapter environment.

The repository should therefore treat `lean422_exact` as the canonical source lane and `lean424_interop` as the canonical comparison lane.

## Mathlib policy

Lean version alone is not enough. Every supported lane must also pin the resolved dependency state that determines compilation and proof behavior.

For MVP, that means:

- `lean422_exact` uses the exact `lake-manifest.json` and dependency graph shipped with the benchmark package version.
- `lean424_interop` uses its own pinned Mathlib or Lake snapshot that is recorded as part of the same package-version contract.
- later experiment lanes may use different pinned snapshots, but they must still record those snapshots explicitly and may not resolve dependencies from a moving branch or tag.

The practical rule is simple: if two runs claim the same package version and the same lane id, they must resolve to the same Lean toolchain and the same Mathlib dependency snapshot.

## How interoperability lanes work

The benchmark package root remains the authority for immutable Problem 9 benchmark input. `lean422_exact` is the lane directly represented by the package's `lean-toolchain`.

Other lanes are allowed only through deterministic compatibility materialization. That means:

- the theorem meaning, namespace, and benchmark-owned statement content must remain unchanged
- any lane-specific compatibility edits must be recorded as immutable lane-owned inputs, not ad hoc local fixes
- those lane-owned inputs must be versioned and reviewable like the package itself

If `lean424_interop` requires changing imports, syntax, or supporting definitions to compile cleanly on Lean `4.24.0`, those changes are permitted only when they preserve theorem meaning and are recorded as part of the benchmark package version's declared lane policy.

## Mixed-version handling

Mixed-version handling is explicit:

- one run selects one lane id
- one lane id implies one Lean toolchain version
- one lane id implies one resolved Mathlib or Lake snapshot
- one run bundle must never mix files or dependencies from multiple lane snapshots

Cross-lane comparison is allowed only at the reporting layer. For example, ParetoProof may compare `lean422_exact` and `lean424_interop` verdicts for the same package version, but it may not build one candidate against a partially `4.22.0` and partially `4.24.0` workspace.

If a contributor wants to test multiple lanes, the harness should produce separate runs and separate bundle records.

## Version-change policy

Version changes are benchmark-input changes, not invisible maintenance.

The following changes require a new benchmark package version:

- changing the exact lane from Lean `4.22.0` to another Lean version
- changing the required interoperability lane from Lean `4.24.0` to another Lean version
- changing the pinned Mathlib or Lake dependency snapshot for any required lane
- adding, removing, or materially changing deterministic lane-compatibility inputs
- promoting an experiment lane into a required lane

The following changes do not become silent patch releases:

- backporting a compatibility fix to keep `lean422_exact` reproducible
- forward-porting a compatibility fix to keep `lean424_interop` compiling
- refreshing Mathlib for convenience without changing the benchmark statement

All of those still change benchmark execution behavior and therefore require a new package version plus golden-verifier reruns.

## Backports and newer Lean releases

The benchmark should not auto-upgrade when Lean or Mathlib publishes a new release.

The allowed promotion path is:

1. introduce the newer Lean release as an experiment lane
2. pin its full dependency snapshot
3. prove that canonical positive goldens and required negative fixtures still behave as expected
4. document any compatibility materialization needed to preserve theorem meaning
5. explicitly decide whether the lane remains experimental or becomes required in a later package version

This rule also applies in reverse for backports. If an older lane needs a compatibility repair to stay reproducible on supported infrastructure, that repair must be documented, pinned, and versioned. It must not appear as an untracked local workaround.

## Relationship to other Problem 9 baselines

- `problem9-benchmark-package-baseline.md` defines the immutable benchmark package boundary.
- `docker-image-baseline.md` defines which images must carry the required lanes and toolchains.
- `problem-9-verifier-golden-baseline.md` defines which lanes are required merge gates.

This document is the source of truth for deciding which Lean and Mathlib lanes exist, which are required, and how version changes are handled.

## Out of scope

- provider-adapter API details from issue `#43`
- harness stop conditions from issue `#145`
- run-bundle payload structure from issue `#380`
