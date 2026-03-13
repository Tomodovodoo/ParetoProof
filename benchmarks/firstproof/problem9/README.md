# FirstProof Problem 9

This directory is the repository-owned authoring source for the canonical `firstproof/Problem9` benchmark package.

The checked-in source tree is not the final materialized package root. The worker materializer copies the immutable authored files from this directory, writes them into `firstproof/Problem9/`, and then generates `benchmark-package.json` there with deterministic hash metadata.

Authoring-source boundary:

- checked in here:
  - `README.md`
  - `LICENSE`
  - `lean-toolchain`
  - `lakefile.toml`
  - `lake-manifest.json`
  - `statements/problem.md`
  - `FirstProof/Problem9/Statement.lean`
  - `FirstProof/Problem9/Support.lean`
  - `FirstProof/Problem9/Gold.lean`
  - `package-source.json`
- generated during materialization:
  - `benchmark-package.json`

The current package keeps the mathematical content intentionally small so the repository can establish one deterministic package contract before broader runner and verifier work lands.
