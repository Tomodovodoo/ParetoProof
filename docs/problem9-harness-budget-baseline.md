# Problem 9 Harness Budget and Stop-Condition Baseline

This document defines the concrete budget ceilings and stop conditions for the offline `firstproof/Problem9` worker and local harness loop. The goal is to make the bounded agentic attempt reproducible before those rules are lifted into queue scheduling or backend control logic.

The budgets here are intentionally strict. ParetoProof should bias toward runs that are easy to reproduce, inspect, and compare, not toward open-ended agent sessions that quietly spend more until something passes.

## Policy summary

- the canonical Problem 9 run uses one bounded attempt, not an unbounded search
- compile repair and verifier repair have separate ceilings
- wall-clock, provider-turn, and provider-usage ceilings all stop the attempt independently
- any one exhausted budget dimension is terminal for the current attempt
- manual cancellation is immediate and terminal
- the run bundle must record exactly which budget or stop condition ended the attempt

## Canonical per-attempt ceilings

The default MVP ceilings for one `bounded_agentic_attempt` are:

- maximum attempts per run: `1`
- maximum provider turns per attempt: `6`
  - one initial generation turn
  - up to three compile-repair turns
  - up to two verifier-repair turns
- maximum compile-repair cycles: `3`
- maximum verifier-repair cycles: `2`
- maximum wall-clock runtime per attempt: `20 minutes`
- maximum provider spend budget per attempt: `USD 5.00`
- maximum aggregate provider token budget per attempt: `120000` total tokens when the provider exposes stable accounting

All ceilings above are active at the same time. Reaching any one of them is enough to stop the attempt.

## Mode-specific ceilings

The harness supports multiple run modes, so the budget policy fixes how the default ceilings map to each mode.

### `single_pass_probe`

- maximum attempts per run: `1`
- maximum provider turns: `1`
- compile-repair cycles: `0`
- verifier-repair cycles: `0`
- wall-clock ceiling: `5 minutes`
- provider spend ceiling: `USD 1.00`

`single_pass_probe` is intentionally narrow. It is the baseline `pass@1` probe mode, not a disguised repair loop.

### `pass_k_probe`

- maximum attempts per run: exactly `k`
- each attempt uses the `single_pass_probe` ceilings above
- no transcript, candidate, or tool-state carryover is allowed between attempts

The `pass_k_probe` outer driver may repeat attempts, but each attempt is still a strict one-turn probe under the same benchmark and prompt package.

### `bounded_agentic_attempt`

- maximum attempts per run: `1`
- maximum provider turns: `6`
- compile-repair cycles: `3`
- verifier-repair cycles: `2`
- wall-clock ceiling: `20 minutes`
- provider spend ceiling: `USD 5.00`
- aggregate token ceiling: `120000`

This is the default Problem 9 benchmark mode.

### `benchmark_batch`

`benchmark_batch` does not define a new inner budget. It repeats one selected per-item mode:

- `benchmark_slice` repeats the chosen per-item budget over a subset of items
- `full_benchmark` repeats the chosen per-item budget over the full benchmark set

Each item keeps its own independent attempt ceilings. One item may not borrow unused budget from another.

## Repair budget semantics

The compile and verifier repair ceilings are separate on purpose.

### Compile-repair ceiling

The harness may spend at most `3` compile-repair cycles after authoritative compile failures.

A compile-repair cycle means:

1. a candidate fails compilation
2. the model receives compile diagnostics and produces a repaired candidate
3. the harness re-runs compilation

If the candidate still does not compile after the third repair cycle, the attempt ends with `compile_failed`.

### Verifier-repair ceiling

The harness may spend at most `2` verifier-repair cycles after clean compilation followed by a Lean-policy failure.

A verifier-repair cycle means:

1. a candidate compiles
2. the Lean verifier rejects it for theorem drift, forbidden axioms, forbidden placeholders, or another verifier-policy failure
3. the model receives structured verifier findings and produces a repaired candidate
4. the harness re-enters the compile gate

If the candidate still fails Lean-policy validation after the second verifier-repair cycle, the attempt ends with `verifier_failed`.

## Provider-turn semantics

The provider-turn ceiling is global across the whole attempt.

Every model output that asks the provider to generate new content counts as one turn, including:

- the initial candidate generation
- compile-repair turns
- verifier-repair turns

Tool calls do not count as additional provider turns by themselves, but any follow-up model turn after tool execution does count.

If the run reaches `6` provider turns without success, the attempt ends with `budget_exhausted` and the exhausted budget dimension must be recorded as `provider_turns`.

## Wall-clock semantics

The wall-clock ceiling starts when the attempt enters `prepared` and ends only when the attempt reaches a terminal state.

The wall-clock budget includes:

- provider latency
- tool execution time
- Lean compilation time
- Lean verifier time
- harness-side bookkeeping

If the wall-clock runtime crosses `20 minutes`, the attempt ends immediately with `budget_exhausted` and exhausted dimension `wall_clock`.

The harness must not hide long-running work by pausing the timer during tool or verifier execution.

## Provider spend and token semantics

The MVP uses both a spend ceiling and a token ceiling because not every provider exposes accounting in the same way.

### Spend ceiling

When stable provider pricing metadata is available, the attempt must stop once estimated spend reaches `USD 5.00`.

### Token ceiling

When stable token accounting is available, the attempt must also stop once aggregate prompt plus completion usage reaches `120000` tokens.

If a provider exposes one of these two dimensions but not the other:

- enforce the available dimension
- record the missing dimension as unavailable in the usage metadata

If a provider exposes neither stable spend nor stable token accounting, the run may still proceed under the turn and wall-clock ceilings, but the run bundle must record that provider-usage accounting was unavailable.

## Manual cancellation

Manual cancellation is always immediate and terminal.

The canonical rule is:

- once a user or control surface cancels the attempt, the harness must stop creating new provider turns
- in-flight tool or verifier work may finish only long enough to preserve consistent bundle output and termination metadata
- the attempt ends with `cancelled`

Cancellation is not a retryable infrastructure failure. It is an explicit terminal stop reason.

## Terminal outcomes

The Problem 9 attempt may end only in one of these canonical terminal outcomes:

- `success`
- `compile_failed`
- `verifier_failed`
- `budget_exhausted`
- `cancelled`
- `provider_failed`
- `harness_failed`

### `success`

The candidate compiled cleanly, passed the Lean verifier policy, and did so before exhausting any budget ceiling.

### `compile_failed`

Compilation never reached a clean verifier-entry state before the compile-repair ceiling was exhausted.

### `verifier_failed`

The candidate compiled, but the Lean verification policy still rejected it after the verifier-repair ceiling was exhausted.

### `budget_exhausted`

The attempt crossed one of the active budget ceilings:

- `provider_turns`
- `wall_clock`
- `provider_spend`
- `provider_tokens`

The run bundle must record which dimension actually stopped the attempt.

Compile-repair and verifier-repair ceiling hits do not emit `budget_exhausted`. They emit `compile_failed` and `verifier_failed` respectively.

### `cancelled`

The attempt was manually cancelled before it reached another terminal outcome.

### `provider_failed`

The attempt ended because the provider transport or auth path failed in a way the harness classified as terminal for the current run.

### `harness_failed`

The attempt ended because the local harness, tool layer, or worker runtime failed before producing a valid success or policy failure result.

## Deterministic versus retryable stop conditions

The stop-condition policy distinguishes deterministic benchmark failures from retryable outer failures.

### Deterministic terminal conditions

These are deterministic benchmark-side stop conditions. They should not be retried automatically inside the same run once the harness reaches the corresponding terminal outcome:

- compile-repair ceiling exhausted, which emits `compile_failed`
- verifier-repair ceiling exhausted, which emits `verifier_failed`
- hard provider-turn ceiling exhaustion, which emits `budget_exhausted` with exhausted dimension `provider_turns`
- wall-clock ceiling exhaustion, which emits `budget_exhausted` with exhausted dimension `wall_clock`
- provider spend ceiling exhaustion, which emits `budget_exhausted` with exhausted dimension `provider_spend`
- provider token ceiling exhaustion, which emits `budget_exhausted` with exhausted dimension `provider_tokens`
- explicit cancellation, which emits `cancelled`

### Deterministic verifier findings before repair budget exhaustion

Theorem-statement drift, forbidden placeholders, and forbidden-axiom findings are deterministic Lean-policy failures, but they are not immediate terminal outcomes by themselves when verifier-repair budget remains.

The required rule is:

- route those findings into verifier repair while verifier-repair budget remains
- emit `verifier_failed` only after the verifier-repair ceiling is exhausted or when the policy baseline explicitly marks a finding as non-repairable in a later scope decision

This keeps the budget baseline aligned with `problem9-lean-run-strategy-baseline.md`.

### Retryable outer failures

These may justify a new whole-attempt rerun only when an outer retry policy explicitly allows it:

- provider transport failure
- transient rate limit
- local harness crash
- worker interruption

The crucial rule is that outer retries must create a new attempt id. They may not continue spending the exhausted budgets from the previous attempt.

## Required evidence when a budget or stop condition fires

Whenever an attempt stops for any non-success reason, the run bundle must still preserve enough evidence to explain why.

At minimum, `run-bundle.json`, `verification/verdict.json`, or `execution/usage.json` when present must record:

- terminal outcome
- stop reason
- exhausted budget dimension when applicable
- total provider turns used
- compile-repair count used
- verifier-repair count used
- wall-clock runtime at termination
- provider spend estimate when available
- provider token usage when available
- last completed phase before termination
- final candidate digest when a candidate exists

Additional required evidence by outcome:

- for `compile_failed`
  - latest compiler diagnostics and compiler output
- for `verifier_failed`
  - latest verifier output and theorem-drift or axiom findings
- for `budget_exhausted`
  - which budget ceiling fired first
  - the current phase when exhaustion happened
- for `cancelled`
  - cancellation origin when known
  - whether any in-flight verification or tool step was still being finalized

## Preservation of local and future worker semantics

The local/offline harness is the authority for budget semantics. Future worker scheduling must preserve these rules exactly:

- the same ceiling values apply to equivalent run modes unless the baseline is updated explicitly
- worker retries do not grant extra compile or verifier repairs inside an existing attempt
- a hosted worker must emit the same terminal outcomes and exhausted-budget fields as a local run
- queue or lease logic may restart a fresh attempt, but it may not silently continue a stopped attempt under a new worker

This keeps offline results, CI verifier runs, and later hosted worker runs comparable.

## Relationship to other Problem 9 baselines

- `problem9-agent-loop-baseline.md` defines the phase model and retry boundary
- `problem9-lean-run-strategy-baseline.md` defines which Lean-policy failures count as verifier failures
- `problem9-run-bundle-baseline.md` defines where the evidence must be stored

This document is the source of truth for the numeric ceilings and exact terminal stop semantics.

## Out of scope

- public failure-label taxonomy wording from issue `#48`
- queue-level concurrency or lease policy outside the per-attempt budget model
- implementation details of the worker runtime
