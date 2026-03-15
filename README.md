# ParetoProof

ParetoProof is a benchmark platform for reproducible mathematical evaluation. The project combines a public website, branded auth entry, a contributor portal, a Fastify control plane, and worker runtimes that execute benchmark attempts under explicit contracts.

The current repository is centered on one real benchmark kernel: the offline `firstproof/Problem9` slice. Around that kernel, the repo now carries the concrete run, job, attempt, artifact, worker-lease, offline-ingest, and portal benchmark-ops surfaces needed to execute and review reproducible runs instead of only planning the auth or API shell around them.

The MVP stack is TypeScript across the repo. The web application lives in React with Vite, the API runs on Fastify, data is stored through Drizzle on Neon Postgres, Cloudflare hosts the public and auth surfaces, Railway runs the API, Modal and containerized workers handle execution, Cloudflare R2 stores larger artifacts, and GHCR holds worker images.

## Current Repo Reality

- `apps/web` owns the public site, auth-entry relay, portal bootstrap, and the contributor/admin benchmark operations UI.
- `apps/api` owns the control-plane API, portal/admin read models, offline-ingest routes, and the internal worker claim/finalize surface.
- `apps/worker` owns the benchmark package materializers, local trusted and machine-auth attempt paths, offline-ingest CLI, and the hosted claim loop.
- `packages/shared` owns the canonical schemas, contracts, and lifecycle vocab shared across the API, worker, and frontend.

The current worker and control-plane flow is already concrete enough to run deterministic Problem 9 package, verifier, run-bundle, and startup-validation smoke gates in PR CI. The broader "what becomes the canonical benchmark after the bootstrap Problem 9 slice" decision is still open, so the docs and code should keep describing `firstproof/Problem9` as the current kernel rather than overstating a wider benchmark catalog.

## Start here

- [docs/README.md](docs/README.md) for the short docs index
- [docs/architecture.md](docs/architecture.md) for the system shape
- [docs/benchmarks.md](docs/benchmarks.md) for the benchmark kernel
- [docs/runtime.md](docs/runtime.md) for runtime and deployment rules
- [apps/worker/README.md](apps/worker/README.md) for the worker runtime, image, and CLI contract

## Project boards

- [Roadmap](https://github.com/users/Tomodovodoo/projects/9/views/1) for execution work
- [Scoping Board](https://github.com/users/Tomodovodoo/projects/3) for unresolved scope decisions and decomposition
