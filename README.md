# ParetoProof

ParetoProof is being built as a Lean benchmark and evaluation platform for modern AI systems. The repository is moving from broad scoping into an implementation baseline, so the codebase now reflects the service boundaries and tooling we intend to build against rather than a finished product.

The MVP stack is now locked around TypeScript. The web application lives in React with Vite, the API is built on Fastify, and database access is handled through Drizzle on top of Neon Postgres. Bun is the workspace and package runner for the monorepo. Cloudflare hosts the public and gated web surfaces, Railway runs the control-plane API, Modal runs workers, and Cloudflare R2 will hold larger artifacts that do not belong in Postgres.

The quickest way to understand the repository is through the documentation index at [docs/README.md](/U:/Personal/ParetoProof/docs/README.md). The current architecture summary is in [docs/architecture.md](/U:/Personal/ParetoProof/docs/architecture.md), the repository layout is described in [docs/repository-layout.md](/U:/Personal/ParetoProof/docs/repository-layout.md), the deployment baseline is described in [docs/deployment-baseline.md](/U:/Personal/ParetoProof/docs/deployment-baseline.md), and the accepted stack decision is recorded in [docs/adrs/0001-mvp-implementation-stack.md](/U:/Personal/ParetoProof/docs/adrs/0001-mvp-implementation-stack.md).

If you want to contribute to the still-open product questions, the scoping discussions remain the best entry point: [Scope discussions](https://github.com/Tomodovodoo/ParetoProof/discussions/categories/scope). If you want to follow concrete execution work, use the GitHub projects and issues rather than the older discussion threads.
