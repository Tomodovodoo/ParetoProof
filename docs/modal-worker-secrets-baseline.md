# Modal Worker Secrets Baseline

This document defines the MVP secret contract for Modal-hosted ParetoProof workers. The goal is to keep the worker runtime portable and least-privileged without confusing owner deployment credentials with secrets that actually belong inside a running worker process.

## Policy summary

- `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` are owner or deploy credentials, not worker runtime secrets
- Modal-hosted workers receive runtime secrets only through named Modal Secrets attached at deploy time
- the only universally required worker runtime secret in MVP is `WORKER_BOOTSTRAP_TOKEN`
- internal API transport secrets, artifact credentials, and provider machine-auth secrets are attached only when the selected worker mode actually needs them
- runtime variable names stay the same between local `.env` usage and Modal Secret injection, even though the surrounding secret-store mechanism differs

## Separation of credential classes

The worker secret model starts by separating three different credential classes:

- owner platform credentials
  - `MODAL_TOKEN_ID`
  - `MODAL_TOKEN_SECRET`
- worker runtime identity
  - `WORKER_BOOTSTRAP_TOKEN`
- optional worker runtime capabilities
  - internal API transport credentials
  - artifact-store credentials
  - provider machine-auth credentials

The first class never belongs in a worker container. `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` exist only so an owner-controlled shell session, CI job, or deployment helper can create or update Modal resources. They must not be injected into the running worker service.

## Canonical Modal Secret objects

Modal worker runtime secrets should be split by environment and by capability instead of one omnibus secret bundle.

### Base worker identity secret

Each worker environment should have one base Modal Secret object:

- `paretoproof-worker-dev`
- `paretoproof-worker-staging`
- `paretoproof-worker-production`

Each object contains:

- `WORKER_BOOTSTRAP_TOKEN`

This is the only worker runtime secret that every hosted worker should receive by default.

### Optional internal API transport secret

If the worker must cross an internal Cloudflare Access service-token boundary to reach `api.paretoproof.com/internal/*`, attach a second environment-scoped Modal Secret object:

- `paretoproof-worker-internal-api-dev`
- `paretoproof-worker-internal-api-staging`
- `paretoproof-worker-internal-api-production`

Each object contains:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`

Do not attach this secret object until that internal service-token path is actually live. The names stay reserved so later worker work can depend on one stable inventory.

### Optional artifact secret

If a worker ever needs direct runtime access to Cloudflare R2 instead of purely API-minted upload material, attach a separate environment-scoped Modal Secret object:

- `paretoproof-worker-artifacts-dev`
- `paretoproof-worker-artifacts-staging`
- `paretoproof-worker-artifacts-production`

Each object contains:

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

These credentials must stay out of the base worker identity secret so workers that do not need direct artifact access are not over-privileged.

### Optional provider secret objects

Provider machine-auth credentials must not be mixed into the base worker identity secret either. When a hosted worker mode needs machine-auth access to a provider, that provider should get its own environment-scoped Modal Secret object attached only to the deployments that require it.

This issue does not fix the final per-provider variable catalog. The stable rule is narrower:

- keep provider credentials in provider-specific Modal Secret objects
- keep them environment-scoped
- attach only the provider secret objects required by the selected worker deployment
- never repurpose `WORKER_BOOTSTRAP_TOKEN` as a provider credential

## Required runtime variable names

The current stable worker runtime variable set is:

- `API_BASE_URL`
- `WORKER_BOOTSTRAP_TOKEN`

The current reserved later-scope worker runtime variables are:

- `CF_INTERNAL_API_SERVICE_TOKEN_ID`
- `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

The worker package may expose these names in `.env.example` as placeholders, but only `WORKER_BOOTSTRAP_TOKEN` is part of the default hosted worker secret attachment contract today.

## Attachment rules

- attach `paretoproof-worker-<environment>` to every hosted worker deployment in that environment
- attach `paretoproof-worker-internal-api-<environment>` only when the worker actually needs the internal service-token path
- attach `paretoproof-worker-artifacts-<environment>` only when the worker actually needs direct R2 access
- attach provider-specific Modal Secret objects only to the deployments that need that provider

The operational rule is that a worker deployment should receive the minimum set of secret objects required for its specific execution mode.

## Alignment with local worker development

Local development still uses `apps/worker/.env` or shell-managed runtime variables instead of Modal Secrets. The important alignment rule is that the variable names stay the same even when the secret store changes.

That means:

- local trusted runs may set `WORKER_BOOTSTRAP_TOKEN` in `apps/worker/.env`
- hosted Modal workers receive the same variable name through Modal Secret injection
- the Docker image and worker build remain secret-free in both cases

The broader local-versus-Modal injection story, including trusted local Codex handling, belongs to issue `#148`. This document only fixes the hosted Modal worker secret inventory and attachment model.

## Bootstrap helper

The repository bootstrap helper for the base worker identity secret is:

```bash
bun run bootstrap:modal:worker-secrets -- --worker-environment dev --apply
```

By default the script targets Modal environment `main`, reads `apps/worker/.env`, and creates or updates the base secret object for the selected worker environment. It refuses the checked-in placeholder bootstrap token so a copied-but-unedited `.env` file cannot clobber a live Modal secret.

## Rotation rules

- rotate `WORKER_BOOTSTRAP_TOKEN` at the worker deployment or pool level
- rotate internal API service-token credentials independently from bootstrap tokens
- rotate artifact credentials independently from bootstrap tokens
- rotate provider credentials independently and only for the affected provider deployments

Secret rotation should not require rebuilding the worker image. It should only require updating the relevant Modal Secret object and redeploying or restarting the worker service that consumes it.

## Explicit non-goals

- storing `MODAL_TOKEN_ID` or `MODAL_TOKEN_SECRET` inside worker runtime secrets
- baking any runtime secret into the worker Docker image
- using one shared Modal Secret object for every worker capability
- finalizing the full local trusted Codex secret-injection path

