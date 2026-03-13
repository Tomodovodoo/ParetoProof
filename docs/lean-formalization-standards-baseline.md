# Lean Formalization Standards Baseline

This document defines the repository-owned Lean formalization standards for ParetoProof benchmark items. It fixes how benchmark-owned statement modules, support modules, and gold proofs should be authored so curation, verification, and later model-produced artifacts all target one stable contract.

The goal is not to impose every Mathlib style preference. The goal is to keep benchmark formalizations reviewable, comparable, and reproducible across package versions and Lean lanes.

## Scope of this baseline

This baseline applies to benchmark-owned Lean artifacts that ship inside an immutable benchmark package:

- canonical statement modules such as `FirstProof/Problem9/Statement.lean`
- benchmark-owned support modules such as `FirstProof/Problem9/Support.lean`
- benchmark-owned gold proof modules such as `FirstProof/Problem9/Gold.lean`

It does not define how model-produced candidate files may be named inside a run workspace. That remains downstream of the runner and bundle contracts.

## Canonical module and naming rules

Every benchmark item version must expose one canonical namespace root and one canonical statement-entry module.

For the MVP, the required naming pattern is:

- namespace root: `BenchmarkFamily.ItemId` in Lean `UpperCamelCase` segments
- statement-entry module: `<NamespaceRoot>.Statement`
- support module path: `<NamespaceRoot>.Support`
- gold proof module path: `<NamespaceRoot>.Gold`

For `firstproof/Problem9`, that becomes:

- namespace root: `FirstProof.Problem9`
- statement-entry module: `FirstProof.Problem9.Statement`
- support module: `FirstProof.Problem9.Support`
- gold module: `FirstProof.Problem9.Gold`

The canonical theorem in the statement-entry module should use a stable, benchmark-owned theorem name. Gold proofs may use a different theorem name when that improves readability, but they must still prove the exact canonical target.

## Import boundary rules

Benchmark-owned Lean modules must keep imports narrow and explicit.

Required rules:

- `Statement.lean` may import only benchmark-owned support modules and the pinned package dependencies needed to state the theorem
- `Statement.lean` must not import `Gold.lean` or any model-produced candidate module
- `Support.lean` may define helper lemmas, notation, local structures, or abbreviations, but it must not hide the benchmark target itself
- `Gold.lean` may import `Statement.lean` and `Support.lean`, but it must not redefine the canonical statement under a second authoritative name
- imports must resolve entirely inside the pinned Lean and Lake environment for the package version

The practical standard is that a reviewer should be able to read `Statement.lean` and see the benchmark target without searching through a large web of local modules.

## Statement-authoring rules

The canonical theorem statement is the machine-checkable authority for the benchmark target. It must therefore stay narrow, explicit, and stable.

Required statement rules:

- the canonical target must appear in `Statement.lean`, not only in `Gold.lean`
- the authoritative target must be a named top-level theorem or specification constant, not an anonymous `example`
- the theorem statement must live under the canonical namespace root
- theorem parameters, assumptions, and target proposition must be explicit in the theorem signature
- notation or helper definitions may appear in `Support.lean`, but the benchmark target must still be understandable from the statement module plus its declared imports
- the statement module must not include placeholder proof terms, temporary admits, or editorial TODO markers that change theorem meaning

If a benchmark family needs several related theorems, exactly one theorem or specification must still be identified as the authoritative benchmark target for scoring and reproducibility.

## Statement versus gold-proof split

The canonical statement target and the benchmark-owned reference proof are related, but they are not the same role.

Required rules:

- `Statement.lean` is the authoritative home of the benchmark target signature
- `Gold.lean` is the authoritative benchmark-owned reference proof module when a reference proof is shipped
- `Statement.lean` may include a proof term when that keeps the canonical target self-checking and reviewable
- if both modules contain proofs of the same target, the benchmark still treats the theorem signature in `Statement.lean` as the scoring target and the proof in `Gold.lean` as the reference regression artifact

This rule preserves the current Problem 9 shape, where the theorem target is stated in `Statement.lean` and a second benchmark-owned proof exists in `Gold.lean` for reference and regression use.

## Style rules for benchmark-owned Lean files

ParetoProof MVP should keep benchmark-owned Lean files plain and conservative.

Required style rules:

- use one file per canonical role: `Statement`, `Support`, and `Gold`
- keep top-level namespace declarations explicit
- prefer descriptive helper names in `Support.lean` over anonymous local proof tricks that are hard to audit
- keep theorem statements and proof scripts formatted so line-based review remains readable in pull requests
- avoid nonstandard syntax extensions or metaprogramming unless the benchmark package explicitly depends on them and they are necessary to state or prove the benchmark target
- keep benchmark-owned modules deterministic and offline; they must not rely on network fetches, generated code, or machine-local path assumptions

This baseline intentionally does not prescribe a full formatter or linter profile. It only fixes the rules that matter for benchmark identity and reviewability.

## Proof completion definition

A benchmark-owned formalization counts as complete only when all of the following are true:

- the statement module compiles in the selected package lane
- the gold proof compiles in the selected package lane
- the gold proof proves the canonical statement from `Statement.lean`
- no file in the benchmark-owned formalization uses `sorry` or `admit`
- the proof does not require new unreviewed dependencies, hidden generated files, or mutable benchmark-package edits outside the declared version

For ParetoProof MVP, "complete" does not mean "beautiful" or "maximally general." It means the benchmark-owned Lean artifact is machine-checkable, reviewable, and stable enough to serve as the authoritative target or reference proof.

## Correctness and review standards

Correctness for benchmark-owned formalizations is stricter than ordinary draft Lean notes because later benchmark scoring depends on it.

The minimum correctness standard is:

- the statement formalizes the intended benchmark task without silently weakening or broadening it
- the gold proof checks against that exact statement
- support definitions used by the statement or gold proof are benchmark-owned and versioned inside the package
- any theorem-meaning change, assumption change, or support-definition change that affects the benchmark target requires a new benchmark package version

Reviewers should therefore check:

- theorem name and module path stability
- import minimality and absence of hidden benchmark logic in unrelated modules
- whether assumptions in the Lean statement still match the published informal statement
- whether the gold proof is proving the canonical theorem instead of a nearby restatement

## MVP application to `firstproof/Problem9`

For the current offline Problem 9 slice:

- `FirstProof/Problem9/Statement.lean` is the only authoritative statement-entry module
- `FirstProof/Problem9/Support.lean` contains benchmark-owned helper definitions such as `triangular`
- `FirstProof/Problem9/Gold.lean` is the benchmark-owned reference proof module
- the theorem `FirstProof.Problem9.problem9` is the canonical benchmark target

Later execution work may materialize candidates into separate run workspaces, but those candidates must still target the statement contract defined here.

## Relationship to adjacent baselines

- `problem-statement-metadata-baseline.md` defines how the canonical formal statement is referenced in benchmark metadata
- `problem9-benchmark-package-baseline.md` defines where the benchmark-owned Lean files live inside the immutable package
- `problem9-lean-run-strategy-baseline.md` defines how model-produced candidates are validated against the benchmark-owned formalization
- `problem-9-verifier-golden-baseline.md` defines the golden and negative fixtures that protect the Lean verification pipeline

This document is the source of truth for how ParetoProof should author the benchmark-owned Lean formalization itself.

## Out of scope

- runner-specific candidate file naming outside the immutable benchmark package
- public disclosure policy for gold proofs or held-out statements
- database schema or API field names for formalization metadata
- broad Mathlib style guidance unrelated to benchmark identity or reviewability
