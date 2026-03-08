# Deployment Baseline

The repository is set up so each deployable surface can be built without committing to too much product logic up front. The web app in `apps/web` builds as a normal Vite application and is intended for Cloudflare Pages. The API in `apps/api` and the worker in `apps/worker` both have real multi-stage Dockerfiles so they can be built from the repository root and deployed to Railway or a worker image registry without rewriting the build story later.

The Dockerfiles deliberately stop at the service boundary. They install the Bun workspace, build the shared package first, build the target service, and then copy only the runtime artifacts into a small Node 22 image. That keeps the deployment path compatible with the chosen monorepo tooling while avoiding an early commitment to a more elaborate runtime stack.

Pages configuration is still expected to live in the Cloudflare project settings rather than in a large local config surface. The intended build settings are simple: the root directory is `apps/web`, the install command is `bun install`, and the build command is `bun run build`. Railway can build the API from `apps/api/Dockerfile`, and the worker image can be built from `apps/worker/Dockerfile` and published when the worker runtime work is ready.

Each app also has a small `.env.example` file so deployment variables are easy to discover without pretending that the final secret model is already implemented. Those files are there to make local bootstrapping and platform configuration predictable, not to define the final production secret inventory.
