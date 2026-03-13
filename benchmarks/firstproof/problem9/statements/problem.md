# Problem 9

Let `triangular : Nat -> Nat` be the benchmark-owned helper defined by:

- `triangular 0 = 0`
- `triangular (n + 1) = triangular n + (n + 1)`

Prove that for every natural number `n`,

`triangular (n + 1) = triangular n + (n + 1)`.

The benchmark package fixes the helper definition, theorem target, namespace,
and gold proof together as one immutable package version.
