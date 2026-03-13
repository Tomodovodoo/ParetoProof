# Problem 9

Define a function `double : Nat -> Nat` by recursion:

- `double 0 = 0`
- `double (n + 1) = Nat.succ (Nat.succ (double n))`

Formally prove that for every natural number `n`, the recursive function agrees with ordinary addition:

`double n = n + n`

This benchmark item is intentionally small. Its purpose in the MVP is to establish one deterministic benchmark-package contract that workers and run bundles can materialize reproducibly from the repository.
