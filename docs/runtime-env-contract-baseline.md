# Runtime Env Contract Baseline

This document defines the canonical environment-variable contract for the ParetoProof MVP surfaces and execution modes.

The goal is to make local, hosted, and CI runs fail deterministically instead of inferring runtime requirements from scattered `.env.example` comments or platform dashboards.

## Core decision

ParetoProof should validate runtime environment by surface and by mode, not through one repository-wide omnibus env list.

That means:

- each app owns its own required runtime variables
- variables that are required in one mode may be optional or invalid in another
- startup validation should happen before the process begins serving requests or claiming work
- `.env.example` files document local developer-facing inputs only; they are not the sole source of truth for hosted runtime requirements

## Variable classes

The contract uses four variable classes.

### 1. Public build-time config

These values may safely ship into browser bundles because they only control public routing or non-secret client behavior.

Current MVP example:

- `VITE_API_BASE_URL`

### 2. App runtime config

These values are required by a running service or CLI mode and must be present before that mode starts.

Current MVP examples:

- `DATABASE_URL`
- `ACCESS_PROVIDER_STATE_SECRET`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_PORTAL_AUD`
- `WORKER_BOOTSTRAP_TOKEN`

### 3. Owner-ops or bootstrap config

These values are valid only for explicit owner workflows such as migrations, bootstrap, or platform administration. They are not normal steady-state app runtime requirements.

Current MVP examples:

- `MIGRATION_DATABASE_URL`
- `OWNER_EMAIL`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `MODAL_TOKEN_ID`
- `MODAL_TOKEN_SECRET`

### 4. Reserved later-scope runtime config

These names are allowed placeholders because later worker or internal-service flows expect them, but current MVP code must not pretend they are universally required yet.

Current MVP examples:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Validation rules

The validation model should follow these rules:

1. Validate only the variables that are required for the selected app and mode.
2. Fail fast before the app begins listening, serving, or claiming work.
3. Treat empty strings as missing values unless a variable explicitly allows empty content.
4. Keep build-time and runtime validation separate. A Pages or Vite build must not require secrets that belong only to Railway or Modal runtime.
5. Treat owner-ops scripts as their own validation mode, not as part of normal app startup.

## Web contract

The web surface has two distinct configuration modes:

- browser build-time config for the Vite app
- Pages-managed runtime config for auth-entry edge functions

Those modes must not be collapsed into one "web has no secrets" rule.

### Browser build-time config

The Vite browser app currently has one optional public build-time override:

- `VITE_API_BASE_URL`

### Local web development

`VITE_API_BASE_URL` is optional in local development.

If it is absent, the web app should keep deriving the API origin automatically:

- `https://api.paretoproof.com` when running on a `paretoproof.com` hostname
- local port `3000` when running on localhost

### Hosted web runtime

The browser-rendered web surface should not depend on runtime-only secret injection in Pages for normal rendering.

That means:

- no app secret should be required in the browser bundle
- `VITE_API_BASE_URL` remains an optional override, not a mandatory production secret
- auth, portal, and public web surfaces should prefer stable hostname-based derivation over environment drift

### Auth-entry edge runtime

The Pages-managed auth-entry handlers are a separate runtime mode from the browser bundle.

That mode currently requires:

- `ACCESS_PROVIDER_STATE_SECRET`

Those handlers may not be rendered into the browser bundle, but they are still part of the hosted web surface and must fail fast if the required secret is missing.

## API contract

### API service runtime

The API runtime requires:

- `DATABASE_URL`
- `ACCESS_PROVIDER_STATE_SECRET`
- `CF_ACCESS_TEAM_DOMAIN`
- one of `CF_ACCESS_PORTAL_AUD` or `CF_ACCESS_AUD`
- `WORKER_BOOTSTRAP_TOKEN`

The API runtime may optionally use:

- `HOST`
- `PORT`
- `NODE_ENV`
- `CF_ACCESS_INTERNAL_AUD`
- `CORS_ALLOWED_ORIGINS`
- `CORS_ALLOW_LOCALHOST`

Validation should fail before Fastify starts listening if any required runtime variable is missing.

### API local development mode

Local API development should use:

- local Postgres through `DATABASE_URL`
- local `.env` or shell-provided auth configuration for Cloudflare Access parity

Local development does not require:

- owner-admin bootstrap variables
- Cloudflare platform API credentials
- production-hosted secrets

### API Railway runtime

Railway is the authoritative hosted API runtime mode.

Railway should hold the same required API runtime variables as local API startup, with platform-owned values for:

- `DATABASE_URL`
- `ACCESS_PROVIDER_STATE_SECRET`
- `CF_ACCESS_TEAM_DOMAIN`
- `CF_ACCESS_PORTAL_AUD` or `CF_ACCESS_AUD`

`PORT` remains Railway-managed. `HOST` may be set explicitly but should keep the existing `0.0.0.0` default behavior.

### API owner-ops modes

The migration and owner bootstrap scripts are separate modes with their own env requirements.

#### Migration mode

Requires:

- `MIGRATION_DATABASE_URL` or `DATABASE_URL`

#### Owner bootstrap mode

Requires:

- `MIGRATION_DATABASE_URL` or `DATABASE_URL`
- `OWNER_EMAIL`
- `CLOUDFLARE_ACCOUNT_ID`
- either `CLOUDFLARE_API_TOKEN`, or `CLOUDFLARE_EMAIL` together with `CLOUDFLARE_GLOBAL_API_KEY`

These values must not be treated as required for normal API server startup.

## Worker contract

The worker contract is mode-specific because the current worker package mixes deterministic local materializer CLIs with later hosted runtime plans.

### Current materializer CLI mode

The current checked-in worker CLIs for package, prompt-package, and run-bundle materialization do not require steady-state runtime env variables.

They are file-input-driven and should keep working without:

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`
- provider API keys

### Future claim-and-run worker mode

When the worker starts acting as a long-lived claimant against the API, the runtime should require:

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`

This is the first hosted worker runtime contract.

### Future offline-ingest CLI mode

When the worker adds `ingest-problem9-run-bundle`, the CLI should require:

- `API_BASE_URL`
- one explicit portal-audience Access assertion supplied by the operator at invocation time

That assertion is the control-plane auth artifact approved by [offline-ingest-auth-baseline.md](offline-ingest-auth-baseline.md). It should be passed explicitly to the command and forwarded as:

- `Cf-Access-Jwt-Assertion: <token>`

The offline-ingest CLI must not require or reuse:

- `WORKER_BOOTSTRAP_TOKEN`
- per-job worker tokens
- provider API keys
- trusted-local `auth.json`

Because the assertion is short-lived and human-admin scoped, it should not be documented as a steady-state worker `.env` variable.

### Hosted provider or non-interactive model mode

When the worker must call a hosted model provider without a trusted local Codex session, the mode should additionally require the relevant provider credential, such as:

- `CODEX_API_KEY`

That requirement is mode-specific, not universal to every worker command.

### Reserved worker later-scope variables

These variables remain allowed placeholders but should validate only in the workflows that actually use them:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

## Local Docker contract

Local Docker runs should validate runtime env at container start, not at image build time.

That means:

- runtime variables enter through `--env`, `--env-file`, or platform secret injection
- Dockerfiles and image builds must not require live secrets
- the selected container command decides which variables are required

For the current worker materializer commands, local Docker may legitimately need no runtime secret at all.

For a future hosted-parity worker container, local Docker would require only the variables for the selected worker mode, such as `API_BASE_URL`, `WORKER_BOOTSTRAP_TOKEN`, and mode-specific provider credentials.

## Modal contract

Modal is the authoritative hosted worker runtime mode.

The default hosted worker secret contract requires:

- `WORKER_BOOTSTRAP_TOKEN`

Additional variables are mode-specific:

- `CODEX_API_KEY` only when using hosted machine auth for provider calls
- internal API service-token or R2 credentials only when a later worker slice actually consumes them

Modal deploy credentials such as `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are not worker runtime variables. They belong to deploy or owner-ops workflows only.

## CI and validation expectations

CI should mirror the mode split instead of pretending every secret can be present in pull requests.

That means:

- ordinary pull-request CI validates code, types, and deterministic CLIs without requiring hosted secrets
- owner-controlled deploy or bootstrap workflows validate only the env contract for the mode they actually execute
- future env-validation helpers should be testable without needing production values

## `.env.example` expectations

Each app-level `.env.example` file should:

- list only the variables relevant to local developer-facing modes for that app
- comment whether a variable is required, optional, owner-only, or reserved later scope
- avoid implying that every commented variable is required for every command

The checked-in examples remain documentation aids. This baseline is the authoritative contract.

## Startup-validation expectations by surface

- web: validate public build-time overrides only where they are actually used; do not require runtime secrets in browser code
- api: fail before `buildServer()` listens if required API runtime variables are missing
- worker: validate per command or per runtime mode before claiming work or contacting providers
- owner scripts: validate their own required env immediately on entry

## Relationship to adjacent baselines

- [operations-baseline.md](operations-baseline.md) defines secret ownership and where values live, not the per-mode validation contract
- [modal-worker-secrets-baseline.md](modal-worker-secrets-baseline.md) defines which hosted Modal secrets exist and how they are attached
- [worker-secret-injection-baseline.md](worker-secret-injection-baseline.md) defines trusted-local versus hosted injection rules for worker credentials
- [deployment-baseline.md](deployment-baseline.md) defines the live hosted API and Pages deployment boundary

This document is the source of truth for which variables are required by which runtime mode and where startup validation should happen.
