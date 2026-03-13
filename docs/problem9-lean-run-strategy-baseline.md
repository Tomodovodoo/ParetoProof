# Problem 9 Lean Run Strategy Baseline

This document defines the Lean-specific run strategy for the offline `firstproof/Problem9` MVP slice. It fixes the authoritative Lean validation sequence, theorem-statement drift checks, and proof-acceptance rules that the harness must apply before a candidate can count as a passing result.

The goal is simple: a model output is not a benchmark result just because it looks plausible. It must survive one explicit Lean verification pipeline that is narrow enough to reproduce and strict enough to reject statement drift, hidden assumptions, and incomplete proofs.

## Policy summary

- every candidate is judged through one fixed Lean validation pipeline
- theorem-statement stability is checked at both the semantic and surface level
- compilation is an authoritative gate before proof-policy checks can pass
- `sorry` and `admit` are always terminal failures
- new non-allowlisted axioms are always terminal failures
- the candidate may not mutate immutable benchmark inputs or silently broaden the benchmark package
- the final pass or fail verdict comes from Lean validation artifacts, not from provider self-report

## Canonical validation pipeline

The MVP Problem 9 slice uses this ordered validation pipeline for every candidate:

1. materialize the immutable benchmark package and selected lane snapshot
2. write the candidate only into the run workspace as `candidate/Candidate.lean`
3. run authoritative Lean compilation for the selected lane
4. reject forbidden token patterns such as `sorry` and `admit`
5. compare the candidate theorem target against the canonical benchmark target
6. inspect the proved theorem's axiom footprint against the lane allowlist
7. emit the structured verifier output and terminal verdict

This order matters:

- theorem and axiom checks only count after the candidate compiles in the selected lane
- verifier repair may follow a failed theorem or axiom check, but any repaired candidate must compile again before the verifier phase resumes

## Candidate file and module contract

The canonical candidate output for the Problem 9 slice is one Lean file:

- `candidate/Candidate.lean`

The candidate may import the benchmark-owned package modules needed to prove the target theorem, but it must remain a derived artifact outside the immutable package root.

The candidate must not:

- overwrite `Statement.lean`, `Support.lean`, `Gold.lean`, `lean-toolchain`, `lakefile.toml`, or `lake-manifest.json`
- write additional mutable files into the benchmark package subtree
- fetch new dependencies from the network during validation
- switch Lean lanes or dependency snapshots mid-attempt

If a workflow needs to alter benchmark-owned modules to make a proof pass, that is a benchmark-package revision, not a successful run.

## Authoritative compile gate

Lean compilation is the first authoritative gate. A candidate enters the verifier phase only if it compiles successfully in the selected lane environment.

The compile gate must use:

- the lane-specific Lean toolchain from `lean-mathlib-version-baseline.md`
- the lane-specific Mathlib or Lake snapshot for the selected benchmark package version
- the same module and import context that the verifier goldens use

The compile step must emit:

- exact compiler output in `verification/compiler-output.txt`
- normalized structured diagnostics in `verification/compiler-diagnostics.json`

Compilation failures are terminal for the current verifier pass. The harness may still choose a compile-repair turn if compile-side budget remains, but it may not record a passing verifier result without a clean compile.

## Forbidden-token and incomplete-proof policy

The Problem 9 MVP rejects incomplete proof placeholders unconditionally.

These findings are always terminal:

- `sorry`
- `admit`

The validator should treat both as explicit benchmark failures even if the surrounding file still compiles under permissive local settings. They are not warnings, and they are not allowed to degrade into a "partial credit" state.

If the candidate contains either token, the verifier output must record:

- which token was found
- where it was found when location data is available
- that the candidate is ineligible for success regardless of later checks

## Theorem-statement stability

The theorem target must remain stable. The validator therefore records two related checks:

- `semanticEquality`
- `surfaceEquality`

### Semantic equality

Semantic equality is the authoritative theorem-target check. The candidate only passes theorem validation when the proved target is semantically equal to the canonical benchmark theorem for the selected lane.

A semantic mismatch is always terminal, even if:

- the candidate compiles cleanly
- the theorem is similar in wording
- the candidate proves a nearby or stronger or weaker statement

The benchmark question is whether the model solved the intended theorem, not whether it solved a convenient variant.

### Surface equality

Surface equality is a diagnostic companion signal. It captures whether the normalized textual theorem representation still matches the canonical reference shape.

Surface mismatch alone does not fail the candidate if semantic equality succeeds, but it must record:

- `surfaceEquality`
- `surface_drift`

This preserves the same meaning already defined in `problem-9-verifier-golden-baseline.md`.

## Theorem-drift failure classes

At minimum, the Lean verifier strategy must distinguish these theorem-target failures:

- wrong theorem name or missing canonical theorem entry
- wrong theorem type or target proposition
- extra assumptions that change the benchmark task
- proof of a different proposition under the same namespace shell
- semantic mismatch despite clean compilation

These failures belong in structured verifier output so later issues can map them into public failure taxonomies without losing the underlying Lean cause.

## Axiom allowlist policy

The Problem 9 verifier must inspect the candidate proof's axiom footprint.

The authoritative rule is:

- a candidate may use only the axiom set explicitly allowed for the selected lane and benchmark policy
- any new non-allowlisted axiom is terminal

The verifier must therefore record:

- the extracted axiom inventory for the proved theorem
- the selected allowlist id or version
- which axiom, if any, caused rejection

The MVP baseline intentionally stays strict: benchmark success is not allowed to depend on silently introducing user-defined axioms or unsupported proof assumptions.

If lane policy later permits a bounded list of standard axioms or classical reasoning assumptions, those permissions must still be explicit, versioned, and reviewable.

## Import and environment stability

The Lean run strategy must also preserve environment stability around the theorem proof:

- imports must resolve only through the selected benchmark package and lane snapshot
- the validator must reject attempts that depend on unpinned external packages
- the candidate may add local imports only when those imports resolve inside the pinned lane environment and do not mutate the benchmark package boundary

This prevents "it worked on my machine" results that are really hidden environment drift.

## Diagnostics policy

The Lean validator must classify diagnostics into benchmark-relevant pass or fail outcomes.

For MVP:

- compile errors are terminal
- verifier-policy failures are terminal unless the harness still has verifier-repair budget
- diagnostics that the benchmark policy explicitly marks as disallowed must fail the candidate

The exact public-facing failure taxonomy stays downstream, but the Lean-side verifier output must already preserve whether the failure was caused by:

- compilation
- theorem drift
- forbidden placeholder tokens
- forbidden axioms
- environment or import instability

## Required verifier outputs

The Lean strategy must produce structured outputs that fit the run-bundle baseline:

- `verification/compiler-diagnostics.json`
- `verification/compiler-output.txt`
- `verification/verifier-output.json`
- `verification/verdict.json`

`verification/verifier-output.json` should carry, at minimum:

- theorem-target comparison results
- semantic-equality result
- surface-equality result
- `surface_drift`
- forbidden-token findings
- axiom inventory and allowlist decision
- import or environment-stability findings when relevant
- the final Lean-policy rule evaluations that led to pass or fail

## Relationship to repair loops

This document defines what the Lean verifier checks. It does not define the numeric repair budgets.

Its boundary with the agent loop is:

- compile failures return the attempt to compile repair when budget remains
- theorem or axiom failures return the attempt to verifier repair when budget remains
- any repaired candidate must re-enter compilation before the verifier can accept it

This preserves the state-machine contract already defined in `problem9-agent-loop-baseline.md`.

## Relationship to goldens and bundle contracts

- `problem-9-verifier-golden-baseline.md` defines which positive and negative fixtures must prove this strategy stays stable
- `problem9-run-bundle-baseline.md` defines where the Lean validation outputs must be stored
- `lean-mathlib-version-baseline.md` defines which lane environment the validator runs against

This document is the source of truth for what the Lean verifier must actually check.

## Out of scope

- exact numeric retry ceilings from issue `#145`
- final public failure-label taxonomy from issue `#48`
- backend result persistence schema from issue `#32`
- implementation details of the verifier runner itself
