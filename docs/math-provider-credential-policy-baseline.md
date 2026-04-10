# Math Provider Credential Policy Baseline

This document defines how provider credentials are owned and used for math launches on `math.paretoproof.com`.

The goal is to make hosted, local connected, and offline launch posture explicit before launch UI and bootstrap services start carrying hidden assumptions about where provider secrets live.

## Current baseline

- `docs/math-surface-activation-baseline.md` accepts `math.paretoproof.com` as the authenticated home for question-centric launch entry.
- `docs/web-surface-policy.md` keeps raw provider secret vending out of browser surfaces by default.
- `docs/runtime.md` already separates browser env from worker machine credentials and keeps trusted-local auth host-local.
- `docs/hosted-worker-provider-capability-baseline.md` already defines the current hosted capability matrix as `openai` plus `machine_api_key` with operator-managed `CODEX_API_KEY`.
- `apps/worker` already distinguishes local auth modes `trusted_local_user`, `machine_api_key`, and `local_stub`, while hosted execution accepts only `machine_api_key`.

The missing decision is not whether credentials exist. The missing decision is which launch modes may use which credential owners, and where those credentials may exist.

## Decision

ParetoProof should use a strict ownership split for math launch credential posture.

The accepted baseline is:

- hosted launches use platform-managed provider credentials only
- local connected launches may use BYO credentials only on the local runner host
- offline export is credential-agnostic from the product perspective
- browser surfaces must not accept, store, echo, or vend raw provider secrets
- any future stored-BYO credential model is deferred until a later dedicated scope approves storage, encryption, rotation, revocation, and audit posture

This is a credential-ownership decision, not approval to broaden the current hosted provider matrix beyond what the worker/runtime baselines already verify.

## Canonical launch-mode matrix

| Launch mode | Credential owner | Where credential may exist | Browser may see raw secret | Current status |
| --- | --- | --- | --- | --- |
| Hosted | platform-managed | operator-managed hosted secret store and worker runtime env only | no | approved |
| Local connected with trusted local auth | end user on the runner machine | local runner host only | no | approved |
| Local connected with local machine API key | end user or operator on the runner machine | local runner host env only | no | approved |
| Offline export | none in product | outside ParetoProof after export | no | approved |
| Stored BYO credential vault | user-owned but platform-stored | not approved yet | no | deferred |

## Hosted launch policy

Hosted launches are platform-managed.

That means:

- the hosted credential owner is ParetoProof, not the browser user
- hosted provider secrets live only in operator-managed hosted secret stores and worker runtime env
- browser and contributor sessions may request hosted launches, but they may not supply raw hosted provider secrets
- math launch UI must not ask for provider API keys, OAuth access tokens, or equivalent raw provider secrets for hosted execution

For the currently supported hosted path, this aligns with the existing hosted worker baseline:

- provider family: `openai`
- hosted auth mode: `machine_api_key`
- hosted secret: operator-managed `CODEX_API_KEY`

Hosted math launch does not approve:

- pasted provider API keys in browser forms
- uploaded provider token files
- browser-to-API passthrough of raw provider credentials
- treating contributor-local auth state as a hosted credential source

## Local connected launch policy

Local connected launch is allowed to use BYO credentials, but only on the runner host.

That means:

- the math surface may initiate local connected launch and issue control-plane bootstrap metadata or short-lived bootstrap sessions
- the actual provider credential must be resolved locally by the runner on the machine that performs execution
- the browser may choose local connected launch mode, but it must not carry the raw provider secret needed for that mode

The currently accepted local connected postures are the same ones the worker runtime already supports locally:

- `trusted_local_user`
- `machine_api_key`

### `trusted_local_user`

`trusted_local_user` remains a host-local path tied to:

- a readable local `CODEX_HOME/auth.json`
- successful `codex login status`
- the existing trusted-local devbox mount contract when the devbox wrapper is used

This auth material must remain host-local. It must not be uploaded into math, stored by the API, or replayed into hosted workers.

### `machine_api_key`

`machine_api_key` is also allowed for local connected launch, but only when the key is supplied on the runner host.

That means:

- the local machine or launcher process may read a local `CODEX_API_KEY`
- the browser and control plane may know that the run is using the `machine_api_key` posture
- the browser and control plane must not receive the raw key value

## Offline export policy

Offline export is credential-agnostic from the product perspective.

That means:

- ParetoProof may export benchmark/package/prompt/bootstrap material needed to run outside the product
- the export must not include provider secrets
- the product does not need to know which provider secret the user later chooses outside the system

Offline export therefore differs from both hosted and local connected launch:

- hosted uses a platform-managed credential inside ParetoProof's hosted environment
- local connected uses a user- or operator-managed credential on the runner host
- offline export leaves provider auth entirely outside the product boundary

## Stored BYO credential policy

Stored BYO provider credentials are not approved by this baseline.

That means ParetoProof does not currently approve:

- encrypted storage of user-supplied provider API keys in the control plane
- browser flows that save provider credentials for later hosted launch reuse
- contributor settings pages that collect provider keys for server-side execution
- any “temporary” credential vault added before a dedicated credential-storage scope exists

If the product later wants stored-BYO credentials, that must be a separate scope with explicit decisions for:

- storage model
- encryption posture
- secret-access controls
- revocation and rotation
- audit evidence
- UX consent and delete behavior

## Browser boundary

The browser boundary is strict.

Math browser surfaces must not:

- accept raw provider secrets for hosted launch
- persist raw provider secrets in local storage, cookies, or form-draft state
- echo raw provider secrets in errors, support payloads, or preview summaries
- receive platform-managed provider secrets from the API

This applies both to obvious inputs and disguised ones. The same rule covers:

- API keys
- OAuth access tokens
- refresh tokens
- credential blobs
- provider secret files

The browser may carry launch posture metadata such as:

- launch mode
- provider family
- auth posture label
- question or submission context

It may not carry the raw provider secret itself.

## Unsupported combinations

Unsupported combinations must fail closed.

Examples:

- hosted launch with user-supplied provider API key
- hosted launch with `trusted_local_user`
- hosted launch with `machine_oauth`
- hosted launch with unsupported provider family
- local bootstrap request that tries to embed a provider secret for the runner
- offline export request that tries to include provider secret material

These are contract violations, not optional warnings or soft fallbacks.

## Relationship to current worker auth modes

This policy does not change the current worker auth model. It clarifies how math launch should use it.

### `machine_api_key`

- allowed for hosted launch when it is platform-managed
- allowed for local connected launch when the key is runner-host-local
- not allowed as raw secret material in browser payloads

### `trusted_local_user`

- allowed for local connected launch only
- not allowed for hosted launch
- not allowed to enter the control plane as stored secret material

### `local_stub`

- remains a local deterministic verification path
- not a hosted provider integration
- not a production math launch credential posture

### `machine_oauth`

- not approved for hosted launch by the current hosted worker capability baseline
- not approved by this math credential baseline either
- requires a later dedicated scope if the product ever wants to support it

## Relationship to other baselines

This document complements rather than replaces:

- `docs/math-surface-activation-baseline.md`
- `docs/web-surface-policy.md`
- `docs/runtime.md`
- `docs/hosted-worker-provider-capability-baseline.md`

The intended split is:

- math surface baseline says which product surface owns question-centric launch entry
- hosted provider capability baseline says which hosted provider combinations are actually supported
- this baseline says who owns the credential in each math launch mode and where that credential may exist

## Follow-up execution work

This baseline should drive later execution work, not be re-decided by it.

Follow-up implementation should:

1. expose the approved credential posture in math launch read models and UX
2. reject secret-bearing browser payloads on math launch and bootstrap routes
3. keep local connected bootstrap credential-free from the browser perspective
4. keep hosted launch platform-managed only unless a later scope explicitly expands that boundary
5. add regression coverage for forbidden secret-vending and unsupported auth paths

## Non-goals

This baseline does not:

- implement encrypted credential storage
- implement provider adapters
- redefine worker bootstrap or per-job token policy outside the math launch context
- broaden hosted provider support beyond the current verified matrix
- approve browser-side collection of raw provider credentials for hosted use
