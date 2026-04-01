# Problem 9 Benchmark Target Baseline

`firstproof/Problem9` is the current canonical benchmark target for the
repository-owned ParetoProof kernel.

## Current target

- canonical statement module:
  `benchmarks/firstproof/problem9/FirstProof/Problem9/Statement.lean`
- canonical gold module:
  `benchmarks/firstproof/problem9/FirstProof/Problem9/Gold.lean`
- canonical human statement:
  `benchmarks/firstproof/problem9/statements/problem.md`

The benchmark theorem is the closed-form triangular-number identity:

`2 * triangular n = n * (n + 1)`

The Lean statement uses the equivalent `n * Nat.succ n` spelling.

## Binding rules

The checked-in package must keep these layers aligned:

- `benchmark-package.json` names `Statement`, `Support`, and `Gold` as the
  canonical modules
- `lakefile.toml` default-builds `FirstProof.Problem9.Gold`
- `Gold.lean` imports `Statement.lean`
- `Statement.lean` defines the benchmark proposition as `problem9_target`
- both the exported statement axiom and the gold artifact bind to
  `problem9_target n` instead of restating the proposition independently under
  disconnected contracts

That arrangement keeps the package-local default build on the same path as the
canonical statement contract.

## Package shape

The benchmark remains one immutable package version with:

- one statement module
- one support module
- one gold-proof module
- one benchmark statement markdown file

The support module may contain helper lemmas needed by the benchmark-owned
proof, but the exported statement stays the single benchmark target.

## Documentation truth

Benchmark-facing docs should describe the checked-in closed-form target as
current reality, not as future upgrade work.

The following files are part of that truth surface:

- `benchmarks/firstproof/problem9/README.md`
- `benchmarks/firstproof/problem9/statements/problem.md`
- `docs/benchmarks.md`
- this document

## Verification

The repository should fail validation if:

- the canonical module names drift from the checked-in package files
- the default Lake target stops building through `Gold.lean`
- `Gold.lean` stops importing `Statement.lean`
- `Statement.lean` stops defining the canonical `problem9_target`
- the gold artifact stops proving `problem9_target n`

That keeps the benchmark target, gold proof artifact, and default local build
mechanically aligned.
