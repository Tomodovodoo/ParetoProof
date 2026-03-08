# Repository Layout

The repository is now structured as a Bun workspace monorepo. The intent is to keep each deployable surface independent while still allowing shared contracts and tooling to live in one place.

The `apps` directory contains the deployable services. `apps/web` is the React and Vite frontend. `apps/api` is the Fastify control-plane service. `apps/worker` holds the worker-side control code that will eventually drive Lean and model execution in remote runtimes.

The `packages` directory is reserved for code that should be shared rather than copied. Right now that means `packages/shared`, which is where request schemas, event contracts, shared constants, and cross-service types belong.

The `infra` directory is for repository-owned operational material such as Docker-related files, helper scripts, and worked examples. The `docs` directory is for architecture and workflow documentation. Existing benchmark, run, and schema material remains in the top-level directories that were already part of the repository.

At the root, `package.json` and `tsconfig.base.json` define the shared workspace and TypeScript baseline. The top-level structure is meant to stay boring on purpose: deployable apps in one place, shared packages in one place, operational assets in one place, and documentation close to the code.
