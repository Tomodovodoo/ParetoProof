# Gold and Reference Solution Policy Baseline

This document defines when ParetoProof benchmark items require a benchmark-owned gold or reference artifact, how official upstream formalizations may be used, and how withheld reference material should be handled for MVP.

The goal is to stop benchmark curation from treating gold proofs, official formalizations, and reviewer-only notes as interchangeable. Benchmark items need one explicit policy for what reference artifact exists, who may see it, and whether the item is eligible for active benchmark use.

## Core policy

ParetoProof distinguishes between three closely related things:

- the canonical formal statement, which defines the machine-checkable target
- the benchmark-owned gold or reference solution artifact, which proves or realizes that target
- reviewer notes or informal proof sketches, which may help curation but are not themselves authoritative benchmark artifacts

The first rule is strict:

- every `active` benchmark item must have a fully correct canonical formal statement

The second rule depends on the expected output type:

- if the benchmark expects `formal_solution_proof`, the item must also have at least one fully correct internal reference solution before it may become `active`
- if the benchmark expects `formal_problem_statement`, a reference proof is recommended but not required unless the same item is also used in a proof-generation benchmark slice

This keeps the benchmark from publishing proof-generation tasks whose owners do not themselves know a correct machine-checkable answer.

## Gold versus reference artifact terms

For MVP, ParetoProof should use the following terms consistently:

- `gold artifact`: the benchmark-owned canonical reference artifact used for regression, internal validation, and package versioning
- `reference artifact`: any benchmark-approved, fully correct artifact that may support review, curation, or future publication, including the gold artifact itself

The practical rule is:

- every gold artifact is a reference artifact
- not every reference artifact is the canonical gold artifact

If several correct formal solutions exist, the benchmark may keep multiple reference proofs, but exactly one should be named as the canonical gold artifact for package-level reproducibility and regression work.

## When a gold or reference solution is required

### Direct formal solution generation

If the benchmark task expects a `formal_solution_proof` directly from a canonical formal statement, then before the item is `active` ParetoProof must have:

- one canonical formal statement
- one fully correct internal reference proof
- one declared canonical gold artifact if the item is part of the benchmark-kernel or regression-protected slice

For the current `firstproof/Problem9` MVP kernel, `Gold.lean` is required, not optional.

### Proof formalization from informal source material

If the benchmark asks a system to formalize a proof from informal source material, the item must still have:

- one canonical formal statement
- one fully correct internal reference proof for that statement before the item is `active`

The benchmark may publish the informal proof exposition, but it must not rely on reviewer intuition alone to decide whether the task is actually solvable in the current formal system.

### Statement formalization

If the benchmark expects a `formal_problem_statement`, then before the item is `active` ParetoProof must have:

- one canonical informal statement
- one fully correct canonical formal statement approved for scoring

A reference proof for that formal statement is recommended, because it reduces the risk that the statement is formally well-typed but mathematically mis-scoped. It is not mandatory for MVP statement-formalization items unless the same item also feeds proof-generation or verifier-regression work.

## Official upstream formalizations

An official or previously published formalization may be adopted, but it does not automatically become the ParetoProof gold artifact.

An upstream formalization is acceptable as the basis for a benchmark-owned gold or reference artifact only if:

- provenance and license are recorded in the benchmark metadata
- the exact imported or copied revision is pinned
- the formalization matches the benchmark-owned canonical statement or is deliberately adopted as that canonical statement in a new benchmark version
- ParetoProof review confirms that it is fully correct for the benchmark target in the selected Lean lane

If those conditions hold, ParetoProof may:

- adopt the upstream formalization directly as the canonical gold artifact
- mirror it into the repository as a benchmark-owned snapshot
- adapt it into a repository-owned gold artifact while preserving a provenance link to the upstream source

The important point is that "official" does not bypass internal review, versioning, or lane validation.

## Fully correct statement requirement

The repository must not mark a benchmark item `active` if the formal statement is still tentative.

For MVP, a fully correct canonical formal statement means:

- the statement is machine-checkable in the selected package lane
- the statement matches the intended benchmark task rather than an accidental weakening, strengthening, or side-condition drift
- the statement is benchmark-owned and versioned under the canonical metadata and package rules

This requirement applies even when a gold proof is withheld from contributors or the public. Public visibility and correctness are different questions.

## Review expectations

Before a benchmark item with a formal target becomes `active`, review should confirm both statement correctness and reference-artifact policy.

The minimum review expectation for MVP is:

- one reviewer checks that the canonical formal statement matches the intended mathematical task
- one reviewer checks that any gold or reference proof proves that exact target in the declared Lean lane
- the benchmark metadata records whether the reference artifact is canonical gold, internal-only reference, or absent because the task is statement-formalization-only

One person may satisfy more than one of those checks in the earliest MVP phase, but the checks themselves must still happen explicitly and be reviewable in the repository history.

## Withheld and private reference handling

ParetoProof may keep a correct reference solution private while still using it internally for curation and evaluation.

Allowed MVP states are:

- `public_gold`: the canonical gold artifact is repository-visible and may be shown to contributors
- `internal_gold`: the canonical gold artifact exists and is benchmark-owned, but it is restricted to internal curators or benchmark maintainers
- `internal_reference_only`: the item has one or more validated internal reference artifacts, but none is exposed as a public gold artifact

For proof-generation benchmarks, `internal_gold` and `internal_reference_only` are valid only if the internal artifact is complete and review-approved. A benchmark item must not become `active` with no correct internal answer just because the benchmark wants a hold-out challenge.

When the reference artifact is withheld, it does not need to ship inside a contributor-visible benchmark package. It does still need one benchmark-owned, versioned internal home so review, reruns, and future disclosure decisions all point at the same validated artifact instead of at reviewer-local files.

This baseline does not decide the full public-disclosure matrix for statements, hints, or benchmark release timing. That broader publication policy is defined in `public-disclosure-holdout-policy-baseline.md`. This document only fixes the minimum rule that a hold-out item may withhold its reference artifact publicly, but it may not skip having one internally.

## MVP application to `firstproof/Problem9`

For the current offline `firstproof/Problem9` slice:

- the benchmark expects `formal_solution_proof`
- the canonical formal statement is required
- the benchmark-owned `Gold.lean` reference proof is required
- the gold artifact is part of the immutable benchmark package and is used for regression and verifier-golden work

That makes Problem 9 a `public_gold` style benchmark item for MVP.

## Relationship to adjacent baselines

- `math-artifact-types-baseline.md` defines `formal_solution_proof` as both a model-produced target and a benchmark-owned gold/reference artifact type
- `problem-statement-metadata-baseline.md` defines the canonical statement pair and metadata contract that this policy builds on
- `lean-formalization-standards-baseline.md` defines how benchmark-owned gold proofs and statement modules should be authored
- `problem9-benchmark-package-baseline.md` defines where the gold artifact lives inside the immutable package
- `public-disclosure-holdout-policy-baseline.md` defines the broader public disclosure and hold-out policy across statements, solutions, and discussion norms

This document is the source of truth for whether a benchmark item must have a gold or reference solution before ParetoProof treats it as an active benchmark target.

## Out of scope

- exact contributor-facing UI for revealing or withholding gold artifacts
- database column names for gold visibility or review state
- publication timing and announcement policy for benchmark releases
- non-Lean benchmark families that may need a different notion of reference executor or oracle
