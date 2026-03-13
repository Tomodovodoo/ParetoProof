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

The benchmark theorem for this initial package is a narrow recurrence identity
for the benchmark-owned `triangular` helper:

`triangular (Nat.succ n) = triangular n + Nat.succ n`

That theorem is intentionally small enough to keep the first immutable package
easy to review while the broader offline runner and verifier stack is still
landing.
