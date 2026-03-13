# Provider Framework API Baseline

This document defines the MVP provider framework API for ParetoProof worker and local harness execution. The goal is to put Codex and Aristotle behind the same harness boundary while still leaving a clean path for OpenAI, Anthropic, Google, Axle, and later model backends.

The provider framework is not the benchmark protocol itself. It is the adapter boundary between the run harness and an upstream model backend.

## Scope of the framework

The provider framework owns:

- normalized request and response objects between the harness and a model backend
- provider identity, model identity, auth mode, and capability metadata
- tool-call and tool-result translation where a provider supports tool use
- provider-specific escape hatches that cannot be expressed in the narrow shared core
- stable error classes that the harness can map into retry and failure policy

The provider framework does not own:

- benchmark package structure
- prompt-layer construction rules
- verifier semantics
- queue scheduling
- artifact retention

Those concerns are defined in the other Problem 9 baselines and are inputs to the provider adapter, not fields the provider gets to reinterpret.

## Required provider set

The framework must recognize these provider families:

- `openai`
- `anthropic`
- `google`
- `axle`
- `aristotle`
- `custom`

For the offline Problem 9 MVP, the launch-critical providers are narrower:

- `openai`
  - required because trusted local Codex-style execution and future machine-auth OpenAI runs must share one adapter family
- `aristotle`
  - required because the Problem 9 slice explicitly expects Aristotle compatibility in the trusted local devbox path

The framework must have first-class shapes for `anthropic`, `google`, and `axle`, but those families are not required merge-gate providers for the first offline Problem 9 slice. They should fit the same API without forcing the MVP harness to implement every transport immediately.

## Provider id and auth-mode split

Provider family and auth mode must be separate fields.

The canonical provider identifiers are:

- `openai`
- `anthropic`
- `google`
- `axle`
- `aristotle`
- `custom`

The canonical auth modes are:

- `trusted_local_user`
  - human-authenticated local runtime such as Codex CLI on a contributor devbox
- `machine_api_key`
  - normal non-interactive provider API key
- `machine_oauth`
  - non-interactive OAuth or service-account flow
- `local_stub`
  - deterministic local fake provider for tests and fixture generation

This split matters because `openai` with `trusted_local_user` is not the same operational contract as `openai` with `machine_api_key`, even if they map to the same model family.

## Provider maturity tiers

The framework should treat the provider families in three tiers.

### Tier 1: required MVP adapters

- `openai` with:
  - `trusted_local_user` for local Codex-style runs in the Problem 9 devbox
  - `machine_api_key` for canonical non-interactive execution later
- `aristotle` with:
  - `trusted_local_user` or local adapter-managed auth inside the Problem 9 devbox

### Tier 2: first-class but not launch-critical

- `anthropic` with `machine_api_key`
- `google` with `machine_api_key` or `machine_oauth`
- `axle` with the machine-auth mode its service requires

### Tier 3: future families

- `custom`
  - for repository-owned adapters that still map into the normalized request and response shape

The framework should not special-case "Codex" as a separate provider family. Codex is an OpenAI-family execution mode that uses a different auth and runtime path.

## Run-entry assumptions

Every provider call must start from one immutable run entry object created by the harness. The provider adapter receives:

- `runId`
- `attemptId`
- `benchmarkPackageId`
- `benchmarkPackageDigest`
- `benchmarkItemId`
- `laneId`
- `modelConfigId`
- `providerFamily`
- `authMode`
- `toolProfile`
- `promptPackageDigest`
- `workingDirectoryPolicy`
- `budget`
- `input`

The run entry is the harness-owned truth. A provider adapter may derive vendor-specific transport fields from it, but it must not mutate benchmark identity, lane identity, or budget semantics.

The `input` section should be one of two normalized shapes:

- `single_turn`
  - one complete request with no expected provider-managed conversation state
- `agent_turn`
  - one turn in a harness-owned agent loop with prior transcript and tool results included explicitly

The MVP framework should assume the harness, not the provider, owns iteration. Even when a provider offers server-side sessions or tool loops, the canonical ParetoProof execution state stays harness-owned and reproducible.

## Normalized request object

The normalized request object must be narrow enough that every supported provider can implement it.

At minimum it must include:

- identity:
  - `runId`
  - `attemptId`
  - `providerFamily`
  - `authMode`
  - `modelConfigId`
- execution mode:
  - `requestKind`: `single_turn` or `agent_turn`
  - `toolProfile`
  - `toolCallMode`: `none`, `provider_native`, or `harness_only`
- prompt material:
  - `systemPrompt`
  - `messages`
  - `attachments` when the benchmark later supports non-text inputs
- benchmark context:
  - `benchmarkPackageDigest`
  - `benchmarkItemId`
  - `laneId`
  - `promptPackageDigest`
- budget and limits:
  - `timeoutMs`
  - `maxOutputTokens` when applicable
  - `maxToolCalls`
  - `maxContextBytes`
- tool declarations:
  - normalized tool specs and allowed tool ids when tools are in scope
- provider options:
  - structured escape hatch map described below

`systemPrompt` is the only canonical home for system-layer instructions at the provider boundary. The `messages` array must not contain a second `system` message slot, because that would create ambiguous transport precedence across providers with different system-prompt models.

The `messages` field should use one shared role model:

- `user`
- `assistant`
- `tool`

Any provider that uses a different transport shape must translate to and from this normalized message model internally.

## Normalized response object

Every adapter call must return one normalized response object. At minimum it must include:

- identity:
  - `runId`
  - `attemptId`
  - `providerFamily`
  - `modelId`
- outcome:
  - `stopReason`
  - `status`: `completed`, `incomplete`, or `failed`
  - `errorClass` when `status=failed`
- generated content:
  - `assistantMessage`
  - `toolCalls`
  - `providerTranscriptDelta`
- accounting:
  - `usage`
  - `latencyMs`
- reproducibility:
  - `providerRequestFingerprint`
  - `providerResponseFingerprint` when available
  - `providerMetadata`

The normalized `stopReason` enum should be:

- `completed`
- `max_output`
- `tool_call_requested`
- `timeout`
- `provider_cancelled`
- `provider_refusal`
- `transport_error`
- `rate_limited`
- `auth_error`
- `unsupported_request`

This lets the harness map provider outcomes into retry policy without parsing vendor-specific strings.

When `status=failed`, `errorClass` must carry one of the shared provider error ids from the error model below rather than hiding that classification inside provider metadata.

## Tool-call boundary

The framework must support three tool modes:

- `none`
  - the provider receives no tool schema and cannot request tools
- `provider_native`
  - the provider can emit native tool-call requests that the adapter normalizes
- `harness_only`
  - the harness gives the model prior tool results in messages, but the provider transport itself is plain text only

The adapter must never hide provider-side tool execution from the harness. If the provider requests a tool, the request must come back to the harness as a normalized tool-call record before execution continues.

## Provider-specific escape hatches

The shared API must allow a small structured escape hatch for fields that do not fit the common core. The escape hatch should be:

- namespaced by provider family
- explicit in configuration and result metadata
- non-authoritative for benchmark identity, run identity, or policy fields

Allowed escape-hatch categories:

- sampling knobs not shared by every provider
- provider-native reasoning or effort settings
- provider-native safety toggles that do not change benchmark semantics
- service-tier selection
- provider-specific session resumption tokens when they are recorded back into result metadata

Disallowed escape hatches:

- mutating benchmark package identity
- mutating lane id
- mutating tool-permission policy
- bypassing harness budget accounting
- embedding hidden benchmark answers or verifier labels

The rule is simple: escape hatches may tune the transport, but they may not redefine the benchmark contract.

## Error model

Every adapter must map failures into one shared error class set:

- `provider_auth_error`
- `provider_rate_limited`
- `provider_transport_error`
- `provider_timeout`
- `provider_cancelled`
- `provider_refusal`
- `provider_unsupported_request`
- `provider_malformed_response`
- `provider_tool_contract_error`
- `provider_internal_error`

These error ids should be the only provider-level failure categories the harness needs for retry and run-governance decisions. Vendor-specific codes can still be preserved inside `providerMetadata`.

## Model configuration boundary

The adapter must treat model configuration as a repository-owned object, not as an ad hoc per-call string.

Each `modelConfigId` should resolve to:

- `providerFamily`
- upstream model id
- auth mode constraints
- default token/output limits
- default sampling settings
- supported tool modes
- supported attachment modes
- required escape-hatch keys if any

The provider adapter may validate that the resolved configuration is compatible with the selected run, but it should not silently substitute another model or auth mode.

## Canonical assumptions for Codex and Aristotle

The framework must make these two paths fit the same shape:

### OpenAI / Codex-style local trusted path

- provider family: `openai`
- auth mode: `trusted_local_user`
- runtime location: Problem 9 devbox only
- canonical use:
  - trusted contributor experiments
  - local benchmark dry runs
  - non-canonical exploratory attempts before a machine-auth rerun

This path is allowed in MVP, but it is not the authoritative non-interactive benchmark-verdict path for hosted execution.

### Aristotle path

- provider family: `aristotle`
- auth mode:
  - `trusted_local_user` in MVP local workflows
  - later machine-auth mode if Aristotle supports one cleanly
- runtime location:
  - Problem 9 devbox for MVP

The important boundary is that Aristotle still receives the same normalized run entry and returns the same normalized response object as OpenAI-family runs.

## Compatibility rule for future providers

Any future provider backend may be added only if it can satisfy:

- the normalized request object
- the normalized response object
- the shared error model
- explicit auth-mode declaration
- explicit escape-hatch declaration

If a provider cannot fit those constraints, it should be treated as a different harness mode rather than smuggled into the provider framework under undefined behavior.

## Out of scope

- final agent-loop budgeting and retry policy from issue `#44`
- Lean-specific verification policy from issue `#46`
- final model registry schema from issue `#47`
- implementation of the adapters themselves
