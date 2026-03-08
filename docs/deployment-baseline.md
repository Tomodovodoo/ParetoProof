# Deployment Baseline

The repository is set up so each deployable surface can be built without committing to too much product logic up front. The web app in `apps/web` builds as a normal Vite application and is intended for Cloudflare Pages. The API in `apps/api` and the worker in `apps/worker` both have real multi-stage Dockerfiles so they can be built from the repository root and deployed to Railway or a worker image registry without rewriting the build story later.

The Dockerfiles deliberately stop at the service boundary. They install the Bun workspace, build the shared package first, build the target service, and then copy only the runtime artifacts into a small Node 22 image. That keeps the deployment path compatible with the chosen monorepo tooling while avoiding an early commitment to a more elaborate runtime stack.

Pages now has a concrete project baseline. The Cloudflare project is `paretoproof-web`, and its durable deployment path lives in `apps/web/wrangler.toml`. The public website is attached to `paretoproof.com` and `www.paretoproof.com`, and the portal hostname is attached at `portal.paretoproof.com`. Because the frontend consumes the shared workspace package, the web bundle should be built from the repository root with `bun run build:web:pages`, then uploaded to Pages from `apps/web/dist`. This keeps the Pages deployment path aligned with the Bun workspace instead of depending on a narrower dashboard root that would miss shared-package changes.

Each app also has a small `.env.example` file so deployment variables are easy to discover without pretending that the final secret model is already implemented. Those files are there to make local bootstrapping and platform configuration predictable, not to define the final production secret inventory.
