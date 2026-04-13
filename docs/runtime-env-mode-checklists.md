# Runtime Env Mode Checklists

This document is the operator-facing companion to [runtime.md](runtime.md).

Use it when you need to answer a narrower question: "What do I actually need to set for this exact supported command or runtime?"

If a mode is not listed here, do not infer support from a placeholder variable name or an aspirational issue. This checklist covers only the currently supported web, API, and worker modes that exist in the repository today.

## Shared rules

- checked-in `.env.example` files are local examples only
- hosted secrets stay in the platform that runs the process, not in checked-in `.env` files
- empty strings are treated as missing values by the runtime validators
- required CLI flags such as `--access-jwt` are part of the operational checklist even when they are not environment variables
- `bun run test:startup-validation` is the required smoke suite for startup env validation across the documented web, API, worker, and local Docker paths; update it when any checklist item changes

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
  - `CF_ACCESS_BRANDED_AUDS`
  - `WORKER_BOOTSTRAP_TOKEN`
- Optional env:
  - `HOST`
  - `PORT`
  - `NODE_ENV`
  - `CF_ACCESS_INTERNAL_AUD`
  - `CORS_ALLOWED_ORIGINS`
  - `CORS_ALLOW_LOCALHOST`
  - `PORTAL_PUBLIC_ORIGIN`
  - `AUTH_PUBLIC_ORIGIN`
  - `BRANDED_AUTH_ORIGINS`
  - `ACCESS_COOKIE_DOMAIN`
  - `ACCESS_COOKIE_SECURE`
- Secret env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `WORKER_BOOTSTRAP_TOKEN`
- Notes:
  - `CF_ACCESS_INTERNAL_AUD` falls back to the portal audience when omitted
  - `CF_ACCESS_BRANDED_AUDS` is the comma-separated allowlist of branded provider-host Access audiences accepted only on the finalize-submit handoff boundary
  - set `CORS_ALLOW_LOCALHOST=true` when you need loopback-mapped branded auth hosts such as `http://github.auth.paretoproof.com:<port>` or `http://google.auth.paretoproof.com:<port>` to post directly to the local API finalize-submit boundary during auth-flow previews
  - `PORTAL_PUBLIC_ORIGIN` defaults to `https://portal.paretoproof.com`
  - `AUTH_PUBLIC_ORIGIN` defaults to `https://auth.paretoproof.com`
  - `BRANDED_AUTH_ORIGINS` defaults to the configured auth origin plus the matching GitHub and Google branded auth origins
  - `ACCESS_COOKIE_DOMAIN` defaults to the shared domain suffix derived from the configured portal and branded auth origins when one exists
  - `ACCESS_COOKIE_SECURE` defaults to `true` only when every configured portal/branded auth origin is `https`
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
  - `CF_ACCESS_BRANDED_AUDS`
  - `WORKER_BOOTSTRAP_TOKEN`
- Optional env:
  - `HOST`
  - `PORT`
  - `NODE_ENV`
  - `CF_ACCESS_INTERNAL_AUD`
  - `CORS_ALLOWED_ORIGINS`
  - `CORS_ALLOW_LOCALHOST`
  - `PORTAL_PUBLIC_ORIGIN`
  - `AUTH_PUBLIC_ORIGIN`
  - `BRANDED_AUTH_ORIGINS`
  - `ACCESS_COOKIE_DOMAIN`
  - `ACCESS_COOKIE_SECURE`
- Secret env:
  - `DATABASE_URL`
  - `ACCESS_PROVIDER_STATE_SECRET`
  - `WORKER_BOOTSTRAP_TOKEN`
- Platform notes:
  - Railway normally supplies `PORT`
  - keep migration credentials out of the live service runtime
  - `api.paretoproof.com/portal/*` must bypass Cloudflare Access because the portal SPA talks to it with cross-origin `fetch()` and needs JSON `200`/`401` responses, not Access redirects
  - keep `api.paretoproof.com/internal/*` on its own Cloudflare Access app for owner and service-token callers
  - use the explicit portal/auth origin and cookie overrides when a hosted non-prod environment does not live on the canonical `*.paretoproof.com` pair

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
  - `OWNER_IDENTITY_PROVIDER`
  - `CLOUDFLARE_ACCOUNT_ID`
  - either `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_EMAIL` together with `CLOUDFLARE_GLOBAL_API_KEY`
- Optional env: none
- Secret env:
  - database credential used for the bootstrap
  - Cloudflare credential used for the bootstrap
- Notes:
  - `OWNER_IDENTITY_PROVIDER` must be `cloudflare_github` or `cloudflare_google`
  - rerunning the bootstrap migrates a legacy `cloudflare_one_time_pin` owner identity for the same Access subject onto the declared provider
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
- Optional env:
  - `PARETOPROOF_DEVBOX_IMAGE_DIGEST`
- Secret env: none
- Notes:
  - these commands are intentionally file-driven
  - do not inject `API_BASE_URL`, `WORKER_BOOTSTRAP_TOKEN`, or provider keys just because they exist in the worker example file

### Local Problem 9 attempt with `local_stub`

Use this mode for deterministic local dry runs of `run-problem9-attempt`.

- Example file: `apps/worker/.env.example`
- Required env: none
- Optional env:
  - `PARETOPROOF_DEVBOX_IMAGE_DIGEST`
- Secret env: none

### Local Problem 9 attempt with `machine_api_key`

Use this mode for `run-problem9-attempt --auth-mode machine_api_key`.

- Example file: `apps/worker/.env.example`
- Required env:
  - `CODEX_API_KEY`
- Optional env:
  - `PARETOPROOF_DEVBOX_IMAGE_DIGEST`
- Secret env:
  - `CODEX_API_KEY`

### Local Problem 9 attempt with `trusted_local_user`

Use this mode for `run-problem9-attempt --auth-mode trusted_local_user`.

- Example file: none by design
- Required env:
  - none if the default Codex home is correct
- Optional env:
  - `CODEX_HOME` when the local auth cache is not under the default home directory
  - `PARETOPROOF_DEVBOX_IMAGE_DIGEST`
- Required local file/state:
  - a readable `auth.json` under `CODEX_HOME` or the inferred home directory
  - a passing `codex login status`
- Secret env: none
- Notes:
  - on Windows, the default inferred path is `%USERPROFILE%\\.codex\\auth.json`
  - on non-Windows hosts, the default inferred path is `$HOME/.codex/auth.json`
  - malformed `auth.json` content is treated as a setup failure, not a runtime fallback
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
  - `PARETOPROOF_DEVBOX_IMAGE_DIGEST`
- Required local file/state:
  - a readable `auth.json` under `CODEX_HOME` or the inferred home directory
  - a passing host `codex login status`
- Secret env: none
- Notes:
  - this wrapper mounts the auth file into the container read-only
  - the wrapper also sets `PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT=readonly_auth_json` and expects `CODEX_HOME=/run/paretoproof/codex-home` inside the devbox
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
  - `PARETOPROOF_WORKER_IMAGE_DIGEST`
- Optional env: none
- Secret env:
  - `WORKER_BOOTSTRAP_TOKEN`
  - `CODEX_API_KEY`
- Notes:
  - this is the fully documented hosted worker path in the repository today
  - hosted modes must not set `PARETOPROOF_TRUSTED_LOCAL_AUTH_MOUNT` or point `CODEX_HOME` at `/run/paretoproof/codex-home`
  - hosted Problem 9 execution currently supports only provider family `openai`
  - hosted bundles emit `executionTargetKind: "paretoproof-worker"` and carry the exact wrapper digest from `PARETOPROOF_WORKER_IMAGE_DIGEST`
  - hosted claim-loop runs fail closed when proxy env or provider base-URL override env is present, including `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `OPENAI_BASE_URL`, `OPENAI_API_BASE`, and `OPENAI_API_BASE_URL`

## Reserved later-scope variables

These names may appear in examples as commented placeholders, but they are not part of the required checklist for any currently supported mode above:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Operator workflow summary

- before treating a PR as promotion-ready for `main`, read the successful `Pull Request CI / ci` run on the exact merge head and confirm the named smoke evidence in [runtime.md](runtime.md):
  - image smoke: `Build Problem 9 execution image smoke target`, `Verify Problem 9 execution image smoke target`, `Build Problem 9 devbox image smoke target`, and `Verify Problem 9 devbox image smoke target`
  - worker smoke: `Run deterministic Problem 9 verifier smoke` and `Run deterministic Problem 9 local-stub attempt smoke`
  - coupled auth/runtime gates when those surfaces changed: `Check runtime env examples`, `Check trusted-local auth boundaries`, `Test API auth handoff routes`, and `Test web auth relay functions`
- do not sign off main-branch promotion from generic success signals alone such as typecheck, build, or unrelated frontend checks when the slice changes worker or runtime kernel paths
- sample promotion path:
  - review the PR and wait for `Pull Request CI / ci` on the final head
  - confirm the named smoke evidence above for the touched surfaces
  - merge to `main`
  - if the merge triggers image publication, attach the `problem9-image-digests` or `problem9-devbox-image-digest` artifact from the publish workflow to the release packet as the post-merge digest record
- use `apps/web/.env.example` only for local browser overrides
- use `apps/api/.env.example` for local API startup and owner-only API operations
- use `apps/worker/.env.example` for local worker modes that actually need environment variables
- keep Pages, Railway, and Modal hosted secrets in those platforms rather than inventing checked-in hosted `.env` files
