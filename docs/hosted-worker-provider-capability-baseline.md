# Hosted Worker Provider Capability Baseline

This document defines the truthful hosted-provider capability matrix for ParetoProof.

The goal is to stop hosted execution from implying support for provider families, auth modes, or credential postures that the repository does not actually verify today.

## Decision

ParetoProof should treat hosted provider support as an explicit allowlist, not as an open-ended abstraction.

For the current hosted Problem 9 slice, the accepted provider matrix is:

- supported provider family: `openai`
- supported hosted auth mode: `machine_api_key`
- supported hosted runtime credential: operator-managed `CODEX_API_KEY`
- unsupported hosted auth modes: `trusted_local_user`, `local_stub`, `machine_oauth`
- unsupported hosted provider families: every non-`openai` family unless a later scope explicitly adds one

If a launch, worker config, or runtime request falls outside that matrix, the system should reject it before hosted execution starts.

## Why the explicit matrix is necessary

The repository already exposes several related concepts:

- a general `providerFamily` field on run, attempt, prompt-package, and worker-control objects
- local auth modes `trusted_local_user`, `machine_api_key`, and `local_stub`
- a hosted claim-loop path that uses `machine_api_key`
- runtime env examples that include `CODEX_API_KEY`

Those pieces can make the platform look broader than it really is.

The actual verified hosted path today is narrower:

- shared hosted auth exports allow only `machine_api_key`
- shared provider-family exports allow only `openai`
- worker docs state that hosted Problem 9 execution currently supports only provider family `openai`
- worker CLI and runtime tests reject unsupported hosted auth-mode inputs

This scope makes that narrower truth authoritative instead of leaving it spread across code and tests.

## Canonical hosted provider matrix

### Supported today

| Provider family | Hosted auth mode | Hosted support status | Credential owner | Notes |
| --- | --- | --- | --- | --- |
| `openai` | `machine_api_key` | supported | operator-owned environment secret | current hosted claim-loop contract |

### Explicitly unsupported today

| Provider family | Auth mode | Hosted status | Reason |
| --- | --- | --- | --- |
| `openai` | `trusted_local_user` | unsupported | trusted-local Codex auth is a host-user path and must not enter hosted workers |
| `openai` | `local_stub` | unsupported | deterministic stub mode is a local/offline verification path, not a hosted provider integration |
| `openai` | `machine_oauth` | unsupported | no hosted machine OAuth contract, token owner, or refresh ceremony exists yet |
| any non-`openai` family | any hosted auth mode | unsupported | no accepted provider adapter, credential contract, or verified hosted runtime path exists yet |

Unsupported means fail closed, not "try it and see."

## Supported hosted capability contract

The accepted hosted capability surface for `openai` plus `machine_api_key` is:

- queueable through the hosted worker claim loop
- prompt-package materialization with `providerFamily: openai`
- model config ids that use the `openai/` prefix required by the shared contract
- execution through the current worker runner using `CODEX_API_KEY`
- result, artifact, and failure reporting through the internal worker API

The current hosted slice does not imply support for:

- provider-specific tool APIs beyond what the existing worker runtime already uses
- provider-specific file storage or upload channels
- provider-specific login or token refresh inside the worker
- human-owned provider sessions mounted into Modal

Hosted support is defined by the repository-owned worker and control-plane path, not by whether a provider happens to be conceptually capable of solving math tasks.

## Credential ownership decision

Hosted provider credentials are operator-owned machine secrets.

That means:

- they belong to ParetoProof's hosted environment and pool configuration
- they are injected into hosted worker apps as environment-scoped secrets
- they are not contributed by end users, browsers, or contributor sessions
- they are not recovered from trusted-local `CODEX_HOME/auth.json`

For the currently supported hosted provider path, the operator-owned secret is `CODEX_API_KEY`.

## Ownership boundary

The ownership split is strict:

- operators own hosted provider credentials
- workers may use hosted provider credentials only after the control plane has already admitted them into the correct environment and pool
- contributors may request launches, but they do not choose or supply raw hosted provider secrets
- the portal must not become a passthrough for uploading provider API keys into hosted execution

This keeps hosted execution reproducible and auditable. A run should be attributable to one approved hosted credential posture, not to a random browser session or developer machine.

## Relationship to worker identity and bootstrap credentials

Hosted workers therefore hold two distinct secret classes:

- bootstrap credentials that prove worker and pool identity to the control plane
- hosted provider credentials that allow the admitted worker to talk to the supported model provider

Those secret classes must stay separate.

The bootstrap credential does not authorize provider access, and the provider credential does not authorize job claim or lease mutation by itself.

That separation matters during incident response:

- a bootstrap rotation handles claim identity
- a provider-key rotation handles model-provider access
- neither should silently substitute for the other

## Hosted auth-mode boundary

### `machine_api_key`

`machine_api_key` is the only accepted hosted auth mode today.

It is accepted because:

- it matches the current worker runtime env validation
- it matches the hosted claim-loop docs and tests
- it keeps credential ownership with the operator-controlled hosted environment
- it avoids human login state inside Modal

### `trusted_local_user`

`trusted_local_user` is not a hosted mode.

It is explicitly a trusted-local path tied to:

- a readable host-side `CODEX_HOME/auth.json`
- successful `codex login status`
- the trusted-local devbox mount contract

Hosted workers must reject this path instead of trying to emulate it.

### `local_stub`

`local_stub` is also not a hosted mode.

It exists for:

- deterministic local dry runs
- fixture generation
- smoke and regression verification without paid provider traffic

It should not be treated as a hosted provider family or as a production execution fallback.

### `machine_oauth`

`machine_oauth` is not supported in hosted execution today.

Even if a provider later supports machine OAuth, ParetoProof does not yet have an accepted contract for:

- token issuance owner
- refresh flow
- revocation evidence
- secret storage shape
- runtime failure semantics

Until those decisions exist, `machine_oauth` remains out of bounds for hosted execution.

## Provider-family boundary

`openai` is the only hosted provider family currently in scope.

Every other provider family is unsupported until all of these exist:

- a documented provider family in the shared execution contracts
- a worker runtime implementation that actually executes that family
- an accepted hosted credential ownership story
- startup validation and regression coverage for success and failure paths
- a clear operator rotation and incident posture for that provider secret class

This prevents the project from accidentally treating a string enum expansion as real support.

## Launch validation consequences

Hosted launch and claim validation should reject work that does not fit the matrix above.

Examples that must fail closed:

- hosted launch targeting `providerFamily: anthropic`
- hosted launch targeting `authMode: trusted_local_user`
- hosted launch targeting `authMode: machine_oauth`
- worker claim path receiving a prompt package with non-`openai` provider metadata
- model config ids that do not match the required `openai/` prefix for hosted `machine_api_key`

Those are launch-contract violations, not soft warnings.

## Worker startup consequences

Hosted worker startup should validate the provider posture before claiming work.

For the current supported hosted path, that means:

- `CODEX_API_KEY` is required
- trusted-local mount markers must be absent
- the worker should not advertise unsupported hosted auth modes
- the worker should not continue with a provider-family configuration it cannot execute

The worker should fail before claiming if its provider credential posture is invalid or incomplete.

## Artifact and evidence consequences

Because hosted provider credentials are operator-owned secrets:

- they must never appear in worker artifacts, logs, or run evidence
- provider error reporting should be classified without leaking raw secrets or secret-derived payloads
- supportability bundles and incident exports must redact provider credential material

Hosted provider capability is not only about successful execution. It also has to stay safe on failure.

## Operator rotation posture

Hosted provider credential rotation is an operator ceremony separate from bootstrap-token rotation.

For the current supported provider path, that means:

1. issue or obtain the replacement hosted `CODEX_API_KEY`
2. update the target Modal environment secret for the intended pool apps
3. roll workers onto the replacement secret boundary
4. verify claims and provider-backed attempts succeed on the replacement posture
5. revoke the old provider key according to the provider-side control
6. record rotation evidence in operator-facing audit or release surfaces

Future provider families may need different secret shapes, but they must still fit the same operator-owned rotation posture.

## Failure classification posture

Provider capability policy should map unsupported combinations into clear failure classes rather than vague runtime crashes.

The system should distinguish:

- unsupported provider family
- unsupported hosted auth mode
- missing operator-owned provider credential
- provider auth error for an otherwise supported family
- provider timeout or transport failure
- provider refusal or malformed response

That distinction is necessary for launch rejection, worker startup validation, incident triage, and future public-safe reporting.

## Relationship to other scopes

This provider baseline depends on and complements the surrounding hosted-worker scopes:

- `#917` fixes where hosted worker apps and secrets live
- `#918` fixes worker identity plus bootstrap-token and job-token ownership
- `#920` will define rollout and release evidence for image and secret promotion
- `#922` will define lifecycle and recovery behavior around claim, heartbeat, and lease loss
- `#929` will define the exact network egress posture for the provider endpoints hosted workers may contact

This scope does not redefine those boundaries. It fixes which provider families and auth modes are actually allowed inside them.

## Consequences for follow-up execution

This baseline should directly guide later implementation:

- `#911` should inject only the supported hosted provider secret class for the accepted provider family
- `#912` should make real hosted attempts fail closed when run metadata requests an unsupported family or auth mode
- `#934` should encode the canonical provider capability matrix in worker and launch validation instead of leaving it as route-local checks
- `#942` should add regression coverage for secret redaction and provider/auth-mode rejection paths

## Out of scope

This scope does not:

- implement additional provider adapters
- define local connected credential policy outside hosted execution
- define provider-specific pricing, quotas, or budget policy
- define network allowlists in detail

It defines the hosted provider-family, auth-mode, and credential-ownership contract that later execution work must honor.
