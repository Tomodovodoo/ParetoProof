# Problem 9 Agent Loop Baseline

This document defines the MVP agent loop design for the offline `firstproof/Problem9` slice. It fixes the supported run modes, the canonical attempt state machine, and the retry boundary between in-attempt repair turns and whole-attempt reruns.

The goal is to make the worker and local harness semantics explicit before exact numeric budgets, queue scheduling, and backend ingest rules are layered on top.

## Core principles

The Problem 9 loop follows five hard rules:

- the harness owns iteration; providers do not get to hide server-side agent loops or mutable session state from the run record
- one attempt starts from one immutable benchmark package, one prompt package, one model configuration, and one clean writable workspace
- compile and verifier steps are authoritative gates; model output is only a candidate until those gates pass
- in-attempt repair is allowed only inside the bounded harness loop and must stay within the same attempt identity
- whole-attempt reruns must restart from a clean workspace and must not inherit mutable state from a prior failed attempt

This keeps `pass@k`, autonomous repair, and later distributed scheduling aligned to one reproducible attempt model.

## Supported run modes

The MVP loop supports four run modes.

### `single_pass_probe`

`single_pass_probe` is the narrowest mode:

- one provider generation turn
- one compile step
- one verifier step if compile succeeds
- no repair loop

This is the canonical `pass@1` probe mode. It is useful for baseline comparisons and cheap sanity checks, but it is not the default Problem 9 benchmark mode once bounded repair is available.

### `pass_k_probe`

`pass_k_probe` is a wrapper around `single_pass_probe`:

- run `k` independent probe attempts
- each probe starts from the same immutable package and logical prompt package
- no transcript, candidate, or tool-state carryover between probes

This mode exists for `pass@k` measurement. It is not allowed to smuggle in adaptive cross-attempt learning or benchmark-specific hand tuning mid-run.

### `bounded_agentic_attempt`

`bounded_agentic_attempt` is the canonical Problem 9 MVP attempt:

- an initial generation turn creates the first candidate
- compile failures may trigger bounded compile-repair turns
- verifier failures may trigger bounded verifier-repair turns after a clean compile
- the harness may use tools allowed by the selected profile between turns, but all tool actions remain harness-visible and recorded

This is the default mode for the offline benchmark slice because it answers the actual MVP question: what can a bounded, tool-aware harness do on one formal math task reproducibly?

### `benchmark_batch`

`benchmark_batch` is an outer driver mode:

- `benchmark_slice` runs one chosen inner mode over a selected subset of benchmark items
- `full_benchmark` runs one chosen inner mode over the whole benchmark set

`benchmark_batch` is not a different inner attempt semantics. It is only the orchestration layer that repeats the same per-item attempt contract across multiple items.

## Canonical attempt boundary

One attempt is defined by this immutable tuple:

- benchmark package id and digest
- benchmark item id
- lane id
- prompt package digest
- provider family
- auth mode
- model configuration id
- tool profile
- harness revision

Changing any field above creates a new attempt, not a mid-flight mutation.

Within one attempt, the harness may create multiple model turns and multiple intermediate candidate revisions, but they all belong to the same attempt id and the same clean workspace rooted outside the immutable package tree.

## Canonical state machine

Every Problem 9 attempt should follow this logical state machine:

1. `prepared`
2. `generating_initial_candidate`
3. `compiling`
4. `compile_repair`
5. `verifying`
6. `verifier_repair`
7. terminal state

Allowed transitions are:

- `prepared -> generating_initial_candidate`
- `generating_initial_candidate -> compiling`
- `compiling -> verifying` when compilation succeeds cleanly enough for verifier entry
- `compiling -> compile_repair` when compilation fails but repair budget remains
- `compile_repair -> compiling`
- `verifying -> success` when the verifier accepts the candidate
- `verifying -> verifier_repair` when verification fails but repair budget remains
- `verifier_repair -> compiling`

Any state may also transition to a terminal failure for budget exhaustion, cancellation, provider failure, or harness/tool failure.

The important boundary is that verifier repair returns to `compiling`, not directly back to `verifying`, because every repaired candidate must pass authoritative Lean compilation again before a new verifier pass.

## Candidate and repair semantics

The candidate loop is bounded and phase-aware.

### Initial candidate generation

The first model turn should receive the normalized prompt package and produce the first complete candidate artifact for `candidate/Candidate.lean`.

### Compile repair

Compile repair is allowed only after an authoritative compile failure. The repair turn may use:

- the original prompt package
- the latest candidate source
- normalized compiler diagnostics
- allowed tool outputs from the current attempt

Compile repair must not:

- mutate the immutable benchmark package
- switch provider family, auth mode, or model config
- import benchmark-external dependencies from the network

### Verifier repair

Verifier repair is allowed only after a clean compile and a verifier-policy failure. The repair turn may use:

- the original prompt package
- the latest candidate source
- structured verifier findings
- theorem-drift or axiom findings defined by the Lean verification policy

Verifier repair is not allowed to treat a compile failure as a verifier failure. If a repaired candidate no longer compiles, the loop returns to the compile phase and consumes compile-side budget again.

## Retry boundary

The loop must distinguish three different things that are often conflated.

### In-attempt repair

In-attempt repair means additional model turns inside the same attempt id:

- compile repair turns
- verifier repair turns

These are not whole-attempt retries.

### Whole-attempt rerun

A whole-attempt rerun creates a fresh attempt id and restarts from `prepared` with a clean workspace. Whole-attempt reruns are allowed for:

- `pass_k_probe`
- explicit user-requested reruns
- transient provider or harness failures when outer retry policy permits them

Whole-attempt reruns are not allowed to inherit mutable candidate files, transcripts, or tool outputs from a prior failed attempt. They may inherit the same immutable package and prompt package references.

### Control-plane retry

Control-plane retry is the distributed scheduling concept from [run-control-governance-baseline.md](run-control-governance-baseline.md). That outer retry policy may later re-run a worker assignment, but it must preserve the same logical distinction above:

- repair turns stay within one attempt
- scheduler retries create a new attempt or job execution record

## Stop and budget behavior

This document fixes the budget domains and stop semantics. Issue `#145` sets the exact numeric ceilings.

Every bounded agentic attempt must track these independent budget dimensions:

- model-turn budget
- compile-repair budget
- verifier-repair budget
- wall-clock budget
- provider-usage budget
- manual-cancel boundary

Crossing any one of those limits is terminal for the current attempt.

The canonical terminal outcomes are:

- `success`
- `compile_failed`
- `verifier_failed`
- `budget_exhausted`
- `provider_failed`
- `cancelled`
- `harness_failed`

The exact mapping from detailed failure causes into the final public failure taxonomy belongs to issue `#48`, but the loop must already preserve which phase ended the attempt and whether the stop was deterministic, policy-driven, or transient.

## Deterministic versus retryable outcomes

The loop should treat these classes differently.

### Deterministic attempt failures

These end the current attempt without automatic whole-attempt retry:

- compile failure after compile-repair budget is exhausted
- verifier failure after verifier-repair budget is exhausted
- theorem-target drift failure
- forbidden-token findings such as `sorry` or `admit`
- forbidden-axiom findings under the selected lane policy
- unsupported-request failures that come from the chosen run configuration rather than a transient provider problem

### Retryable outer failures

These may justify a new whole-attempt rerun if the outer retry policy allows it:

- transient provider transport failure
- transient rate limiting
- harness crash
- local tool bootstrap failure that is classified as transient
- worker interruption or lease loss in hosted execution

This distinction is critical for later queue policy: deterministic math or policy failures should not be disguised as infrastructure retries.

## Full-harness and benchmark-wide execution

The MVP should use one inner attempt semantics everywhere:

- local trusted runs
- local Docker runs
- future hosted worker runs
- `benchmark_slice`
- `full_benchmark`

The only thing that changes is the outer driver:

- `single_pass_probe` and `bounded_agentic_attempt` are per-item modes
- `pass_k_probe` repeats per-item probes
- `benchmark_batch` repeats a chosen per-item mode across many items

That means "full-harness run" is not an open-ended autonomous research session. It is a repeated application of the same bounded per-item state machine.

## Required evidence in the run bundle

The run bundle defined in [problem9-run-bundle-baseline.md](problem9-run-bundle-baseline.md) must carry enough evidence to reconstruct the loop outcome:

- the final candidate source
- compiler diagnostics and output
- verifier findings and final verdict
- structured event trace when available
- stop reason and terminal state in `run-bundle.json`

Intermediate candidate revisions and full transcripts may remain optional artifacts, but the terminal phase and failure class must always be reconstructible from the required bundle files.

## Downstream implications

This baseline constrains downstream work in specific ways.

### Issue `#145`

Issue `#145` should define the numeric ceilings for:

- max provider turns
- max compile repairs
- max verifier repairs
- max wall-clock time
- max provider spend or token use

It should not reopen the attempt boundary or invent a new phase model.

### Issue `#46`

Issue `#46` should define the authoritative Lean verification gates that decide whether the loop leaves `verifying` as `success`, `verifier_failed`, or `verifier_repair`.

### Issue `#32`

Issue `#32` should build its verdict classes and first metrics set on the terminal outcomes and evidence model above rather than on raw provider strings.

### Issue `#147`

Issue `#147` should derive worker events and terminal payloads from this state machine so claim, heartbeat, event-log, and result messages all describe the same loop phases.

## Out of scope

- exact numeric ceilings for budgets and stop conditions
- final failure taxonomy labels for the public product
- implementation of the worker loop itself
- queue scheduling and lease semantics beyond the retry boundary noted above
