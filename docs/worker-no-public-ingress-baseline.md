# Worker No-Public-Ingress Baseline

This document resolves the MVP no-public-ingress policy for worker services and internal-only worker execution surfaces.

## Policy

Workers must not expose public inbound HTTP endpoints.

- Worker runtimes are outbound clients to `api.paretoproof.com`.
- Browser traffic must never talk directly to worker services.
- Internal control-plane behavior is API-mediated, not worker-hostname-mediated.

## Allowed network direction

- allowed: worker -> API (claim, heartbeat, artifact coordination, result updates)
- allowed: worker -> model providers and storage endpoints required for assigned jobs
- disallowed: internet -> worker listener (public ingress)
- disallowed: browser -> worker direct endpoint

## Enforcement in repository

The repository now includes a static guard script:

- `infra/scripts/check-worker-no-public-ingress.mjs`

The guard scans `apps/worker/src` for inbound-server patterns and fails if detected, including:

- `createServer(...)`
- `listen(...)`
- imports of common HTTP server frameworks in worker source (`fastify`, `express`, `koa`, `hono`)
- `Deno.serve(...)`
- `Bun.serve(...)`

CI enforcement:

- pull request workflow runs `bun run check:worker:no-public-ingress`

## Operational boundary

- Modal worker services should run without public HTTP ingress configuration.
- Any future internal endpoint must remain non-public and be explicitly justified in a follow-up issue.
- If internal ingress is ever needed for debugging, it must be temporary, environment-scoped, and removed after incident resolution.

## Out of scope

- configuring Modal dashboard/project settings directly from this repo
- implementing service-mesh or private-network controls beyond current MVP platform capabilities
