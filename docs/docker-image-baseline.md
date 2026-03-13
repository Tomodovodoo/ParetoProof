# Docker Image Baseline

This document resolves the MVP image-content scope for the API and worker services. It defines exactly what belongs in each image, what is pinned, and what must stay runtime-only.

## Image policy summary

- API and worker images use multi-stage Docker builds.
- Bun is the workspace/build tool. Node.js is the production runtime in both images.
- Python is not part of the default MVP API or worker base image.
- Lean and Mathlib are worker-only toolchains and must be pinned.
- Images must be reproducible and secret-free.

## API image baseline (`apps/api`)

The API currently deploys to Railway from source, but the MVP image contract is fixed now so runtime behavior does not drift if container deployment is enabled.

### Build stage

- Base image: `oven/bun:1.3.10`
- Inputs:
  - repository `package.json`, `bun.lock`, and workspace package manifests
  - `apps/api` source
  - `packages/shared` source
- Build outputs:
  - `apps/api/dist`
  - `packages/shared/dist`
  - production dependency tree

### Runtime stage

- Base image: `node:22-bookworm-slim`
- Runtime process: `node apps/api/dist/index.js`
- Included files:
  - built `apps/api/dist`
  - built `packages/shared/dist`
  - runtime `package.json` metadata and production dependencies
- Excluded from runtime image:
  - TypeScript sources not needed at runtime
  - test fixtures and local-only scripts
  - Git metadata and CI-only tooling

## Worker image baseline (`apps/worker`)

The worker image is execution-oriented and must include the Lean toolchain contract for reproducible formal-math runs.

### Build stage

- Base image: `oven/bun:1.3.10`
- Inputs:
  - repository `package.json`, `bun.lock`, and workspace package manifests
  - `apps/worker` source
  - `packages/shared` source
- Build outputs:
  - `apps/worker/dist`
  - `packages/shared/dist`
  - production dependency tree

### Runtime stage

- Base image: `node:22-bookworm-slim`
- Required system packages:
  - `ca-certificates`
  - `curl`
  - `git`
  - `xz-utils`
  - `zstd`
- Runtime process: `node apps/worker/dist/index.js`

### Lean and Mathlib pinning

- Lean must be installed via `elan` in the worker image.
- Lean version must be pinned by `apps/worker/lean-toolchain` to an exact stable release string (no floating channels such as `stable` or `nightly`).
- Mathlib and related Lake dependencies must be pinned by committed lock/manifests (`lake-manifest.json`) to exact revisions.
- Any change to Lean or Mathlib versions must be committed in source control and called out in the PR summary.

## Python decision

Python is out of the default MVP worker image baseline.

- Rationale: current worker control-plane/runtime code is TypeScript-first, and adding Python by default increases attack surface and rebuild cost without a required MVP use case.
- If a specific benchmark harness later requires Python, add it in a dedicated execution issue with an explicit package/version list.

## Bun runtime decision

Bun remains a build/workspace tool for MVP.

- Bun is used to install dependencies and build workspace packages.
- Production containers run with Node.js (`node:22-bookworm-slim`) for runtime compatibility and operational predictability.

## Never-in-image policy

The following values must never be present in Dockerfiles, image `ARG`/`ENV`, copied files, or baked config:

- `DATABASE_URL`
- `MIGRATION_DATABASE_URL`
- `ACCESS_PROVIDER_STATE_SECRET`
- `CF_ACCESS_PORTAL_AUD`, `CF_ACCESS_AUD`, `CF_ACCESS_INTERNAL_AUD`
- `CF_INTERNAL_API_SERVICE_TOKEN_ID`, `CF_INTERNAL_API_SERVICE_TOKEN_SECRET`
- `WORKER_BOOTSTRAP_TOKEN`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- `GH_TOKEN`, `RAILWAY_API_TOKEN`, `NEON_API_KEY`, `CLOUDFLARE_API_TOKEN`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`
- model-provider API keys

All secret material is runtime-injected by the hosting platform (Railway for API, Modal for workers) or by local uncommitted `.env` files for development.

## Change control

Any future image baseline change should include:

- the exact file and version change
- compatibility impact (API runtime, worker runtime, or both)
- rollback note (which prior image or toolchain pin remains valid)
