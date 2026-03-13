# MVP Testing Baseline

This document resolves the MVP testing-stack scope for ParetoProof. It defines which tools are used, what each test layer covers, and which checks are required locally and in CI before merge.

## Goals

- Keep the test stack small and TypeScript-native.
- Cover the highest-risk MVP paths first: auth flow, portal gating, API authz, and DB migrations.
- Avoid test tooling that forces architecture changes before worker orchestration is implemented.

## Tooling Decisions

The MVP uses one primary test runner family across the monorepo.

| Layer | Tooling | Purpose |
| --- | --- | --- |
| Unit tests (`apps/*`, `packages/shared`) | `Vitest` | Fast unit coverage for business logic and helpers. |
| Frontend component tests (`apps/web`) | `Vitest` + `@testing-library/react` + `jsdom` | Route/component behavior without full browser E2E overhead. |
| API integration tests (`apps/api`) | `Vitest` + Fastify `inject` | HTTP contract and authz behavior without external network flake. |
| API contract tests (`apps/api` + `packages/shared`) | `Vitest` + shared schema assertions | Ensure backend responses match shared contract types/schemas. |
| Migration tests (`apps/api`) | `Vitest` + Drizzle migrate against ephemeral Postgres | Verify migrations apply cleanly and expected tables/indexes exist. |
| End-to-end smoke tests | `Playwright` (Chromium) | Validate branded auth entry + portal bootstrap + basic session flow. |

## Test Methodology By Surface

### Shared package (`packages/shared`)

- Unit-test schema helpers, parsing utilities, and contract guards.
- Any contract change must include both positive and negative parsing tests.

### Web app (`apps/web`)

- Unit/component-test route decision logic and portal shell state handling.
- Mock network boundaries with deterministic fixtures; avoid backend-dependent unit tests.
- Keep E2E for cross-surface auth/bootstrap behavior only.

### API (`apps/api`)

- Unit-test pure auth and policy helpers.
- Integration-test routes through Fastify `inject` with realistic auth context headers.
- Contract-test serialized response shapes against shared schemas.
- Migration-test schema evolution on a clean Postgres instance before merge.

### Worker (`apps/worker`)

- Unit-test run-state transitions, payload validation, and retry/cancel bookkeeping.
- Integration tests stay local-process and mock provider/runner boundaries until live worker orchestration exists.

## Local Development Workflow

Before opening or updating a PR, contributors should run:

1. `bun run typecheck`
2. `bun run test:unit`
3. `bun run test:integration`
4. `bun run test:e2e:smoke` when changes affect auth flow, portal routing, or cross-surface session handling

If scope is documentation-only, test commands may be skipped.

## CI Baseline

PR CI should run:

1. Install (`bun install --frozen-lockfile`)
2. `bun run typecheck`
3. `bun run test:unit`
4. `bun run test:integration`
5. `bun run test:e2e:smoke` for web/API/auth-affecting changes, or as a required workflow on protected branches

Main-branch/nightly CI should additionally run the full E2E smoke suite and migration tests against a clean ephemeral Postgres service.

## Coverage Expectations (MVP)

- No global line-coverage gate is required during early MVP.
- New or changed logic must include targeted tests for happy path plus at least one meaningful failure path.
- Critical paths (auth callback/finalize, portal bootstrap gating, approval-state mutations, migration scripts) are expected to be test-backed before merge.

## Out Of Scope For This Decision

- Property-based testing adoption.
- Browser matrix expansion beyond Chromium.
- Performance/load testing framework choice.
- Long-running worker sandbox integration tests against Modal.
