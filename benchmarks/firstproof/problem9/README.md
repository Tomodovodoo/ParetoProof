# FirstProof Problem 9

This directory is the repository-owned authoring source for the canonical
`firstproof/Problem9` benchmark package.

It intentionally keeps the checked-in metadata separate from the generated
materialized manifest:

- this directory's `benchmark-package.json` is source metadata that the worker
  materializer validates
- the materializer copies the immutable package files into a normalized
  `firstproof/Problem9/` output tree and writes a generated
  `benchmark-package.json` there with the file-hash inventory and package digest

The benchmark theorem for this package is the closed-form triangular-number
identity for the benchmark-owned `triangular` helper:

`2 * triangular n = n * (n + 1)`

The checked-in package now separates the target declaration from the repository
reference proof:

- `FirstProof/Problem9/Statement.lean` declares the canonical target without
  leaking the gold proof into prompt materialization
- `FirstProof/Problem9/Gold.lean` carries the repository-owned proof artifact
- `FirstProof/Problem9/Support.lean` keeps the benchmark-owned helper and the
  supporting recurrence and arithmetic lemmas used by the gold proof

This keeps the immutable package honest while preserving deterministic local
materialization and verifier behavior.

## Axiom safety model

- `Statement.lean` intentionally exports `axiom problem9` as the stable theorem
  header.
- The checked-in axiom is not accepted as benchmark proof evidence.
- The runtime keeps the checked-in benchmark package read-only and writes model
  output only to `FirstProof/Problem9/Candidate.lean`.
- Importing `FirstProof.Problem9.Gold` is invalid.
- Passing runs must match the canonical theorem target and clear the
  no-axioms check for `FirstProof.Problem9.problem9`.
