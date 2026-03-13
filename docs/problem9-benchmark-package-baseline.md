# Problem 9 Benchmark Package Boundary Baseline

This document defines the canonical benchmark package boundary for the offline `firstproof/Problem9` MVP slice. The package version is the main reproducibility object for the benchmark itself: workers, verifiers, and later ingest logic should all refer to one immutable package digest rather than to an informal collection of Lean files.

The package is a logical artifact with root id `firstproof/Problem9`. It may be materialized from a checked-in directory, a tarball, or another content-addressed snapshot, but every valid materialization must normalize to the same file tree and package digest.

## Canonical package root

The checked-in source of the package should live under `benchmarks/firstproof/problem9/`. When it is materialized for local execution or archival, the normalized package root should be `firstproof/Problem9/`.

The canonical package must contain exactly these required boundary files and directories:

```text
firstproof/Problem9/
  benchmark-package.json
  README.md
  LICENSE
  lean-toolchain
  lake-manifest.json
  lakefile.toml
  statements/
    problem.md
  FirstProof/
    Problem9/
      Statement.lean
      Support.lean
      Gold.lean
```

The meaning of each required file is fixed:

- `benchmark-package.json`: the benchmark-owned manifest for package id, package version, benchmark family, item id, lane compatibility, and the canonical file-hash inventory
- `README.md`: human-readable package notes, provenance summary, and any non-normative setup hints
- `LICENSE`: the package-level license and attribution boundary for this benchmark artifact
- `lean-toolchain`: the exact Lean lane pin used to materialize the package
- `lakefile.toml`: the canonical Lake package definition for the Problem 9 package
- `lake-manifest.json`: the resolved dependency snapshot for the package
- `statements/problem.md`: the canonical natural-language problem statement that the benchmark version publishes
- `FirstProof/Problem9/Statement.lean`: the canonical Lean theorem target and namespace boundary
- `FirstProof/Problem9/Support.lean`: benchmark-owned supporting definitions and lemmas that are part of the immutable task context
- `FirstProof/Problem9/Gold.lean`: the gold reference formalization and proof for verifier and regression use

No other file is required for the package to be valid. Extra files may exist later, but they must be classified explicitly as either immutable package inputs or derived auxiliary material in `benchmark-package.json`. The Problem 9 MVP should stay narrow and avoid hidden fixture sprawl inside the package root.

## Immutable inputs versus candidate outputs

Everything under the canonical package root is immutable benchmark input for one package version. That includes the natural-language statement, the Lean theorem target, benchmark-owned support modules, the gold solution, and all workspace metadata needed to compile the package reproducibly.

Candidate outputs do not belong inside the package root. Generated candidate proofs, model transcripts, verifier logs, usage summaries, and other run outputs must be written into a separate run workspace or run bundle that mounts or copies the package as read-only input. A worker may copy package files into a sandbox for local execution, but it must treat the copied package subtree as immutable and must record candidate work outside that subtree.

The practical rule is simple:

- package root: immutable benchmark input
- run workspace outside package root: mutable attempt output
- run bundle or ingest bundle: derived artifact set built from the immutable package plus run outputs

If a proposed workflow requires editing `Statement.lean`, `Support.lean`, `Gold.lean`, `lean-toolchain`, `lakefile.toml`, or `lake-manifest.json` in place during an attempt, that workflow is invalid for the Problem 9 MVP.

## Lean module and workspace policy

The package defines one Lean package and one canonical benchmark namespace:

- Lake package name: `firstproof-problem9`
- canonical namespace root: `FirstProof.Problem9`
- canonical theorem-entry module: `FirstProof.Problem9.Statement`
- canonical gold-proof module: `FirstProof.Problem9.Gold`

`Statement.lean` is the authority for the published theorem target. `Support.lean` may contain benchmark-owned local definitions, helper lemmas, notation, or setup that the theorem depends on. `Gold.lean` may import both `Statement` and `Support`, but no execution issue may treat `Gold.lean` as mutable working state.

The MVP package uses `lakefile.toml`, not `lakefile.lean`, to keep the package definition declarative and easier to hash. If a future benchmark truly needs a programmable Lake definition, that change should be treated as a new package-boundary revision rather than as an invisible substitution.

## Versioning rule for statement, formalization, and gold proof

The natural-language statement, canonical Lean target, support modules, and gold proof version together as one package object.

That means:

- changing `statements/problem.md` requires a new package version
- changing the theorem statement or namespace in `Statement.lean` requires a new package version
- changing benchmark-owned support definitions in `Support.lean` requires a new package version
- changing the gold proof in `Gold.lean` requires a new package version, even if the theorem target is unchanged
- changing Lean or Lake dependency pins in `lean-toolchain`, `lakefile.toml`, or `lake-manifest.json` requires a new package version

The package version is therefore the only supported way to say "this is a different benchmark input." Later run records may point at additional run-level artifacts, but they may not claim the same package version after any immutable input has changed.

## Required package metadata and checksums

`benchmark-package.json` is the machine-readable anchor for the package. At minimum it must record:

- `packageId`: `firstproof/Problem9`
- `packageVersion`
- `benchmarkFamily`: `firstproof`
- `benchmarkItemId`: `Problem9`
- `lanePolicy`: the supported Lean lanes for this package version
- `canonicalModules`: `Statement`, `Support`, and `Gold`
- `hashes`: SHA-256 digests for every immutable file in the package root
- `packageDigest`: the SHA-256 digest of the normalized whole-package snapshot

The required hash set for MVP is:

- whole-package SHA-256 over the normalized file tree
- per-file SHA-256 for `benchmark-package.json`, `README.md`, `LICENSE`, `lean-toolchain`, `lakefile.toml`, `lake-manifest.json`, `statements/problem.md`, `FirstProof/Problem9/Statement.lean`, `FirstProof/Problem9/Support.lean`, and `FirstProof/Problem9/Gold.lean`

Normalization must ignore local build output and editor noise. Files such as `.lake/`, `.git/`, `.DS_Store`, `*.olean`, transient logs, and other generated outputs are not part of the package boundary and must never contribute to the package digest.

## Compatibility with downstream run and artifact work

This package boundary constrains later execution work in a few important ways:

- verifier work must treat `Statement.lean` and `Support.lean` as immutable baseline input when checking candidate correctness
- run-bundle work must record which package digest the run consumed instead of trying to infer benchmark identity from a few copied files
- worker-control contracts should send package identity, selected lane, and a read-only package materialization reference rather than embedding mutable benchmark content in the control payload
- artifact-catalog work should model package snapshots separately from run outputs, because benchmark inputs and run artifacts have different ownership and mutability rules

Issue `#380` should define how the package snapshot is represented inside a completed run bundle, but it should not reopen what the package boundary itself is.

## Extension rule for later benchmark packages

Problem 9 is the first package, not a one-off exception. Later benchmark packages should preserve the same core contract:

- one package manifest file
- one pinned Lean toolchain file
- one pinned Lake definition and manifest
- one natural-language statement path
- one canonical theorem-entry module
- one gold proof module
- one whole-package digest plus per-file digest inventory

Future packages may add more benchmark-owned modules, fixtures, or metadata directories, but they should do so by extending the manifest schema without changing the meaning of the Problem 9 boundary above. If a later package needs a broader structure, the manifest version should change explicitly and the compatibility story should be written down rather than implied.

## Out of scope

- the completed offline run bundle shape, which belongs to issue `#380`
- final verifier verdict schema details, which belong to the verifier and run-bundle scope work
- upload, download, and retention policy for run artifacts, which stay downstream of the package boundary
