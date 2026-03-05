# Benchmark Specification

## Objective

ParetoProof should measure what researchers actually care about when using frontier models for Lean:

- can the model formalize the right statement,
- can the model prove it,
- can the model recover from partial failure, and
- can the model make meaningful progress under realistic tool and time budgets.

## Benchmark tracks

### 1. `formalize`

Input: natural-language mathematics, plus optional diagrams, definitions, or source text.

Target: a Lean theorem statement and any necessary local definitions or notation needed for the statement to compile.

Primary metric: statement fidelity plus compile success.

### 2. `prove`

Input: a compilable Lean theorem statement.

Target: a proof term or tactic proof that verifies under the target toolchain.

Primary metric: verified proof success.

### 3. `repair`

Input: a broken proof, partial proof, or intentionally corrupted proof state.

Target: a minimal successful repair.

Primary metric: repair success under bounded edit budget.

### 4. `full_stack`

Input: a natural-language problem.

Target: statement formalization plus proof.

Primary metric: end-to-end verified success with artifact completeness.

## Evaluation modes

ParetoProof should publish more than one regime, because `pass@1` alone obscures real capability.

- `pass@1`: one bounded attempt, minimal tool use.
- `pass@k`: fixed number of independent attempts under identical constraints.
- `budgeted_search`: bounded wall-clock, token, and tool budget.
- `full_effort`: a larger autonomous budget intended to model serious research usage.

Every reported score should include the exact run manifest, model identifier, budget, tool permissions, and Lean/mathlib version.

## Unit of evaluation

Each benchmark item should carry:

- a stable ID,
- track,
- source provenance,
- licensing status,
- Lean version and mathlib constraints,
- tags for topic and difficulty,
- canonical prompt material,
- target artifact expectations,
- adjudication notes when exact correctness needs human review.

The initial schema is defined in [../../schemas/benchmark-item.schema.json](../../schemas/benchmark-item.schema.json).

## Scoring principles

- The primary unit is verified success, not plausibility.
- Statement correctness is separate from proof correctness.
- Published scores should include cost and latency, not only success.
- All public leaderboard entries should link to run artifacts.
- Human adjudication should be explicit and versioned.

## MVP recommendation

Start with a narrow but credible benchmark slice:

- Lean 4 only,
- one pinned mathlib snapshot per release,
- 25 to 50 benchmark items,
- a mix of algebra, analysis, combinatorics, and olympiad-style formalization tasks,
- at least one baseline run per evaluation mode.
