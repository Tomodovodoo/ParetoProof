# Problem 9 Failure Registration Baseline

This document defines the MVP failure-registration baseline for the offline `firstproof/Problem9` slice. It fixes how ParetoProof classifies malformed output, timeout, tool misuse, stuck loops, invalid theorem statements, invalid proofs, and related execution failures before those results are lifted into backend ingest and public reporting.

The goal is simple: a failed run should not collapse into one vague "did not solve it" bucket. The harness must preserve what failed, where it failed, whether retry is valid, and what a contributor or later backend surface is allowed to show to users.

## Scope of failure registration

Failure registration owns:

- the canonical failure classes for Problem 9 attempts
- the difference between terminal attempt failures and retryable outer failures
- the minimum evidence each failure record must preserve
- which failures are safe to expose in user-visible result surfaces
- the boundary between provider errors, harness errors, tool errors, and Lean-verifier failures

Failure registration does not own:

- the numeric ceilings from issue `#145`
- the Lean validation rules from `problem9-lean-run-strategy-baseline.md`
- the provider transport schema from `provider-framework-api-baseline.md`
- backend persistence tables or UI wording

## Core principles

The MVP failure model follows six hard rules:

- every non-successful attempt must register one canonical primary failure code
- the primary failure code must come from the authoritative failing phase, not from a later symptom
- retryability is a separate field, not something inferred ad hoc from free-form error text
- user-visible status may be narrower than internal diagnostics, but it must map back to the same canonical failure record
- compile, theorem, axiom, and proof-policy failures are benchmark failures, not infrastructure noise
- transient provider, tool-bootstrap, and worker-interruption failures must not be silently reported as math failures

## Canonical registration object

Each failed attempt must register one normalized failure object with at least these fields:

- `failureCode`
  - the canonical failure id from this document
- `failureFamily`
  - the broader family that groups related failure codes
- `phase`
  - the authoritative phase where the attempt failed
- `terminality`
  - `terminal_attempt`, `retryable_outer`, or `cancelled`
- `userVisibility`
  - `user_visible`, `user_visible_sanitized`, or `internal_only`
- `retryEligibility`
  - `never`, `outer_retry_allowed`, or `manual_retry_only`
- `evidenceRefs`
  - references to the artifacts or structured fields that justify the failure
- `summary`
  - short repository-owned explanation suitable for logs and later UI mapping

This object belongs in the run bundle and later backend ingest record. It is the canonical answer to "why did this attempt fail?"

## Failure families

The Problem 9 MVP uses seven top-level failure families:

- `provider`
- `harness`
- `tooling`
- `budget`
- `compile`
- `verification`
- `input_contract`

These families are intentionally narrow. They let result views show a stable high-level reason without discarding the more specific failure code.

## Canonical phases

Every registered failure must point at one canonical phase:

- `prepare`
- `generate`
- `tool`
- `compile`
- `verify`
- `finalize`
- `cancel`

The phase is not the same as the family:

- a `provider_timeout` failure belongs to family `provider` and phase `generate`
- a `tool_contract_violation` failure belongs to family `tooling` and phase `tool`
- a `theorem_semantic_mismatch` failure belongs to family `verification` and phase `verify`

## Canonical failure codes

The MVP baseline fixes these primary failure codes.

### Provider failures

- `provider_auth_error`
- `provider_rate_limited`
- `provider_transport_error`
- `provider_timeout`
- `provider_cancelled`
- `provider_refusal`
- `provider_unsupported_request`
- `provider_malformed_response`
- `provider_internal_error`

These codes must align with the provider error model already defined in `provider-framework-api-baseline.md`.

### Harness and tooling failures

- `harness_bootstrap_failed`
- `harness_crashed`
- `harness_output_missing`
- `tool_bootstrap_failed`
- `tool_contract_violation`
- `tool_permission_violation`
- `tool_use_outside_policy`
- `tool_result_missing`
- `stuck_loop_detected`

The key distinction is:

- harness failures come from the repository-owned runner or orchestration layer
- tooling failures come from the configured tool path or from the model misusing that tool boundary

### Budget and cancellation failures

- `wall_clock_budget_exhausted`
- `provider_usage_budget_exhausted`
- `turn_budget_exhausted`
- `compile_repair_budget_exhausted`
- `verifier_repair_budget_exhausted`
- `manual_cancelled`

Budget-exhaustion codes are first-class failures rather than free-text reasons attached to one generic `budget_exhausted` label. The loop baseline may still keep `budget_exhausted` as a terminal outcome family, but result records must preserve which budget actually ended the attempt.

### Compile failures

- `compile_failed`
- `candidate_output_missing`
- `candidate_output_malformed`
- `candidate_file_outside_contract`

`compile_failed` means the candidate entered authoritative Lean compilation and did not compile successfully.

The other three codes are earlier candidate-contract failures:

- no candidate file was produced
- candidate output could not be interpreted as the required file artifact
- candidate tried to write outside the permitted candidate contract

These are not theorem-verification failures because the candidate never reached a valid verifier entry state.

### Verification failures

- `forbidden_placeholder_token`
- `theorem_reference_missing`
- `theorem_surface_drift_only`
- `theorem_semantic_mismatch`
- `extra_theorem_assumptions`
- `wrong_theorem_target`
- `forbidden_axiom_dependency`
- `environment_instability_detected`
- `proof_policy_failed`

The verification family intentionally separates theorem-target failures from proof-policy failures:

- theorem-target failures mean the candidate proved the wrong thing or changed the benchmark task
- proof-policy failures mean the candidate may target the right theorem but violated a benchmark proof rule such as forbidden axioms or incomplete proof placeholders

`theorem_surface_drift_only` is special:

- it records diagnostic drift where semantic equality still holds
- it is not a terminal failing code by itself
- it may appear as a secondary finding alongside `success`

Because the canonical failure object exists only for failed attempts, `theorem_surface_drift_only` must never be used as the primary failure code unless later policy explicitly decides that surface drift is itself disallowed.

### Input-contract failures

- `benchmark_input_missing`
- `benchmark_input_digest_mismatch`
- `lane_configuration_invalid`
- `prompt_package_missing`
- `run_configuration_invalid`

These are repository-side contract failures. They mean the attempt was not launched against a valid, reproducible Problem 9 configuration and therefore cannot produce a benchmark result.

## Primary-failure selection rules

Many failed attempts will have more than one bad symptom. The harness must still choose one canonical primary failure code.

The selection rules are:

1. prefer the earliest authoritative failing gate
2. do not overwrite a more specific policy failure with a later generic symptom
3. preserve secondary findings separately when they help debugging

Examples:

- if the provider returns malformed JSON and no candidate file is written, the primary failure is `provider_malformed_response`, not `candidate_output_missing`
- if a candidate contains `sorry` and also fails theorem equality, the primary failure is `forbidden_placeholder_token` because the proof is already invalid before theorem acceptance matters
- if a candidate cleanly compiles and then uses a forbidden axiom while also showing surface drift, the primary failure is `forbidden_axiom_dependency`; surface drift remains a secondary verifier finding
- if the harness times out while waiting for a compile subprocess, the primary failure is `wall_clock_budget_exhausted` or `harness_crashed` depending on whether the run hit an explicit budget or the harness itself broke

## Recoverable versus terminal split

Failure registration must explicitly separate recoverable and terminal behavior.

### Terminal attempt failures

These failures end the current attempt and should not trigger an automatic whole-attempt retry by default:

- `wall_clock_budget_exhausted`
- `provider_usage_budget_exhausted`
- `turn_budget_exhausted`
- `compile_repair_budget_exhausted`
- `verifier_repair_budget_exhausted`
- `compile_failed`
- `candidate_output_missing`
- `candidate_output_malformed`
- `candidate_file_outside_contract`
- `forbidden_placeholder_token`
- `theorem_reference_missing`
- `theorem_semantic_mismatch`
- `extra_theorem_assumptions`
- `wrong_theorem_target`
- `forbidden_axiom_dependency`
- `proof_policy_failed`
- `provider_unsupported_request`
- `provider_malformed_response`
- `tool_permission_violation`
- `tool_use_outside_policy`
- `benchmark_input_digest_mismatch`
- `lane_configuration_invalid`
- `run_configuration_invalid`

These are deterministic failures under the chosen configuration. Retrying them as though they were transient infrastructure noise would misrepresent benchmark behavior.

### Retryable outer failures

These may justify a new whole-attempt rerun if outer policy allows it:

- `provider_rate_limited`
- `provider_transport_error`
- `provider_timeout`
- `provider_internal_error`
- `harness_bootstrap_failed`
- `harness_crashed`
- `harness_output_missing`
- `tool_bootstrap_failed`
- `tool_result_missing`
- `stuck_loop_detected`
- `benchmark_input_missing`
- `prompt_package_missing`

These failures still fail the current attempt, but they are not reliable evidence that the model or benchmark candidate itself was mathematically wrong.

### Manual retry only

These failures should default to manual retry rather than automatic retry:

- `provider_auth_error`
- `provider_refusal`
- `tool_contract_violation`
- `environment_instability_detected`
- `provider_cancelled`

They may be recoverable after human intervention or configuration repair, but they are too ambiguous for blind automatic reruns.

### Cancelled outcomes

- `manual_cancelled`

Cancellation is not a success and not a benchmark pass. It should remain distinct from both deterministic failure and retryable infrastructure failure.

## User-visible result policy

The public and contributor-facing product should not expose raw internal failure detail indiscriminately. The failure record therefore needs a stable visibility class.

### Fully user-visible

These failures are safe to expose directly with repository-owned wording:

- compile failures
- theorem-target failures
- forbidden placeholder token failures
- forbidden axiom failures
- budget exhaustion failures
- manual cancellation

These reflect benchmark-relevant facts and do not reveal secrets or sensitive infrastructure detail.

### User-visible but sanitized

These may be shown to users only through sanitized wording:

- provider errors
- harness crashes
- tool bootstrap failures
- environment instability
- prompt or benchmark input missing

The user-visible wording should say things like:

- "provider execution failed"
- "worker environment failed"
- "run input was incomplete"

It should not dump raw provider payloads, internal stack traces, secret names, or host paths.

### Internal only

The raw details behind these failures stay internal:

- secret lookup paths
- host-specific environment metadata
- raw provider error bodies when they may contain sensitive request metadata
- internal stack traces
- tool transcript segments that leak privileged filesystem or host detail

The normalized failure code may still be user-visible through a sanitized label, but the detailed evidence is not.

## Required evidence per family

Each failure record must point to concrete evidence. At minimum:

### Provider

- normalized provider error class
- provider stop reason or transport status when available
- provider request and response fingerprints

### Harness and tooling

- harness event trace or tool event trace
- subprocess exit data or timeout marker when available
- enough log reference to distinguish harness failure from tool misuse

### Budget and cancellation

- the budget counter or deadline that was crossed
- the final observed value at the time of stop
- whether the stop was automatic or user-initiated

### Compile

- `verification/compiler-output.txt`
- `verification/compiler-diagnostics.json`
- candidate artifact presence or absence

### Verification

- `verification/verifier-output.json`
- `verification/verdict.json`
- theorem comparison and axiom findings as applicable

### Input contract

- the missing or mismatched config artifact reference
- the digest or version field that failed validation

## Relationship to run outcomes

The loop baseline already defines the high-level terminal outcomes:

- `success`
- `compile_failed`
- `verifier_failed`
- `budget_exhausted`
- `provider_failed`
- `cancelled`
- `harness_failed`

This document refines those outcomes into failure-registration detail:

- `compile_failed` maps to the compile-family failure codes
- `verifier_failed` maps to theorem, placeholder-token, axiom, and proof-policy failure codes
- `budget_exhausted` maps to the specific exhausted budget code
- `provider_failed` maps to the normalized provider failure codes
- `harness_failed` maps to harness, tooling, or input-contract failures depending on the actual cause

The high-level outcome remains useful for dashboards. The failure code is the authoritative explanation.

## Malformed output and invalid-proof policy

Two common ambiguous cases need explicit treatment.

### Malformed output

Malformed output means the model did not produce a valid candidate artifact that the harness can interpret under the current output contract.

Use:

- `candidate_output_missing` when no candidate artifact exists
- `candidate_output_malformed` when content exists but cannot be interpreted as the required candidate file
- `provider_malformed_response` when the malformed condition originates at the provider boundary before candidate extraction

Malformed output is not the same as an invalid proof. The harness must not conflate "could not parse the output artifact" with "parsed candidate failed Lean validation."

### Invalid proof

Invalid proof means a candidate reached authoritative Lean validation and failed benchmark proof policy.

Use:

- `compile_failed` when Lean compilation itself fails
- `forbidden_placeholder_token` for `sorry` or `admit`
- `theorem_semantic_mismatch`, `extra_theorem_assumptions`, or `wrong_theorem_target` for theorem-target failures
- `forbidden_axiom_dependency` or `proof_policy_failed` for proof-policy failures after compile

This distinction is essential for later result views and leaderboard reasoning. "No valid candidate produced" and "candidate produced but failed theorem validation" are materially different outcomes.

## Downstream implications

This baseline constrains later work:

### Issue `#32`

Backend evaluation and metric work should group results by the failure families and primary codes above instead of inventing a second taxonomy.

### Issue `#145`

Budget-policy work should reuse the specific budget exhaustion codes from this document rather than collapsing everything into a generic stop reason.

### Issue `#147`

Worker-control and ingest contracts should preserve both high-level terminal outcome and canonical failure code so offline and hosted runs remain comparable.

## Out of scope

- final UI copy or localization
- backend schema names
- automatic retry quotas
- implementation of the verifier, provider adapter, or worker harness
