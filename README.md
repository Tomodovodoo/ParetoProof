# ParetoProof

ParetoProof is a benchmark platform for reproducible mathematical evaluation. The project combines a public website, branded auth entry, a contributor portal, a Fastify control plane, and worker runtimes that execute benchmark attempts under explicit contracts.

The current repository is centered on one real benchmark kernel: the offline `firstproof/Problem9` slice. Around that, the platform now includes run, job, attempt, artifact, and worker-lease models; internal worker APIs; offline ingest; portal benchmark operations; and the Docker/runtime pieces needed to execute and verify the benchmark flow.

The MVP stack is TypeScript across the repo. The web application lives in React with Vite, the API runs on Fastify, data is stored through Drizzle on Neon Postgres, Cloudflare hosts the public and auth surfaces, Railway runs the API, Modal and containerized workers handle execution, Cloudflare R2 stores larger artifacts, and GHCR holds worker images.

## Start here

- [docs/README.md](docs/README.md) for the short docs index
- [docs/architecture.md](docs/architecture.md) for the system shape
- [docs/benchmarks.md](docs/benchmarks.md) for the benchmark kernel
- [docs/runtime.md](docs/runtime.md) for runtime and deployment rules

## Project boards

- [Roadmap](https://github.com/users/Tomodovodoo/projects/9/views/1) for execution work
- [Scoping Board](https://github.com/users/Tomodovodoo/projects/3) for unresolved scope decisions and decomposition
