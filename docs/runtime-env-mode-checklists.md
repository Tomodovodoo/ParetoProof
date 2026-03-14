# Runtime Env Mode Checklists

This document is the operator-facing companion to [runtime.md](runtime.md).

Use it when you need to answer a narrower question: "What do I actually need to set for this exact supported command or runtime?"

If a mode is not listed here, do not infer support from a placeholder variable name or an aspirational issue. This checklist covers only the currently supported web, API, and worker modes that exist in the repository today.

## Shared rules

- checked-in `.env.example` files are local examples only
- hosted secrets stay in the platform that runs the process, not in checked-in `.env` files
- empty strings are treated as missing values by the runtime validators
- required CLI flags such as `--access-jwt` are part of the operational checklist even when they are not environment variables

## Web modes

### Local browser build or dev server

Use this mode for `bun run dev:web` and `bun run build:web`.

- Example file: `apps/web/.env.example`
- Required env: none
- Optional env:
  - `VITE_API_BASE_URL`
- Secret env: none
- Runtime behavior:
  - when `VITE_API_BASE_URL` is unset, the app derives `https://api.paretoproof.com` on branded `paretoproof.com` hosts
  - when `VITE_API_BASE_URL` is unset on local origins, the app derives the same origin on port `3000`
- Do not set here:
  - `ACCESS_PROVIDER_STATE_SECRET`

### Pages auth-entry runtime

Use this mode for the Pages-managed auth provider-start handlers and the legacy finalize compatibility route.

- Checked-in example file: none by design
- Required env:
  - `ACCESS_PROVIDER_STATE_SECRET`
- Optional env: none
- Secret env:
  - `ACCESS_PROVIDER_STATE_SECRET`
- Platform owner:
  - Cloudflare Pages runtime, not the browser bundle
- Do not set here:
  - `VITE_API_BASE_URL` as a secret substitute

## API modes

### Local API startup

Use this mode for `bun run dev:api`, `bun run build:api`, and direct local server startup.

- Example file: `apps/api/.env.example`
- Required env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `CF_ACCESS_TEAM_DOMAIN`
  - one of `CF_ACCESS_PORTAL_AUD` or `CF_ACCESS_AUD`
  - `WORKER_BOOTSTRAP_TOKEN`
- Optional env:
  - `HOST`
  - `PORT`
  - `NODE_ENV`
  - `CF_ACCESS_INTERNAL_AUD`
  - `CORS_ALLOWED_ORIGINS`
  - `CORS_ALLOW_LOCALHOST`
- Secret env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `WORKER_BOOTSTRAP_TOKEN`
- Notes:
  - `CF_ACCESS_INTERNAL_AUD` falls back to the portal audience when omitted
  - `HOST` defaults to `0.0.0.0`
  - `PORT` defaults to `3000`

### Railway API runtime

Use this mode for the hosted `api.paretoproof.com` control plane.

- Checked-in example file: none; use Railway service variables
- Required env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `CF_ACCESS_TEAM_DOMAIN`
  - one of `CF_ACCESS_PORTAL_AUD` or `CF_ACCESS_AUD`
  - `WORKER_BOOTSTRAP_TOKEN`
- Optional env:
  - `HOST`
  - `PORT`
  - `NODE_ENV`
  - `CF_ACCESS_INTERNAL_AUD`
  - `CORS_ALLOWED_ORIGINS`
  - `CORS_ALLOW_LOCALHOST`
- Secret env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `WORKER_BOOTSTRAP_TOKEN`
- Platform notes:
  - Railway normally supplies `PORT`
  - keep migration credentials out of the live service runtime

### API migration mode

Use this mode for `bun run db:migrate:api`.

- Example file: `apps/api/.env.example`
- Required env:
  - `MIGRATION_DATABASE_URL` or `DATABASE_URL`
- Optional env: none
- Secret env:
  - `MIGRATION_DATABASE_URL` when used
  - `DATABASE_URL` when used as the fallback
- Do not assume:
  - Cloudflare platform tokens are needed just to run migrations

### API owner bootstrap mode

Use this mode for `bun run bootstrap:owner-admin:api` and related owner-only setup work.

- Example file: `apps/api/.env.example`
- Required env:
  - `MIGRATION_DATABASE_URL` or `DATABASE_URL`
  - `OWNER_EMAIL`
  - `CLOUDFLARE_ACCOUNT_ID`
  - either `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_EMAIL` together with `CLOUDFLARE_GLOBAL_API_KEY`
- Optional env: none
- Secret env:
  - database credential used for the bootstrap
  - Cloudflare credential used for the bootstrap
- Do not treat as normal startup:
  - these owner-only values are not required for routine API serving

## Worker modes

### Artifact materializers

Use this mode for:

- `bun run materialize:problem9-package`
- `bun run materialize:problem9-prompt-package`
- `bun run materialize:problem9-run-bundle`

- Example file: `apps/worker/.env.example`
- Required env: none
- Optional env: none
- Secret env: none
- Notes:
  - these commands are intentionally file-driven
  - do not inject `API_BASE_URL`, `WORKER_BOOTSTRAP_TOKEN`, or provider keys just because they exist in the worker example file

### Local Problem 9 attempt with `local_stub`

Use this mode for deterministic local dry runs of `run-problem9-attempt`.

- Example file: `apps/worker/.env.example`
- Required env: none
- Optional env: none
- Secret env: none

### Local Problem 9 attempt with `machine_api_key`

Use this mode for `run-problem9-attempt --auth-mode machine_api_key`.

- Example file: `apps/worker/.env.example`
- Required env:
  - `CODEX_API_KEY`
- Optional env: none
- Secret env:
  - `CODEX_API_KEY`

### Local Problem 9 attempt with `trusted_local_user`

Use this mode for `run-problem9-attempt --auth-mode trusted_local_user`.

- Example file: none by design
- Required env:
  - none if the default Codex home is correct
- Optional env:
  - `CODEX_HOME` when the local auth cache is not under the default home directory
- Required local file/state:
  - a readable `auth.json` under `CODEX_HOME` or the inferred home directory
  - a passing `codex login status`
- Secret env: none
- Notes:
  - on Windows, the default inferred path is `%USERPROFILE%\\.codex\\auth.json`
  - on non-Windows hosts, the default inferred path is `$HOME/.codex/auth.json`
  - this is a trusted-local path only; do not reuse it for hosted worker modes

### Trusted-local devbox wrapper

Use this mode for:

- `node infra/scripts/run-problem9-trusted-local-attempt.mjs --preflight-only`
- `bun run run:problem9-attempt:trusted-local`

- Example file: none by design
- Required env:
  - none if the default Codex home is correct
- Optional env:
  - `CODEX_HOME` when the local auth cache is not under the default home directory
- Required local file/state:
  - a readable `auth.json` under `CODEX_HOME` or the inferred home directory
  - a passing host `codex login status`
- Secret env: none
- Notes:
  - this wrapper mounts the auth file into the container read-only
  - do not move trusted-local auth into `apps/worker/.env`

### Offline ingest CLI

Use this mode for `bun run ingest:problem9-run-bundle -- --bundle-root <directory> --access-jwt <token>`.

- Example file: `apps/worker/.env.example`
- Required env:
  - `API_BASE_URL`
- Optional env: none
- Required CLI inputs:
  - `--bundle-root`
  - `--access-jwt`
- Secret env: none
- Secret CLI input:
  - `--access-jwt`
- Do not set here:
  - `WORKER_BOOTSTRAP_TOKEN`
  - `CODEX_API_KEY`
  - trusted-local `CODEX_HOME/auth.json`

### Hosted claim loop with `machine_api_key`

Use this mode for `bun run run:worker-claim-loop -- --auth-mode machine_api_key ...`.

- Example file: `apps/worker/.env.example`
- Required env:
  - `API_BASE_URL`
  - `WORKER_BOOTSTRAP_TOKEN`
  - `CODEX_API_KEY`
- Optional env: none
- Secret env:
  - `WORKER_BOOTSTRAP_TOKEN`
  - `CODEX_API_KEY`
- Notes:
  - this is the fully documented hosted worker path in the repository today
  - the command also accepts `--auth-mode machine_oauth`, but this checklist does not treat that as a complete hosted-provider workflow until a follow-up issue documents and exercises it end to end

## Reserved later-scope variables

These names may appear in examples as commented placeholders, but they are not part of the required checklist for any currently supported mode above:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Operator workflow summary

- use `apps/web/.env.example` only for local browser overrides
- use `apps/api/.env.example` for local API startup and owner-only API operations
- use `apps/worker/.env.example` for local worker modes that actually need environment variables
- keep Pages, Railway, and Modal hosted secrets in those platforms rather than inventing checked-in hosted `.env` files
