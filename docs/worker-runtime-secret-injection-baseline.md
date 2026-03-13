# Worker Runtime Secret Injection Baseline

This document defines the MVP runtime-secret injection model for the offline `firstproof/Problem9` worker and devbox flow. The goal is to let the same worker runtime contract operate locally and on Modal without baking provider credentials, worker bootstrap tokens, or ChatGPT-managed auth material into the image.

This baseline complements:

- `docker-image-baseline.md`
  - image contents and the devbox-versus-execution split
- `modal-worker-secrets-baseline.md`
  - hosted Modal secret inventory and attachment rules
- `operations-baseline.md`
  - global secret ownership and the worker bootstrap-token model

## Policy summary

- runtime secrets are injected only at container start or process launch time
- Docker build inputs and published images stay secret-free
- local Docker and local devbox runs use runtime env injection or runtime-mounted secret files
- hosted Modal runs use Modal Secret objects only
- `WORKER_BOOTSTRAP_TOKEN` is worker identity for backend claim flow, not provider auth
- OpenAI-family non-interactive worker execution uses `CODEX_API_KEY`
- trusted local Codex auth is allowed only in local trusted workflows and must never be copied into an image, git checkout, or hosted worker secret store
- the runtime variable names stay stable across local and hosted execution, even when the secret store changes

## Credential classes

The worker secret model separates four credential classes.

### 1. Owner and deploy credentials

These stay outside worker runtime entirely:

- `GH_TOKEN`
- `RAILWAY_API_TOKEN`
- `NEON_API_KEY`
- `CLOUDFLARE_API_TOKEN`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

They belong to an owner shell session, CI deploy workflow, or private bootstrap vault. They are not valid worker-process inputs.

### 2. Worker and backend credentials

These identify the worker to the ParetoProof backend:

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`
- later, only when the internal service-token path is live:
  - `CF_INTERNAL_API_SERVICE_TOKEN_ID`
  - `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`

`WORKER_BOOTSTRAP_TOKEN` is the only default worker credential every live worker deployment needs. It must never be reused as a provider key, artifact credential, or general-purpose API bearer outside the claim/bootstrap flow.

### 3. Artifact and storage credentials

These are attached only when the worker mode actually needs direct object-store access:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

If artifact upload can stay API-coordinated, do not attach these credentials.

### 4. Provider credentials

Provider access splits by auth mode:

- `trusted_local_user`
  - local trusted session material only
- `machine_api_key`
  - repository-approved provider env vars such as `CODEX_API_KEY`
- `machine_oauth`
  - later provider-specific machine credentials, if a provider requires them

The current MVP fixed provider runtime variable is:

- `CODEX_API_KEY`
  - OpenAI-family non-interactive provider auth for hosted workers, local automation, and local machine-auth parity runs

No repository-wide Aristotle machine-auth variable is fixed yet. Aristotle stays local-trusted in MVP unless a later issue defines a clean machine-auth contract.

## Canonical runtime variable catalog

The worker runtime may expect these variables.

### Required when the worker talks to the API

- `API_BASE_URL`
  - the target API origin for claim, heartbeat, result submission, or optional bundle ingest
- `WORKER_BOOTSTRAP_TOKEN`
  - required for live worker claim flow

For pure offline local runs that only produce a bundle and do not call the API, these may remain unset.

### Optional internal API variables

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`

These stay reserved until the internal Cloudflare Access service-token route is live.

### Optional direct artifact variables

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

These stay unset unless the selected worker mode actually performs direct object-store operations.

### Provider variables

- `CODEX_API_KEY`
  - required for OpenAI-family `machine_api_key` execution

The worker must not expect a checked-in env var for trusted local Codex auth. That path depends on local user session material, not on a repository-owned secret value.

## Local runtime injection rules

### Local shell and `.env` flow

Trusted local contributors may inject runtime variables through:

- `apps/worker/.env`
- a developer shell session
- a one-shot command invocation

Allowed local env-injected secret values include:

- `WORKER_BOOTSTRAP_TOKEN`
- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `CODEX_API_KEY`

These values stay local-only and uncommitted.

### Local Docker flow

Local Docker runs must inject secrets only at runtime through:

- `docker run --env-file`
- explicit `docker run -e ...`
- read-only runtime secret file mounts when the credential is file-shaped rather than scalar

Local Docker runs must not use:

- `docker build --build-arg` for secrets
- copied `.env` files inside the image
- committed secret files in the build context

The important rule is that the portable worker image stays identical whether the caller later provides local env vars or Modal Secrets.

## Trusted local Codex rule

Trusted local Codex auth is supported only for local trusted workflows.

That means:

- allowed:
  - contributor-controlled local devbox runs
  - contributor-controlled local Docker runs with runtime-mounted local Codex session material
- not allowed:
  - Modal-hosted workers
  - CI
  - non-interactive automation
  - published worker images

When trusted local Codex auth is used, the worker may read the local Codex session only from runtime-mounted local user material such as the local Codex auth directory or `auth.json`. That material must be:

- outside git
- outside Docker build context
- mounted read-only at runtime if it enters a container
- treated as local user session state, not as a repository-managed secret

The worker image must never contain:

- `auth.json`
- `$CODEX_HOME` contents
- browser-exported ChatGPT session material
- copied ChatGPT-managed credentials in any image layer or cache

## Hosted and automated execution rule

Hosted workers and non-interactive automation must use machine auth only.

For the MVP OpenAI-family path, that means:

- auth mode: `machine_api_key`
- runtime variable: `CODEX_API_KEY`

Hosted or automated execution must not rely on:

- trusted local user auth
- mounted local Codex home directories
- copied `auth.json`
- a human browser or CLI session being present

If a run starts as a trusted local Codex experiment and later needs hosted parity, the rerun must switch to machine auth instead of trying to export or replay the local human session.

## Modal injection rules

Hosted Modal workers receive runtime secrets only through Modal Secret objects.

The hosted injection split is:

- base worker identity secret
  - `WORKER_BOOTSTRAP_TOKEN`
- optional internal API secret
  - `CF_INTERNAL_API_SERVICE_TOKEN_ID`
  - `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- optional artifact secret
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
- optional provider secret
  - `CODEX_API_KEY` for the OpenAI-family machine-auth path

Modal must not receive:

- `auth.json`
- contributor-local Codex home directories
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

Those values either belong to local trusted execution only or to owner/deploy workflows rather than the worker runtime.

## Portability rule for the image

The portability contract is:

- the worker image does not change when moving between local Docker and Modal
- only the runtime secret store changes
- runtime variable names stay stable across those environments

This is strict for machine-auth execution:

- local Docker may inject `CODEX_API_KEY`
- Modal may inject the same `CODEX_API_KEY` through a provider-scoped Modal Secret
- neither path changes the image contents

Trusted local Codex auth is intentionally not part of the portable hosted contract. It is a local-only convenience path that exists in the trusted devbox workflow and must not leak into hosted execution assumptions.

## Optional backend ingest rule

Optional backend ingest for a locally produced bundle should reuse the normal backend origin and existing auth boundary rather than inventing a second secret class.

The stable rule is:

- use `API_BASE_URL` for the ingest target when a helper or future worker-side upload path talks to the API directly
- use `WORKER_BOOTSTRAP_TOKEN` only for live worker claim/assignment flows
- do not create a separate long-lived "ingest secret" just for local bundle upload

For the MVP, the canonical local bundle import path may stay human- or operator-triggered outside the worker process entirely, in which case the worker needs no extra ingest credential. If a future worker-side ingest path is added, it must reuse the normal worker/backend token model instead of introducing a new long-lived ingest credential.

## Hard prohibitions

The repository must not:

- commit live worker or provider secrets
- copy `.env` into a Docker image
- bake `WORKER_BOOTSTRAP_TOKEN` into image layers
- bake `CODEX_API_KEY` into image layers
- copy `auth.json` or other ChatGPT-managed auth material into an image
- attach trusted local Codex session material to Modal workers
- reuse worker bootstrap tokens as provider or artifact credentials

## Out of scope

- final Aristotle machine-auth variable naming
- per-provider secret catalogs beyond the MVP `CODEX_API_KEY` rule
- implementation of the provider adapters themselves
- the final worker-control message schema from issue `#147`
