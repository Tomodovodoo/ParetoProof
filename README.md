# ParetoProof

ParetoProof is an end-to-end framework for evaluating models and harnesses in a structural, highly reproducible manner. The goal of this project is to show what the pareto-frontier REALLY is, not simply one-off-benchmarks, or running single passes through models.

This project aims to guide researchers and mathematicians into figuring out how good AI is at the moment, AND how it can help them. By building full open-source harnesses, infrastructure, and methodology we aim to fully work through how you can solve math problems.

The MVP stack is now locked around TypeScript. The web application lives in React with Vite, the API is built on Fastify, and database access is handled through Drizzle on top of Neon Postgres. Bun is the workspace and package runner for the monorepo. Cloudflare hosts the public and gated web surfaces, Railway runs the control-plane API, Modal runs workers, Cloudflare R2 will hold larger artifacts such as logs and result bundles, and GHCR will hold worker images.

The quickest way to understand the repository is through the documentation index at [docs/README.md](docs/README.md). The current architecture summary is in [docs/architecture.md](docs/architecture.md), and the repository layout is described in [docs/repository-layout.md](docs/repository-layout.md).

To find out what is currently being worked on for different systems, please look through the [Project Roadmap](https://github.com/users/Tomodovodoo/projects/9/views/1).

Additionally, for unworked scopes of this project, please check out the [Project Scoping Board](https://github.com/users/Tomodovodoo/projects/3), these represent ideas for the project that still need to either be fully defined and thought through, or fleshed out to concrete tasks. I would greatly appreciate any and all feedback for these, so please leave any comments and ideas there!
