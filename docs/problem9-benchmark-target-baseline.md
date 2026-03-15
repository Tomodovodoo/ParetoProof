# Problem 9 Benchmark Target Baseline

This document decides whether the repository-owned `firstproof/Problem9` package should remain a bootstrap theorem or now become the intended canonical benchmark target for the current ParetoProof kernel.

## Current baseline

- `benchmarks/firstproof/problem9/README.md` still says the checked-in theorem is intentionally small while the broader runner and verifier stack lands.
- `docs/benchmarks.md` already treats `firstproof/Problem9` as the benchmark slice that exercises package materialization, local attempts, verifier output, offline ingest, and hosted worker execution.
- The current theorem in `benchmarks/firstproof/problem9/FirstProof/Problem9/Statement.lean` is the helper recurrence itself:

  `triangular (Nat.succ n) = triangular n + Nat.succ n`

- The current gold proof in `benchmarks/firstproof/problem9/FirstProof/Problem9/Gold.lean` is a thin restatement of that same theorem.

The package is therefore already operationally central while still mathematically acting like a bootstrap fixture.

## Decision

`firstproof/Problem9` should stop being treated as a bootstrap theorem and should be upgraded now to the intended canonical benchmark target for the current platform iteration.

The package identity stays the same:

- package id remains `firstproof/Problem9`
- benchmark family remains `firstproof`
- benchmark item id remains `Problem9`

The canonical theorem target should change.

## Canonical target

The canonical `Problem9` theorem should become the triangular-number closed-form identity without division:

- mathematical statement: `2 * triangular n = n * (n + 1)`
- Lean statement may use the equivalent `n * Nat.succ n` spelling if that keeps the theorem and proof clearer in code

This is the accepted benchmark target for the next package revision.

## Why this target

The current recurrence identity is not a truthful long-term benchmark target because it is too close to the helper definition itself.

The closed-form identity is a better canonical target because it:

- still lives on the same benchmark-owned `triangular` helper
- remains small enough to review, version, and verify reproducibly inside the existing package-driven kernel
- requires genuine proof work rather than direct definitional unfolding
- exercises induction and arithmetic normalization instead of only restating one recursive equation
- stays compatible with the current Lean lanes without introducing division-specific portability questions

This is the smallest target change that makes the benchmark materially more honest while preserving the surrounding package, verifier, and worker infrastructure.

## Status of the current theorem

The current recurrence identity should no longer be the benchmark target once the follow-up implementation lands.

It may remain in the package as one of:

- a support lemma used by the canonical proof
- a helper theorem documented as bootstrap history
- a negative or control fixture only if that later proves useful

It should not remain the exported benchmark statement that the package asks models to prove.

## Benchmark shape that stays fixed

This decision does not create a new benchmark family or a multi-problem suite.

The canonical benchmark should still be:

- one repository-owned immutable package
- one statement module
- one support module
- one gold-proof module
- one benchmark-owned problem markdown statement
- one released package version at a time through the existing package materialization path

The next benchmark target should therefore stress the theorem, not the surrounding package topology.

## Proof difficulty boundary

The upgraded canonical target should stay within a reviewable and reproducible proof envelope.

The follow-up implementation should preserve these constraints:

- the theorem must not be provable by direct `rfl` or by merely restating the helper recurrence
- the gold proof should make the real reasoning visible, typically through explicit induction plus arithmetic normalization
- the statement should avoid avoidable encoding noise that would make failures more about theorem-encoding trivia than about mathematical reasoning
- the benchmark should remain self-contained inside the benchmark-owned helper and statement files rather than depending on a broad external theorem library search problem

This keeps the benchmark meaningful without turning `Problem9` into a large-mathlib integration exercise.

## Package-version implications

The current checked-in package version represents bootstrap history, not the final benchmark truth.

The follow-up execution work should therefore:

- bump the immutable package version when the theorem target changes
- update the statement markdown, Lean statement, and gold proof together in one package revision
- refresh verifier goldens, negative fixtures, and worker-facing docs so they describe the upgraded target truthfully

The package id should not fork into a new benchmark name just to hide that the original theorem was provisional.

## What this decision does not do

This scope does not:

- implement the upgraded theorem or proof
- define the broader benchmark intake and curation-review workflow
- reopen the current package-driven kernel model
- require a new hostname or new portal benchmark-authoring surface
- commit the project to a much larger benchmark family before the current canonical package is honest

## Follow-up execution slices

Execution work after this scope should split into:

1. upgrade `benchmarks/firstproof/problem9` so `Statement.lean`, `Gold.lean`, `README.md`, and `statements/problem.md` all describe the closed-form target consistently
2. refresh verifier goldens and negative fixtures so they fail on the old bootstrap statement and pass on the new canonical theorem
3. update worker, ingest, and benchmark-facing docs so `firstproof/Problem9` is described as the canonical current benchmark rather than a temporary tiny theorem
4. re-check any prompt-package or attempt-smoke expectations that still encode the old recurrence statement
