# Worker Secret Injection Baseline

This document defines how the same ParetoProof worker image stays portable between trusted local runs and hosted Modal execution without ever baking provider or platform credentials into the image.

## Policy summary

- the worker and devbox images stay secret-free; all credentials arrive only at runtime
- local Docker runs and Modal-hosted runs use the same runtime variable names whenever they represent the same capability
- trusted local user auth is allowed only on a contributor-controlled machine and never through Modal Secrets or other hosted runtime stores
- hosted or other non-interactive execution must use machine auth such as `CODEX_API_KEY`, not ChatGPT-managed or human-session credentials
- provider, artifact, and internal-API credentials stay split into separate capability bundles instead of one omnibus secret set

## Canonical injection mechanisms

The supported injection mechanisms differ by secret shape, not by image.

### Local Docker and devbox runs

Use these inputs on a trusted contributor machine:

- scalar runtime variables:
  - local shell environment
  - `apps/worker/.env`
  - `docker run --env-file ...` or the equivalent compose `env_file`
- file-shaped or session-shaped local-only credentials:
  - read-only bind mounts
  - Docker secrets mounted at runtime

The worker image must not assume a workstation-specific source path. The local wrapper chooses the host path or secret mount, and the container sees only the mounted runtime location.

### Modal-hosted runs

Use these inputs in hosted execution:

- named Modal Secret objects for runtime credentials
- non-secret runtime config such as `API_BASE_URL` through Modal app configuration or equivalent deploy-time environment settings

Hosted workers must never receive trusted local user auth material, local `auth.json`, or other ChatGPT-managed session state through Modal Secrets.

## Runtime variable contract

The current stable runtime variable set is:

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`

The current approved machine-auth provider variable is:

- `CODEX_API_KEY`
  - OpenAI-family machine-auth execution only
  - valid for local non-interactive reruns and hosted worker execution
  - not used for trusted local user-authenticated Codex runs

The current reserved later-scope runtime variables are:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

No trusted-local Codex session credential should be represented as a worker runtime variable. That path stays file-mounted or host-session-managed on a trusted local machine only.

## Trusted local Codex path

The trusted local Codex path is:

- provider family: `openai`
- auth mode: `trusted_local_user`
- allowed runtime: local devbox or local Docker on a trusted contributor machine

The exact host-path, mount-path, and preflight contract for this path is defined in [codex-trusted-local-auth-baseline.md](codex-trusted-local-auth-baseline.md).

The hard rule is:

- keep Codex `auth.json` and any ChatGPT-managed session material on the host
- mount or expose that material to the local runtime only at execution time
- never copy it into the image, repository, build cache, Modal Secret, or CI artifact

If that local trusted auth material is absent, the trusted-local Codex path is unavailable. The worker should not silently fall back to a hosted or machine-auth path with different semantics.

## Machine-auth path

Hosted or other non-interactive execution must use machine auth.

For the current OpenAI-family path, that means:

- auth mode: `machine_api_key`
- runtime variable: `CODEX_API_KEY`
- local injection:
  - local shell or `apps/worker/.env` for trusted machine-owned reruns
  - optional Docker secret or `--env-file` for local container execution
- Modal injection:
  - provider-specific Modal Secret objects:
    - `paretoproof-worker-openai-dev`
    - `paretoproof-worker-openai-staging`
    - `paretoproof-worker-openai-production`

Each provider-specific Modal Secret object currently contains:

- `CODEX_API_KEY`

Other provider families should follow the same pattern later:

- provider-specific runtime variable names
- provider-specific Modal Secret objects
- attachment only to the deployments that need that provider

## Capability split by secret bundle

The canonical capability split is:

- base worker identity:
  - `WORKER_BOOTSTRAP_TOKEN`
  - local: `apps/worker/.env` or shell environment
  - Modal: `paretoproof-worker-<environment>`
- provider machine auth:
  - `CODEX_API_KEY`
  - local: shell environment, `.env`, or local Docker runtime injection
  - Modal: `paretoproof-worker-openai-<environment>`
- internal API transport:
  - `CF_INTERNAL_API_SERVICE_TOKEN_ID`
  - `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
  - local: shell environment, `.env`, or Docker runtime injection only when that path exists
  - Modal: `paretoproof-worker-internal-api-<environment>`
- direct artifact access:
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - local: shell environment, `.env`, or Docker runtime injection only when direct R2 access is required
  - Modal: `paretoproof-worker-artifacts-<environment>`

This split keeps the same image portable while ensuring each execution mode gets only the capabilities it actually needs.

## Portability rule for the image

The image portability rule is simple:

- the image reads the same variable names in local and hosted execution
- local-only trusted auth arrives through runtime mounts rather than image content
- hosted machine auth arrives through provider-specific Modal Secrets rather than human session state
- changing secret sources must not require changing the image contents

If a flow would require baking a credential into the image to work, that flow is outside the allowed MVP worker model.

## Verification baseline

The minimum verification for this policy is:

- confirm the base worker Modal Secret bootstrap helper still works:
  - `bun run bootstrap:modal:worker-secrets -- --worker-environment dev`
- confirm the local worker example env documents the stable and reserved variable names
- confirm the hosted secret inventory and attachment rules stay documented in `modal-worker-secrets-baseline.md`

This issue does not require seeding a live provider key into Modal. It fixes the contract so later provider-specific setup work can follow one stable local-versus-hosted rule set.
